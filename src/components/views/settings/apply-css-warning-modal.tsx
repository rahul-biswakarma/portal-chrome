import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

interface ApplyCssWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
}

export function ApplyCssWarningModal({
  isOpen,
  onClose,
  onConfirm,
  isLoading,
}: ApplyCssWarningModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="text-amber-500" size={20} />
            Apply CSS to Portal
          </DialogTitle>
          <DialogDescription className="text-left space-y-3">
            <p>
              You are about to apply the current CSS from your editor to the DevRev portal. This
              will replace any existing custom CSS on the portal.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
              <p className="text-sm font-medium text-amber-800 mb-2">Please confirm you have:</p>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-amber-700">
                  <CheckCircle2 size={14} className="text-amber-600" />
                  Included any previous CSS content you want to preserve
                </div>
                <div className="flex items-center gap-2 text-sm text-amber-700">
                  <CheckCircle2 size={14} className="text-amber-600" />
                  Tested the CSS changes thoroughly
                </div>
                <div className="flex items-center gap-2 text-sm text-amber-700">
                  <CheckCircle2 size={14} className="text-amber-600" />
                  Backed up any existing portal customizations
                </div>
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
              <p className="text-sm font-medium text-blue-800 mb-1">💡 Pro Tip:</p>
              <p className="text-sm text-blue-700">
                To get the latest CSS from your portal, use the{' '}
                <strong>Download button (📥)</strong> in the CSS Editor tab. This will fetch the
                current CSS from DevRev and merge it with your changes.
              </p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-md p-3">
              <p className="text-sm font-medium text-green-800 mb-1">🔧 Consistent Behavior:</p>
              <p className="text-sm text-green-700">
                The CSS will be uploaded exactly as you've written it, ensuring consistent behavior
                between extension testing and server deployment. If styles don't apply as expected,
                consider adding <code>!important</code> declarations to override existing portal
                styles.
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              This action cannot be undone. The CSS will be immediately applied to your live portal.
            </p>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={onConfirm} disabled={isLoading}>
              {isLoading ? 'Applying...' : 'Apply to Portal'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
