import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle } from 'lucide-react';

interface FetchCssModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
}

export function FetchCssModal({
  isOpen,
  onClose,
  onConfirm,
  isLoading,
}: FetchCssModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="text-amber-500" size={18} />
            Replace Current CSS?
          </DialogTitle>
          <DialogDescription className="text-left">
            This will fetch the latest CSS from DevRev portal preferences and
            replace your current editor content. Any unsaved changes will be
            lost.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <div className="flex flex-col gap-2">
            <Button variant="outline" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={onConfirm} disabled={isLoading}>
              {isLoading ? 'Fetching...' : 'Fetch and Replace'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
