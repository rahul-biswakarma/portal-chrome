import { useState, useEffect } from 'react';
import { useAppContext } from '@/contexts';
import { getActiveTab } from '@/utils/chrome-utils';
import { processReferenceImage } from '@/utils/image-to-css';
import { getPageStructure, extractTailwindClasses } from '@/utils/dom-utils';
import type { TreeNode, TailwindClassData } from '@/types';
import { useLogger, LogMessages } from '@/services/logger';

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
    handleImageChange,
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
  const { addLog } = useLogger();

  // Effect to auto-generate prompt when reference image is uploaded
  useEffect(() => {
    if (imageFile && generationStage === 'idle') {
      // Could add auto-prompt generation here if needed
    }
  }, [imageFile, generationStage]);

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
      // Instead of trying to parse as JSON, create the structure directly
      const classHierarchy: TreeNode = {
        element: 'body',
        portalClasses: [],
        children: [],
      };

      // Extract any relevant portal classes from the page structure
      // This approach doesn't rely on JSON parsing which was failing
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

      // Set up a listener to track iterations
      const messageListener = (message: {
        action: string;
        iteration: number;
      }) => {
        if (
          message.action === 'css-iteration-update' ||
          message.action === 'iteration-update'
        ) {
          setIterations(message.iteration);
          const iterationMsg = `Iteration ${message.iteration}/5: Refining CSS...`;
          setStatus(iterationMsg);
          addLog(iterationMsg, 'info');
        }
      };
      chrome.runtime.onMessage.addListener(messageListener);

      // Process the reference image - start the full workflow
      setStatus('Generating initial CSS...');
      addLog(LogMessages.API_GENERATING_CSS || 'Generating CSS...', 'info');
      const result = await processReferenceImage(
        imageFile,
        tab.id,
        classHierarchy,
        tailwindData,
      );

      // Remove listener
      chrome.runtime.onMessage.removeListener(messageListener);

      setStatus(result.message);

      if (result.success) {
        setGenerationStage('success');
        addLog('CSS generated and applied successfully', 'success');
        // Fetch the current CSS to display in the editor
        const appliedCss = await getCurrentCSS(tab.id);
        setCssContent(appliedCss);
      } else {
        setGenerationStage('error');
        addLog(`Failed to generate CSS: ${result.message}`, 'error');
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

  // Helper function to get the current CSS from the page
  const getCurrentCSS = async (tabId: number): Promise<string> => {
    return new Promise((resolve) => {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          func: () => {
            const styleEl = document.getElementById('portal-generated-css');
            return styleEl ? styleEl.textContent || '' : '';
          },
        },
        (results) => {
          if (results && results[0]?.result) {
            resolve(results[0].result as string);
          } else {
            resolve('');
          }
        },
      );
    });
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
              selectedImage
                ? 'Describe changes or add to prompt...'
                : 'Type your prompt (e.g., modern, dark theme with green accents)'
            }
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>

        {/* Bottom section: Generate Button */}
        <div className="flex justify-between items-center p-1.5 bg-background">
          <Button
            variant="outline"
            size="sm"
            onClick={triggerFileUpload}
            className="flex items-center gap-1.5 whitespace-nowrap p-1 h-auto shrink-0 justify-center"
            disabled={generationStage === 'generating'}
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

            {generationStage === 'generating' && (
              <div className="w-36 bg-gray-200 rounded-full h-1.5 mb-1">
                <div
                  className="bg-blue-600 h-1.5 rounded-full"
                  style={{ width: `${Math.min((iterations / 5) * 100, 100)}%` }}
                />
              </div>
            )}

            <Button
              size="sm"
              className="flex items-center gap-1.5 h-8 px-3"
              onClick={handleGenerate}
              disabled={generationStage === 'generating' || !imageFile}
            >
              {generationStage === 'generating' ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span className="text-xs">Generating</span>
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
