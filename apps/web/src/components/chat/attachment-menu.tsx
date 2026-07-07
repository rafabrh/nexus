'use client';

import { useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { motion, AnimatePresence, useReducedMotion, type Variants } from 'framer-motion';
import { Paperclip, Camera, Image as ImageIcon, FileText, User, MapPin } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSendMedia } from '@/hooks/use-messages';
import { notify } from '@/lib/notify';
import { CameraCapture } from './camera-capture';
import { ContactPicker } from './contact-picker';
import { LocationShare } from './location-share';

interface AttachmentMenuProps {
  jid: string;
  /** Legenda para as mídias (texto atual do composer). Usada em imagem/documento. */
  getCaption?: () => string | undefined;
  /** Chamado após enviar mídia com sucesso (para limpar o composer). */
  onMediaSent?: () => void;
  disabled?: boolean;
}

type ActionId = 'camera' | 'image' | 'document' | 'contact' | 'location';

interface Action {
  id: ActionId;
  label: string;
  icon: LucideIcon;
  /** Cor iOS do círculo do ícone (token do tema quando existe). */
  color: string;
}

// Cinco ações estilo WhatsApp, cada uma num círculo colorido distinto (iOS).
const ACTIONS: Action[] = [
  { id: 'camera', label: 'Câmera', icon: Camera, color: '#FF2D55' },
  { id: 'image', label: 'Imagem', icon: ImageIcon, color: 'var(--stage-s2)' },
  { id: 'document', label: 'Documento', icon: FileText, color: 'var(--stage-s1)' },
  { id: 'contact', label: 'Contato', icon: User, color: 'var(--stage-s6)' },
  { id: 'location', label: 'Localização', icon: MapPin, color: 'var(--success)' },
];

const DOC_ACCEPT =
  'application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.zip';

/** Lê um arquivo como base64 puro (sem o prefixo data:). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Menu carrossel de anexos (Paperclip) estilo WhatsApp/iOS. Um popover liquid-glass
 * abre ACIMA do botão, ancorado, com 5 tiles coloridos: Câmera, Imagem, Documento,
 * Contato e Localização. Fecha ao escolher uma ação, clicar fora ou Esc (Radix).
 * Foco inicial no primeiro tile + navegação por setas (roving tabindex).
 */
export function AttachmentMenu({
  jid,
  getCaption,
  onMediaSent,
  disabled,
}: AttachmentMenuProps) {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<'camera' | 'contact' | 'location' | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const reduce = useReducedMotion();

  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const tilesRef = useRef<Array<HTMLButtonElement | null>>([]);
  const sendMedia = useSendMedia(jid);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite reenviar o mesmo arquivo
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      notify.error('Arquivo muito grande (máx 16MB)');
      return;
    }
    try {
      const base64 = await fileToBase64(file);
      const mediatype = file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('video/')
          ? 'video'
          : 'document';
      sendMedia.mutate(
        {
          mediatype,
          media: base64,
          fileName: file.name,
          mimetype: file.type,
          caption: getCaption?.(),
        },
        {
          onSuccess: () => {
            onMediaSent?.();
            notify.success('Mídia enviada');
          },
          onError: () => notify.error('Erro ao enviar mídia'),
        },
      );
    } catch {
      notify.error('Erro ao ler o arquivo');
    }
  };

  const runAction = (id: ActionId) => {
    setOpen(false);
    switch (id) {
      case 'camera':
        setModal('camera');
        break;
      case 'image':
        imageInputRef.current?.click();
        break;
      case 'document':
        docInputRef.current?.click();
        break;
      case 'contact':
        setModal('contact');
        break;
      case 'location':
        setModal('location');
        break;
    }
  };

  // Navegação por teclado entre os tiles (roving tabindex).
  const moveFocus = (next: number) => {
    const clamped = (next + ACTIONS.length) % ACTIONS.length;
    setFocusIndex(clamped);
    tilesRef.current[clamped]?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        moveFocus(index + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        moveFocus(index - 1);
        break;
      case 'Home':
        e.preventDefault();
        moveFocus(0);
        break;
      case 'End':
        e.preventDefault();
        moveFocus(ACTIONS.length - 1);
        break;
    }
  };

  // Variantes de animação — respeitam prefers-reduced-motion.
  const container: Variants = reduce
    ? {
        closed: { opacity: 0 },
        open: { opacity: 1, transition: { staggerChildren: 0 } },
      }
    : {
        closed: { opacity: 0, scale: 0.92, y: 8 },
        open: {
          opacity: 1,
          scale: 1,
          y: 0,
          transition: {
            type: 'spring',
            stiffness: 420,
            damping: 30,
            mass: 0.7,
            staggerChildren: 0.035,
            delayChildren: 0.03,
          },
        },
      };

  const tile: Variants = reduce
    ? { closed: { opacity: 0 }, open: { opacity: 1 } }
    : {
        closed: { opacity: 0, y: 10, scale: 0.8 },
        open: {
          opacity: 1,
          y: 0,
          scale: 1,
          transition: { type: 'spring', stiffness: 500, damping: 26 },
        },
      };

  return (
    <>
      {/* Inputs ocultos — disparados pelos tiles Imagem/Documento. */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
      <input
        ref={docInputRef}
        type="file"
        accept={DOC_ACCEPT}
        className="hidden"
        onChange={handleFile}
      />

      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setFocusIndex(0);
        }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label="Anexar"
            title="Anexar"
            className={cn(
              'flex-shrink-0 w-8 h-8 rounded-input flex items-center justify-center transition-colors duration-150 focus-ring disabled:opacity-50',
              open
                ? 'bg-primary-800/40 text-primary-400'
                : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover',
            )}
          >
            <Paperclip size={16} />
          </button>
        </Popover.Trigger>

        <AnimatePresence>
          {open && (
            <Popover.Portal forceMount>
              <Popover.Content
                asChild
                forceMount
                side="top"
                align="start"
                sideOffset={12}
                // Foco inicial no primeiro tile (em vez do container).
                onOpenAutoFocus={(e) => {
                  e.preventDefault();
                  requestAnimationFrame(() => tilesRef.current[0]?.focus());
                }}
                // max-w impede o carrossel de estourar em telas estreitas (~320px):
                // limita o popover à largura da viewport menos uma folga (12px de
                // cada lado). No desktop a viewport é larga, então nada muda.
                className="glass-popup z-[var(--z-dropdown)] overflow-hidden max-w-[calc(100vw-24px)]"
              >
                <motion.div
                  role="menu"
                  aria-label="Opções de anexo"
                  variants={container}
                  initial="closed"
                  animate="open"
                  exit="closed"
                  style={{
                    transformOrigin:
                      'var(--radix-popover-content-transform-origin)',
                    borderRadius: 16,
                  }}
                >
                  {/* Tiles menores no mobile (círculo 44px, tile 54px) fazem os 5
                      caberem numa linha só até ~320px, sem o wrap 4+1 desajeitado.
                      flex-wrap fica como rede de segurança em telas ultra-estreitas.
                      No desktop os valores md: restauram o layout original. */}
                  <div className="flex flex-wrap items-stretch justify-center gap-0.5 md:gap-1 p-2 md:p-2.5">
                    {ACTIONS.map((action, i) => {
                      const Icon = action.icon;
                      return (
                        <motion.button
                          key={action.id}
                          ref={(el) => {
                            tilesRef.current[i] = el;
                          }}
                          type="button"
                          role="menuitem"
                          aria-label={action.label}
                          tabIndex={i === focusIndex ? 0 : -1}
                          variants={tile}
                          onClick={() => runAction(action.id)}
                          onKeyDown={(e) => handleKeyDown(e, i)}
                          onFocus={() => setFocusIndex(i)}
                          whileHover={reduce ? undefined : { y: -2 }}
                          whileTap={reduce ? undefined : { scale: 0.92 }}
                          className="group flex w-[54px] md:w-[62px] flex-col items-center gap-1.5 rounded-xl px-1 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent"
                        >
                          <span
                            className="flex h-11 w-11 md:h-12 md:w-12 items-center justify-center rounded-full text-white shadow-sm transition-transform duration-150 group-active:scale-95"
                            style={{
                              background: action.color,
                              boxShadow:
                                'inset 0 1px 0 rgba(255,255,255,.25), 0 4px 10px color-mix(in srgb, ' +
                                action.color +
                                ' 35%, transparent)',
                            }}
                          >
                            <Icon size={22} />
                          </span>
                          <span className="text-[11px] leading-tight text-text-secondary">
                            {action.label}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              </Popover.Content>
            </Popover.Portal>
          )}
        </AnimatePresence>
      </Popover.Root>

      {/* Modais das ações que precisam de UI própria. */}
      <CameraCapture
        open={modal === 'camera'}
        onOpenChange={(o) => setModal(o ? 'camera' : null)}
        jid={jid}
      />
      <ContactPicker
        open={modal === 'contact'}
        onOpenChange={(o) => setModal(o ? 'contact' : null)}
        jid={jid}
      />
      <LocationShare
        open={modal === 'location'}
        onOpenChange={(o) => setModal(o ? 'location' : null)}
        jid={jid}
      />
    </>
  );
}
