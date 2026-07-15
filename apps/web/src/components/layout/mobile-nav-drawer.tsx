'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bot,
  X,
  MessagesSquare,
  KanbanSquare,
  LayoutDashboard,
  Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface MobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
}

// As mesmas 4 abas da TopBar, aqui com ícone para dar corpo ao alvo de toque
// (≥ 44px) e leitura rápida no mobile. Mantém a paridade de rotas com o desktop.
const NAV_ITEMS = [
  { label: 'Conversas', href: '/conversations', Icon: MessagesSquare },
  { label: 'Kanban', href: '/kanban', Icon: KanbanSquare },
  { label: 'Dashboard', href: '/dashboard', Icon: LayoutDashboard },
  { label: 'Feed IA', href: '/feed', Icon: Sparkles },
];

/**
 * Gaveta de navegação mobile (< md). As abas centrais da TopBar não cabem em
 * telas estreitas, então migram para cá atrás de um hambúrguer. Entra da
 * ESQUERDA com backdrop escurecido e fecha ao: clicar no backdrop, Esc, ou tocar
 * numa aba. `md:hidden` garante que ela sequer existe no desktop.
 *
 * A11y: role="dialog" + aria-modal, foco inicial no painel e trava de scroll do
 * body enquanto aberta. Sob "reduzir movimento" o framer descarta o transform de
 * slide (via MotionConfig reducedMotion="user" no layout) e resta só o fade —
 * suave, nunca abrupto.
 */
export function MobileNavDrawer({ open, onClose }: MobileNavDrawerProps) {
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);

  // Esc fecha; enquanto a gaveta está aberta travamos o scroll do body para o
  // conteúdo por baixo não "vazar" o rolar do toque.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Foco inicial no painel para leitores de tela / navegação por teclado.
    panelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        // md:hidden — a gaveta só existe no mobile; no desktop as abas ficam na barra.
        <div className="md:hidden">
          {/* Backdrop escurecido — clique fecha */}
          <motion.div
            className="fixed inset-0 z-[60]"
            style={{
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Painel — entra da esquerda */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navegação"
            tabIndex={-1}
            className="glass-heavy fixed top-0 left-0 bottom-0 z-[61] w-[82vw] max-w-[320px] flex flex-col outline-none"
            style={{
              borderRight: '1px solid var(--separator)',
              borderTopRightRadius: 'var(--radius-panel)',
              borderBottomRightRadius: 'var(--radius-panel)',
            }}
            initial={{ x: '-100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '-100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
          >
            {/* Cabeçalho — marca + fechar. h-12 espelha a TopBar. */}
            <div
              className="h-12 flex-shrink-0 flex items-center justify-between px-4"
              style={{ borderBottom: '1px solid var(--separator)' }}
            >
              <div className="flex items-center gap-2">
                <Bot size={20} className="text-primary-400" />
                <span className="text-md font-semibold text-text-primary tracking-tight">
                  NEXUS
                </span>
                <span className="text-xs text-text-muted font-normal">Panel</span>
              </div>
              <button
                onClick={onClose}
                aria-label="Fechar menu"
                className="w-8 h-8 rounded-input flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors duration-150 focus-ring"
              >
                <X size={16} />
              </button>
            </div>

            {/* Abas de navegação. Cada item ≥ 44px de altura (alvo de toque). */}
            <nav className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
              {NAV_ITEMS.map(({ label, href, Icon }) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onClose}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative flex items-center gap-3 min-h-[44px] px-3 rounded-input text-sm font-medium transition-colors duration-150 focus-ring',
                      active
                        ? 'text-primary-400'
                        : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover',
                    )}
                    style={
                      active
                        ? {
                            background:
                              'color-mix(in srgb, var(--accent-500) 14%, transparent)',
                            boxShadow: 'inset 0 1px 0 var(--mirror-edge)',
                          }
                        : undefined
                    }
                  >
                    <Icon size={18} className="flex-shrink-0" />
                    {label}
                  </Link>
                );
              })}
            </nav>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
