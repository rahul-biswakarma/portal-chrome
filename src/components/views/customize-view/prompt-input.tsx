import { useState } from 'react';
import { useAppContext } from '@/contexts';
import { getActiveTab } from '@/utils/chrome-utils';
import { processReferenceImage } from '@/utils/image-to-css';
import { getPageStructure } from '@/utils/dom-utils';

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

  const handleGenerate = async () => {
    if (!imageFile) {
      setStatus('Please upload a reference image first');
      return;
    }

    try {
      setGenerationStage('generating');
      setStatus('Processing reference image...');
      setIterations(0);

      // Get active tab
      const tab = await getActiveTab();
      if (!tab.id) {
        throw new Error('No active tab found');
      }

      // Extract the page structure
      setStatus('Analyzing page structure...');
      const classHierarchy = await getPageStructure(tab.id);

      // Set up a listener to track iterations
      const messageListener = (message: {
        action: string;
        iteration: number;
      }) => {
        if (message.action === 'iteration-update') {
          setIterations(message.iteration);
          setStatus(`Iteration ${message.iteration}/5: Refining CSS...`);
        }
      };
      chrome.runtime.onMessage.addListener(messageListener);

      // Process the reference image
      setStatus('Generating initial CSS...');
      const result = await processReferenceImage(
        imageFile,
        tab.id,
        classHierarchy,
      );

      // Remove listener
      chrome.runtime.onMessage.removeListener(messageListener);

      setStatus(result.message);

      if (result.success) {
        setGenerationStage('success');
        // Fetch the current CSS to display in the editor
        const appliedCss = await getCurrentCSS(tab.id);
        setCssContent(appliedCss);
      } else {
        setGenerationStage('error');
      }
    } catch (error) {
      console.error('Error generating CSS:', error);
      setStatus('Error generating CSS');
      setGenerationStage('error');
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
              >
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
