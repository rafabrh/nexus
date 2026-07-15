'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SwatchGrid, STAGE_PALETTE } from './column-color-picker';

interface AddColumnProps {
  /** Cria a coluna (POST /funnel/stages). */
  onCreate: (label: string, color: string) => void;
  /** true enquanto o POST está em voo (desabilita o Check). */
  isPending?: boolean;
}

/**
 * Coluna-fantasma FIXA ao fim do board (fora do Reorder.Group). Estado de repouso:
 * borda tracejada + ícone Plus em círculo + "Nova coluna". Clique → form inline no
 * mesmo slot: bolinha (cor default = 1º swatch) + Input + Check + faixa de swatches.
 * A entrada da coluna criada (spring) acontece no board, ao aparecer no cache.
 */
export function AddColumn({ onCreate, isPending }: AddColumnProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(STAGE_PALETTE[0]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [adding]);

  const reset = () => {
    setAdding(false);
    setName('');
    setColor(STAGE_PALETTE[0]);
  };

  const commit = () => {
    const label = name.trim();
    if (!label) {
      reset();
      return;
    }
    onCreate(label, color);
    reset();
  };

  return (
    <div
      className="w-[260px] flex-shrink-0 rounded-xl"
      style={{ height: '100%', scrollSnapAlign: 'start' }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {adding ? (
          <motion.div
            key="form"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col gap-3 p-3 rounded-xl"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              boxShadow: 'var(--shadow-control)',
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="rounded-full flex-shrink-0"
                style={{
                  width: 8,
                  height: 8,
                  backgroundColor: color,
                  boxShadow: `0 0 0 2px color-mix(in srgb, ${color} 25%, transparent)`,
                }}
              />
              <Input
                ref={inputRef}
                value={name}
                maxLength={60}
                placeholder="Nome da etapa"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit();
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    reset();
                  }
                }}
                className="h-7 text-xs"
                aria-label="Nome da nova coluna"
              />
              <motion.div whileTap={{ scale: 0.95 }}>
                <Button
                  size="xs"
                  onClick={commit}
                  onMouseDown={(e) => e.preventDefault()}
                  disabled={isPending || !name.trim()}
                  aria-label="Criar coluna"
                >
                  <Check size={14} />
                </Button>
              </motion.div>
            </div>

            {/* Faixa de swatches para escolher a cor antes de criar. */}
            <SwatchGrid value={color} onSelect={setColor} />
          </motion.div>
        ) : (
          <motion.button
            key="ghost"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setAdding(true)}
            className="add-column-ghost group w-full h-full flex flex-col items-center justify-center gap-2 rounded-xl transition-colors duration-150"
            style={{
              border: '1.5px dashed var(--border-default)',
              background: 'transparent',
            }}
          >
            <span
              className="flex items-center justify-center rounded-full transition-colors duration-150"
              style={{
                width: 36,
                height: 36,
                border: '1.5px dashed var(--border-default)',
                color: 'var(--text-muted)',
              }}
            >
              <Plus size={18} />
            </span>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              Nova coluna
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
