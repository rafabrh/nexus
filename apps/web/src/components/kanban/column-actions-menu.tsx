'use client';

import { useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { motion, AnimatePresence, useReducedMotion, type Variants } from 'framer-motion';
import {
  MoreHorizontal,
  Pencil,
  Palette,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { SwatchGrid } from './column-color-picker';

interface ColumnActionsMenuProps {
  /** Cor atual da coluna (swatch no item "Cor" + valor selecionado do picker). */
  color: string;
  /** Abre o modo renomear inline no cabeçalho. */
  onRename: () => void;
  /** Escolha de cor no sub-picker → `PATCH {color}` otimista. */
  onColorSelect: (hex: string) => void;
  /** Excluir (fluxo pessimista; 409 mantém a coluna). */
  onDelete: () => void;
  /** Mover a coluna uma posição (só mobile — reorder por troca de ids). */
  onMoveLeft: () => void;
  onMoveRight: () => void;
  /** Desabilita "Mover ←/→" nos extremos. */
  canMoveLeft: boolean;
  canMoveRight: boolean;
}

/**
 * Menu ⋯ do cabeçalho da coluna. Radix Popover (side=bottom align=end), liquid
 * glass. Itens: Renomear, Cor (sub-picker), Excluir. No mobile (< md) ganha
 * "Mover para esquerda/direita" (reorder por troca de posição, já que o arraste
 * de coluna fica desabilitado no toque). Navegação por setas (roving tabindex),
 * foco inicial no 1º item.
 */
export function ColumnActionsMenu({
  color,
  onRename,
  onColorSelect,
  onDelete,
  onMoveLeft,
  onMoveRight,
  canMoveLeft,
  canMoveRight,
}: ColumnActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const reduce = useReducedMotion();
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Itens na ordem visual. Os "Mover" só existem no mobile — marcados com
  // `mobileOnly` para o roving por teclado (desktop) pular sobre eles.
  type Item = {
    id: string;
    label: string;
    icon: typeof Pencil;
    onSelect: () => void;
    danger?: boolean;
    mobileOnly?: boolean;
    disabled?: boolean;
    /** O item "Cor" não fecha o menu ao clicar — abre o sub-picker. */
    keepOpen?: boolean;
    /** Swatch da cor atual antes do ícone (item "Cor"). */
    swatch?: boolean;
  };

  const items: Item[] = [
    { id: 'rename', label: 'Renomear', icon: Pencil, onSelect: onRename },
    { id: 'color', label: 'Cor', icon: Palette, onSelect: () => setColorOpen(true), keepOpen: true, swatch: true },
    {
      id: 'move-left',
      label: 'Mover para esquerda',
      icon: ChevronLeft,
      onSelect: onMoveLeft,
      mobileOnly: true,
      disabled: !canMoveLeft,
    },
    {
      id: 'move-right',
      label: 'Mover para direita',
      icon: ChevronRight,
      onSelect: onMoveRight,
      mobileOnly: true,
      disabled: !canMoveRight,
    },
    { id: 'delete', label: 'Excluir', icon: Trash2, onSelect: onDelete, danger: true },
  ];

  const runItem = (item: Item) => {
    if (item.disabled) return;
    if (!item.keepOpen) setOpen(false);
    item.onSelect();
  };

  // Roving tabindex — pula itens desabilitados.
  const focusableIndexes = items
    .map((it, i) => (it.disabled ? -1 : i))
    .filter((i) => i >= 0);

  const moveFocus = (fromIndex: number, dir: 1 | -1) => {
    const pos = focusableIndexes.indexOf(fromIndex);
    const nextPos =
      pos === -1
        ? 0
        : (pos + dir + focusableIndexes.length) % focusableIndexes.length;
    const nextIndex = focusableIndexes[nextPos];
    setFocusIndex(nextIndex);
    itemRefs.current[nextIndex]?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        moveFocus(index, 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveFocus(index, -1);
        break;
      case 'Home':
        e.preventDefault();
        moveFocus(focusableIndexes[focusableIndexes.length - 1], 1);
        break;
      case 'End':
        e.preventDefault();
        moveFocus(focusableIndexes[0], -1);
        break;
    }
  };

  const container: Variants = reduce
    ? { closed: { opacity: 0 }, open: { opacity: 1, transition: { staggerChildren: 0 } } }
    : {
        closed: { opacity: 0, scale: 0.94, y: -6 },
        open: {
          opacity: 1,
          scale: 1,
          y: 0,
          transition: {
            type: 'spring',
            stiffness: 420,
            damping: 30,
            mass: 0.7,
            staggerChildren: 0.025,
            delayChildren: 0.02,
          },
        },
      };

  const itemVariant: Variants = reduce
    ? { closed: { opacity: 0 }, open: { opacity: 1 } }
    : {
        closed: { opacity: 0, x: 6 },
        open: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 500, damping: 30 } },
      };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setFocusIndex(0);
        else setColorOpen(false);
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Ações da coluna"
          title="Ações da coluna"
          // Slot visual 20px; `.tap-44` estende a área de toque para 44px no mobile
          // (via ::after transparente) sem crescer o layout.
          className="tap-44 flex-shrink-0 flex items-center justify-center rounded-md text-text-muted hover:text-text-secondary transition-all duration-150 focus-ring opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 md:data-[state=open]:opacity-100"
          style={{ width: 20, height: 20, minWidth: 20 }}
        >
          <MoreHorizontal size={14} />
        </button>
      </Popover.Trigger>

      <AnimatePresence>
        {open && (
          <Popover.Portal forceMount>
            <Popover.Content
              asChild
              forceMount
              side="bottom"
              align="end"
              sideOffset={6}
              onOpenAutoFocus={(e) => {
                e.preventDefault();
                requestAnimationFrame(() => itemRefs.current[0]?.focus());
              }}
              className="glass-popup z-[var(--z-dropdown)] overflow-visible max-w-[calc(100vw-24px)]"
            >
              <motion.div
                role="menu"
                aria-label="Ações da coluna"
                variants={container}
                initial="closed"
                animate="open"
                exit="closed"
                style={{
                  transformOrigin: 'var(--radix-popover-content-transform-origin)',
                  borderRadius: 12,
                  minWidth: 190,
                }}
                className="p-1"
              >
                {items.map((item, i) => {
                  const Icon = item.icon;
                  const menuItem = (
                    <motion.button
                      key={item.id}
                      ref={(el) => {
                        itemRefs.current[i] = el;
                      }}
                      type="button"
                      role="menuitem"
                      variants={itemVariant}
                      tabIndex={i === focusIndex ? 0 : -1}
                      disabled={item.disabled}
                      onClick={() => runItem(item)}
                      onKeyDown={(e) => handleKeyDown(e, i)}
                      onFocus={() => setFocusIndex(i)}
                      className={[
                        'w-full flex items-center gap-2.5 px-2.5 rounded-md text-xs text-left transition-colors duration-100',
                        'h-11 md:h-8',
                        'focus:outline-none disabled:opacity-40 disabled:pointer-events-none',
                        item.mobileOnly ? 'md:hidden' : '',
                        item.danger
                          ? 'text-text-secondary hover:text-[color:var(--error)]'
                          : 'text-text-secondary hover:text-text-primary',
                      ].join(' ')}
                      style={
                        item.danger
                          ? ({
                              // separador acima do "Excluir".
                              borderTop: '1px solid var(--separator)',
                              marginTop: 4,
                              paddingTop: 4,
                            } as React.CSSProperties)
                          : undefined
                      }
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = item.danger
                          ? 'color-mix(in srgb, var(--error) 10%, transparent)'
                          : 'var(--bg-hover)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      {item.swatch ? (
                        <span
                          className="flex-shrink-0 rounded-full"
                          style={{
                            width: 14,
                            height: 14,
                            background: color,
                            boxShadow: `inset 0 1px 0 rgba(255,255,255,.25), 0 1px 3px color-mix(in srgb, ${color} 35%, transparent)`,
                          }}
                          aria-hidden
                        />
                      ) : (
                        <Icon size={14} className="flex-shrink-0" aria-hidden />
                      )}
                      <span className="flex-1">{item.label}</span>
                    </motion.button>
                  );

                  // O item "Cor" é o anchor do sub-picker (Radix Popover aninhado).
                  if (item.id === 'color') {
                    return (
                      <Popover.Root
                        key={item.id}
                        open={colorOpen}
                        onOpenChange={setColorOpen}
                      >
                        <Popover.Trigger asChild>{menuItem}</Popover.Trigger>
                        <AnimatePresence>
                          {colorOpen && (
                            <Popover.Portal forceMount>
                              <Popover.Content
                                asChild
                                forceMount
                                side="right"
                                align="start"
                                sideOffset={8}
                                collisionPadding={12}
                                onOpenAutoFocus={(e) => e.preventDefault()}
                                className="glass-popup z-[var(--z-dropdown)] overflow-hidden max-w-[calc(100vw-24px)]"
                              >
                                <motion.div
                                  variants={container}
                                  initial="closed"
                                  animate="open"
                                  exit="closed"
                                  style={{
                                    transformOrigin:
                                      'var(--radix-popover-content-transform-origin)',
                                    borderRadius: 16,
                                  }}
                                  className="p-3"
                                >
                                  <SwatchGrid
                                    value={color}
                                    autoFocusSelected
                                    onSelect={(hex) => {
                                      onColorSelect(hex);
                                      setColorOpen(false);
                                      setOpen(false);
                                    }}
                                  />
                                </motion.div>
                              </Popover.Content>
                            </Popover.Portal>
                          )}
                        </AnimatePresence>
                      </Popover.Root>
                    );
                  }

                  return menuItem;
                })}
              </motion.div>
            </Popover.Content>
          </Popover.Portal>
        )}
      </AnimatePresence>
    </Popover.Root>
  );
}
