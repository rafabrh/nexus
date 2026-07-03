import { useEffect, useRef, useState } from 'react';

/**
 * Observa a entrada do elemento na viewport (uma vez). Serve para adiar o fetch de
 * blobs autenticados (foto de perfil, áudio) até o componente aparecer — importante
 * com centenas de conversas/mensagens. `rootMargin` generoso pré-carrega um pouco
 * antes de entrar em tela; ao aparecer, desconecta (não volta a false → sem flapping).
 * Sem IntersectionObserver (SSR/browser antigo), assume visível.
 */
export function useInView<T extends HTMLElement>(rootMargin = '250px') {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, rootMargin]);

  return { ref, inView };
}
