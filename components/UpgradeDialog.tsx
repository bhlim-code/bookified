'use client';

import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface UpgradeDialogProps {
  // The message to show. When it is null, the dialog is closed.
  message: string | null;
  onClose: () => void;
  title?: string;
}

const UpgradeDialog = ({
  message,
  onClose,
  title = 'Book limit reached',
}: UpgradeDialogProps) => {
  const router = useRouter();

  return (
    <Dialog
      open={message !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter className='gap-2 sm:gap-0'>
          <Button variant='outline' onClick={onClose}>
            Not now
          </Button>
          <Button
            onClick={() => {
              onClose();
              router.push('/subscriptions');
            }}
          >
            Upgrade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UpgradeDialog;
