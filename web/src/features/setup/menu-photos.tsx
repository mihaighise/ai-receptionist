import { ImagePlus, Loader2, ScanText, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useMenuImport, useStartMenuImport } from '@/api/owner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { shrinkPhoto } from '@/lib/shrink-photo';

const MAX_PHOTOS = 5;

// "Add your menu from photos": the owner picks photos of a menu or price list, Claude reads them
// (src/api/menu-import.js), and onLines gets one line per item, to add to the common questions
// for the owner to check before saving.
export function MenuPhotos({ onLines }: { onLines: (lines: string[]) => void }) {
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const start = useStartMenuImport();
  const job = useMenuImport(jobId);
  const handled = useRef<string | null>(null);

  // Thumbnails are object URLs; free them when they're removed or the card goes away.
  const urls = useRef(photos.map((photo) => photo.url));
  urls.current = photos.map((photo) => photo.url);
  useEffect(
    () => () => {
      for (const url of urls.current) URL.revokeObjectURL(url);
    },
    [],
  );

  // Once the upload has been read: hand over the lines, or show what went wrong.
  useEffect(() => {
    const result = job.data;
    if (!result || result.status === 'reading' || handled.current === result.id) return;
    handled.current = result.id;
    setJobId(null);
    if (result.status === 'failed') {
      setError(result.error ?? 'The menu could not be read.');
      return;
    }
    onLines(result.lines);
    for (const photo of photos) URL.revokeObjectURL(photo.url);
    setPhotos([]);
    toast.success(`Added ${result.lines.length} lines from your menu. Check them, especially the prices.`);
  }, [job.data, onLines, photos]);

  const reading = preparing || start.isPending || Boolean(jobId);

  const add = (files: FileList | null) => {
    setError(null);
    const chosen = [...(files ?? [])].filter((file) => file.type.startsWith('image/') || /\.hei[cf]$/i.test(file.name));
    const room = MAX_PHOTOS - photos.length;
    if (chosen.length > room) setError(`Add up to ${MAX_PHOTOS} photos at a time.`);
    setPhotos((current) => [
      ...current,
      ...chosen.slice(0, room).map((file) => ({ file, url: URL.createObjectURL(file) })),
    ]);
  };

  const remove = (url: string) => {
    URL.revokeObjectURL(url);
    setPhotos((current) => current.filter((photo) => photo.url !== url));
  };

  const read = async () => {
    setError(null);
    setPreparing(true);
    try {
      const shrunk = await Promise.all(photos.map((photo) => shrinkPhoto(photo.file)));
      setPreparing(false);
      const { id } = await start.mutateAsync(shrunk);
      setJobId(id);
    } catch (err) {
      setPreparing(false);
      setError(err instanceof Error ? err.message : 'The photos could not be uploaded.');
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <ScanText className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="font-medium text-sm">Have a menu or price list?</p>
          <p className="text-muted-foreground text-sm">
            Add photos of it and we'll type it in for you, one line per item. You check the lines before saving.
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5" aria-label="Menu photos">
          {photos.map((photo) => (
            <li key={photo.url} className="relative aspect-[3/4] overflow-hidden rounded-md border bg-muted">
              <img src={photo.url} alt={photo.file.name} className="size-full object-cover" />
              {!reading && (
                <button
                  type="button"
                  onClick={() => remove(photo.url)}
                  aria-label={`Remove ${photo.file.name}`}
                  className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-background/90 shadow-sm"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        aria-label="Menu photos to add"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = '';
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => input.current?.click()}
          disabled={reading || photos.length >= MAX_PHOTOS}
        >
          <ImagePlus /> {photos.length ? 'Add more photos' : 'Add photos'}
        </Button>
        {photos.length > 0 && (
          <Button type="button" size="sm" onClick={read} disabled={reading}>
            {reading ? <Loader2 className="animate-spin" /> : <ScanText />}
            {reading ? 'Reading your menu…' : `Read ${photos.length === 1 ? 'photo' : `${photos.length} photos`}`}
          </Button>
        )}
        {reading && <span className="text-muted-foreground text-xs">This usually takes under a minute.</span>}
      </div>
    </div>
  );
}
