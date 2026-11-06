import { X } from 'lucide-react';
import type { Preview } from '@/api/businesses';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// What the receptionist would say and know on a call, for the values in the form.
export function PreviewPanel({ preview, onClose }: { preview: Preview; onClose: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Preview</CardTitle>
        <CardDescription>Built by the same code as a real call, from what's in the form now.</CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close preview">
            <X />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <section>
          <h3 className="mb-2 font-medium text-sm">Greeting</h3>
          <ol className="flex list-decimal flex-col gap-1 pl-5">
            {preview.greeting.map((part) => (
              <li key={part.language}>
                {part.text} <span className="text-muted-foreground text-xs">({part.languageName})</span>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h3 className="mb-2 font-medium text-sm">Claude's instructions</h3>
          <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/50 p-3 font-mono text-xs leading-relaxed">
            {preview.prompt}
          </pre>
        </section>
      </CardContent>
    </Card>
  );
}
