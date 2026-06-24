'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { modalOverlay, modalContent } from '@/lib/motion-variants';

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ open, onOpenChange, title, children, className }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal forceMount>
        <AnimatePresence>
          {open && (
            <>
              <Dialog.Overlay asChild>
                <motion.div
                  className="fixed inset-0 z-50"
                  style={{
                    background: 'rgba(0,0,0,0.55)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                  }}
                  variants={modalOverlay}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                />
              </Dialog.Overlay>

              <Dialog.Content asChild>
                <motion.div
                  className={cn(
                    'fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
                    'w-full max-w-md p-6',
                    'focus:outline-none',
                    className,
                  )}
                  style={{
                    background: 'var(--bg-surface)',
                    backdropFilter: 'blur(24px) saturate(1.3)',
                    WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: 'var(--radius-panel)',
                    boxShadow: 'var(--shadow-panel)',
                  }}
                  variants={modalContent}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  <div className="flex items-center justify-between mb-4">
                    <Dialog.Title className="text-lg font-semibold text-text-primary">
                      {title}
                    </Dialog.Title>
                    <Dialog.Close className="text-text-muted hover:text-text-secondary transition-colors duration-150">
                      <X size={16} />
                    </Dialog.Close>
                  </div>
                  {children}
                </motion.div>
              </Dialog.Content>
            </>
          )}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
