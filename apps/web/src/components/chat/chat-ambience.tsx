'use client';

import { useEffect, useRef } from 'react';

/**
 * Interactive mirror backdrop for the Conversas chat area.
 *
 * A soft specular "reflection" tracks the cursor across the chat region — the
 * macOS efeito-espelho language carried into the conversation surface — sitting
 * over a static sheen + vignette (see `.chat-ambience` in globals.css) that give
 * the otherwise-flat surface real depth. Every color comes from theme tokens,
 * so it reads correctly in light and dark and adds no new hues.
 *
 * The pointer is tracked on `window` (the layer is pointer-events:none, behind
 * the messages) and mapped to the layer's own rect, so the glow fades out when
 * the cursor leaves the chat area. Driven imperatively via CSS vars for 60fps,
 * and disabled under prefers-reduced-motion.
 */
export function ChatAmbience() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        const inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
        el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
        el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
        el.style.setProperty('--mirror-glow', inside ? '1' : '0');
      });
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <div ref={ref} className="chat-ambience" aria-hidden />;
}
