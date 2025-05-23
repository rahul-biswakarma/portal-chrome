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

  const getApiParameters = async () => {
    const model = (await getEnvVariable('GEMINI_MODEL')) || 'gemini-2.0-flash';
    return { model };
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
    try {
      setFeedbackStage('taking-screenshot');
      setProgress(20);

      const screenshot = await captureScreenshot({ fullPage: true });
      setScreenshots([...screenshots, screenshot]);
      setProgress(30);
      return screenshot;
    } catch (error) {
      console.error('Error taking screenshot:', error);
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

      // Get Gemini API key
      const apiKey = await getEnvVariable('GEMINI_API_KEY');
      if (!apiKey) throw new Error('Gemini API key not found');

      // Create dynamic diff analysis prompt that adapts to actual DOM structure
      const diffPrompt = `TASK: Analyze these images and DOM structure to create a precise visual transformation plan.

🎯 IMAGE ANALYSIS:
- IMAGE 1 (REFERENCE): Target design to replicate exactly
- IMAGE 2 (CURRENT): Current portal state that needs transformation

📋 CURRENT PORTAL STRUCTURE:
${domStructure || 'No portal elements found'}

IMPORTANT CSS SELECTOR NOTE:
- All portal-* identifiers in the DOM are CSS CLASSES, not HTML attributes
- Use class selectors: .portal-class-name (NOT div[portal-class-name])
- Example: .portal-banner__wrapper, .portal-directory-card, .portal-common-header

REQUIRED ANALYSIS - Generate a detailed visual diff:

**VISUAL ELEMENTS EXTRACTION:**
From REFERENCE image, extract:
1. **Color Palette:**
   - Primary background colors/gradients
   - Text colors (headings, body, links)
   - Card/container background colors
   - Accent and highlight colors
   - Border and shadow colors

2. **Typography Characteristics:**
   - Font weights and sizes for different text levels
   - Text color hierarchy and contrast
   - Line spacing and letter spacing patterns

3. **Layout & Spacing:**
   - Container padding and margins
   - Element spacing (cards, buttons, sections)
   - Grid/layout density and rhythm
   - Border radius and corner styling

4. **Visual Depth & Style:**
   - Shadow patterns and depth
   - Border styles and weights
   - Background treatments (solid, gradient, patterns)
   - Overall visual style (flat, material, etc.)

**TRANSFORMATION MAPPING:**
Based on the actual DOM structure above, identify:
1. **Background Elements:** Which portal CSS classes should receive background treatments
2. **Card/Container Elements:** Which portal CSS classes represent cards or containers
3. **Navigation Elements:** Which portal CSS classes represent headers or navigation
4. **Text Elements:** Which portal CSS classes contain text that needs styling
5. **Interactive Elements:** Which portal CSS classes represent buttons, inputs, or links

**OUTPUT REQUIREMENTS:**
Create a specific transformation plan that:
- Maps reference design elements to actual portal CSS classes found in DOM
- Provides exact color values and measurements
- Gives specific CSS property recommendations using CLASS SELECTORS (.portal-class)
- Focuses only on portal classes that actually exist in the current page

CRITICAL: Remember all portal-* are CSS classes - use .portal-class-name syntax for CSS selectors.

Do not assume any specific portal class names - work with what's actually present in the DOM structure provided.`;

      // Prepare the message parts
      const parts: MessagePart[] = [{ text: diffPrompt }];

      // Add images
      if (isValidImageData(referenceImage)) {
        const imgData = dataUrlToBase64(referenceImage);
        const mimeType = referenceImage.split(';')[0].split(':')[1];
        parts.push({
          inline_data: {
            data: imgData,
            mime_type: mimeType,
          },
        });
      }

      if (isValidImageData(currentScreenshot)) {
        const imgData = dataUrlToBase64(currentScreenshot);
        const mimeType = currentScreenshot.split(';')[0].split(':')[1];
        parts.push({
          inline_data: {
            data: imgData,
            mime_type: mimeType,
          },
        });
      }

      // Prepare the messages for Gemini
      const { model } = await getApiParameters();
      const messages: GeminiMessage[] = [
        {
          role: 'user',
          parts,
        },
      ];

      // Use session ID to maintain conversation context
      const diffSessionId = sessionId || `diff_${Date.now()}`;

      // Use the shared makeGeminiRequest function
      const visualDiffAnalysis = await makeGeminiRequest(
        apiKey,
        messages,
        model,
        diffSessionId,
      );

      if (!visualDiffAnalysis) {
        throw new Error('No visual diff analysis returned from API');
      }

      console.log('Generated visual diff analysis:', visualDiffAnalysis);
      addLog('Visual diff analysis completed', 'info');

      return visualDiffAnalysis.trim();
    } catch (error) {
      console.error('Error generating visual diff analysis:', error);
      addLog('Failed to generate visual diff analysis', 'error');
      return 'Unable to generate detailed visual analysis. Proceeding with basic comparison.';
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

      // Get Gemini API key
      const apiKey = await getEnvVariable('GEMINI_API_KEY');
      if (!apiKey) throw new Error('Gemini API key not found');

      // Create CSS generation prompt using the visual diff analysis
      const cssPrompt = `TASK: Generate CSS based on the visual analysis and DOM structure.

📋 VISUAL TRANSFORMATION PLAN:
${visualDiffAnalysis}

📋 CURRENT DOM STRUCTURE:
${domStructure || 'No portal elements found'}

📋 CURRENT CSS:
${cssContent || 'No existing CSS'}

CRITICAL CSS SELECTOR REQUIREMENTS:
- All portal-* identifiers are CSS CLASSES, not HTML attributes
- ALWAYS use class selectors: .portal-class-name
- NEVER use attribute selectors: div[portal-class-name] ❌
- For high specificity use: .portal-class.portal-class or .portal-class.portal-class {}

CORRECT EXAMPLES:
✅ .portal-banner__wrapper { background: blue; }
✅ .portal-directory-card.portal-directory-card { padding: 20px; }
✅ .portal-common-header__actions-container { display: flex; }

INCORRECT EXAMPLES:
❌ div[portal-banner__wrapper] { background: blue; }
❌ button[portal-common-header__actions-container__login-button] { color: white; }

CSS GENERATION REQUIREMENTS:

1. **Use Correct CSS Class Selectors:**
   - Target portal CSS classes with: .portal-class-name
   - For high specificity use: .portal-class.portal-class
   - Add !important for strong overrides where needed

2. **Apply Visual Diff Recommendations:**
   - Implement the exact color palette extracted from reference
   - Apply typography changes as specified in the analysis
   - Implement layout and spacing changes
   - Add visual depth and styling as recommended

3. **Focus on Actual DOM Elements:**
   - Only generate CSS for portal classes that exist in the provided DOM structure
   - Use the transformation mapping from the visual analysis
   - Ensure selectors match the actual HTML structure using CLASS SELECTORS

4. **Complete Transformation:**
   - Make dramatic changes that completely transform the appearance
   - Override ALL existing styles that conflict with the reference design
   - Create a cohesive visual transformation

5. **CSS Organization:**
   - Organize CSS logically (layout, colors, typography, effects)
   - Include comments explaining major transformations
   - Ensure cross-browser compatibility

REMEMBER: portal-banner__wrapper, portal-directory-card, portal-common-header etc. are CSS classes - use .portal-class-name syntax!

Generate production-ready CSS that transforms the portal to match the reference design exactly.`;

      // Use same session ID to continue the conversation context
      const cssSessionId = sessionId || `css_${Date.now()}`;

      // Prepare messages - this continues the conversation from the visual diff
      const messages: GeminiMessage[] = [
        {
          role: 'user',
          parts: [{ text: cssPrompt }],
        },
      ];

      const { model } = await getApiParameters();

      // Generate CSS with Gemini using the conversation context
      const generatedCSS = await makeGeminiRequest(
        apiKey,
        messages,
        model,
        cssSessionId,
      );

      if (!generatedCSS) {
        throw new Error('No CSS generated from visual diff analysis');
      }

      console.log('Generated CSS from diff analysis:', generatedCSS);
      addLog('CSS generation completed', 'info');

      return generatedCSS.trim();
    } catch (error) {
      console.error('Error generating CSS from diff:', error);
      addLog('Failed to generate CSS from visual analysis', 'error');
      return null;
    }
  };

  // Stage 3: Get feedback from Gemini about the current result (updated)
  const getFeedback = async (
    newScreenshot: string,
    domStructure: string,
  ): Promise<boolean> => {
    try {
      setFeedbackStage('getting-feedback');
      setProgress(85);

      // Get Gemini API key
      const apiKey = await getEnvVariable('GEMINI_API_KEY');
      if (!apiKey) throw new Error('Gemini API key not found');

      // Create feedback prompt that regenerates CSS from scratch
      const feedbackPrompt = `TASK: Evaluate transformation results and generate improved CSS.

📋 CONTEXT:
This is feedback loop ${feedbackLoopCount} of ${maxFeedbackLoops} for the current page transformation.

📋 IMAGES:
- IMAGE 1 (REFERENCE): Target design to match exactly
- IMAGE 2 (CURRENT RESULT): Current transformation result after previous CSS

📋 CURRENT DOM STRUCTURE:
${domStructure || 'No portal elements found'}

📋 PREVIOUS CSS (for reference):
${cssContent || 'No CSS applied'}

CRITICAL CSS SELECTOR REQUIREMENTS:
- All portal-* identifiers are CSS CLASSES, not HTML attributes
- ALWAYS use class selectors: .portal-class-name
- NEVER use attribute selectors: div[portal-class-name] ❌
- For high specificity use: .portal-class.portal-class

CORRECT EXAMPLES:
✅ .portal-banner__wrapper { background: blue; }
✅ .portal-directory-card.portal-directory-card { padding: 20px; }
✅ .portal-common-header__actions-container { display: flex; }

INCORRECT EXAMPLES:
❌ div[portal-banner__wrapper] { background: blue; }
❌ button[portal-common-header__actions-container__login-button] { color: white; }

EVALUATION & REGENERATION:

1. **Visual Assessment:**
   - Compare current result (Image 2) with target reference (Image 1)
   - Identify what's working well and what needs improvement
   - Focus on color scheme, typography, layout, spacing, and visual hierarchy

2. **Decision Criteria:**
   - If visual match is 85%+ satisfactory: Return "COMPLETE"
   - If improvements needed: Generate completely NEW CSS from scratch

**OUTPUT FORMAT:**

If transformation is complete (85%+ match):
MATCH_STATUS: COMPLETE

If improvements needed:
MATCH_STATUS: NEEDS_IMPROVEMENT

/* Complete CSS for Feedback Loop ${feedbackLoopCount} */
[Generate COMPLETE CSS from scratch - NOT incremental changes]

REQUIREMENTS for CSS regeneration:
- Analyze the reference image and current result
- Generate COMPLETE CSS that addresses all visual gaps
- Use correct CSS class selectors: .portal-class-name (NOT div[portal-class])
- Use high specificity selectors (.portal-class.portal-class) for strong overrides
- Include !important for strong overrides where needed
- Target only portal classes found in the DOM structure
- Create cohesive styling that transforms the portal completely
- Build upon what was working from previous CSS but fix what wasn't

REMEMBER: All portal-* are CSS classes - use .portal-class-name syntax!

Generate a complete, production-ready CSS solution that brings the current result closer to the reference design.`;

      const parts: MessagePart[] = [{ text: feedbackPrompt }];

      // Add images for comparison
      if (referenceImages.length > 0 && isValidImageData(referenceImages[0])) {
        const imgData = dataUrlToBase64(referenceImages[0]);
        const mimeType = referenceImages[0].split(';')[0].split(':')[1];
        parts.push({
          inline_data: {
            data: imgData,
            mime_type: mimeType,
          },
        });
      }

      if (isValidImageData(newScreenshot)) {
        const imgData = dataUrlToBase64(newScreenshot);
        const mimeType = newScreenshot.split(';')[0].split(':')[1];
        parts.push({
          inline_data: {
            data: imgData,
            mime_type: mimeType,
          },
        });
      }

      // Use same session ID to maintain context
      const feedbackSessionId = sessionId || `feedback_${Date.now()}`;

      const messages: GeminiMessage[] = [
        {
          role: 'user',
          parts,
        },
      ];

      const { model } = await getApiParameters();

      const feedbackResult = await makeGeminiRequest(
        apiKey,
        messages,
        model,
        feedbackSessionId,
      );

      if (!feedbackResult) {
        addLog(
          'No feedback received, continuing with current result',
          'warning',
        );
        return false;
      }

      // Parse the feedback result
      const isComplete =
        feedbackResult.includes('MATCH_STATUS: COMPLETE') ||
        feedbackResult.includes('MATCH_STATUS:COMPLETE');

      if (isComplete) {
        addLog(
          'AI evaluation: Transformation completed successfully',
          'success',
        );
        return true;
      } else if (
        feedbackResult.includes('MATCH_STATUS: NEEDS_IMPROVEMENT') ||
        feedbackResult.includes('MATCH_STATUS:NEEDS_IMPROVEMENT')
      ) {
        // Extract complete new CSS - look for CSS after the status line
        const lines = feedbackResult.split('\n');
        const statusIndex = lines.findIndex(
          (line) =>
            line.includes('MATCH_STATUS: NEEDS_IMPROVEMENT') ||
            line.includes('MATCH_STATUS:NEEDS_IMPROVEMENT'),
        );

        if (statusIndex >= 0) {
          // Get everything after the status line
          const cssLines = lines.slice(statusIndex + 1);

          // Find the start of CSS (look for CSS comment or selector)
          const cssStartIndex = cssLines.findIndex(
            (line) =>
              line.trim().startsWith('/*') ||
              line.trim().startsWith('.') ||
              line.trim().startsWith('#') ||
              line.includes('{'),
          );

          if (cssStartIndex >= 0) {
            const newCompleteCSS = cssLines
              .slice(cssStartIndex)
              .join('\n')
              .trim();

            if (newCompleteCSS && newCompleteCSS.length > 10) {
              // Replace entire CSS content with new version
              await applyCSSToEditor(newCompleteCSS);
              addLog(
                `Generated new complete CSS for feedback loop ${feedbackLoopCount}`,
                'info',
              );
              console.log('Generated new complete CSS:', newCompleteCSS);
            } else {
              addLog('No valid CSS found in feedback response', 'warning');
            }
          } else {
            addLog('No CSS code found in feedback response', 'warning');
            console.log('Feedback response:', feedbackResult);
          }
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

      // Get DOM structure for analysis
      const domStructure = await getPortalDOMStructure();
      console.log('Extracted DOM structure for analysis:', domStructure);

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

        // Wait before next iteration to allow CSS to settle
        await new Promise((resolve) => setTimeout(resolve, 1500));
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

      // Log the CSS for debugging
      console.log('Applying CSS from structured output:', css);

      // Set CSS content - the CSS editor will handle auto-applying to the page
      setCssContent(css);

      // Wait a moment for the CSS to be applied
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Check again after waiting
      if (shouldStop) {
        throw new Error('Stopped by user');
      }
    } catch (error) {
      console.error('Error applying CSS:', error);
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
