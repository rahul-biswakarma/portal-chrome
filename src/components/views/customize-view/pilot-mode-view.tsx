import { useState, useEffect } from 'react';
import { useAppContext } from '@/contexts';
import { getEnvVariable } from '@/utils/environment';
import { getActiveTab } from '@/utils/chrome-utils';
import { captureScreenshot } from '@/utils/screenshot';
import {
  AlertCircle,
  ImageIcon,
  X,
  ArrowRight,
  Loader,
  CheckCircle2,
  PlayCircle,
  StopCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { isValidImageData, makeGeminiRequest } from '@/utils/gemini-client';
import type { GeminiMessage, MessagePart } from '@/utils/gemini-client';
import { useLogger } from '@/services/logger';

// Simplified workflow stages
type PilotStage =
  | 'collect-references'
  | 'customizing-home'
  | 'navigate-to-inner'
  | 'customizing-inner'
  | 'complete';

// Feedback loop stages - updated to reflect new 3-stage approach
type FeedbackStage =
  | 'idle'
  | 'taking-screenshot'
  | 'generating-visual-diff'
  | 'generating-css'
  | 'applying-css'
  | 'getting-feedback'
  | 'complete';

// Type for DOM element structure
interface PortalElement {
  tagName: string;
  portalClass: string;
  tailwindClasses: string[];
  children: PortalElement[];
}

export const PilotModeView = () => {
  const [geminiKeyMissing, setGeminiKeyMissing] = useState(false);
  const { setApiKey, apiKey, setCssContent, fileInputRef } = useAppContext();
  const { addLog } = useLogger();

  // Pilot mode state
  const [pilotStage, setPilotStage] =
    useState<PilotStage>('collect-references');
  const [feedbackStage, setFeedbackStage] = useState<FeedbackStage>('idle');
  const [feedbackLoopCount, setFeedbackLoopCount] = useState(0);
  const [maxFeedbackLoops] = useState(8);
  const [isProcessing, setIsProcessing] = useState(false);
  const [shouldStop, setShouldStop] = useState(false);
  const [progress, setProgress] = useState(0);

  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [currentPageTitle, setCurrentPageTitle] = useState('Home Page');

  // Helper functions
  const dataUrlToBase64 = (dataUrl: string): string => {
    return dataUrl.split(',')[1];
  };

  // Clean CSS response from AI (remove markdown, extra text, etc.)
  const cleanCSSResponse = (response: string): string => {
    let cleaned = response;

    console.log(
      '[PILOT-DEBUG] Raw AI response:',
      response.substring(0, 300) + '...',
    );

    // Remove markdown code blocks
    cleaned = cleaned.replace(/```css\s*/gi, '');
    cleaned = cleaned.replace(/```\s*$/gi, '');
    cleaned = cleaned.replace(/```/g, '');

    // Remove status messages and explanatory text at the beginning
    cleaned = cleaned.replace(/^.*?MATCH_STATUS[^\n]*\n/gi, '');
    cleaned = cleaned.replace(/^.*?NEEDS_IMPROVEMENT[^\n]*\n/gi, '');
    cleaned = cleaned.replace(/^.*?COMPLETE[^\n]*\n/gi, '');

    // Remove CSS variables, imports, and complex definitions (we want only direct styling)
    cleaned = cleaned.replace(/@import[^;]+;/g, '');
    cleaned = cleaned.replace(/:root\s*{[^}]*}/gs, '');
    cleaned = cleaned.replace(/--[^:]+:[^;]+;/g, '');

    // Remove any leading/trailing whitespace
    cleaned = cleaned.trim();

    // Look for CSS patterns (class selectors, attribute selectors, etc.)
    const cssPatterns = [
      /\.[a-zA-Z0-9_-]+[^{]*\s*{/, // .class-name {
      /\[[^}]*\]\s*{/, // [attribute] {
      /[a-zA-Z0-9_-]+\s*{/, // element {
    ];

    let cssStartIndex = -1;
    for (const pattern of cssPatterns) {
      const match = cleaned.match(pattern);
      if (match) {
        const matchIndex = cleaned.indexOf(match[0]);
        if (cssStartIndex === -1 || matchIndex < cssStartIndex) {
          cssStartIndex = matchIndex;
        }
      }
    }

    // If we found CSS, extract from that point
    if (cssStartIndex >= 0) {
      cleaned = cleaned.substring(cssStartIndex);
    }

    // Remove any trailing explanatory text after the last CSS rule
    const lastBraceIndex = cleaned.lastIndexOf('}');
    if (lastBraceIndex > 0) {
      cleaned = cleaned.substring(0, lastBraceIndex + 1);
    }

    // Check for non-portal classes and provide warnings
    const cssLines = cleaned.split('\n');
    let hasNonPortalClasses = false;
    const nonPortalClasses: string[] = [];

    cssLines.forEach((line) => {
      const trimmedLine = line.trim();
      if (trimmedLine.includes('{') && trimmedLine.includes('.')) {
        // Extract selector part before {
        const selectorPart = trimmedLine.split('{')[0].trim();
        // Check if it contains non-portal classes
        const classMatches = selectorPart.match(/\.[a-zA-Z0-9_-]+/g);
        if (classMatches) {
          classMatches.forEach((cls) => {
            if (!cls.startsWith('.portal-')) {
              hasNonPortalClasses = true;
              if (!nonPortalClasses.includes(cls)) {
                nonPortalClasses.push(cls);
              }
            }
          });
        }
      }
    });

    if (hasNonPortalClasses) {
      console.warn(
        '[PILOT-DEBUG] Non-portal classes detected:',
        nonPortalClasses,
      );
      addLog(
        `Warning: CSS contains non-portal classes: ${nonPortalClasses.join(', ')}`,
        'warning',
      );

      // Attempt to filter out obvious non-portal classes but keep the CSS structure
      // This is a cautious approach - we log warnings but don't break the CSS
      const problematicPrefixes = [
        '.humand-',
        '.site-',
        '.main-content-',
        '.top-header',
        '.frequent-searches-',
        '.contact-',
        '.footer-',
        '.header-',
        '.search-',
        '.card-',
        '.navigation-',
      ];
      let filteredCss = cleaned;

      problematicPrefixes.forEach((prefix) => {
        // Remove CSS blocks that start with these non-portal prefixes
        const regex = new RegExp(`\\${prefix}[^{]*\\{[^}]*\\}`, 'g');
        const matches = filteredCss.match(regex);
        if (matches) {
          addLog(
            `Filtering out ${matches.length} non-portal CSS rules with prefix '${prefix}'`,
            'info',
          );
          filteredCss = filteredCss.replace(regex, '');
        }
      });

      // Also remove body and html selectors if they're not using portal classes
      filteredCss = filteredCss.replace(/^body\s*\{[^}]*\}/gm, '');
      filteredCss = filteredCss.replace(/^html\s*\{[^}]*\}/gm, '');
      filteredCss = filteredCss.replace(/^main\s*\{[^}]*\}/gm, '');

      // Only use filtered CSS if it still has meaningful content
      if (filteredCss.trim().length > 50 && filteredCss.includes('.portal-')) {
        cleaned = filteredCss;
        addLog('Applied CSS filtering to remove non-portal classes', 'info');
      } else {
        addLog(
          'CSS filtering would remove too much content, keeping original CSS',
          'warning',
        );
      }
    }

    // Additional quality checks and filtering for Humand design matching
    const portalClassCount = (cleaned.match(/\.portal-[a-zA-Z0-9_-]+/g) || [])
      .length;
    const hasGradients = cleaned.includes('gradient');
    const hasBrightColors = /(?:orange|coral|#FF|#F0F|violet|purple)/i.test(
      cleaned,
    );
    const hasHumandBlue =
      /#3B4B8C|#4A5498/i.test(cleaned) ||
      cleaned.toLowerCase().includes('blue');

    if (portalClassCount === 0) {
      addLog(
        'Critical: No portal classes found in CSS after cleaning',
        'error',
      );
    }

    if (hasGradients) {
      console.warn(
        '[PILOT-DEBUG] CSS contains gradients, Humand uses solid blue colors',
      );
      // Replace gradients with solid Humand blue for header/hero sections
      cleaned = cleaned.replace(
        /background[^:]*:\s*[^;]*gradient[^;]*;/gi,
        'background: #3B4B8C !important;',
      );
      addLog(
        'Auto-replaced gradients with Humand blue for proper styling',
        'info',
      );
    }

    if (!hasHumandBlue) {
      console.warn(
        '[PILOT-DEBUG] CSS missing Humand blue colors, adding guidance',
      );
      addLog(
        'CSS should include Humand blue (#3B4B8C) for header and hero sections',
        'info',
      );
    }

    if (hasBrightColors) {
      console.warn(
        '[PILOT-DEBUG] CSS contains bright colors, Humand uses professional blue/white scheme',
      );
    }

    console.log(
      '[PILOT-DEBUG] Cleaned CSS:',
      cleaned.substring(0, 500) + '...',
    );
    console.log('[PILOT-DEBUG] CSS length:', cleaned.length);
    console.log('[PILOT-DEBUG] Portal classes found:', portalClassCount);

    return cleaned.trim();
  };

  const getApiParameters = async () => {
    const model = (await getEnvVariable('GEMINI_MODEL')) || 'gemini-2.0-flash';
    // Define temperatures for different stages - lowered significantly for more consistency
    const temperatureVisualDiff = parseFloat(
      (await getEnvVariable('GEMINI_TEMP_VISUAL_DIFF')) || '0.1',
    );
    const temperatureCssGeneration = parseFloat(
      (await getEnvVariable('GEMINI_TEMP_CSS_GENERATION')) || '0.1',
    );
    const temperatureFeedbackLoop = parseFloat(
      (await getEnvVariable('GEMINI_TEMP_FEEDBACK_LOOP')) || '0.2',
    );
    return {
      model,
      temperatureVisualDiff,
      temperatureCssGeneration,
      temperatureFeedbackLoop,
    };
  };

  // Check if API keys are set whenever this component is shown or apiKey context changes
  useEffect(() => {
    const checkApiKeys = async () => {
      // Check Gemini key
      const geminiKey = await getEnvVariable('GEMINI_API_KEY');
      if (!geminiKey) {
        setGeminiKeyMissing(true);
      } else {
        setGeminiKeyMissing(false);
      }
    };

    checkApiKeys();
  }, [setApiKey, apiKey]);

  // Handle stopping the pilot mode
  const stopPilotMode = () => {
    setShouldStop(true);
    addLog('Pilot mode stopped by user', 'info');
  };

  // Reset stop flag when starting new operations
  const resetStopFlag = () => {
    setShouldStop(false);
  };

  // Get DOM structure for elements with portal- classes
  const getPortalDOMStructure = async (): Promise<string> => {
    try {
      const tab = await getActiveTab();
      if (!tab.id) return '';

      const domStructure = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Function to extract portal elements and their structure
          const extractPortalElements = (
            element: Element,
            depth = 0,
          ): PortalElement | PortalElement[] | null => {
            const portalClass = Array.from(element.classList).find((cls) =>
              cls.startsWith('portal-'),
            );

            if (!portalClass) {
              // If this element doesn't have a portal class, check its children
              const children: PortalElement[] = [];
              Array.from(element.children).forEach((child) => {
                const childResult = extractPortalElements(child, depth);
                if (childResult) {
                  if (Array.isArray(childResult)) {
                    children.push(...childResult);
                  } else {
                    children.push(childResult);
                  }
                }
              });
              return children.length > 0 ? children : null;
            }

            // This element has a portal class
            const tailwindClasses = Array.from(element.classList)
              .filter((cls) => !cls.startsWith('portal-'))
              .sort();

            const result: PortalElement = {
              tagName: element.tagName.toLowerCase(),
              portalClass,
              tailwindClasses,
              children: [],
            };

            // Process children
            Array.from(element.children).forEach((child) => {
              const childResult = extractPortalElements(child, depth + 1);
              if (childResult) {
                if (Array.isArray(childResult)) {
                  result.children.push(...childResult);
                } else {
                  result.children.push(childResult);
                }
              }
            });

            return result;
          };

          // Start from document body
          const structure = extractPortalElements(document.body);
          return structure;
        },
      });

      if (!domStructure[0]?.result) return '';

      // Format the structure as requested - ensure we always pass an array
      const result = domStructure[0].result;
      const elementsArray = Array.isArray(result) ? result : [result];

      const formatStructure = (
        elements: PortalElement[],
        depth = 0,
      ): string => {
        if (!elements || !Array.isArray(elements)) return '';

        return elements
          .map((element) => {
            if (!element.portalClass) return '';

            const prefix = depth === 0 ? '' : '|'.padEnd(depth * 2, ' ') + '_ ';
            const tailwindPart =
              element.tailwindClasses.length > 0
                ? ` [tailwind: ${element.tailwindClasses.join(' ')}]`
                : '';

            let result = `${prefix}${element.tagName} [${element.portalClass}]${tailwindPart}`;

            if (element.children && element.children.length > 0) {
              const childrenFormatted = formatStructure(
                element.children,
                depth + 1,
              );
              if (childrenFormatted) {
                result += '\n' + childrenFormatted;
              }
            }

            return result;
          })
          .filter(Boolean)
          .join('\n');
      };

      return formatStructure(elementsArray);
    } catch (error) {
      console.error('Error getting DOM structure:', error);
      addLog('Failed to extract DOM structure', 'warning');
      return '';
    }
  };

  // Handle reference image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Only allow up to 3 reference images
    if (referenceImages.length + files.length > 3) {
      addLog('Maximum 3 reference images allowed', 'warning');
      return;
    }

    const newImages = [...referenceImages];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const base64 = await readFileAsDataURL(file);
        newImages.push(base64);
      } catch (error) {
        console.error('Error reading file:', error);
        addLog('Error reading image file', 'error');
      }
    }

    setReferenceImages(newImages);

    // Reset file input
    if (e.target) e.target.value = '';
  };

  // Helper function to read file as data URL
  const readFileAsDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Remove reference image
  const removeReferenceImage = (index: number) => {
    const newImages = [...referenceImages];
    newImages.splice(index, 1);
    setReferenceImages(newImages);
  };

  // Take a screenshot of the current page
  const takeScreenshot = async (): Promise<string | null> => {
    const startTime = Date.now();
    console.log(
      '[PILOT-MODE] Starting screenshot capture for feedback analysis...',
    );

    try {
      setFeedbackStage('taking-screenshot');
      setProgress(20);
      addLog('Taking full page screenshot for analysis...', 'info');

      const screenshot = await captureScreenshot({ fullPage: true });

      if (screenshot) {
        setScreenshots([...screenshots, screenshot]);
        setProgress(30);

        const totalTime = Date.now() - startTime;
        const imageSizeKB = Math.round(screenshot.length / 1024);
        console.log(
          `[PILOT-MODE] Screenshot capture successful in ${totalTime}ms, size: ${imageSizeKB}KB`,
        );
        addLog(
          `Screenshot captured successfully (${imageSizeKB}KB)`,
          'success',
        );

        return screenshot;
      } else {
        console.error(
          '[PILOT-MODE] Screenshot capture returned null/empty result',
        );
        addLog('Screenshot capture failed - no data returned', 'error');
        return null;
      }
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(
        `[PILOT-MODE] Screenshot capture failed after ${totalTime}ms:`,
        error,
      );
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      addLog(`Screenshot capture failed: ${errorMessage}`, 'error');
      return null;
    }
  };

  // Helper function to analyze visual differences and provide specific guidance
  const analyzeVisualDifferences = (
    availableClasses: string[],
    currentCSS: string,
  ): string => {
    const guidance = [];

    // CRITICAL: Check for banner background image removal
    const hasBannerImageRemoval =
      currentCSS.includes('.portal-banner__wrapper') &&
      (currentCSS.includes('background-image: none') ||
        currentCSS.includes('background-image:none'));
    if (!hasBannerImageRemoval) {
      guidance.push(
        'CRITICAL: REMOVE banner background image - Target .portal-banner__wrapper with background-image: none !important',
      );
      guidance.push(
        'CRITICAL: SET solid blue background for banner - .portal-banner__wrapper { background: #3B4B8C !important; }',
      );
    }

    // Check for proper Humand blue backgrounds
    const hasProperBlueHeader =
      currentCSS.includes('#3B4B8C') ||
      currentCSS.includes('#4A5498') ||
      currentCSS.includes('blue');
    if (!hasProperBlueHeader) {
      guidance.push(
        'CRITICAL: ADD blue header background (#3B4B8C) - Humand has blue header',
      );
    }

    // Check for gradients (Humand uses solid colors)
    if (
      currentCSS.includes('gradient') ||
      currentCSS.includes('linear-gradient')
    ) {
      guidance.push(
        'REMOVE gradients - Humand uses solid blue colors (#3B4B8C)',
      );
    }

    // Check for missing essential Humand elements
    const essentialClasses = [
      'portal-public',
      'portal-header',
      'portal-common-header',
      'portal-banner__wrapper',
    ];
    const missingEssential = essentialClasses.filter(
      (cls) => availableClasses.includes(cls) && !currentCSS.includes(cls),
    );
    if (missingEssential.length > 0) {
      guidance.push(
        `STYLE missing essential classes: ${missingEssential.join(', ')}`,
      );
    }

    // Specific Humand design guidance with banner focus
    guidance.push(
      'HUMAND BANNER: REMOVE background image completely - use solid blue (#3B4B8C)',
    );
    guidance.push(
      'HUMAND HEADER: Blue background (#3B4B8C) with white navigation text',
    );
    guidance.push(
      'HUMAND HERO: Blue section with white title "How can we help?"',
    );
    guidance.push(
      'HUMAND SEARCH: White rounded search bar in blue hero section',
    );
    guidance.push(
      'HUMAND CONTENT: White background with clean card grid layout',
    );
    guidance.push(
      'HUMAND CARDS: White background, simple icons, clean typography',
    );
    guidance.push('HUMAND FOOTER: Blue background matching header (#3B4B8C)');
    guidance.push('HUMAND STYLE: Professional knowledge base aesthetic');

    return guidance.length > 0
      ? `\nHUMAND DESIGN REQUIREMENTS:\n${guidance.map((g) => `- ${g}`).join('\n')}`
      : '';
  };

  // Stage 1: Generate initial CSS from reference and current images
  const generateInitialCSS = async (
    referenceImage: string,
    currentScreenshot: string,
    domStructure: string,
  ): Promise<string | null> => {
    try {
      setFeedbackStage('generating-css');
      setProgress(40);

      const apiKey = await getEnvVariable('GEMINI_API_KEY');
      if (!apiKey) throw new Error('Gemini API key not found');

      // Get all available portal classes for comprehensive context
      const tab = await getActiveTab();
      let availablePortalClasses: string[] = [];
      let computedStyles: Record<string, Record<string, string>> = {};

      if (tab.id) {
        try {
          // Extract all portal classes from the page
          const portalClassResult = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              const portalElements =
                document.querySelectorAll('[class*="portal-"]');
              const portalClasses = new Set<string>();

              portalElements.forEach((element) => {
                Array.from(element.classList).forEach((cls) => {
                  if (cls.startsWith('portal-')) {
                    portalClasses.add(cls);
                  }
                });
              });

              return Array.from(portalClasses).sort();
            },
          });

          availablePortalClasses = portalClassResult[0]?.result || [];

          // Get computed styles for better context
          const computedStylesResult = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              const portalElements =
                document.querySelectorAll('[class*="portal-"]');
              const result: Record<string, Record<string, string>> = {};

              portalElements.forEach((element) => {
                const classes = Array.from(element.classList);
                const portalClasses = classes.filter((cls) =>
                  cls.startsWith('portal-'),
                );
                const computedStyle = window.getComputedStyle(element);

                portalClasses.forEach((portalClass) => {
                  if (!result[portalClass]) {
                    const styles: Record<string, string> = {};
                    // Key style properties to capture
                    const props = [
                      'color',
                      'background-color',
                      'font-size',
                      'font-weight',
                      'font-family',
                      'padding',
                      'margin',
                      'border',
                      'border-radius',
                      'display',
                      'width',
                      'height',
                      'text-align',
                      'line-height',
                      'box-shadow',
                      'border-color',
                      'border-width',
                    ];

                    props.forEach((prop) => {
                      const value = computedStyle.getPropertyValue(prop);
                      if (
                        value &&
                        value !== '' &&
                        value !== 'initial' &&
                        value !== 'auto'
                      ) {
                        styles[prop] = value;
                      }
                    });

                    result[portalClass] = styles;
                  }
                });
              });

              return result;
            },
          });

          computedStyles = computedStylesResult[0]?.result || {};
        } catch (error) {
          console.warn(
            'Failed to extract portal classes or computed styles:',
            error,
          );
        }
      }

      // Create comprehensive context for better CSS generation
      const availableClassesList =
        availablePortalClasses.length > 0
          ? availablePortalClasses.map((cls) => `.${cls}`).join('\n')
          : 'No portal classes found';

      const computedStylesText =
        Object.keys(computedStyles).length > 0
          ? Object.entries(computedStyles)
              .map(([cls, styles]) => {
                const styleProps = Object.entries(styles)
                  .map(([prop, value]) => `  ${prop}: ${value}`)
                  .join('\n');
                return `.${cls} {\n${styleProps}\n}`;
              })
              .join('\n\n')
          : 'No computed styles available';

      const cssPrompt = `Generate CSS to transform the current page to match the HUMAND design exactly.

HUMAND DESIGN SPECIFICATIONS (EXACT TARGET):
- Blue header background (#3B4B8C or similar dark blue)
- White navigation text in header
- Blue hero section with centered white text "How can we help?"
- White rounded search bar in hero section
- Small blue pill-shaped buttons below search (Frequent searches)
- White main content area with clean card layout
- Cards have simple icons and clean typography
- Blue footer background matching header
- Professional, clean knowledge base aesthetic

CRITICAL: REMOVE BANNER BACKGROUND IMAGE
- Target .portal-banner__wrapper class
- Remove background-image completely
- Use solid blue background (#3B4B8C) instead
- Override any inline background-image styles

AVAILABLE PORTAL CLASSES (ONLY USE THESE):
${availableClassesList}

COMPUTED STYLES FOR CONTEXT:
${computedStylesText}

DOM STRUCTURE:
${domStructure || 'No DOM elements available'}

EXACT HUMAND DESIGN REQUIREMENTS:
1. HEADER: Dark blue background (#3B4B8C), white text, clean navigation
2. HERO/BANNER SECTION:
   - REMOVE background-image completely
   - Use solid blue background (#3B4B8C)
   - Target .portal-banner__wrapper specifically
   - Override: background-image: none !important;
   - Set: background: #3B4B8C !important;
3. HERO TEXT: Centered white title, white search bar
4. SEARCH BAR: White background, rounded corners, subtle border
5. FREQUENT SEARCHES: Small blue pill buttons below search
6. MAIN CONTENT: White background, clean card grid layout
7. CARDS: White background, simple icons, clean typography, subtle shadows
8. FOOTER: Blue background matching header
9. TYPOGRAPHY: Clean, professional fonts, good contrast

CSS GENERATION RULES:
- ONLY use class selectors from the AVAILABLE PORTAL CLASSES list above
- Use dot notation: .portal-class-name { }
- Apply !important to ensure styles override existing ones and inline styles
- CRITICAL: Target .portal-banner__wrapper to remove background image
- Use BLUE backgrounds for header/hero/footer (#3B4B8C or #4A5498)
- Use WHITE backgrounds for search bar and main content (#FFFFFF)
- Create clean card layouts with proper spacing
- Match Humand's professional knowledge base aesthetic exactly

SPECIFIC BANNER IMAGE OVERRIDE:
.portal-banner__wrapper {
  background-image: none !important;
  background: #3B4B8C !important;
}

CRITICAL REQUIREMENTS:
- Transform current page to look exactly like Humand reference
- REMOVE the banner background image completely
- Use solid blue (#3B4B8C) for banner/hero section
- Create white search bar with rounded corners
- Build clean white card layout for main content
- Use blue footer matching header
- Generate comprehensive CSS covering all visible elements

Output ONLY CSS with dot notation selectors:`;

      const parts: MessagePart[] = [{ text: cssPrompt }];

      // Add reference image
      if (isValidImageData(referenceImage)) {
        try {
          const imgData = dataUrlToBase64(referenceImage);
          const mimeType = referenceImage.split(';')[0].split(':')[1];
          parts.push({
            inline_data: {
              data: imgData,
              mime_type: mimeType,
            },
          });
        } catch (error) {
          console.warn('Failed to add reference image:', error);
        }
      }

      // Add current screenshot
      if (isValidImageData(currentScreenshot)) {
        try {
          const imgData = dataUrlToBase64(currentScreenshot);
          const mimeType = currentScreenshot.split(';')[0].split(':')[1];
          parts.push({
            inline_data: {
              data: imgData,
              mime_type: mimeType,
            },
          });
        } catch (error) {
          console.warn('Failed to add current screenshot:', error);
        }
      }

      const { model, temperatureCssGeneration } = await getApiParameters();
      // Use fresh session ID for initial CSS generation - no chat history
      const freshCssSessionId = `css_fresh_${Date.now()}_${Math.random()}`;
      const messages: GeminiMessage[] = [{ role: 'user', parts }];

      const generatedCSS = await makeGeminiRequest({
        apiKey,
        messages,
        modelName: model,
        sessionId: freshCssSessionId,
        temperature: temperatureCssGeneration,
      });

      if (!generatedCSS) {
        throw new Error('No CSS generated from images');
      }

      const cleanedCSS = cleanCSSResponse(generatedCSS);

      // Validate that the initial CSS only uses portal classes
      const cssLines = cleanedCSS.split('\n');
      const hasOnlyPortalClasses = cssLines.every((line) => {
        const trimmedLine = line.trim();
        if (
          !trimmedLine ||
          trimmedLine.startsWith('/*') ||
          trimmedLine.endsWith('*/')
        )
          return true;
        if (trimmedLine.includes('{') && trimmedLine.includes('.')) {
          // Extract selector part before {
          const selectorPart = trimmedLine.split('{')[0].trim();
          // Check if it contains non-portal classes
          const classMatches = selectorPart.match(/\.[a-zA-Z0-9_-]+/g);
          if (classMatches) {
            return classMatches.every((cls) => cls.startsWith('.portal-'));
          }
        }
        return true;
      });

      // Log detailed CSS analysis
      const portalClassCount = (
        cleanedCSS.match(/\.portal-[a-zA-Z0-9_-]+/g) || []
      ).length;
      const backgroundColorRules = (
        cleanedCSS.match(/background-color:[^;]+/g) || []
      ).length;
      const colorRules = (cleanedCSS.match(/color:[^;]+/g) || []).length;

      console.log('[PILOT-DEBUG] Initial CSS Analysis:', {
        totalLength: cleanedCSS.length,
        portalClassCount,
        backgroundColorRules,
        colorRules,
        hasOnlyPortalClasses,
      });

      if (!hasOnlyPortalClasses) {
        addLog(
          'Warning: Initial CSS contains non-portal classes, but applying anyway',
          'warning',
        );
      } else {
        addLog(
          `Generated high-quality CSS with ${portalClassCount} portal class rules`,
          'success',
        );
      }

      // Additional validation for CSS quality
      if (cleanedCSS.length < 100) {
        addLog(
          'Warning: Generated CSS seems very short, may be incomplete',
          'warning',
        );
      }

      if (portalClassCount === 0) {
        addLog('Error: No portal classes found in generated CSS', 'error');
      }

      console.log('Generated initial CSS:', cleanedCSS);
      addLog('Initial CSS generation completed successfully', 'info');
      return cleanedCSS;
    } catch (error) {
      console.error('Error generating initial CSS:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      addLog(`Failed to generate initial CSS: ${errorMessage}`, 'error');
      return null;
    }
  };

  // Stage 2: Simple feedback - generate new CSS or return DONE
  const getSimpleFeedback = async (
    newScreenshot: string,
    domStructure: string,
    currentCSS: string,
  ): Promise<{ isDone: boolean; newCSS?: string }> => {
    try {
      setFeedbackStage('getting-feedback');
      setProgress(75);

      const apiKey = await getEnvVariable('GEMINI_API_KEY');
      if (!apiKey) throw new Error('Gemini API key not found');

      // Get all available portal classes and computed styles
      const tab = await getActiveTab();
      let availablePortalClasses: string[] = [];
      let computedStyles: Record<string, Record<string, string>> = {};

      if (tab.id) {
        try {
          // Extract all portal classes from the page
          const portalClassResult = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              const portalElements =
                document.querySelectorAll('[class*="portal-"]');
              const portalClasses = new Set<string>();

              portalElements.forEach((element) => {
                Array.from(element.classList).forEach((cls) => {
                  if (cls.startsWith('portal-')) {
                    portalClasses.add(cls);
                  }
                });
              });

              return Array.from(portalClasses).sort();
            },
          });

          availablePortalClasses = portalClassResult[0]?.result || [];

          // Get computed styles for better context
          const computedStylesResult = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              const portalElements =
                document.querySelectorAll('[class*="portal-"]');
              const result: Record<string, Record<string, string>> = {};

              portalElements.forEach((element) => {
                const classes = Array.from(element.classList);
                const portalClasses = classes.filter((cls) =>
                  cls.startsWith('portal-'),
                );
                const computedStyle = window.getComputedStyle(element);

                portalClasses.forEach((portalClass) => {
                  if (!result[portalClass]) {
                    const styles: Record<string, string> = {};
                    // Key style properties to capture
                    const props = [
                      'color',
                      'background-color',
                      'font-size',
                      'font-weight',
                      'font-family',
                      'padding',
                      'margin',
                      'border',
                      'border-radius',
                      'display',
                      'width',
                      'height',
                      'text-align',
                      'line-height',
                      'box-shadow',
                      'border-color',
                      'border-width',
                    ];

                    props.forEach((prop) => {
                      const value = computedStyle.getPropertyValue(prop);
                      if (
                        value &&
                        value !== '' &&
                        value !== 'initial' &&
                        value !== 'auto'
                      ) {
                        styles[prop] = value;
                      }
                    });

                    result[portalClass] = styles;
                  }
                });
              });

              return result;
            },
          });

          computedStyles = computedStylesResult[0]?.result || {};
        } catch (error) {
          console.warn(
            'Failed to extract portal classes or computed styles:',
            error,
          );
        }
      }

      // Create comprehensive context for better feedback
      const availableClassesList =
        availablePortalClasses.length > 0
          ? availablePortalClasses.map((cls) => `.${cls}`).join('\n')
          : 'No portal classes found';

      const computedStylesText =
        Object.keys(computedStyles).length > 0
          ? Object.entries(computedStyles)
              .map(([cls, styles]) => {
                const styleProps = Object.entries(styles)
                  .map(([prop, value]) => `  ${prop}: ${value}`)
                  .join('\n');
                return `.${cls} {\n${styleProps}\n}`;
              })
              .join('\n\n')
          : 'No computed styles available';

      // Get specific visual guidance based on current state
      const visualGuidance = analyzeVisualDifferences(
        availablePortalClasses,
        currentCSS || '',
      );

      const feedbackPrompt = `Analyze the current design and provide CSS improvements to better match HUMAND reference design.

HUMAND TARGET SPECIFICATIONS:
- Dark blue header background (#3B4B8C)
- Blue hero section with white text "How can we help?"
- WHITE search bar (not blue) in hero section - very important
- White main content area with clean cards
- Blue footer matching header
- BANNER IMAGE MUST BE REMOVED - check .portal-banner__wrapper has no background-image

CRITICAL BANNER CHECK:
- Verify .portal-banner__wrapper has background-image: none !important
- Should use solid blue background (#3B4B8C) instead of image
- Override any inline background-image styles completely

VISUAL ASSESSMENT REQUIRED:
1. BANNER/HERO: Is background image removed? Is it solid blue?
2. SEARCH BAR: Is it white (not blue)? Does it stand out in blue hero?
3. HEADER: Is it dark blue with white text?
4. MAIN CONTENT: Are cards clean with white backgrounds?
5. FOOTER: Does it match header blue color?
6. OVERALL: Does it look like professional Humand knowledge base?

AVAILABLE PORTAL CLASSES (ONLY USE THESE):
${availableClassesList}

COMPUTED STYLES FOR CONTEXT:
${computedStylesText}

DOM STRUCTURE:
${domStructure || 'No DOM structure available'}${visualGuidance}

Provide specific CSS improvements focusing on:
- Removing banner background image completely
- Making search bar white and prominent
- Matching Humand's clean professional aesthetic
- Using proper blue (#3B4B8C) and white colors

ONLY use portal classes. Include !important for overrides.`;

      const parts: MessagePart[] = [{ text: feedbackPrompt }];

      // Add reference image
      if (referenceImages.length > 0 && isValidImageData(referenceImages[0])) {
        try {
          const imgData = dataUrlToBase64(referenceImages[0]);
          const mimeType = referenceImages[0].split(';')[0].split(':')[1];
          parts.push({
            inline_data: {
              data: imgData,
              mime_type: mimeType,
            },
          });
        } catch (error) {
          console.warn('Failed to add reference image for feedback:', error);
        }
      }

      // Add current screenshot
      if (isValidImageData(newScreenshot)) {
        try {
          const imgData = dataUrlToBase64(newScreenshot);
          const mimeType = newScreenshot.split(';')[0].split(':')[1];
          parts.push({
            inline_data: {
              data: imgData,
              mime_type: mimeType,
            },
          });
        } catch (error) {
          console.warn('Failed to add new screenshot for feedback:', error);
        }
      }

      const { model, temperatureFeedbackLoop } = await getApiParameters();
      // Use fresh session ID for each feedback call - no chat history
      const freshSessionId = `feedback_fresh_${Date.now()}_${Math.random()}`;

      const messages: GeminiMessage[] = [{ role: 'user', parts }];

      const feedbackResult = await makeGeminiRequest({
        apiKey,
        messages,
        modelName: model,
        sessionId: freshSessionId,
        temperature: temperatureFeedbackLoop,
      });

      if (!feedbackResult) {
        addLog('No feedback received, stopping', 'warning');
        return { isDone: true };
      }

      console.log('Feedback result:', feedbackResult);

      // Simple detection - if response contains "DONE", we're finished
      if (feedbackResult.trim().toUpperCase().includes('DONE')) {
        addLog('AI says transformation is complete', 'success');
        return { isDone: true };
      }

      // Otherwise, extract CSS
      const cleanedCSS = cleanCSSResponse(feedbackResult);
      if (cleanedCSS && cleanedCSS.length > 10) {
        // Validate that the CSS only uses portal classes
        const cssLines = cleanedCSS.split('\n');
        const hasOnlyPortalClasses = cssLines.every((line) => {
          const trimmedLine = line.trim();
          if (
            !trimmedLine ||
            trimmedLine.startsWith('/*') ||
            trimmedLine.endsWith('*/')
          )
            return true;
          if (trimmedLine.includes('{') && trimmedLine.includes('.')) {
            // Extract selector part before {
            const selectorPart = trimmedLine.split('{')[0].trim();
            // Check if it contains non-portal classes
            const classMatches = selectorPart.match(/\.[a-zA-Z0-9_-]+/g);
            if (classMatches) {
              return classMatches.every((cls) => cls.startsWith('.portal-'));
            }
          }
          return true;
        });

        // Log detailed CSS analysis for feedback iteration
        const portalClassCount = (
          cleanedCSS.match(/\.portal-[a-zA-Z0-9_-]+/g) || []
        ).length;
        const backgroundColorRules = (
          cleanedCSS.match(/background-color:[^;]+/g) || []
        ).length;
        const colorRules = (cleanedCSS.match(/color:[^;]+/g) || []).length;
        const hasBackgroundChanges = cleanedCSS
          .toLowerCase()
          .includes('background');
        const hasColorChanges = cleanedCSS.toLowerCase().includes('color:');

        console.log(
          `[PILOT-DEBUG] Feedback Loop ${feedbackLoopCount} CSS Analysis:`,
          {
            totalLength: cleanedCSS.length,
            portalClassCount,
            backgroundColorRules,
            colorRules,
            hasOnlyPortalClasses,
            hasBackgroundChanges,
            hasColorChanges,
          },
        );

        if (!hasOnlyPortalClasses) {
          addLog(
            'Warning: Generated CSS contains non-portal classes, but applying anyway',
            'warning',
          );
        } else {
          addLog(
            `Feedback loop ${feedbackLoopCount}: Generated CSS with ${portalClassCount} portal class rules`,
            'success',
          );
        }

        // Additional quality checks
        if (portalClassCount === 0) {
          addLog(
            `Feedback loop ${feedbackLoopCount}: Warning - No portal classes found in generated CSS`,
            'warning',
          );
        }

        if (!hasBackgroundChanges && !hasColorChanges) {
          addLog(
            `Feedback loop ${feedbackLoopCount}: Warning - CSS doesn't seem to address color/background changes`,
            'warning',
          );
        }

        addLog(
          `Generated new CSS for feedback loop ${feedbackLoopCount}`,
          'info',
        );
        return { isDone: false, newCSS: cleanedCSS };
      } else {
        addLog('No valid CSS found in feedback, stopping', 'warning');
        return { isDone: true };
      }
    } catch (error) {
      console.error('Error getting feedback:', error);
      addLog('Error getting feedback, stopping', 'error');
      return { isDone: true };
    }
  };

  // Simplified feedback loop with 2-stage approach
  const runFeedbackLoop = async (): Promise<boolean> => {
    try {
      setIsProcessing(true);
      resetStopFlag();
      setProgress(0);

      if (referenceImages.length === 0) {
        addLog('No reference images available', 'warning');
        return false;
      }

      // Step 1: Take initial screenshot
      setFeedbackStage('taking-screenshot');
      const initialScreenshot = await takeScreenshot();
      if (!initialScreenshot || shouldStop) {
        return false;
      }

      // Get DOM structure
      const fullDomStructure = await getPortalDOMStructure();
      const domStructure =
        fullDomStructure.length > 800
          ? fullDomStructure.substring(0, 800) + '...'
          : fullDomStructure;

      console.log('DOM structure:', domStructure);

      // Step 2: Generate initial CSS from both images
      const initialCSS = await generateInitialCSS(
        referenceImages[0],
        initialScreenshot,
        domStructure,
      );

      if (!initialCSS || shouldStop) {
        addLog('Failed to generate initial CSS', 'error');
        return false;
      }

      // Apply initial CSS and track it
      let currentAppliedCSS = initialCSS;
      try {
        await applyCSSToEditor(initialCSS);
        setProgress(60);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        if (shouldStop) return false;
        addLog('Failed to apply initial CSS', 'error');
        return false;
      }

      // Step 3: Simple feedback loops
      for (let i = 0; i < maxFeedbackLoops; i++) {
        if (shouldStop) return false;

        setFeedbackLoopCount(i + 1);
        addLog(`Starting feedback loop ${i + 1}/${maxFeedbackLoops}`, 'info');

        // Take new screenshot
        const newScreenshot = await takeScreenshot();
        if (!newScreenshot || shouldStop) {
          if (shouldStop) return false;
          break;
        }

        // Get simple feedback with current CSS context
        const feedback = await getSimpleFeedback(
          newScreenshot,
          domStructure,
          currentAppliedCSS,
        );
        if (shouldStop) return false;

        if (feedback.isDone) {
          setProgress(100);
          setFeedbackStage('complete');
          addLog('Transformation completed successfully!', 'success');
          return true;
        }

        // Apply new CSS if provided and update tracking
        if (feedback.newCSS) {
          try {
            await applyCSSToEditor(feedback.newCSS);
            currentAppliedCSS = feedback.newCSS; // Track the current CSS
            await new Promise((resolve) => setTimeout(resolve, 2000));
          } catch (error) {
            if (shouldStop) return false;
            addLog('Failed to apply feedback CSS', 'warning');
          }
        }
      }

      // Max loops reached
      setProgress(100);
      setFeedbackStage('complete');
      addLog(`Completed after ${maxFeedbackLoops} feedback loops`, 'info');
      return true;
    } catch (error) {
      console.error('Error in feedback loop:', error);
      addLog('Error in transformation process', 'error');
      return false;
    } finally {
      setIsProcessing(false);
    }
  };

  // Navigate to inner page by clicking on portal-directory-card
  const navigateToInnerPage = async (): Promise<boolean> => {
    try {
      setIsProcessing(true);
      setProgress(30);

      // Check if we should stop
      if (shouldStop) {
        return false;
      }

      const tab = await getActiveTab();
      if (!tab.id) throw new Error('No active tab found');

      // Click on the first portal-directory-card element
      const clickResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const card = document.querySelector(
            '.portal-directory-card',
          ) as HTMLElement;
          if (card) {
            card.click();
            return true;
          }
          return false;
        },
      });

      if (!clickResult[0]?.result) {
        throw new Error('No portal-directory-card found to click');
      }

      // Wait for page to load
      setProgress(60);

      // Check for stop during wait
      for (let i = 0; i < 30; i++) {
        // 3 seconds in 100ms chunks
        if (shouldStop) {
          return false;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Get page title
      const titleResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => document.title || 'Inner Page',
      });

      setCurrentPageTitle(titleResult[0]?.result || 'Inner Page');
      setProgress(100);

      return true;
    } catch (error) {
      console.error('Error navigating:', error);
      return false;
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle starting customization process
  const startCustomization = async () => {
    if (referenceImages.length === 0) {
      addLog('Please upload at least one reference image', 'warning');
      return;
    }

    setPilotStage('customizing-home');
    setFeedbackLoopCount(0);
    setCurrentPageTitle('Home Page');
    resetStopFlag();

    addLog('Starting home page customization...', 'info');
    const success = await runFeedbackLoop();

    if (!success && shouldStop) {
      // Reset to initial state if stopped
      setPilotStage('collect-references');
      setFeedbackStage('idle');
      setProgress(0);
      addLog('Home page customization stopped by user', 'info');
    }
  };

  // Handle moving to next page
  const moveToNextPage = async () => {
    setPilotStage('navigate-to-inner');
    resetStopFlag();
    const success = await navigateToInnerPage();

    if (success && !shouldStop) {
      setPilotStage('customizing-inner');
      setFeedbackLoopCount(0);
      addLog('Starting inner page customization...', 'info');
      const innerSuccess = await runFeedbackLoop();

      if (!innerSuccess && shouldStop) {
        // If stopped during inner page customization, go back to home complete state
        setPilotStage('customizing-home');
        setFeedbackStage('complete');
        addLog('Inner page customization stopped by user', 'info');
      }
    } else if (shouldStop) {
      // If stopped during navigation, stay at home page complete
      setPilotStage('customizing-home');
      setFeedbackStage('complete');
      addLog('Navigation stopped by user', 'info');
    }
  };

  // Handle completing the process
  const completeProcess = () => {
    setPilotStage('complete');
    addLog('Pilot mode completed successfully', 'success');
  };

  // Handle starting new session
  const startNewSession = () => {
    setPilotStage('collect-references');
    setFeedbackStage('idle');
    setFeedbackLoopCount(0);
    setReferenceImages([]);
    setScreenshots([]);
    setCssContent('');
    setProgress(0);
    setShouldStop(false);
    addLog('Starting new pilot session', 'info');
  };

  // Apply CSS to CSS editor (which will auto-apply to page)
  const applyCSSToEditor = async (css: string): Promise<void> => {
    try {
      setFeedbackStage('applying-css');
      setProgress(70);

      // Check if we should stop
      if (shouldStop) {
        throw new Error('Stopped by user');
      }

      // Log the CSS for debugging - first 500 chars
      const cssPreview = css.length > 500 ? css.substring(0, 500) + '...' : css;
      console.log('Applying CSS to editor:', cssPreview);
      addLog(`Applying CSS (${css.length} characters)`, 'info');

      // Validate CSS is not empty
      if (!css || css.trim().length < 10) {
        throw new Error('Generated CSS is empty or too short');
      }

      // Set CSS content in the editor context
      setCssContent(css);

      // Also apply CSS directly to the page to ensure it takes effect immediately
      const tab = await getActiveTab();
      if (tab.id) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (cssContent) => {
            // Remove existing style if it exists
            const existingStyle = document.getElementById(
              'portal-generated-css',
            );
            if (existingStyle) {
              existingStyle.remove();
            }

            // Create and add new style element
            const styleEl = document.createElement('style');
            styleEl.id = 'portal-generated-css';
            styleEl.textContent = cssContent;
            document.head.appendChild(styleEl);
          },
          args: [css],
        });
        addLog('CSS applied directly to page', 'info');

        // Verify CSS was applied by checking the DOM
        const verificationResult = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const styleEl = document.getElementById('portal-generated-css');
            return {
              exists: !!styleEl,
              contentLength: styleEl ? styleEl.textContent?.length || 0 : 0,
            };
          },
        });

        if (verificationResult[0]?.result) {
          const { exists, contentLength } = verificationResult[0].result;
          console.log(
            '[PILOT-DEBUG] CSS verification - exists:',
            exists,
            'length:',
            contentLength,
          );
          if (!exists) {
            addLog(
              'Warning: CSS style element not found in DOM after application',
              'warning',
            );
          } else {
            addLog(`CSS verified in DOM (${contentLength} characters)`, 'info');
          }
        }

        // Check if CSS selectors match any elements on the page
        const selectorCheckResult = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (cssContent) => {
            // Extract CSS selectors from the CSS content
            const selectorMatches =
              cssContent.match(/\.[a-zA-Z0-9_-]+[^{]*(?=\s*{)/g) || [];
            const uniqueSelectors = [
              ...new Set(selectorMatches.map((sel) => sel.trim())),
            ];

            const selectorResults = [];
            for (const selector of uniqueSelectors.slice(0, 10)) {
              // Check first 10 selectors
              try {
                const elements = document.querySelectorAll(selector);
                selectorResults.push({
                  selector,
                  matchCount: elements.length,
                  exists: elements.length > 0,
                });
              } catch (e) {
                selectorResults.push({
                  selector,
                  matchCount: 0,
                  exists: false,
                  error: e instanceof Error ? e.message : String(e),
                });
              }
            }

            return selectorResults;
          },
          args: [css],
        });

        if (selectorCheckResult[0]?.result) {
          const selectorResults = selectorCheckResult[0].result;
          console.log(
            '[PILOT-DEBUG] CSS selector check results:',
            selectorResults,
          );

          const workingSelectors = selectorResults.filter((r) => r.exists);
          const failingSelectors = selectorResults.filter((r) => !r.exists);

          if (failingSelectors.length > 0) {
            console.log(
              '[PILOT-DEBUG] Selectors with no matches:',
              failingSelectors.map((r) => r.selector),
            );
            addLog(
              `Warning: ${failingSelectors.length} CSS selectors don't match any elements`,
              'warning',
            );
          }

          if (workingSelectors.length > 0) {
            addLog(
              `${workingSelectors.length} CSS selectors found matching elements`,
              'info',
            );
          }
        }
      }

      // Wait a moment for the CSS to be applied and take effect
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Check again after waiting
      if (shouldStop) {
        throw new Error('Stopped by user');
      }

      addLog('CSS applied successfully', 'success');
    } catch (error) {
      console.error('Error applying CSS:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      addLog(`Error applying CSS: ${errorMessage}`, 'error');
      throw error; // Re-throw to stop the feedback loop
    }
  };

  // Render different content based on the current pilot stage
  const renderStageContent = () => {
    switch (pilotStage) {
      case 'collect-references':
        return (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-lg font-medium text-blue-800 mb-2">
                Reference Images
              </h3>
              <p className="text-sm text-blue-700 mb-3">
                Upload up to 3 reference images that show the design style you
                want to apply to your portal.
              </p>

              <div className="flex flex-wrap gap-4 mb-4">
                {referenceImages.map((image, index) => (
                  <div key={index} className="relative">
                    <img
                      src={image}
                      alt={`Reference ${index + 1}`}
                      className="w-32 h-32 object-cover rounded-md border border-gray-300"
                    />
                    <button
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"
                      onClick={() => removeReferenceImage(index)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}

                {referenceImages.length < 3 && (
                  <button
                    className="w-32 h-32 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-md hover:border-blue-500 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImageIcon className="mb-2 text-gray-400" />
                    <span className="text-sm text-gray-500">Add Image</span>
                  </button>
                )}
              </div>

              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleImageUpload}
                multiple
              />

              <p className="text-xs text-gray-500">
                Images will be used to generate CSS that makes your portal look
                similar to the reference design.
              </p>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={startCustomization}
                disabled={referenceImages.length === 0 || isProcessing}
                className="flex items-center"
              >
                {isProcessing ? (
                  <>
                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <PlayCircle className="mr-2 h-4 w-4" />
                    Customize Portal
                  </>
                )}
              </Button>
            </div>
          </div>
        );

      case 'customizing-home':
      case 'customizing-inner':
        return (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-lg font-medium text-blue-800 mb-2">
                Customizing{' '}
                {pilotStage === 'customizing-home'
                  ? 'Home Page'
                  : currentPageTitle}
              </h3>
              <p className="text-sm text-blue-700 mb-3">
                {feedbackStage === 'idle' &&
                  'Ready to start customization process.'}
                {feedbackStage === 'taking-screenshot' &&
                  'Taking screenshot of current page...'}
                {feedbackStage === 'generating-visual-diff' &&
                  'Analyzing visual differences between reference and current page...'}
                {feedbackStage === 'generating-css' &&
                  'Generating CSS based on visual analysis...'}
                {feedbackStage === 'applying-css' &&
                  'Applying generated CSS to the page...'}
                {feedbackStage === 'getting-feedback' &&
                  'Getting AI feedback on the results...'}
                {feedbackStage === 'complete' &&
                  'Page customization completed successfully!'}
              </p>

              <div className="mb-3">
                <Progress value={progress} className="h-2 mb-1" />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>
                    Feedback Loop: {feedbackLoopCount}/{maxFeedbackLoops}
                  </span>
                  <span className="capitalize">
                    {feedbackStage.replace('-', ' ')}
                  </span>
                </div>
              </div>

              {feedbackStage === 'idle' && (
                <Button
                  onClick={runFeedbackLoop}
                  disabled={isProcessing}
                  className="w-full flex items-center justify-center"
                >
                  <PlayCircle className="mr-2 h-4 w-4" />
                  Start Customization
                </Button>
              )}

              {isProcessing &&
                feedbackStage !== 'idle' &&
                feedbackStage !== 'complete' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-center text-blue-600 py-2">
                      <Loader className="mr-2 h-4 w-4 animate-spin" />
                      <span>Processing...</span>
                    </div>
                    <Button
                      onClick={stopPilotMode}
                      variant="destructive"
                      className="w-full flex items-center justify-center"
                    >
                      <StopCircle className="mr-2 h-4 w-4" />
                      Stop Customization
                    </Button>
                  </div>
                )}

              {feedbackStage === 'complete' && (
                <div className="flex items-center justify-center text-green-600 py-2">
                  <CheckCircle2 className="mr-2 h-5 w-5" />
                  <span>
                    {pilotStage === 'customizing-home'
                      ? 'Home page customization complete!'
                      : 'Inner page customization complete!'}
                  </span>
                </div>
              )}
            </div>

            {feedbackStage === 'complete' && (
              <div className="flex justify-end">
                <Button
                  onClick={
                    pilotStage === 'customizing-home'
                      ? moveToNextPage
                      : completeProcess
                  }
                  disabled={isProcessing}
                  className="flex items-center"
                >
                  {pilotStage === 'customizing-home' ? (
                    <>
                      Customize Next Page{' '}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  ) : (
                    <>
                      Complete Process <CheckCircle2 className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        );

      case 'navigate-to-inner':
        return (
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="text-lg font-medium text-yellow-800 mb-2">
                Navigating to Inner Page
              </h3>
              <p className="text-sm text-yellow-700 mb-3">
                Automatically clicking on the first portal directory card to
                navigate to the inner page...
              </p>

              <div className="mb-3">
                <Progress value={progress} className="h-2 mb-1" />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-center text-yellow-600 py-2">
                  <Loader className="mr-2 h-4 w-4 animate-spin" />
                  <span>Navigating...</span>
                </div>

                {isProcessing && (
                  <Button
                    onClick={stopPilotMode}
                    variant="destructive"
                    className="w-full flex items-center justify-center"
                  >
                    <StopCircle className="mr-2 h-4 w-4" />
                    Stop Navigation
                  </Button>
                )}
              </div>
            </div>
          </div>
        );

      case 'complete':
        return (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
              <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-3" />
              <h3 className="text-xl font-medium text-green-800 mb-2">
                Customization Complete!
              </h3>
              <p className="text-green-700 mb-4">
                Your portal has been successfully customized based on your
                reference images.
              </p>
              <p className="text-sm text-green-600 mb-4">
                Both the home page and inner page have been styled. The CSS
                changes have been applied to your portal through the CSS Editor.
              </p>

              <Button
                onClick={startNewSession}
                className="bg-green-600 hover:bg-green-700"
              >
                Start New Customization
              </Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="pb-12 h-full flex flex-col gap-4 overflow-y-auto p-4 bg-gray-50">
      {geminiKeyMissing && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-2 flex items-center gap-2">
          <AlertCircle size={16} className="text-amber-500" />
          <span className="text-sm text-amber-800">
            Gemini API key not found. Please set it in the Settings tab.
          </span>
        </div>
      )}

      <div>
        <h2 className="text-xl font-semibold mb-1">Pilot Mode</h2>
        <p className="text-sm text-gray-600 mb-3">
          Automated portal customization using your reference images and AI
        </p>
      </div>

      {renderStageContent()}
    </div>
  );
};
