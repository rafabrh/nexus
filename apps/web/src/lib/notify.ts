import { toast } from 'sonner';
import { useNotificationsStore } from '@/stores/notifications.store';

/**
 * App-level notifications. Instead of popping a lateral toast for everything,
 * these are collected in the top-bar bell ("central de notificações"):
 *
 * - `error`   — recorded in the bell AND shown immediately as a toast, since a
 *               failure must be noticed right away.
 * - `success` / `info` — recorded silently in the bell (the badge pulses); no
 *               lateral toast, keeping routine confirmations out of the way.
 *
 * Replaces direct `toast.*` calls across the app.
 */
export const notify = {
  error: (message: string) => {
    useNotificationsStore.getState().push('error', message);
    toast.error(message);
  },
  success: (message: string) => {
    useNotificationsStore.getState().push('success', message);
  },
  info: (message: string) => {
    useNotificationsStore.getState().push('info', message);
  },
};
