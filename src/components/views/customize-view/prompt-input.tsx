import { useState, useEffect } from 'react';
import { useAppContext } from '@/contexts';
import { getActiveTab } from '@/utils/chrome-utils';
import {
  getPageStructure,
  extractTailwindClasses,
  extractComputedStyles,
} from '@/utils/dom-utils';
import type { TreeNode, TailwindClassData } from '@/types';
import { useLogger, LogMessages } from '@/services/logger';
import {
  generatePromptWithAI,
  generateCSSWithAI,
  evaluateCSSResultWithAI,
  getOpenAIApiKey,
  chatManager,
} from '@/utils/openai-client';
import { captureScreenshot } from '@/utils/screenshot';
import type { ScreenshotOptions } from '@/utils/screenshot';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { X, ImageIcon, ArrowUp, Loader2 } from 'lucide-react';
import { useProgressStore } from '@/stores/progress-store';

export const PromptInput = () => {
  const {
    selectedImage,
    imageFile,
    fileInputRef,
    handleImageChange: originalHandleImageChange,
    handleRemoveImage,
    triggerFileUpload,
    setCssContent,
    generationStage,
    setGenerationStage,
  } = useAppContext();

  const [isImageTagHovered, setIsImageTagHovered] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const { addLog } = useLogger();
  const { setProgress } = useProgressStore();

  // Custom image change handler that will also reset the prompt state
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Reset prompt-related states when a new image is uploaded
    setPrompt('');
    setGenerationStage('idle');
    setProgress(0);
    setSessionId(null); // Reset the session ID when changing images

    // Call the original handler from context
    originalHandleImageChange(e);
  };

  // Effect to auto-generate prompt when reference image is uploaded
  useEffect(() => {
    if (imageFile && generationStage === 'idle') {
      generateInitialPrompt();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageFile, generationStage]);

  // Function to take current screenshot (using enhanced screenshot utility)
  const takeScreenshot = async (fullPage: boolean = true): Promise<string> => {
    const startTime = Date.now();
    const screenshotType = fullPage ? 'full-page' : 'viewport';
    console.log(
      `[PROMPT-INPUT] Starting ${screenshotType} screenshot capture...`,
    );

    try {
      const options: ScreenshotOptions = { fullPage };
      const screenshot = await captureScreenshot(options);

      const totalTime = Date.now() - startTime;
      const imageSizeKB = Math.round(screenshot.length / 1024);
      console.log(
        `[PROMPT-INPUT] ${screenshotType} screenshot capture successful in ${totalTime}ms, size: ${imageSizeKB}KB`,
      );
      addLog(
        `Screenshot captured (${screenshotType}, ${imageSizeKB}KB)`,
        'success',
      );

      return screenshot;
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(
        `[PROMPT-INPUT] ${screenshotType} screenshot capture failed after ${totalTime}ms:`,
        error,
      );
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      addLog(`Screenshot failed: ${errorMessage}`, 'error');
      throw error;
    }
  };

  // Function to generate prompt from reference image and current page screenshot
  const generateInitialPrompt = async () => {
    if (!imageFile) return;

    try {
      setIsGeneratingPrompt(true);
      setProgress(25); // Show initial progress
      addLog('Generating prompt from reference image...', 'info');

      // Create a new session ID for this generation process
      const newSessionId = `session_${Date.now()}`;
      setSessionId(newSessionId);
      addLog(`Created new chat session: ${newSessionId}`, 'info');

      // Get active tab
      const tab = await getActiveTab();
      if (!tab.id) {
        throw new Error('No active tab found');
      }

      // Take full page screenshot
      setProgress(35);
      addLog('Capturing full page screenshot...', 'info');
      const screenshot = await takeScreenshot(true);

      // Get page structure
      setProgress(40);
      addLog('Analyzing page structure...', 'info');
      const pageStructureStr = await getPageStructure(tab.id);
      const classHierarchy: TreeNode = {
        element: 'body',
        portalClasses: [],
        children: [],
      };
      const portalClassMatches =
        pageStructureStr.match(/portal-[a-zA-Z0-9-_]+/g) || [];
      if (portalClassMatches.length > 0) {
        classHierarchy.portalClasses = [...new Set(portalClassMatches)];
      }

      setProgress(45);
      addLog('Extracting Tailwind classes...', 'info');
      const rawTailwindData = (await extractTailwindClasses(tab.id)) || {};
      const tailwindData: TailwindClassData = {};
      Object.entries(rawTailwindData).forEach(([selector, classes]) => {
        if (Array.isArray(classes)) {
          tailwindData[selector] = classes;
        }
      });

      // Get computed styles
      addLog('Extracting computed styles...', 'info');
      const computedStyles = await extractComputedStyles(tab.id);

      // Get current CSS (if any)
      const getCurrentCSS = async (tabId: number): Promise<string> => {
        const result = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const styleEl = document.getElementById('portal-generated-css');
            return styleEl ? styleEl.textContent || '' : '';
          },
        });
        return result[0]?.result || '';
      };

      const currentCSS = await getCurrentCSS(tab.id);

      // Get OpenAI API key
      const apiKey = await getOpenAIApiKey();
      if (!apiKey) {
        throw new Error('OpenAI API key not found');
      }

      // Generate prompt using AI with the new session ID
      setProgress(75);
      const generatedPrompt = await generatePromptWithAI(
        apiKey,
        selectedImage as string,
        screenshot,
        classHierarchy,
        tailwindData,
        currentCSS,
        computedStyles,
        newSessionId, // Pass the session ID
      );

      // Set the generated prompt
      setPrompt(generatedPrompt);
      setProgress(100);
      addLog('Prompt generated successfully', 'success');

      // Reset progress after a delay
      setTimeout(() => {
        setProgress(0);
      }, 1000);
    } catch (error) {
      console.error('Error generating prompt:', error);
      let errorMessage = 'Unknown error';

      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object') {
        errorMessage = 'API error - please check console for details';
      }

      addLog(`Error generating prompt: ${errorMessage}`, 'error');
      setProgress(0);
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  // Function to apply CSS to the page
  const applyCSS = async (tabId: number, css: string): Promise<void> => {
    return new Promise((resolve) => {
      chrome.scripting.executeScript(
        {
          target: { tabId },
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
        },
        () => {
          resolve();
        },
      );
    });
  };

  // Function to clean CSS response (remove markdown) and verify completeness
  const cleanCSSResponse = (css: string): string => {
    const cleaned = css
      .replace(/```css\s*/g, '')
      .replace(/```\s*$/g, '')
      .replace(/```/g, '')
      .trim();

    // Verify CSS completeness
    if (cleaned.length < 30) {
      addLog(
        'Warning: Suspiciously short CSS received, may be incomplete',
        'warning',
      );
    }

    // Check for portal- classes - all CSS should target these
    if (!cleaned.includes('.portal-')) {
      addLog('Warning: CSS does not contain any .portal- selectors', 'warning');
    }

    // Check for basic CSS structure with proper declarations
    const hasProperDeclarations = /\{[^}]+\}/.test(cleaned);
    if (!hasProperDeclarations) {
      addLog(
        'Warning: CSS may be malformed (missing proper declarations)',
        'warning',
      );
    }

    return cleaned;
  };

  const handleGenerate = async () => {
    if (!prompt) {
      addLog('Please provide a prompt.', 'warning');
      return;
    }

    try {
      setGenerationStage('generating');
      setProgress(10);
      addLog(
        LogMessages.SCREENSHOT_TAKING || 'Taking full page screenshot...',
        'info',
      );

      // Create a new session ID if we don't have one yet
      const currentSessionId = sessionId || `session_${Date.now()}`;
      if (!sessionId) {
        setSessionId(currentSessionId);
        addLog(`Created new chat session: ${currentSessionId}`, 'info');
      } else {
        addLog(`Using existing chat session: ${currentSessionId}`, 'info');
      }

      const tab = await getActiveTab();
      if (!tab.id) {
        throw new Error('No active tab found');
      }

      setProgress(20);
      addLog('Analyzing page structure...', 'info');
      const pageStructureStr = await getPageStructure(tab.id);
      const classHierarchy: TreeNode = {
        element: 'body',
        portalClasses: [],
        children: [],
      };
      const portalClassMatches =
        pageStructureStr.match(/portal-[a-zA-Z0-9-_]+/g) || [];
      if (portalClassMatches.length > 0) {
        classHierarchy.portalClasses = [...new Set(portalClassMatches)];
      }

      setProgress(30);
      addLog('Extracting Tailwind classes...', 'info');
      const rawTailwindData = (await extractTailwindClasses(tab.id)) || {};
      const tailwindData: TailwindClassData = {};
      Object.entries(rawTailwindData).forEach(([selector, classes]) => {
        if (Array.isArray(classes)) {
          tailwindData[selector] = classes;
        }
      });

      // Get computed styles
      addLog('Extracting computed styles...', 'info');
      const computedStyles = await extractComputedStyles(tab.id);

      const apiKey = await getOpenAIApiKey();
      if (!apiKey) {
        throw new Error('OpenAI API key not found');
      }

      let referenceImgForAI: string | undefined = undefined;
      if (selectedImage && imageFile) {
        // Ensure imageFile is also present for a valid reference
        referenceImgForAI = selectedImage as string;
      } else {
        // No reference image was provided, warn the user
        addLog(
          'No reference image provided. Results may be limited to style descriptions in your prompt only.',
          'warning',
        );
      }

      // Always take a full page screenshot for the current state
      addLog('Taking full page screenshot for AI context...', 'info');
      const currentScreenshotForAI = await takeScreenshot(true);

      setProgress(40);
      addLog(`Generating initial CSS...`, 'info');

      // Enhance the prompt if no reference image is available
      let enhancedPrompt = prompt;
      if (!referenceImgForAI) {
        // Format text-only prompts with a clear directive prefix and specific instructions
        const isShortPrompt = prompt.split(' ').length < 5;

        if (isShortPrompt) {
          addLog(
            'The prompt is very brief. Adding additional context to help the AI interpret your style description.',
            'info',
          );
        }

        enhancedPrompt = `GENERATE CSS FOR: "${prompt}".
CRITICAL: This is a text-only directive with no reference image available.
YOU MUST generate CSS for elements with portal-* classes based on this description.
${isShortPrompt ? 'The description is brief, so use your creativity to interpret what this style means in terms of colors, typography, spacing, and visual effects.' : ''}
DO NOT refuse to generate CSS or ask for clarification - instead, make your best interpretation of the style request.`;
      }

      const initialCss = await generateCSSWithAI(
        apiKey,
        enhancedPrompt,
        classHierarchy,
        tailwindData,
        '', // currentCSS for the first run
        0, // retryCount for the first run
        referenceImgForAI, // This can be undefined
        currentScreenshotForAI, // Screenshot of the page *before* changes
        computedStyles, // Computed styles
        currentSessionId, // Pass the session ID
      );

      setProgress(50);
      let currentCss = cleanCSSResponse(initialCss);
      setCssContent(currentCss);
      await applyCSS(tab.id, currentCss);
      addLog('Initial CSS applied to the page.', 'info');

      // If no reference image was provided, skip evaluation and iteration
      if (!referenceImgForAI) {
        addLog(
          'CSS generated based on text prompt. Visual AI evaluation skipped as no reference image was provided.',
          'success',
        );
        setGenerationStage('success');
        setProgress(100);
        setTimeout(() => setProgress(0), 2000); // Longer timeout for user to read
        return;
      }

      // Proceed with evaluation and iteration only if a reference image was provided
      setProgress(60);
      addLog(
        `Taking full page screenshot after CSS application for evaluation...`,
        'info',
      );
      let newScreenshotAfterCSS = await takeScreenshot(true);

      // Get updated computed styles after CSS application
      addLog(
        'Extracting updated computed styles after CSS application...',
        'info',
      );
      const updatedComputedStyles = await extractComputedStyles(tab.id);

      setProgress(70);
      addLog(`Evaluating initial result against reference image...`, 'info');
      let evaluation = await evaluateCSSResultWithAI(
        apiKey,
        referenceImgForAI, // Definitely available here
        newScreenshotAfterCSS,
        currentCss,
        classHierarchy, // Add class hierarchy
        tailwindData, // Add tailwind data
        updatedComputedStyles, // Updated computed styles
        currentSessionId, // Pass the session ID
      );

      if (evaluation.isMatch) {
        addLog(
          'AI evaluation complete: CSS matches reference design!',
          'success',
        );
        setGenerationStage('success');
        setProgress(100);
        setTimeout(() => setProgress(0), 1500);
        return;
      }

      // Begin iteration loop if initial CSS needs improvement
      let isSuccessful = false;
      const maxIterations = 5;
      let bestCss = currentCss;

      // No longer checking if CSS changes are improvements
      // Function removed as we now accept all AI proposals

      for (let i = 0; i < maxIterations && !isSuccessful; i++) {
        const iterationProgress =
          70 + Math.round(((i + 1) / maxIterations) * 30); // Scale progress from 70 to 100
        setProgress(iterationProgress);

        if (!evaluation.isMatch && evaluation.feedback) {
          addLog(`Iteration ${i + 1}: Analyzing AI feedback...`, 'info');

          // Always apply the proposed CSS changes
          const proposedCss = evaluation.feedback;

          // Verify we received complete CSS
          if (proposedCss.length < 20) {
            addLog(
              `Iteration ${i + 1}: Warning - received suspiciously short CSS (${proposedCss.length} chars), might be incomplete`,
              'warning',
            );
          }

          // Check if typical CSS patterns like selectors and declarations exist
          const hasSelectorPattern = proposedCss.includes('.portal-');
          const hasDeclarationPattern = /:[^;]+;/.test(proposedCss);

          if (!hasSelectorPattern || !hasDeclarationPattern) {
            addLog(
              `Iteration ${i + 1}: Warning - CSS may be malformed, but applying anyway`,
              'warning',
            );
          }

          currentCss = proposedCss; // Apply the new CSS
          bestCss = currentCss; // Track this as our best version so far

          addLog(
            `Iteration ${i + 1}: Applying improved CSS based on AI feedback...`,
            'info',
          );

          setCssContent(currentCss);
          await applyCSS(tab.id, currentCss);

          addLog(
            `Iteration ${i + 1}: Taking full page screenshot after CSS update...`,
            'info',
          );
          newScreenshotAfterCSS = await takeScreenshot(true);

          // Get updated computed styles after this iteration
          addLog(
            `Iteration ${i + 1}: Extracting updated computed styles...`,
            'info',
          );
          const iterationComputedStyles = await extractComputedStyles(tab.id);

          addLog(`Iteration ${i + 1}: Re-evaluating result...`, 'info');
          evaluation = await evaluateCSSResultWithAI(
            apiKey,
            referenceImgForAI,
            newScreenshotAfterCSS,
            currentCss,
            classHierarchy, // Add class hierarchy
            tailwindData, // Add tailwind data
            iterationComputedStyles, // Updated computed styles
            currentSessionId, // Pass the session ID
          );

          if (evaluation.isMatch) {
            addLog(
              `AI evaluation complete after iteration ${i + 1}: CSS matches reference design!`,
              'success',
            );
            isSuccessful = true;
            break;
          }
        } else {
          // This case means evaluation didn't return new CSS, which is unexpected if isMatch is false.
          addLog(
            `Iteration ${i + 1}: AI evaluation did not provide further CSS. Stopping iteration.`,
            'warning',
          );
          break;
        }
      }

      // Always use the best CSS we've seen
      if (currentCss !== bestCss) {
        addLog('Reverting to best CSS version seen during iterations', 'info');
        currentCss = bestCss;
        setCssContent(currentCss);
        await applyCSS(tab.id, currentCss);
      }

      setGenerationStage(isSuccessful ? 'success' : 'error');
      setProgress(100);

      if (!isSuccessful) {
        addLog(
          'Reached maximum iterations. The CSS may still need manual refinement.',
          'warning',
        );
      }

      // Final logging of chat session status
      const session = chatManager.getSession(currentSessionId);
      if (session) {
        addLog(
          `Chat session ${currentSessionId} has ${session.getMessages().length} messages`,
          'info',
        );
      }

      setTimeout(() => {
        setProgress(0);
      }, 1500);
    } catch (error) {
      console.error('Error generating CSS:', error);
      setGenerationStage('error');
      setProgress(0);

      let errorMessage = 'Unknown error';

      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object') {
        errorMessage = 'API error - please check console for details';
      }

      addLog(`Error generating CSS: ${errorMessage}`, 'error');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImageChange}
        accept="image/*"
        style={{ display: 'none' }}
      />
      <div className="border border-border rounded-lg flex flex-col overflow-hidden shadow-sm">
        <div className="flex flex-col items-start gap-2 p-2">
          {selectedImage && (
            <Popover
              open={isImageTagHovered}
              onOpenChange={setIsImageTagHovered}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1.5 whitespace-nowrap px-2 py-1 h-auto shrink-0 relative group justify-center"
                  onMouseEnter={() => setIsImageTagHovered(true)}
                  onMouseLeave={() => setIsImageTagHovered(false)}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveImage();
                  }}
                >
                  {!isImageTagHovered ? (
                    <img
                      src={selectedImage}
                      alt="preview"
                      className="w-4 h-4 rounded-sm object-cover"
                    />
                  ) : (
                    <X size={16} className="text-destructive" />
                  )}
                  <span className="text-xs truncate max-w-[100px]">
                    {imageFile?.name ? imageFile.name : 'Image'}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-auto border-border border shadow-xl p-1 flex flex-col gap-2"
                side="bottom"
                align="start"
                aria-label="Reference image preview"
                aria-describedby="image-preview-description"
              >
                <div id="image-preview-description" className="sr-only">
                  Reference image preview showing your uploaded design
                </div>
                <img
                  src={selectedImage}
                  alt="Reference Preview"
                  className="max-w-[300px] max-h-[300px] rounded-md"
                />
              </PopoverContent>
            </Popover>
          )}

          {/* Textarea */}
          <textarea
            className="flex-grow text-sm w-full resize-none bg-transparent focus:outline-none placeholder:text-muted-foreground pt-0.5 min-h-[60px]"
            placeholder={
              isGeneratingPrompt
                ? 'Generating prompt...'
                : selectedImage
                  ? 'AI is analyzing your image...'
                  : 'Type your prompt (e.g., modern, dark theme with green accents)'
            }
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isGeneratingPrompt}
          />
        </div>

        {/* Bottom section: Generate Button */}
        <div className="flex justify-between items-center p-1.5 bg-background">
          <Button
            variant="outline"
            size="sm"
            onClick={triggerFileUpload}
            className="flex items-center gap-1.5 whitespace-nowrap p-1 h-auto shrink-0 justify-center"
            disabled={generationStage === 'generating' || isGeneratingPrompt}
          >
            <ImageIcon size={14} />
            <span className="text-xs">
              {selectedImage ? 'Replace Image' : 'Upload Image'}
            </span>
          </Button>

          <Button
            size="sm"
            className="flex items-center gap-1.5 h-8 px-3"
            onClick={handleGenerate}
            disabled={
              generationStage === 'generating' || isGeneratingPrompt || !prompt
            }
          >
            {generationStage === 'generating' || isGeneratingPrompt ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span className="text-xs">
                  {isGeneratingPrompt ? 'Generating Prompt' : 'Generating CSS'}
                </span>
              </>
            ) : (
              <>
                <span className="text-xs">Generate</span>
                <ArrowUp size={14} />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
