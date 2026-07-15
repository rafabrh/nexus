'use client';

import { useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { motion, AnimatePresence, useReducedMotion, type Variants } from 'framer-motion';
import { Check } from 'lucide-react';

/**
 * Paleta curada (hex fixos) — neutro → frios → quentes. Sem campo hex cru: o
 * operador escolhe uma das cores da grade. Estes valores são o vocabulário de
 * cores das colunas do funil (iOS system palette).
 */
export const STAGE_PALETTE = [
  '#8E8E93',
  '#32ADE6',
  '#007AFF',
  '#5856D6',
  '#AF52DE',
  '#FF2D55',
  '#FF3B30',
  '#FF9500',
  '#FFCC00',
  '#34C759',
  '#00C7BE',
] as const;

interface SwatchGridProps {
  /** Cor atualmente selecionada (hex) — recebe o anel de seleção. */
  value: string;
  onSelect: (hex: string) => void;
  /**
   * Classes Tailwind de tamanho do swatch (largura+altura). Default segue a spec:
   * 32px no mobile → 28px no desktop (`w-8 h-8 md:w-7 md:h-7`). Usar classes (não
   * `style`) permite a variação responsiva `md:`.
   */
  swatchSizeClass?: string;
  /** true quando os swatches são "grandes" (≥30px) → Check 16px em vez de 14px. */
  largeCheck?: boolean;
  className?: string;
  /** Roving tabindex: começa focado no swatch selecionado (ou 0). */
  autoFocusSelected?: boolean;
}

/**
 * Grade de swatches redondos com sombra "esfera iOS". Reutilizável no popover de
 * cor (ColumnColorPicker) e na faixa de cores do form de criação (AddColumn).
 * Navegação por setas (roving tabindex).
 */
export function SwatchGrid({
  value,
  onSelect,
  swatchSizeClass = 'w-8 h-8 md:w-7 md:h-7',
  largeCheck,
  className,
  autoFocusSelected,
}: SwatchGridProps) {
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(
    0,
    STAGE_PALETTE.findIndex((c) => c.toLowerCase() === value?.toLowerCase()),
  );
  const [focusIndex, setFocusIndex] = useState(selectedIndex);

  const moveFocus = (next: number) => {
    const clamped = (next + STAGE_PALETTE.length) % STAGE_PALETTE.length;
    setFocusIndex(clamped);
    btnRefs.current[clamped]?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    // Grade 5-col: setas verticais saltam uma linha; horizontais um swatch.
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        moveFocus(index + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        moveFocus(index - 1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        moveFocus(index + 5);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveFocus(index - 5);
        break;
      case 'Home':
        e.preventDefault();
        moveFocus(0);
        break;
      case 'End':
        e.preventDefault();
        moveFocus(STAGE_PALETTE.length - 1);
        break;
    }
  };

  return (
    <div
      role="listbox"
      aria-label="Cor da coluna"
      className={`grid grid-cols-5 gap-2 ${className ?? ''}`}
    >
      {STAGE_PALETTE.map((hex, i) => {
        const isSelected = hex.toLowerCase() === value?.toLowerCase();
        return (
          <button
            key={hex}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            type="button"
            role="option"
            aria-selected={isSelected}
            aria-label={hex}
            tabIndex={autoFocusSelected ? (i === focusIndex ? 0 : -1) : 0}
            onClick={() => onSelect(hex)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            onFocus={() => setFocusIndex(i)}
            className={`relative flex items-center justify-center rounded-full transition-transform duration-150 hover:scale-110 focus:outline-none active:scale-95 ${swatchSizeClass}`}
            style={{
              background: hex,
              // Sombra "esfera iOS": brilho interno no topo + sombra colorida embaixo.
              // Selecionado: anel duplo (2px --bg-elevated + 4px hex).
              boxShadow: isSelected
                ? `inset 0 1px 0 rgba(255,255,255,.25), 0 2px 6px color-mix(in srgb, ${hex} 30%, transparent), 0 0 0 2px var(--bg-elevated), 0 0 0 4px ${hex}`
                : `inset 0 1px 0 rgba(255,255,255,.25), 0 2px 6px color-mix(in srgb, ${hex} 30%, transparent)`,
            }}
          >
            {isSelected && (
              <Check size={largeCheck ? 16 : 14} className="text-white" strokeWidth={3} />
            )}
          </button>
        );
      })}
    </div>
  );
}

interface ColumnColorPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cor atual da coluna. */
  value: string;
  /** Chamado ao escolher uma cor — a UI faz `PATCH {color}` otimista e fecha. */
  onSelect: (hex: string) => void;
  /** Âncora do popover (o item "Cor" do menu). */
  children: React.ReactNode;
}

/**
 * Popover de escolha de cor da coluna. Grid 5-col de swatches (28px). Clique →
 * `onSelect(hex)` (PATCH otimista) e fecha. Ancorado ao item "Cor" do menu ⋯.
 */
export function ColumnColorPicker({
  open,
  onOpenChange,
  value,
  onSelect,
  children,
}: ColumnColorPickerProps) {
  const reduce = useReducedMotion();

  const container: Variants = reduce
    ? { closed: { opacity: 0 }, open: { opacity: 1 } }
    : {
        closed: { opacity: 0, scale: 0.92, y: -8 },
        open: {
          opacity: 1,
          scale: 1,
          y: 0,
          transition: { type: 'spring', stiffness: 420, damping: 30, mass: 0.7 },
        },
      };

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <AnimatePresence>
        {open && (
          <Popover.Portal forceMount>
            <Popover.Content
              asChild
              forceMount
              side="bottom"
              align="end"
              sideOffset={6}
              onOpenAutoFocus={(e) => e.preventDefault()}
              className="glass-popup z-[var(--z-dropdown)] overflow-hidden max-w-[calc(100vw-24px)]"
            >
              <motion.div
                variants={container}
                initial="closed"
                animate="open"
                exit="closed"
                style={{
                  transformOrigin: 'var(--radix-popover-content-transform-origin)',
                  borderRadius: 16,
                }}
                className="p-3"
              >
                {/* Swatch 32px mobile → 28px desktop (default). */}
                <SwatchGrid value={value} onSelect={onSelect} autoFocusSelected />
              </motion.div>
            </Popover.Content>
          </Popover.Portal>
        )}
      </AnimatePresence>
    </Popover.Root>
  );
}
