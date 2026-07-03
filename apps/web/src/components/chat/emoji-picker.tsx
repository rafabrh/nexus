'use client';

import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { motion, AnimatePresence } from 'framer-motion';
import { EmojiPicker } from 'frimousse';
import { Smile, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmojiPickerButtonProps {
  /** Recebe o emoji selecionado (o composer o insere na posição do cursor). */
  onSelect: (emoji: string) => void;
  /** Notifica abertura/fechamento (o composer devolve o foco ao textarea ao fechar). */
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
}

/**
 * Botão de emoji + popover com o picker (frimousse, headless) estilizado no
 * liquid-glass: fundo `--glass-bg` com blur, borda `--glass-border`, sheen especular
 * e sombra macOS — nada de cara default. Busca (pt), categorias e tom de pele.
 *
 * O picker não rouba o foco ao abrir (`onOpenAutoFocus` prevenido): o cursor
 * permanece no textarea para a inserção cair na posição certa, e o popover segue
 * aberto para escolher vários emojis. Ao fechar, o composer devolve o foco.
 */
export function EmojiPickerButton({ onSelect, onOpenChange, disabled }: EmojiPickerButtonProps) {
  const [open, setOpen] = useState(false);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="Inserir emoji"
          title="Emoji"
          className={cn(
            'flex-shrink-0 w-8 h-8 rounded-input flex items-center justify-center transition-colors duration-150 focus-ring disabled:opacity-50',
            open
              ? 'bg-primary-800/40 text-primary-400'
              : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover',
          )}
        >
          <Smile size={16} />
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
              sideOffset={10}
              // Foco fica no textarea: inserção cai no cursor e o popover não fecha
              // ao clicarmos nos emojis (o foco só volta ao composer no onOpenChange).
              onOpenAutoFocus={(e) => e.preventDefault()}
              // Não devolvemos o foco ao trigger — o composer refoca o textarea.
              onCloseAutoFocus={(e) => e.preventDefault()}
              className="glass-popup z-[var(--z-dropdown)] overflow-hidden"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: 4 }}
                transition={{ type: 'spring', stiffness: 420, damping: 28, mass: 0.6 }}
                style={{
                  transformOrigin: 'var(--radix-popover-content-transform-origin)',
                  borderRadius: 14,
                }}
              >
                <EmojiPicker.Root
                  locale="pt"
                  columns={8}
                  onEmojiSelect={({ emoji }) => onSelect(emoji)}
                  className="isolate flex flex-col"
                  style={{ width: 320, height: 358 }}
                >
                  {/* Busca + tom de pele */}
                  <div
                    className="flex items-center gap-2 px-2.5 pt-2.5 pb-2"
                    style={{ borderBottom: '1px solid var(--separator)' }}
                  >
                    <div className="relative flex-1">
                      <Search
                        size={13}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ color: 'var(--text-muted)' }}
                      />
                      <EmojiPicker.Search
                        placeholder="Buscar emoji"
                        className="w-full h-8 pl-8 pr-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
                        style={{
                          background: 'var(--control-fill)',
                          border: '1px solid var(--border-default)',
                          borderRadius: 8,
                        }}
                      />
                    </div>
                    <EmojiPicker.SkinToneSelector
                      className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-base transition-colors duration-150 hover:bg-bg-hover"
                      style={{
                        background: 'var(--glass-bg)',
                        border: '1px solid var(--glass-border)',
                      }}
                    />
                  </div>

                  <EmojiPicker.Viewport
                    className="relative flex-1"
                    style={{ outline: 'none', overflowX: 'hidden' }}
                  >
                    <EmojiPicker.Loading className="absolute inset-0 flex items-center justify-center text-sm text-text-muted">
                      Carregando emojis…
                    </EmojiPicker.Loading>
                    <EmojiPicker.Empty className="absolute inset-0 flex items-center justify-center text-sm text-text-muted">
                      {({ search }) => <>Nenhum emoji para “{search}”</>}
                    </EmojiPicker.Empty>
                    <EmojiPicker.List
                      className="select-none pb-1.5"
                      components={{
                        // Cabeçalho de categoria (sticky) — preserva o `style` de
                        // layout do frimousse e adiciona o tom vidro translúcido.
                        CategoryHeader: ({ category, style, ...props }) => (
                          <div
                            {...props}
                            style={{
                              ...style,
                              padding: '10px 12px 4px',
                              fontSize: 11,
                              fontWeight: 600,
                              letterSpacing: '0.02em',
                              color: 'var(--text-muted)',
                              background: 'var(--glass-bg)',
                              backdropFilter: 'blur(var(--glass-blur))',
                              WebkitBackdropFilter: 'blur(var(--glass-blur))',
                            }}
                          >
                            {category.label}
                          </div>
                        ),
                        // Linha — mantém height/display do frimousse, adiciona respiro lateral.
                        Row: ({ children, style, ...props }) => (
                          <div
                            {...props}
                            style={{ ...style, paddingLeft: 6, paddingRight: 6 }}
                          >
                            {children}
                          </div>
                        ),
                        // Emoji — flex-1 para preencher as 8 colunas; realce accent no ativo.
                        Emoji: ({ emoji, style, ...props }) => (
                          <button
                            {...props}
                            style={{
                              ...style,
                              background: emoji.isActive ? 'var(--accent-500)' : 'transparent',
                              transition: 'background 120ms var(--ease-out)',
                            }}
                            className="flex flex-1 items-center justify-center h-9 rounded-lg text-[20px] leading-none"
                          >
                            {emoji.emoji}
                          </button>
                        ),
                      }}
                    />
                  </EmojiPicker.Viewport>
                </EmojiPicker.Root>
              </motion.div>
            </Popover.Content>
          </Popover.Portal>
        )}
      </AnimatePresence>
    </Popover.Root>
  );
}
