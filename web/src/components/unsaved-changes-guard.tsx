import { useBlocker } from '@tanstack/react-router';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// Asks, in the app's own dialog, before leaving a page with unsaved changes: going to another
// page, following a link, or the browser's Back button. hasChanges: whether there's anything to
// lose right now.
//
// Closing or reloading the browser tab still shows the browser's own warning: browsers don't let
// a page show its own dialog then.
export function UnsavedChangesGuard({ hasChanges }: { hasChanges: () => boolean }) {
  const blocker = useBlocker({ shouldBlockFn: hasChanges, enableBeforeUnload: hasChanges, withResolver: true });
  return (
    <AlertDialog open={blocker.status === 'blocked'} onOpenChange={(open) => !open && blocker.reset?.()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
          <AlertDialogDescription>
            You've made changes that aren't saved yet. If you leave this page, they'll be lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => blocker.reset?.()}>Keep editing</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => blocker.proceed?.()}
            className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60"
          >
            Discard changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
