'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, type DragControls } from 'framer-motion';
import { Check, GripVertical } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ColumnActionsMenu } from './column-actions-menu';

interface ColumnHeaderProps {
  label: string;
  /** Cor resolvida da coluna (stage.color || fallback token). */
  color: string;
  /** Contagem de cards na coluna. */
  count: number;
  /** Controle de arraste da coluna (Reorder.Item). A pega é o próprio header. */
  dragControls: DragControls;
  /** Renomear (PATCH {label} otimista). Vazio/igual → cancela sem request. */
  onRename: (label: string) => void;
  /** Trocar cor (PATCH {color} otimista). */
  onColorSelect: (hex: string) => void;
  /** Excluir (fluxo pessimista, 409 mantém a coluna). */
  onDelete: () => void;
  /** Mover uma posição (mobile — reorder por troca). */
  onMoveLeft: () => void;
  onMoveRight: () => void;
  canMoveLeft: boolean;
  canMoveRight: boolean;
}

/**
 * Cabeçalho da coluna do Kanban (estilo seção macOS).
 *
 * - Leitura: bolinha (cor) + label uppercase + pill de contagem + botão ⋯.
 * - Renomear inline: substitui bolinha+label por bolinha + Input + Check. Enter/blur
 *   confirma; Esc cancela; vazio/igual cancela sem request. Também abre por clique
 *   no label (atalho).
 * - Reordenar: o header é a pega de arraste (onPointerDown → dragControls.start).
 *   No desktop, `touchAction:none` captura o gesto; no mobile o arraste fica
 *   desabilitado (scroll-snap manda) — a reordenação vem do menu ⋯.
 */
export function ColumnHeader({
  label,
  color,
  count,
  dragControls,
  onRename,
  onColorSelect,
  onDelete,
  onMoveLeft,
  onMoveRight,
  canMoveLeft,
  canMoveRight,
}: ColumnHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ao entrar em edição: preenche com o label atual, foca e seleciona o texto.
  useEffect(() => {
    if (editing) {
      setDraft(label);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing, label]);

  const commit = () => {
    const next = draft.trim();
    // Vazio ou igual ao atual → cancela sem request.
    if (!next || next === label) {
      setEditing(false);
      return;
    }
    onRename(next);
    setEditing(false);
  };

  const cancel = () => setEditing(false);

  const dot = (
    <span
      className="rounded-full flex-shrink-0"
      style={{
        width: 8,
        height: 8,
        backgroundColor: color,
        boxShadow: `0 0 0 2px color-mix(in srgb, ${color} 25%, transparent)`,
      }}
    />
  );

  return (
    <div className="px-3 pt-3 pb-2 flex-shrink-0">
      <div className="flex items-center justify-between mb-2 gap-1">
        {/* Pega de arraste — espaço reservado (sem pulo de layout). Só desktop:
            no toque o gesto não deve virar drag (scroll-snap manda). */}
        <button
          type="button"
          aria-label="Arrastar coluna"
          tabIndex={-1}
          onPointerDown={(e) => {
            // Só inicia o arraste no desktop (ponteiro fino/mouse). No toque, deixa
            // o navegador rolar (o Reorder da coluna está desabilitado no mobile).
            if (e.pointerType === 'touch') return;
            dragControls.start(e);
          }}
          className="hidden md:flex flex-shrink-0 cursor-grab active:cursor-grabbing text-text-muted"
          style={{ touchAction: 'none' }}
        >
          <GripVertical
            size={14}
            className="opacity-40 group-hover:opacity-90 transition-opacity"
            aria-hidden
          />
        </button>

        {/* Bloco central: leitura (bolinha + label) OU edição inline. */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <AnimatePresence mode="wait" initial={false}>
            {editing ? (
              <motion.div
                key="edit"
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center gap-1.5 flex-1 min-w-0"
              >
                {dot}
                <Input
                  ref={inputRef}
                  value={draft}
                  maxLength={60}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commit();
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      cancel();
                    }
                  }}
                  onBlur={commit}
                  className="h-7 text-xs"
                  aria-label="Nome da coluna"
                />
                <motion.div whileTap={{ scale: 0.95 }}>
                  <Button
                    size="xs"
                    onClick={commit}
                    // onMouseDown preventDefault: clicar no Check não deve tirar o
                    // foco do input antes do onClick (blur também confirma, mas
                    // evita corrida).
                    onMouseDown={(e) => e.preventDefault()}
                    aria-label="Confirmar nome"
                  >
                    <Check size={14} />
                  </Button>
                </motion.div>
              </motion.div>
            ) : (
              <motion.button
                key="read"
                type="button"
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => setEditing(true)}
                title="Renomear coluna"
                className="flex items-center gap-2 flex-1 min-w-0 text-left"
              >
                {dot}
                <span
                  className="font-semibold text-text-secondary truncate"
                  style={{ fontSize: 11, letterSpacing: '0.02em', textTransform: 'uppercase' }}
                >
                  {label}
                </span>
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Contagem + menu ⋯ (ocultos durante a edição para dar espaço ao input). */}
        {!editing && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <span
              className="text-xs font-medium text-text-muted rounded-full px-2 py-0.5 tabular-nums"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
              }}
            >
              {count}
            </span>
            <ColumnActionsMenu
              color={color}
              onRename={() => setEditing(true)}
              onColorSelect={onColorSelect}
              onDelete={onDelete}
              onMoveLeft={onMoveLeft}
              onMoveRight={onMoveRight}
              canMoveLeft={canMoveLeft}
              canMoveRight={canMoveRight}
            />
          </div>
        )}
      </div>

      {/* Linha de destaque da coluna. */}
      <div
        className="w-full rounded-full"
        style={{ height: 2, background: color, opacity: 0.4 }}
      />
    </div>
  );
}
