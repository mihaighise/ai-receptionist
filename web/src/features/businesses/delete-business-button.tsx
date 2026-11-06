import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { type Business, useDeleteBusiness } from '@/api/businesses';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

// Delete button with a confirmation dialog, which also points to pausing as the gentler option.
export function DeleteBusinessButton({ business, onDeleted }: { business: Business; onDeleted: () => void }) {
  const remove = useDeleteBusiness();

  const confirm = async () => {
    try {
      await remove.mutateAsync(business.id);
      toast.success(`Deleted ${business.name}`);
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the business.');
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" className="text-destructive hover:text-destructive">
          <Trash2 /> Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {business.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Calls to its number will no longer be answered, and this can't be undone. To stop calls for now instead,
            untick Active and save.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirm} className="bg-destructive text-white hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
