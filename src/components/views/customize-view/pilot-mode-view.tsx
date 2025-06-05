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
  const { setApiKey, apiKey, setCssContent, cssContent, fileInputRef } =
    useAppContext();
  const { addLog } = useLogger();

  // Pilot mode state
  const [pilotStage, setPilotStage] =
    useState<PilotStage>('collect-references');
  const [feedbackStage, setFeedbackStage] = useState<FeedbackStage>('idle');
  const [feedbackLoopCount, setFeedbackLoopCount] = useState(0);
  const [maxFeedbackLoops] = useState(4);
  const [isProcessing, setIsProcessing] = useState(false);
  const [shouldStop, setShouldStop] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [currentPageTitle, setCurrentPageTitle] = useState('Home Page');

  // Helper functions
  const dataUrlToBase64 = (dataUrl: string): string => {
    return dataUrl.split(',')[1];
  };

  // Compress image data URL to reduce token usage
  const compressImageForAPI = (
    dataUrl: string,
    maxWidth = 800,
  ): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Calculate new dimensions
        const ratio = Math.min(maxWidth / img.width, maxWidth / img.height);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;

        // Draw compressed image
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Get compressed data URL
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
        resolve(compressedDataUrl);
      };
      img.src = dataUrl;
    });
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

    console.log(
      '[PILOT-DEBUG] Cleaned CSS:',
      cleaned.substring(0, 500) + '...',
    );
    console.log('[PILOT-DEBUG] CSS length:', cleaned.length);

    return cleaned.trim();
  };

  const getApiParameters = async () => {
    const model = (await getEnvVariable('GEMINI_MODEL')) || 'gemini-2.0-flash';
    // Define temperatures for different stages - lowered for more consistency
    const temperatureVisualDiff = parseFloat(
      (await getEnvVariable('GEMINI_TEMP_VISUAL_DIFF')) || '0.2',
    );
    const temperatureCssGeneration = parseFloat(
      (await getEnvVariable('GEMINI_TEMP_CSS_GENERATION')) || '0.3',
    );
    const temperatureFeedbackLoop = parseFloat(
      (await getEnvVariable('GEMINI_TEMP_FEEDBACK_LOOP')) || '0.7',
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

    // Initialize session ID
    setSessionId(`pilot_session_${Date.now()}`);
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

  // Stage 1: Generate visual diff analysis using LLM - more dynamic approach
  const generateVisualDiffAnalysis = async (
    referenceImage: string,
    currentScreenshot: string,
    domStructure: string,
  ): Promise<string> => {
    try {
      setFeedbackStage('generating-visual-diff');
      setProgress(25);

      const apiKey = await getEnvVariable('GEMINI_API_KEY');
      if (!apiKey) throw new Error('Gemini API key not found');

      const diffPrompt = `Compare Image 1 (reference) vs Image 2 (current). Extract SPECIFIC styling details.

DOM: ${domStructure || 'No elements'}

From reference image, identify EXACT:
- Background colors (hex codes)
- Text colors
- Card styling (shadows, borders, radius)
- Search bar design
- Header appearance
- Button styles

Create detailed transformation plan with specific CSS values for portal-* classes shown in DOM to match reference design.`;

      const parts: MessagePart[] = [{ text: diffPrompt }];

      // Compress and add images to reduce token usage
      if (isValidImageData(referenceImage)) {
        try {
          const compressedRef = await compressImageForAPI(referenceImage, 600);
          const imgData = dataUrlToBase64(compressedRef);
          const mimeType = compressedRef.split(';')[0].split(':')[1];
          parts.push({
            inline_data: {
              data: imgData,
              mime_type: mimeType,
            },
          });
        } catch (error) {
          console.warn('Failed to compress reference image, skipping:', error);
        }
      }

      if (isValidImageData(currentScreenshot)) {
        try {
          const compressedCurrent = await compressImageForAPI(
            currentScreenshot,
            600,
          );
          const imgData = dataUrlToBase64(compressedCurrent);
          const mimeType = compressedCurrent.split(';')[0].split(':')[1];
          parts.push({
            inline_data: {
              data: imgData,
              mime_type: mimeType,
            },
          });
        } catch (error) {
          console.warn(
            'Failed to compress current screenshot, skipping:',
            error,
          );
        }
      }
      const { model, temperatureVisualDiff } = await getApiParameters();
      const messages: GeminiMessage[] = [{ role: 'user', parts }];
      const diffSessionId = sessionId || `diff_${Date.now()}`;

      // Retry logic for API calls
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          const visualDiffAnalysis = await makeGeminiRequest({
            apiKey,
            messages,
            modelName: model,
            sessionId: diffSessionId,
            temperature: temperatureVisualDiff,
          });

          if (!visualDiffAnalysis) {
            throw new Error('No visual diff analysis returned from API');
          }
          console.log('Generated visual diff analysis:', visualDiffAnalysis);
          addLog('Visual diff analysis completed', 'info');
          return visualDiffAnalysis.trim();
        } catch (error) {
          retryCount++;
          console.warn(`Visual diff attempt ${retryCount} failed:`, error);

          if (retryCount >= maxRetries) {
            throw error;
          }

          // Wait before retry (exponential backoff)
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * retryCount),
          );
          addLog(
            `Retrying visual diff analysis (${retryCount}/${maxRetries})`,
            'warning',
          );
        }
      }

      // This should never be reached due to the throw in the while loop
      throw new Error('Unexpected end of retry loop');
    } catch (error) {
      console.error('Error generating visual diff analysis:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      addLog(
        `Failed to generate visual diff analysis: ${errorMessage}`,
        'error',
      );

      // Return a basic fallback analysis
      return `Basic transformation plan:
- Make search bar prominent with white background and shadow
- Style cards with modern design and hover effects
- Clean header with professional colors
- Use .portal-class-name selectors with !important for overrides`;
    }
  };

  // Stage 2: Generate CSS using the visual diff analysis
  const generateCSSFromDiff = async (
    visualDiffAnalysis: string,
    domStructure: string,
  ): Promise<string | null> => {
    try {
      setFeedbackStage('generating-css');
      setProgress(50);

      const apiKey = await getEnvVariable('GEMINI_API_KEY');
      if (!apiKey) throw new Error('Gemini API key not found');

      const cssPrompt = `Generate CSS implementing: ${visualDiffAnalysis}

DOM: ${domStructure || 'None'}
Current: ${cssContent || 'None'}

Requirements:
- Generate COMPLETE CSS with DRAMATIC visual impact
- Use .portal-class-name selectors with !important
- NO CSS variables, NO @import, NO :root definitions, NO comments
- Make search elements visually striking and prominent
- Transform cards with bold shadows, unique hover effects, vibrant colors
- Style header with eye-catching design matching reference
- Apply bold color schemes and dramatic spacing changes

Output ONLY direct CSS rules:`;

      const cssSessionId = sessionId || `css_${Date.now()}`;
      const messages: GeminiMessage[] = [
        { role: 'user', parts: [{ text: cssPrompt }] },
      ];
      const { model, temperatureCssGeneration } = await getApiParameters();

      // Retry logic for CSS generation
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          const generatedCSS = await makeGeminiRequest({
            apiKey,
            messages,
            modelName: model,
            sessionId: cssSessionId,
            temperature: temperatureCssGeneration,
          });

          if (!generatedCSS) {
            throw new Error('No CSS generated from visual diff analysis');
          }

          // Clean the generated CSS
          const cleanedCSS = cleanCSSResponse(generatedCSS);
          console.log('Generated CSS from diff analysis:', cleanedCSS);
          addLog('CSS generation completed', 'info');
          return cleanedCSS;
        } catch (error) {
          retryCount++;
          console.warn(`CSS generation attempt ${retryCount} failed:`, error);

          if (retryCount >= maxRetries) {
            throw error;
          }

          // Wait before retry
          await new Promise((resolve) =>
            setTimeout(resolve, 2000 * retryCount),
          );
          addLog(
            `Retrying CSS generation (${retryCount}/${maxRetries})`,
            'warning',
          );
        }
      }

      // This should never be reached due to the throw in the while loop
      throw new Error('Unexpected end of retry loop');
    } catch (error) {
      console.error('Error generating CSS from diff:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      addLog(`Failed to generate CSS: ${errorMessage}`, 'error');

      // Return basic fallback CSS with common portal patterns if all retries failed
      return `[class*="portal-banner"] { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important; }
[class*="portal-search"] { background: white !important; border-radius: 12px !important; box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important; padding: 12px !important; border: none !important; }
[class*="portal-card"], [class*="portal-directory"] { background: white !important; border-radius: 16px !important; box-shadow: 0 4px 8px rgba(0,0,0,0.1) !important; padding: 24px !important; border: none !important; transition: all 0.3s ease !important; margin: 16px !important; }
[class*="portal-card"]:hover, [class*="portal-directory"]:hover { transform: translateY(-4px) !important; box-shadow: 0 8px 24px rgba(0,0,0,0.2) !important; }
[class*="portal-header"] { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important; border: none !important; color: white !important; }`;
    }
  };

  // Stage 3: Get feedback from Gemini about the current result (updated)
  const getFeedback = async (
    newScreenshot: string,
    _domStructure: string,
  ): Promise<boolean> => {
    try {
      setFeedbackStage('getting-feedback');
      setProgress(85);

      const apiKey = await getEnvVariable('GEMINI_API_KEY');
      if (!apiKey) throw new Error('Gemini API key not found');

      const feedbackPrompt = `Image 1 = REFERENCE target design. Image 2 = CURRENT result. Loop ${feedbackLoopCount}/${maxFeedbackLoops}

CRITICAL: If current looks almost identical to previous iteration, make DRAMATIC changes!

Current CSS: ${cssContent || 'None'}

If visually matches reference 90%+: "MATCH_STATUS: COMPLETE"
If needs major changes: "MATCH_STATUS: NEEDS_IMPROVEMENT" + COMPLETELY DIFFERENT CSS approach

NEW CSS MUST:
- Make DRAMATIC visual changes from current state
- Change colors, shadows, spacing, typography significantly
- NO CSS variables, NO @import statements, NO complex root definitions
- ONLY direct styling: .class { property: value !important; }
- Target portal-* classes with bold, dramatic styling differences`;

      const parts: MessagePart[] = [{ text: feedbackPrompt }];

      // Add compressed images for comparison
      if (referenceImages.length > 0 && isValidImageData(referenceImages[0])) {
        try {
          const compressedRef = await compressImageForAPI(
            referenceImages[0],
            500,
          );
          const imgData = dataUrlToBase64(compressedRef);
          const mimeType = compressedRef.split(';')[0].split(':')[1];
          parts.push({
            inline_data: {
              data: imgData,
              mime_type: mimeType,
            },
          });
        } catch (error) {
          console.warn(
            'Failed to compress reference image for feedback:',
            error,
          );
        }
      }

      if (isValidImageData(newScreenshot)) {
        try {
          const compressedNew = await compressImageForAPI(newScreenshot, 500);
          const imgData = dataUrlToBase64(compressedNew);
          const mimeType = compressedNew.split(';')[0].split(':')[1];
          parts.push({
            inline_data: {
              data: imgData,
              mime_type: mimeType,
            },
          });
        } catch (error) {
          console.warn(
            'Failed to compress new screenshot for feedback:',
            error,
          );
        }
      }

      // Use same session ID to maintain context
      const feedbackSessionId = sessionId || `feedback_${Date.now()}`;

      const messages: GeminiMessage[] = [
        {
          role: 'user',
          parts,
        },
      ];

      const { model, temperatureFeedbackLoop } = await getApiParameters();

      const feedbackResult = await makeGeminiRequest({
        apiKey,
        messages,
        modelName: model,
        sessionId: feedbackSessionId,
        temperature: temperatureFeedbackLoop,
      });

      if (!feedbackResult) {
        addLog(
          'No feedback received, continuing with current result',
          'warning',
        );
        return false;
      }

      console.log('Full feedback result from AI:', feedbackResult);
      addLog(
        `AI feedback response: ${feedbackResult.substring(0, 200)}...`,
        'info',
      );

      // Parse the feedback result
      const isComplete =
        feedbackResult.includes('MATCH_STATUS: COMPLETE') ||
        feedbackResult.includes('MATCH_STATUS:COMPLETE') ||
        feedbackResult.toUpperCase().includes('COMPLETE');

      if (isComplete) {
        addLog(
          'AI evaluation: Transformation completed successfully',
          'success',
        );
        return true;
      } else if (
        feedbackResult.includes('MATCH_STATUS: NEEDS_IMPROVEMENT') ||
        feedbackResult.includes('MATCH_STATUS:NEEDS_IMPROVEMENT') ||
        feedbackResult.toUpperCase().includes('NEEDS_IMPROVEMENT')
      ) {
        // Extract complete new CSS - try multiple approaches
        let cssContent = '';

        // First try: Look for CSS after the status line
        const lines = feedbackResult.split('\n');
        const statusIndex = lines.findIndex(
          (line) =>
            line.includes('MATCH_STATUS: NEEDS_IMPROVEMENT') ||
            line.includes('MATCH_STATUS:NEEDS_IMPROVEMENT') ||
            line.toUpperCase().includes('NEEDS_IMPROVEMENT'),
        );

        if (statusIndex >= 0) {
          // Get everything after the status line
          cssContent = lines
            .slice(statusIndex + 1)
            .join('\n')
            .trim();
        } else {
          // Second try: Look for CSS patterns in the entire response
          cssContent = feedbackResult;
        }

        console.log('Raw CSS content before cleaning:', cssContent);

        // Clean up markdown formatting and extract CSS
        cssContent = cleanCSSResponse(cssContent);

        console.log('Cleaned CSS content:', cssContent);

        if (cssContent && cssContent.length > 10) {
          // Replace entire CSS content with new version
          await applyCSSToEditor(cssContent);
          addLog(
            `Generated new complete CSS for feedback loop ${feedbackLoopCount}`,
            'info',
          );
          console.log('Generated new complete CSS:', cssContent);
          console.log(
            '[PILOT-DEBUG] About to apply new CSS from feedback:',
            cssContent.substring(0, 500) + '...',
          );

          // Wait for CSS to be applied to the page
          addLog('Allowing CSS to take effect...', 'info');
          await new Promise((resolve) => setTimeout(resolve, 3000));
        } else {
          addLog('No valid CSS found in feedback response', 'warning');
          console.log('Raw feedback response:', feedbackResult);
          console.log(
            '[PILOT-DEBUG] No valid CSS found, cssContent:',
            cssContent,
          );
        }

        return false;
      } else {
        addLog(
          'Unexpected feedback format, continuing with current result',
          'warning',
        );
        console.log('Unexpected feedback:', feedbackResult);
        return false;
      }
    } catch (error) {
      console.error('Error getting AI feedback:', error);
      addLog(
        'Error getting AI feedback, continuing with current result',
        'warning',
      );
      return false;
    }
  };

  // Updated feedback loop with new 3-stage approach
  const runFeedbackLoop = async (): Promise<boolean> => {
    try {
      setIsProcessing(true);
      resetStopFlag();
      setProgress(0);

      // Step 1: Take initial screenshot
      setFeedbackStage('taking-screenshot');
      const initialScreenshot = await takeScreenshot();
      if (!initialScreenshot || shouldStop) {
        return false;
      }

      // Get DOM structure for analysis (limit size for token efficiency)
      const fullDomStructure = await getPortalDOMStructure();
      const domStructure =
        fullDomStructure.length > 1000
          ? fullDomStructure.substring(0, 1000) + '...'
          : fullDomStructure;
      console.log(
        'Extracted DOM structure for analysis (limited):',
        domStructure,
      );

      // Stage 1: Generate visual diff analysis
      if (referenceImages.length === 0) {
        addLog('No reference images available for comparison', 'warning');
        return false;
      }

      const visualDiffAnalysis = await generateVisualDiffAnalysis(
        referenceImages[0],
        initialScreenshot,
        domStructure,
      );

      if (!visualDiffAnalysis || shouldStop) {
        return false;
      }

      // Stage 2: Generate CSS from visual diff analysis
      const newCSS = await generateCSSFromDiff(
        visualDiffAnalysis,
        domStructure,
      );
      if (!newCSS || shouldStop) {
        return false;
      }

      // Stage 3: Apply CSS and run feedback loops
      try {
        await applyCSSToEditor(newCSS);
      } catch (error) {
        if (shouldStop) {
          return false;
        }
        return false;
      }

      // Stage 3: Feedback loops for refinement - regenerate CSS from scratch each time
      for (let i = 0; i < maxFeedbackLoops; i++) {
        if (shouldStop) {
          return false;
        }

        setFeedbackLoopCount(i + 1);

        // Take screenshot after CSS application
        const feedbackScreenshot = await takeScreenshot();
        if (!feedbackScreenshot || shouldStop) {
          if (shouldStop) {
            return false;
          }
          break;
        }

        // Get fresh DOM structure for this iteration (in case it changed)
        const currentDomStructure = await getPortalDOMStructure();

        // Get AI feedback and regenerate complete CSS from scratch
        const isComplete = await getFeedback(
          feedbackScreenshot,
          currentDomStructure,
        );
        if (shouldStop) {
          return false;
        }

        if (isComplete) {
          setProgress(100);
          setFeedbackStage('complete');
          addLog('Transformation completed successfully', 'success');
          return true;
        }

        // Wait longer for new CSS to be applied and settle before next iteration
        addLog('Waiting for CSS changes to take effect...', 'info');
        await new Promise((resolve) => setTimeout(resolve, 4000));
      }

      // If we've reached max loops without completion
      setProgress(100);
      setFeedbackStage('complete');
      addLog(
        `Transformation completed after ${maxFeedbackLoops} feedback loops`,
        'info',
      );
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
    setSessionId(`pilot_session_${Date.now()}`);
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
