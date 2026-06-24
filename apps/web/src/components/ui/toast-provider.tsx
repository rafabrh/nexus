'use client';

import { Toaster } from 'sonner';

export function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: 'var(--bg-surface)',
          border: '1px solid var(--separator)',
          color: 'var(--text-primary)',
          fontSize: '13px',
          boxShadow: 'var(--shadow-panel)',
        },
        className: 'nexus-toast',
      }}
      closeButton
    />
  );
}
