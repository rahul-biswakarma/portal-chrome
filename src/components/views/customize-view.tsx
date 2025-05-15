import { useState } from 'react';
import { useAppContext } from '@/contexts';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { X, ImageIcon, ArrowUp } from 'lucide-react';

// Helper to truncate string
const truncateString = (str: string, num: number) => {
  if (str.length <= num) {
    return str;
  }
  return str.slice(0, num) + '...';
};

export const CustomizeView = () => {
  const {
    selectedImage,
    imageFile,
    fileInputRef,
    handleImageChange,
    handleRemoveImage,
    triggerFileUpload,
  } = useAppContext();

  const [isImageTagHovered, setIsImageTagHovered] = useState(false);

  return (
    <div className="pb-4">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImageChange}
        accept="image/*"
        style={{ display: 'none' }}
      />
      <Accordion
        defaultValue={['prompt-editor']}
        type="multiple"
        className="w-full"
      >
        <AccordionItem value="prompt-editor">
          <AccordionTrigger>Prompt Editor</AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-col gap-3">
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
                    // value={cssContent} // Example binding
                    // onChange={(e) => setCssContent(e.target.value)} // Example binding
                  />
                </div>

                {/* Bottom section: Generate Button */}
                <div className="flex justify-between items-center p-1.5 bg-background">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={triggerFileUpload}
                    className="flex items-center gap-1.5 whitespace-nowrap p-1 h-auto shrink-0 justify-center"
                  >
                    <ImageIcon size={14} />
                    <span className="text-xs">
                      {selectedImage ? 'Replace Image' : 'Upload Image'}
                    </span>
                  </Button>
                  <Button
                    size="sm"
                    className="flex items-center gap-1.5 h-8 px-3"
                  >
                    <span>Generate</span>
                    <ArrowUp size={16} />
                  </Button>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="css-editor">
          <AccordionTrigger>CSS Editor</AccordionTrigger>
          <AccordionContent>
            Edit the generated CSS here and see live changes on your help
            center.
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};
