import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const BARS = 28;

// The hero's centerpiece: a glowing orb with rings that pulse outwards, and a button that plays a
// real sample of the receptionist's voice (public/demo-call.wav, in phone quality: what callers
// hear). The sound bars move while it plays.
export function VoiceOrb() {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    const stop = () => setPlaying(false);
    element.addEventListener('ended', stop);
    element.addEventListener('pause', stop);
    return () => {
      element.removeEventListener('ended', stop);
      element.removeEventListener('pause', stop);
    };
  }, []);

  const toggle = async () => {
    const element = audio.current;
    if (!element) return;
    if (playing) return element.pause();
    element.currentTime = element.ended ? 0 : element.currentTime;
    try {
      await element.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  };

  return (
    <div className="relative mx-auto flex aspect-square w-full max-w-[420px] items-center justify-center">
      {/* Rings pulsing outwards, a little faster while the sample plays. */}
      {[0, 1.2, 2.4].map((delay) => (
        <span
          key={delay}
          aria-hidden="true"
          className={cn(
            'motion-safe-only absolute inset-[18%] animate-ring rounded-full border border-cyan-300/30',
            playing && '[animation-duration:1.8s]',
          )}
          style={{ animationDelay: `${delay}s` }}
        />
      ))}
      {/* The orb: layered gradients that slowly breathe and shift hue. */}
      <div
        aria-hidden="true"
        className="motion-safe-only absolute inset-[22%] animate-orb rounded-full bg-[radial-gradient(circle_at_30%_25%,#a5f3fc_0%,#38bdf8_22%,#6366f1_55%,#7c3aed_78%,#1e1b4b_100%)] shadow-[0_0_80px_20px_rgba(99,102,241,0.45),0_0_160px_40px_rgba(56,189,248,0.25)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-[22%] rounded-full bg-[radial-gradient(circle_at_70%_80%,rgba(255,255,255,0.25),transparent_45%)] mix-blend-overlay"
      />

      <div className="relative flex flex-col items-center gap-4">
        {/* Sound bars */}
        <div aria-hidden="true" className="flex h-12 items-center gap-[3px]">
          {Array.from({ length: BARS }, (_, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: the bars are identical and never reorder.
              key={i}
              className={cn(
                'motion-safe-only h-full w-[3px] origin-center rounded-full bg-white/90',
                playing ? 'animate-wave' : 'scale-y-[0.18]',
              )}
              style={{ animationDelay: `${(i * 97) % 1200}ms`, animationDuration: `${900 + ((i * 53) % 600)}ms` }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={toggle}
          className="flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-5 py-2.5 font-medium text-sm text-white backdrop-blur-md transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          {playing ? 'Pause' : 'Hear a real call'}
        </button>
      </div>
      {/* biome-ignore lint/a11y/useMediaCaption: a short spoken sample; its words are in the transcript next to it. */}
      <audio ref={audio} src="/demo-call.wav" preload="none" />
    </div>
  );
}
