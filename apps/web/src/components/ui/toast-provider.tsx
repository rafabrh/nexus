'use client';

import { Toaster } from 'sonner';

export function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: '#1A2029',
          border: '1px solid #1E2530',
          color: '#E8ECF1',
          fontSize: '13px',
        },
        className: 'nexus-toast',
      }}
      closeButton
    />
  );
}
