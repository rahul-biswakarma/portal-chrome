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
import {
  generateCSSWithGemini,
  evaluateCSSResultWithGemini,
  isValidImageData,
} from '@/utils/gemini-client';
import { useLogger } from '@/services/logger';

// Simplified workflow stages
type PilotStage =
  | 'collect-references'
  | 'customizing-home'
  | 'navigate-to-inner'
  | 'customizing-inner'
  | 'complete';

// Feedback loop stages
type FeedbackStage =
  | 'idle'
  | 'taking-screenshot'
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

// Types for Gemini message parts
interface TextPart {
  text: string;
}

interface ImagePart {
  inline_data: {
    data: string;
    mime_type: string;
  };
}

type MessagePart = TextPart | ImagePart;

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
  const [maxFeedbackLoops] = useState(3);
  const [isProcessing, setIsProcessing] = useState(false);
  const [shouldStop, setShouldStop] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [currentPageTitle, setCurrentPageTitle] = useState('Home Page');
  const [statusMessage, setStatusMessage] = useState('');

  // Helper functions
  const dataUrlToBase64 = (dataUrl: string): string => {
    return dataUrl.split(',')[1];
  };

  const getApiParameters = async () => {
    const model =
      (await getEnvVariable('GEMINI_MODEL')) ||
      'gemini-2.5-flash-preview-05-20';
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
    setStatusMessage('Stopping pilot mode...');
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
      setStatusMessage('Maximum 3 reference images allowed');
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
    setStatusMessage(
      `${newImages.length} reference image${newImages.length !== 1 ? 's' : ''} uploaded`,
    );

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
    setStatusMessage(
      `${newImages.length} reference image${newImages.length !== 1 ? 's' : ''} remaining`,
    );
  };

  // Take a screenshot of the current page
  const takeScreenshot = async (): Promise<string | null> => {
    try {
      setFeedbackStage('taking-screenshot');
      setProgress(20);
      setStatusMessage('Taking screenshot of current page...');
      addLog('Taking screenshot...', 'info');

      const screenshot = await captureScreenshot({ fullPage: true });
      setScreenshots([...screenshots, screenshot]);
      setProgress(30);
      addLog('Screenshot captured successfully', 'success');
      return screenshot;
    } catch (error) {
      console.error('Error taking screenshot:', error);
      addLog(
        `Screenshot failed: ${error instanceof Error ? error.message : String(error)}`,
        'error',
      );
      setStatusMessage('Failed to take screenshot');
      return null;
    }
  };

  // Generate image diff analysis using Gemini
  const generateImageDiffPrompt = async (
    referenceImage: string,
    currentScreenshot: string,
  ): Promise<string> => {
    try {
      setStatusMessage(
        'Analyzing differences between reference and current design...',
      );
      addLog('Generating image diff analysis...', 'info');

      // Check if we should stop
      if (shouldStop) {
        setStatusMessage('Operation stopped by user');
        return '';
      }

      // Get Gemini API key
      const apiKey = await getEnvVariable('GEMINI_API_KEY');
      if (!apiKey) throw new Error('Gemini API key not found');

      const { model } = await getApiParameters();

      // Get DOM structure for component analysis
      const domStructure = await getPortalDOMStructure();

      // Create enhanced diff analysis prompt that includes DOM structure
      const diffPrompt = `Analyze these two images and provide a detailed comparison of their visual differences.

The FIRST image is the REFERENCE design that we want to achieve.
The SECOND image is the CURRENT state that needs to be improved.

CURRENT PAGE DOM STRUCTURE:
${domStructure || 'No portal elements found'}

ANALYSIS INSTRUCTIONS:
1. First, examine the DOM structure above and the current screenshot to identify the main components present on this page (e.g., header, banner, search bar, directory cards, navigation, footer, etc.)

2. Then, compare the reference image with the current image and provide specific differences for each identified component.

3. Focus on these aspects for each component:
   - Colors (backgrounds, text, borders, accents)
   - Typography (font size, weight, spacing)
   - Layout & Spacing (padding, margins, positioning)
   - Visual Effects (shadows, borders, border-radius)
   - Interactive states (hover effects, focus states)

FORMAT YOUR RESPONSE AS:

IDENTIFIED COMPONENTS:
- [List the main UI components you can see in the current image based on DOM structure]

COMPONENT-SPECIFIC DIFFERENCES:

**HEADER/NAVIGATION:**
- [Specific differences in header styling, colors, layout]

**BANNER/HERO SECTION:**
- [Specific differences in banner styling, background, text]

**DIRECTORY CARDS/CONTENT CARDS:**
- [Specific differences in card styling, shadows, spacing, colors]

**SEARCH BAR/INPUT ELEMENTS:**
- [Specific differences in input styling, borders, focus states]

**OVERALL LAYOUT:**
- [Differences in general spacing, alignment, color scheme]

**OTHER COMPONENTS:**
- [Any other components you identify and their differences]

Be very specific and actionable. Reference the portal class names from the DOM structure when possible (e.g., "portal-common-header needs darker background", "portal-directory-card needs increased border-radius").`;

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

      // Make request to Gemini
      const baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
      const url = `${baseUrl}/${model}:generateContent?key=${apiKey}`;

      const requestBody = {
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 3000,
        },
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `API error: ${errorData.error?.message || response.statusText}`,
        );
      }

      const data = await response.json();
      console.log('Diff analysis API response:', data);

      // Improved response parsing with better error handling
      if (data.candidates && data.candidates.length > 0) {
        const candidate = data.candidates[0];

        if (
          candidate.content &&
          candidate.content.parts &&
          candidate.content.parts.length > 0
        ) {
          const textPart = candidate.content.parts[0];
          if (textPart.text) {
            const diffAnalysis = textPart.text.trim();
            addLog('Image diff analysis completed', 'success');
            return diffAnalysis;
          }
        }

        // Check if there's a finish reason that explains why no content was returned
        if (candidate.finishReason) {
          throw new Error(
            `API response incomplete. Finish reason: ${candidate.finishReason}`,
          );
        }
      }

      // If we get here, the response structure is unexpected
      throw new Error(
        'Invalid response structure from API - no valid content found',
      );
    } catch (error) {
      console.error('Error generating image diff:', error);
      addLog(`Error generating image diff: ${error}`, 'warning');
      return 'Unable to generate detailed diff analysis. Proceeding with basic comparison.';
    }
  };

  // Generate CSS using Gemini
  const generateCSS = async (screenshot: string): Promise<string | null> => {
    try {
      setFeedbackStage('generating-css');
      setProgress(40);
      setStatusMessage(
        'Analyzing differences between reference and current design...',
      );
      addLog('Generating CSS with Gemini...', 'info');

      // Check if we should stop
      if (shouldStop) {
        setStatusMessage('Operation stopped by user');
        return null;
      }

      // Get Gemini API key
      const apiKey = await getEnvVariable('GEMINI_API_KEY');
      if (!apiKey) throw new Error('Gemini API key not found');

      // Get DOM structure
      setStatusMessage('Analyzing DOM structure...');
      const domStructure = await getPortalDOMStructure();

      // Log the DOM structure for debugging
      console.log('Extracted DOM structure:', domStructure);
      addLog(
        `DOM structure extracted: ${domStructure ? 'Found portal elements' : 'No portal elements found'}`,
        'info',
      );

      // Generate image diff analysis first
      let diffAnalysis = '';
      if (referenceImages.length > 0) {
        setProgress(45);
        diffAnalysis = await generateImageDiffPrompt(
          referenceImages[0],
          screenshot,
        );
        console.log('Generated diff analysis:', diffAnalysis);
      }

      setProgress(50);
      setStatusMessage('Generating CSS based on analysis...');

      // Create empty TreeNode structure to satisfy type requirements
      const emptyTreeNode = { element: 'div', portalClasses: [], children: [] };

      // Create comprehensive prompt that includes DOM structure and diff analysis
      const referencePrompt =
        referenceImages.length > 0
          ? `Please analyze the provided reference images and generate CSS to transform the current portal design to match the reference style.

${
  diffAnalysis
    ? `DETAILED DIFFERENCE ANALYSIS:
${diffAnalysis}

`
    : ''
}CURRENT DOM STRUCTURE WITH PORTAL CLASSES:
${domStructure || 'No portal elements found on this page'}

CURRENT CSS:
${cssContent || 'No existing CSS'}

INSTRUCTIONS:
- Focus on colors, typography, layout, spacing, and visual effects
- ONLY use CSS selectors that target classes starting with "portal-"
- Use the DOM structure above to understand the current layout hierarchy
- Apply styles that work with the existing Tailwind classes shown in brackets
- Use the difference analysis above to understand exactly what needs to be changed
- Generate complete, valid CSS code (not just snippets)
- Include all necessary styles to match the reference design
- Prioritize the specific changes identified in the difference analysis

Generate CSS to transform the current portal to match the reference design:`
          : 'Generate CSS to improve the portal design.';

      setStatusMessage('Generating CSS with AI...');

      // Generate CSS with Gemini - pass reference images and screenshot correctly
      const generatedCSS = await generateCSSWithGemini(
        apiKey,
        referencePrompt,
        emptyTreeNode,
        {}, // No Tailwind data for simplicity
        cssContent, // Current CSS
        0, // No retry count
        referenceImages[0], // Primary reference image
        screenshot, // Current screenshot
        {}, // No computed styles for simplicity
        sessionId || '',
      );

      // Check if we should stop after generation
      if (shouldStop) {
        setStatusMessage('Operation stopped by user');
        return null;
      }

      addLog('CSS generated successfully', 'success');
      return generatedCSS;
    } catch (error) {
      console.error('Error generating CSS:', error);
      addLog(`Error generating CSS: ${error}`, 'error');
      setStatusMessage('Failed to generate CSS');
      return null;
    }
  };

  // Apply CSS to CSS editor (which will auto-apply to page)
  const applyCSSToEditor = async (css: string): Promise<void> => {
    try {
      setFeedbackStage('applying-css');
      setProgress(70);
      setStatusMessage('Applying CSS through CSS editor...');
      addLog('Setting CSS in CSS editor...', 'info');

      // Check if we should stop
      if (shouldStop) {
        setStatusMessage('Operation stopped by user');
        throw new Error('Stopped by user');
      }

      // Set CSS content - the CSS editor will handle auto-applying to the page
      setCssContent(css);

      // Wait a moment for the CSS to be applied
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Check again after waiting
      if (shouldStop) {
        setStatusMessage('Operation stopped by user');
        throw new Error('Stopped by user');
      }

      addLog('CSS applied successfully through CSS editor', 'success');
    } catch (error) {
      console.error('Error applying CSS:', error);
      addLog(`Error applying CSS: ${error}`, 'error');
      setStatusMessage('Failed to apply CSS');
      throw error; // Re-throw to stop the feedback loop
    }
  };

  // Get feedback from Gemini about the current result
  const getFeedback = async (newScreenshot: string): Promise<boolean> => {
    try {
      setFeedbackStage('getting-feedback');
      setProgress(85);
      setStatusMessage('Getting AI feedback on the result...');
      addLog('Getting AI feedback...', 'info');

      // Check if we should stop
      if (shouldStop) {
        setStatusMessage('Operation stopped by user');
        return false;
      }

      // Get Gemini API key
      const apiKey = await getEnvVariable('GEMINI_API_KEY');
      if (!apiKey) throw new Error('Gemini API key not found');

      // Create empty TreeNode structure to satisfy type requirements
      const emptyTreeNode = { element: 'div', portalClasses: [], children: [] };

      // Get evaluation from Gemini
      const result = await evaluateCSSResultWithGemini(
        apiKey,
        referenceImages[0], // Primary reference image
        newScreenshot, // Current result screenshot
        cssContent, // Current CSS
        emptyTreeNode,
        {}, // Empty Tailwind data
        {}, // Empty computed styles
        sessionId || '',
      );

      // Check if we should stop after getting feedback
      if (shouldStop) {
        setStatusMessage('Operation stopped by user');
        return false;
      }

      const feedback = result.feedback;

      // Check if the response contains "DONE" in caps (as per user requirement)
      const isDone = feedback.toUpperCase().includes('DONE');

      if (isDone) {
        addLog('Design is complete! AI confirmed good match.', 'success');
        setStatusMessage('Design completed successfully!');
        return true; // Stop feedback loop
      } else {
        // Apply the new CSS from feedback
        addLog('AI provided improvements, applying them...', 'info');
        setStatusMessage('Applying AI improvements...');
        await applyCSSToEditor(feedback);
        return false; // Continue feedback loop
      }
    } catch (error) {
      console.error('Error getting AI feedback:', error);
      addLog(`Error getting AI feedback: ${error}`, 'error');
      setStatusMessage(
        'Failed to get AI feedback - will continue with current CSS',
      );
      return false; // Continue with what we have
    }
  };

  // Run the complete feedback loop for current page
  const runFeedbackLoop = async (): Promise<boolean> => {
    try {
      setIsProcessing(true);
      resetStopFlag(); // Reset stop flag when starting
      setProgress(0);

      // Step 1: Take initial screenshot
      const initialScreenshot = await takeScreenshot();
      if (!initialScreenshot || shouldStop) {
        setStatusMessage(
          shouldStop
            ? 'Operation stopped by user'
            : 'Failed to capture initial screenshot',
        );
        return false;
      }

      // Step 2: Generate CSS
      const newCSS = await generateCSS(initialScreenshot);
      if (!newCSS || shouldStop) {
        setStatusMessage(
          shouldStop ? 'Operation stopped by user' : 'Failed to generate CSS',
        );
        return false;
      }

      // Step 3: Apply CSS
      try {
        await applyCSSToEditor(newCSS);
      } catch (error) {
        if (shouldStop) {
          setStatusMessage('Operation stopped by user');
          return false;
        }
        setStatusMessage(`Failed to apply initial CSS: ${error}`);
        return false;
      }

      // Step 4: Start feedback loops
      for (let i = 0; i < maxFeedbackLoops; i++) {
        // Check if we should stop before each loop
        if (shouldStop) {
          setStatusMessage('Operation stopped by user');
          addLog('Feedback loop stopped by user', 'info');
          return false;
        }

        setFeedbackLoopCount(i + 1);
        setStatusMessage(`Feedback loop ${i + 1}/${maxFeedbackLoops}...`);
        addLog(`Starting feedback loop ${i + 1}/${maxFeedbackLoops}`, 'info');

        // Take screenshot after CSS application
        const feedbackScreenshot = await takeScreenshot();
        if (!feedbackScreenshot || shouldStop) {
          if (shouldStop) {
            setStatusMessage('Operation stopped by user');
            return false;
          }
          addLog(
            `Failed to take screenshot for feedback loop ${i + 1}`,
            'warning',
          );
          break;
        }

        // Get AI feedback
        const isComplete = await getFeedback(feedbackScreenshot);
        if (shouldStop) {
          setStatusMessage('Operation stopped by user');
          return false;
        }

        if (isComplete) {
          setProgress(100);
          setStatusMessage('Page customization completed!');
          setFeedbackStage('complete');
          addLog('AI confirmed design is complete', 'success');
          return true;
        }

        // Wait before next iteration to allow CSS to settle
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      // If we've reached max loops without completion
      setProgress(100);
      setStatusMessage(
        `Completed ${maxFeedbackLoops} feedback loops - customization finished`,
      );
      setFeedbackStage('complete');
      addLog(
        `Reached maximum feedback loops (${maxFeedbackLoops}) - design process complete`,
        'info',
      );
      return true;
    } catch (error) {
      console.error('Error in feedback loop:', error);
      addLog(`Feedback loop error: ${error}`, 'error');
      setStatusMessage('Customization process encountered an error');
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
      setStatusMessage('Navigating to inner page...');
      addLog('Navigating to inner page...', 'info');

      // Check if we should stop
      if (shouldStop) {
        setStatusMessage('Navigation stopped by user');
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
      setStatusMessage('Waiting for page to load...');
      addLog('Waiting for page to load...', 'info');

      // Check for stop during wait
      for (let i = 0; i < 30; i++) {
        // 3 seconds in 100ms chunks
        if (shouldStop) {
          setStatusMessage('Navigation stopped by user');
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
      setStatusMessage('Navigation completed successfully');
      addLog('Navigation completed successfully', 'success');

      return true;
    } catch (error) {
      console.error('Error navigating:', error);
      addLog(
        `Navigation failed: ${error instanceof Error ? error.message : String(error)}`,
        'error',
      );
      setStatusMessage('Navigation failed');
      return false;
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle starting customization process
  const startCustomization = async () => {
    if (referenceImages.length === 0) {
      addLog('Please upload at least one reference image', 'warning');
      setStatusMessage('Please upload at least one reference image');
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
    setStatusMessage('All pages customized successfully!');
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
    setStatusMessage('');
    setShouldStop(false);
    addLog('Starting new pilot session', 'info');
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

              {statusMessage && (
                <div className="mt-3 text-sm text-blue-600">
                  {statusMessage}
                </div>
              )}
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
                {feedbackStage === 'generating-css' &&
                  'Generating CSS based on reference images...'}
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

              {statusMessage && (
                <div className="mb-3 text-sm text-blue-600">
                  {statusMessage}
                </div>
              )}

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

              {statusMessage && (
                <div className="mb-3 text-sm text-yellow-600">
                  {statusMessage}
                </div>
              )}

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
