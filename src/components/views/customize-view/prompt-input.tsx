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
} from '@/utils/openai-client';

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
  const { addLog } = useLogger();
  const { setProgress } = useProgressStore();

  // Custom image change handler that will also reset the prompt state
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Reset prompt-related states when a new image is uploaded
    setPrompt('');
    setGenerationStage('idle');
    setProgress(0);

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

  // Function to take current screenshot
  const takeScreenshot = async (): Promise<string> => {
    return new Promise((resolve, reject) => {
      chrome.tabs.captureVisibleTab({ format: 'png' }, (dataUrl) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(error);
        } else {
          resolve(dataUrl);
        }
      });
    });
  };

  // Function to generate prompt from reference image and current page screenshot
  const generateInitialPrompt = async () => {
    if (!imageFile) return;

    try {
      setIsGeneratingPrompt(true);
      setProgress(25); // Show initial progress
      addLog('Generating prompt from reference image...', 'info');

      // Get active tab
      const tab = await getActiveTab();
      if (!tab.id) {
        throw new Error('No active tab found');
      }

      // Take screenshot of current page
      setProgress(35);
      const screenshot = await takeScreenshot();

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

      // Generate prompt using AI
      setProgress(75);
      const generatedPrompt = await generatePromptWithAI(
        apiKey,
        selectedImage as string,
        screenshot,
        classHierarchy,
        tailwindData,
        currentCSS,
        computedStyles,
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

  // Function to clean CSS response (remove markdown)
  const cleanCSSResponse = (css: string): string => {
    return css
      .replace(/```css\s*/g, '')
      .replace(/```\s*$/g, '')
      .replace(/```/g, '')
      .trim();
  };

  const handleGenerate = async () => {
    if (!prompt) {
      addLog('Please provide a prompt.', 'warning');
      return;
    }

    try {
      setGenerationStage('generating');
      setProgress(10);
      addLog(LogMessages.SCREENSHOT_TAKING || 'Taking screenshot...', 'info');

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

      console.log('DEBUG: Class hierarchy structure:', classHierarchy);
      console.log('DEBUG: Tailwind data structure:', tailwindData);
      console.log('DEBUG: Computed styles:', computedStyles);

      const apiKey = await getOpenAIApiKey();
      if (!apiKey) {
        throw new Error('OpenAI API key not found');
      }

      let referenceImgForAI: string | undefined = undefined;
      if (selectedImage && imageFile) {
        // Ensure imageFile is also present for a valid reference
        referenceImgForAI = selectedImage as string;
      }

      // Always take a screenshot for the current state, even if no reference image
      addLog('Taking current page screenshot for AI context...', 'info');
      const currentScreenshotForAI = await takeScreenshot();
      // We don't need to call setCurrentScreenshot here for this specific screenshot
      // as it's for direct use in the AI call.

      setProgress(40);
      addLog(`Generating initial CSS...`, 'info');
      console.log('DEBUG: Tailwind data being passed to OpenAI:', tailwindData);

      const initialCss = await generateCSSWithAI(
        apiKey,
        prompt,
        classHierarchy,
        tailwindData,
        '', // currentCSS for the first run
        0, // retryCount for the first run
        referenceImgForAI, // This can be undefined
        currentScreenshotForAI, // Screenshot of the page *before* changes
        computedStyles, // Computed styles
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
        `Taking screenshot after CSS application for evaluation...`,
        'info',
      );
      let newScreenshotAfterCSS = await takeScreenshot();

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
      const maxIterations = 5; // Max iterations after the initial attempt

      for (let i = 0; i < maxIterations && !isSuccessful; i++) {
        const iterationProgress =
          70 + Math.round(((i + 1) / maxIterations) * 30); // Scale progress from 70 to 100
        setProgress(iterationProgress);

        if (!evaluation.isMatch && evaluation.feedback) {
          addLog(
            `Iteration ${i + 1}: Applying improved CSS based on AI feedback...`,
            'info',
          );

          currentCss = evaluation.feedback; // Feedback is the new CSS
          setCssContent(currentCss);
          await applyCSS(tab.id, currentCss);

          addLog(
            `Iteration ${i + 1}: Taking screenshot after CSS update...`,
            'info',
          );
          newScreenshotAfterCSS = await takeScreenshot();

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

      setGenerationStage(isSuccessful ? 'success' : 'error');
      setProgress(100);

      if (!isSuccessful) {
        addLog(
          'Reached maximum iterations. The CSS may still need manual refinement.',
          'warning',
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
