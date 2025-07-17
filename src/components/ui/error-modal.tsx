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
      <DialogContent className="sm:max-w-[500px] max-w-[90vw] rounded-xl border-border bg-background shadow-xl">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <AlertCircle className="text-destructive flex-shrink-0" size={20} />
            <span className="break-words">{title}</span>
          </DialogTitle>
          <DialogDescription className="text-left space-y-3">
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              <p className="text-sm font-medium text-destructive mb-1">Error Message:</p>
              <p className="text-sm text-destructive/90 break-words whitespace-pre-wrap overflow-wrap-anywhere">
                {errorMessage}
              </p>
            </div>

            {errorDetails && (
              <div className="bg-muted/50 border border-border rounded-lg p-3">
                <p className="text-sm font-medium text-foreground mb-1">Technical Details:</p>
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words overflow-wrap-anywhere max-h-32 overflow-y-auto font-mono bg-muted/30 p-2 rounded-md">
                  {errorDetails}
                </pre>
              </div>
            )}

            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
              <p className="text-sm font-medium text-primary mb-1">💡 Troubleshooting Tips:</p>
              <ul className="text-sm text-primary/90 space-y-1">
                <li className="break-words">• Check your internet connection</li>
                <li className="break-words">• Verify API keys are correctly set in Settings</li>
                <li className="break-words">• Try refreshing the page and attempting again</li>
                <li className="break-words">
                  • Check the browser console for additional error details
                </li>
              </ul>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 flex-wrap">
          {showCopyButton && (
            <Button variant="outline" onClick={handleCopyError} className="flex items-center gap-2">
              {isCopied ? <CheckIcon size={16} /> : <Copy size={16} />}
              {isCopied ? 'Copied!' : 'Copy Error'}
            </Button>
          )}
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
