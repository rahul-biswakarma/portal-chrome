import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertCircle, Copy, CheckIcon } from 'lucide-react';
import { useState } from 'react';

interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  error: string | Error;
  details?: string;
  showCopyButton?: boolean;
}

export function ErrorModal({
  isOpen,
  onClose,
  title = 'Error Occurred',
  error,
  details,
  showCopyButton = true,
}: ErrorModalProps) {
  const [isCopied, setIsCopied] = useState(false);

  const errorMessage = error instanceof Error ? error.message : error;
  const errorDetails = details || (error instanceof Error ? error.stack : undefined);

  const handleCopyError = async () => {
    try {
      const textToCopy = `${title}\n\nError: ${errorMessage}\n\n${errorDetails ? `Details:\n${errorDetails}` : ''}`;
      await navigator.clipboard.writeText(textToCopy);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy error to clipboard:', err);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="text-red-500" size={20} />
            {title}
          </DialogTitle>
          <DialogDescription className="text-left space-y-3">
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm font-medium text-red-800 mb-1">Error Message:</p>
              <p className="text-sm text-red-700 break-words">{errorMessage}</p>
            </div>

            {errorDetails && (
              <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
                <p className="text-sm font-medium text-gray-800 mb-1">Technical Details:</p>
                <pre className="text-xs text-gray-600 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                  {errorDetails}
                </pre>
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
              <p className="text-sm font-medium text-blue-800 mb-1">💡 Troubleshooting Tips:</p>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• Check your internet connection</li>
                <li>• Verify API keys are correctly set in Settings</li>
                <li>• Try refreshing the page and attempting again</li>
                <li>• Check the browser console for additional error details</li>
              </ul>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <div className="flex gap-2">
            {showCopyButton && (
              <Button
                variant="outline"
                onClick={handleCopyError}
                className="flex items-center gap-2"
              >
                {isCopied ? <CheckIcon size={16} /> : <Copy size={16} />}
                {isCopied ? 'Copied!' : 'Copy Error'}
              </Button>
            )}
            <Button onClick={onClose}>Close</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
