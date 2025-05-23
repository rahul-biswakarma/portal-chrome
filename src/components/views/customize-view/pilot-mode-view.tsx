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
    const model = (await getEnvVariable('GEMINI_MODEL')) || 'gemini-1.5-flash';
    // Define temperatures for different stages
    const temperatureVisualDiff = parseFloat(
      (await getEnvVariable('GEMINI_TEMP_VISUAL_DIFF')) || '0.4',
    );
    const temperatureCssGeneration = parseFloat(
      (await getEnvVariable('GEMINI_TEMP_CSS_GENERATION')) || '0.6',
    );
    const temperatureFeedbackLoop = parseFloat(
      (await getEnvVariable('GEMINI_TEMP_FEEDBACK_LOOP')) || '0.3',
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

      const apiKey = await getEnvVariable('GEMINI_API_KEY');
      if (!apiKey) throw new Error('Gemini API key not found');

      const diffPrompt = `TASK: Analyze images and DOM to create a professional visual transformation plan for a HELP CENTER PORTAL.

🎯 IMAGE ANALYSIS:
- IMAGE 1 (REFERENCE): Target design aesthetic to inspire the transformation.
- IMAGE 2 (CURRENT): Current portal state that needs professional enhancement.

📋 CURRENT PORTAL STRUCTURE:
${domStructure || 'No portal elements found'}

CRITICAL CONSIDERATIONS FOR A HELP CENTER:
- **Professionalism:** The final design must look clean, modern, trustworthy, and user-friendly.
- **Search Bar Excellence:** A prominent, well-styled search bar is THE MOST IMPORTANT element. It must be preserved, highly visible, and easy to use.
- **Clear Navigation:** Header and navigation elements must be clear and intuitive.
- **Readability:** Typography and color choices must ensure high readability of content.
- **Responsive Design:** Layout should adapt well to different screen sizes (conceptual).

IMPORTANT CSS SELECTOR NOTE:
- All portal-* identifiers in the DOM are CSS CLASSES, not HTML attributes
- Use class selectors: .portal-class-name (NOT div[portal-classname])
- Example: .portal-banner__wrapper, .portal-directory-card, .portal-common-header

REQUIRED ANALYSIS - Generate a detailed visual diff and transformation plan:

**1. VISUAL ELEMENTS EXTRACTION (From REFERENCE - Image 1):**
   - **Color Palette:** Primary, secondary, accent colors. Aim for a professional and accessible scheme.
   - **Typography:** Font styles, weights, sizes. Prioritize readability.
   - **Layout & Spacing:** Overall structure, padding, margins, content density.
   - **Key Style Elements:** Card styles, button styles, shadow usage, border radius, etc.

**2. CURRENT STATE ASSESSMENT (Image 2 & DOM Structure):**
   - **Identify Key Portal Components:** Locate CSS classes for:
     - Search Bar / Search Input field(s)
     - Main Banner / Hero section
     - Header / Navigation bar
     - Content Cards / Directory items
     - Footer
     - Buttons
   - **Critique Current Design:** What aspects of the current design (Image 2) look unprofessional or hinder usability?

**3. TRANSFORMATION MAPPING (Professional Help Center Focus):**
   Based on the DOM structure and inspired by the REFERENCE (Image 1), plan transformations for:
   - **Search Bar:** How to make it prominent, visually appealing, and highly functional? Specify styling for its container and input fields.
   - **Overall Layout:** How to achieve a clean, organized, and professional structure?
   - **Header/Navigation:** How to ensure clarity and ease of use?
   - **Content Presentation (Cards/Lists):** How to display information in an accessible and engaging way?
   - **Color & Typography:** How to apply a professional and readable color scheme and typography?
   - **Buttons & Interactive Elements:** How to style them for clear affordance and consistency?

**OUTPUT REQUIREMENTS:**
Create a specific transformation plan that:
- Prioritizes a professional, user-friendly help center aesthetic.
- Ensures the search bar is a central, well-styled element.
- Maps reference design elements to actual portal CSS classes found in DOM.
- Provides exact color values and measurements where applicable.
- Gives specific CSS property recommendations using CLASS SELECTORS (.portal-class).

CRITICAL: Remember all portal-* are CSS classes - use .portal-class-name syntax for CSS selectors.
Do not assume any specific portal class names - work with what's actually present in the DOM. The goal is a professional transformation, not just a copy of the reference if the reference is not suitable for a help center.`;

      const parts: MessagePart[] = [{ text: diffPrompt }];
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
      const { model, temperatureVisualDiff } = await getApiParameters();
      const messages: GeminiMessage[] = [{ role: 'user', parts }];
      const diffSessionId = sessionId || `diff_${Date.now()}`;

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

      const apiKey = await getEnvVariable('GEMINI_API_KEY');
      if (!apiKey) throw new Error('Gemini API key not found');

      const cssPrompt = `TASK: Generate COMPLETE CSS for a HELP CENTER PORTAL based on the visual analysis and DOM structure.

📋 VISUAL TRANSFORMATION PLAN:
${visualDiffAnalysis}

📋 CURRENT DOM STRUCTURE:
${domStructure || 'No portal elements found'}

📋 PREVIOUS CSS (for context, if any):
${cssContent || 'No existing CSS'}

CRITICAL GOALS FOR HELP CENTER CSS:
- **Professional Aesthetic:** CSS must result in a clean, modern, trustworthy, and user-friendly interface.
- **Search Bar Functionality & Style:** Ensure the search bar (identified in the plan) is highly visible, functional, and well-styled. DO NOT REMOVE IT.
- **Maintain Essential Elements:** All critical portal functions (navigation, content display, search) must remain fully usable.
- **Readability & Accessibility:** Prioritize readable fonts, good contrast, and accessible design patterns.

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

CSS GENERATION REQUIREMENTS:

1. **Implement Transformation Plan:** Faithfully execute the visual transformation plan, especially regarding the search bar and overall professional look.
2. **Use Correct CSS Class Selectors:** Target portal CSS classes with: .portal-class-name. Use .portal-class.portal-class for high specificity.
3. **Complete & Cohesive Styling:** Generate a FULL stylesheet. Do not assume any base styles exist. Create a consistent look and feel.
4. **Preserve Functionality:** Ensure all interactive elements remain functional. Do not hide or break essential components.
5. **High-Quality CSS:** Write clean, well-organized CSS. Include comments for major sections (e.g., /* Header Styles */, /* Search Bar Styles */, /* Card Styles */).
6. **Override Existing Styles:** If transforming an existing page, ensure new styles are specific enough (using .class.class and !important where necessary) to override previous/browser default styles and achieve the desired professional look.

REMEMBER: The goal is a PROFESSIONAL, MODERN, and FUNCTIONAL help center. The search bar is paramount.

Generate production-ready CSS that transforms the portal to match the professional help center design outlined in the plan.`;

      const cssSessionId = sessionId || `css_${Date.now()}`;
      const messages: GeminiMessage[] = [
        { role: 'user', parts: [{ text: cssPrompt }] },
      ];
      const { model, temperatureCssGeneration } = await getApiParameters();

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

      const apiKey = await getEnvVariable('GEMINI_API_KEY');
      if (!apiKey) throw new Error('Gemini API key not found');

      const feedbackPrompt = `TASK: Evaluate HELP CENTER PORTAL transformation and generate improved CSS.

CRITICAL GOALS FOR HELP CENTER CSS:
- **Professionalism:** Final CSS must result in a clean, modern, trustworthy, and user-friendly interface.
- **Search Bar Functionality & Style:** The search bar MUST be highly visible, functional, and well-styled. It is the most important interactive element.
- **Maintain Essential Elements:** All critical portal functions (navigation, content display, search) must remain fully usable.
- **Readability & Accessibility:** Prioritize readable fonts, good contrast, and accessible design patterns.

📋 CONTEXT:
This is feedback loop ${feedbackLoopCount} of ${maxFeedbackLoops} for the current page transformation.

📋 IMAGES:
- IMAGE 1 (REFERENCE): Target design aesthetic to inspire the transformation.
- IMAGE 2 (CURRENT RESULT): Current transformation result after previous CSS.

📋 CURRENT DOM STRUCTURE:
${domStructure || 'No portal elements found'}

📋 PREVIOUS CSS (that produced Image 2):
${cssContent || 'No CSS applied'}

CRITICAL CSS SELECTOR REQUIREMENTS:
- All portal-* identifiers are CSS CLASSES, not HTML attributes
- ALWAYS use class selectors: .portal-class-name
- NEVER use attribute selectors: div[portal-class-name] ❌
- For high specificity use: .portal-class.portal-class

CORRECT EXAMPLES:
✅ .portal-banner__wrapper { background: blue; }
✅ .portal-directory-card.portal-directory-card { padding: 20px; }

INCORRECT EXAMPLES:
❌ div[portal-banner__wrapper] { background: blue; }

EVALUATION & REGENERATION:

1. **Visual Assessment (Critique Image 2 against Image 1 and Professional Help Center Standards):**
   - **Search Bar:** Is it prominent, well-styled, and fully functional? If not, this is the #1 priority to fix.
   - **Professionalism:** Does it look clean, modern, and trustworthy? Identify any unprofessional elements.
   - **Readability & Clarity:** Is text easy to read? Is navigation clear?
   - **Visual Gaps:** What are the biggest differences between the current result (Image 2) and the desired professional look (inspired by Image 1)?
   - **Functionality:** Are all essential elements (buttons, links, navigation) visible and usable?

2. **Decision Criteria:**
   - If visual match to a professional help center aesthetic is 85%+ satisfactory (AND search bar is excellent): Return "COMPLETE"
   - If improvements needed (especially to search bar or professionalism): Generate completely NEW CSS from scratch.

**OUTPUT FORMAT:**

If transformation is complete (85%+ match AND excellent search bar):
MATCH_STATUS: COMPLETE

If improvements needed:
MATCH_STATUS: NEEDS_IMPROVEMENT

/* Complete NEW CSS for Feedback Loop ${feedbackLoopCount} - Aiming for Professional Help Center */
[Generate COMPLETE CSS from scratch - NOT incremental changes]

REQUIREMENTS for CSS regeneration:
- **Prioritize Search Bar:** Ensure it is perfectly styled and functional.
- **Professionalism First:** Focus on creating a clean, modern, and trustworthy design suitable for a help center.
- **Use Correct Class Selectors:** .portal-class-name (NOT div[portal-class]).
- **High Specificity:** Use .portal-class.portal-class and !important where necessary to override previous styles.
- **Complete Stylesheet:** Generate all CSS rules needed. Do not assume base styles.
- **Preserve Functionality:** Do not hide or break critical elements.
- **Organized CSS:** Include comments for major sections.

REMEMBER: All portal-* are CSS classes - use .portal-class-name syntax! The goal is a professional help center with an excellent search experience.

Generate a complete, production-ready CSS solution.`;

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
