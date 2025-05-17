import { useState, useEffect } from 'react';
import { useAppContext } from '@/contexts';
import { getActiveTab } from '@/utils/chrome-utils';
import { getPageStructure, extractTailwindClasses } from '@/utils/dom-utils';
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
  const [status, setStatus] = useState('');
  const [iterations, setIterations] = useState(0);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [currentScreenshot, setCurrentScreenshot] = useState<string | null>(
    null,
  );
  const { addLog } = useLogger();

  // Custom image change handler that will also reset the prompt state
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Reset prompt-related states when a new image is uploaded
    setPrompt('');
    setStatus('');
    setCurrentScreenshot(null);
    setGenerationStage('idle');

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
      setStatus('Generating prompt...');
      addLog('Generating prompt from reference image...', 'info');

      // Get active tab
      const tab = await getActiveTab();
      if (!tab.id) {
        throw new Error('No active tab found');
      }

      // Take screenshot of current page
      const screenshot = await takeScreenshot();
      setCurrentScreenshot(screenshot);

      // Get OpenAI API key
      const apiKey = await getOpenAIApiKey();
      if (!apiKey) {
        throw new Error('OpenAI API key not found');
      }

      // Generate prompt using AI
      const generatedPrompt = await generatePromptWithAI(
        apiKey,
        selectedImage as string,
        screenshot,
      );

      // Set the generated prompt
      setPrompt(generatedPrompt);
      addLog('Prompt generated successfully', 'success');
      setStatus('Prompt generated');
    } catch (error) {
      console.error('Error generating prompt:', error);
      setStatus('Error generating prompt');
      addLog(
        `Error generating prompt: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
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
    if (!imageFile) {
      setStatus('Please upload a reference image first');
      addLog('Please upload a reference image first', 'warning');
      return;
    }

    try {
      setGenerationStage('generating');
      setStatus('Processing reference image...');
      addLog(LogMessages.SCREENSHOT_TAKING || 'Taking screenshot...', 'info');
      setIterations(0);

      // Get active tab
      const tab = await getActiveTab();
      if (!tab.id) {
        throw new Error('No active tab found');
      }

      // Extract the page structure
      setStatus('Analyzing page structure...');
      addLog('Analyzing page structure...', 'info');
      const pageStructureStr = await getPageStructure(tab.id);

      // Create a proper classHierarchy object from the structure data
      const classHierarchy: TreeNode = {
        element: 'body',
        portalClasses: [],
        children: [],
      };

      // Extract any relevant portal classes from the page structure
      const portalClassMatches =
        pageStructureStr.match(/portal-[a-zA-Z0-9-_]+/g) || [];
      if (portalClassMatches.length > 0) {
        classHierarchy.portalClasses = [...new Set(portalClassMatches)];
      }

      // Get Tailwind classes data
      const rawTailwindData = (await extractTailwindClasses(tab.id)) || {};

      // Convert to proper TailwindClassData format
      const tailwindData: TailwindClassData = {};
      Object.entries(rawTailwindData).forEach(([selector, classes]) => {
        if (Array.isArray(classes)) {
          tailwindData[selector] = classes;
        }
      });

      // Get OpenAI API key
      const apiKey = await getOpenAIApiKey();
      if (!apiKey) {
        throw new Error('OpenAI API key not found');
      }

      // Make sure we have a current screenshot
      let screenshot = currentScreenshot;
      if (!screenshot) {
        screenshot = await takeScreenshot();
        setCurrentScreenshot(screenshot);
      }

      // Start the iterative CSS generation process
      let isSuccessful = false;
      const maxIterations = 5;
      let currentCss = '';

      for (let i = 0; i < maxIterations && !isSuccessful; i++) {
        setIterations(i + 1);
        setStatus(`Iteration ${i + 1}/${maxIterations}: Generating CSS...`);
        addLog(`Iteration ${i + 1}: Generating CSS...`, 'info');

        // Generate CSS with AI
        const generatedCss = await generateCSSWithAI(
          apiKey,
          prompt,
          classHierarchy,
          tailwindData,
          currentCss,
          i,
          selectedImage as string,
          screenshot,
        );

        // Clean and apply the CSS
        const cleanedCss = cleanCSSResponse(generatedCss);
        currentCss = cleanedCss;

        // Set the CSS content in the editor
        setCssContent(cleanedCss);

        // Apply CSS to page
        await applyCSS(tab.id, cleanedCss);

        // Take a new screenshot after applying CSS
        setStatus(`Iteration ${i + 1}/${maxIterations}: Taking screenshot...`);
        addLog(
          `Iteration ${i + 1}: Taking screenshot after CSS application...`,
          'info',
        );
        const newScreenshot = await takeScreenshot();

        // Evaluate the result
        setStatus(`Iteration ${i + 1}/${maxIterations}: Evaluating result...`);
        addLog(`Iteration ${i + 1}: Evaluating result...`, 'info');
        const evaluation = await evaluateCSSResultWithAI(
          apiKey,
          selectedImage as string,
          newScreenshot,
          cleanedCss,
        );

        // Update status based on evaluation
        if (evaluation.isMatch) {
          setStatus('DevRev');
          addLog('CSS generated and applied successfully', 'success');
          isSuccessful = true;
          break;
        } else {
          setStatus(
            `Iteration ${i + 1}/${maxIterations}: ${evaluation.feedback}`,
          );
          addLog(`Iteration ${i + 1}: ${evaluation.feedback}`, 'info');

          // Update screenshot for next iteration
          screenshot = newScreenshot;
          setCurrentScreenshot(screenshot);
        }
      }

      // Set final status
      setGenerationStage(isSuccessful ? 'success' : 'error');
      if (!isSuccessful) {
        addLog('Reached maximum iterations without perfect match', 'warning');
      }
    } catch (error) {
      console.error('Error generating CSS:', error);
      setStatus('Error generating CSS');
      setGenerationStage('error');
      addLog(
        `Error generating CSS: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
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

          <div className="flex flex-col items-end">
            {status && (
              <span
                className={`text-xs mb-1 ${
                  status === 'DevRev'
                    ? 'text-green-600'
                    : status.includes('Failed') || status.includes('Error')
                      ? 'text-red-600'
                      : 'text-blue-600'
                }`}
              >
                {status}
              </span>
            )}

            {(generationStage === 'generating' || isGeneratingPrompt) && (
              <div className="w-36 bg-gray-200 rounded-full h-1.5 mb-1">
                <div
                  className="bg-blue-600 h-1.5 rounded-full"
                  style={{
                    width: `${isGeneratingPrompt ? 50 : Math.min((iterations / 5) * 100, 100)}%`,
                  }}
                />
              </div>
            )}

            <Button
              size="sm"
              className="flex items-center gap-1.5 h-8 px-3"
              onClick={handleGenerate}
              disabled={
                generationStage === 'generating' ||
                isGeneratingPrompt ||
                !imageFile ||
                !prompt
              }
            >
              {generationStage === 'generating' || isGeneratingPrompt ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span className="text-xs">
                    {isGeneratingPrompt
                      ? 'Generating Prompt'
                      : 'Generating CSS'}
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
    </div>
  );
};
