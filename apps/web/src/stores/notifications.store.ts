import { create } from 'zustand';

export type NotificationKind = 'error' | 'success' | 'info';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  message: string;
  /** ISO timestamp — formatted with timeAgo() in the bell. */
  at: string;
  read: boolean;
}

/** Keep only the most recent N entries so the bell never grows unbounded. */
const MAX = 30;

interface NotificationsState {
  items: AppNotification[];
  push: (kind: NotificationKind, message: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clear: () => void;
}

export const useNotificationsStore = create<NotificationsState>((set) => ({
  items: [],
  push: (kind, message) =>
    set((s) => ({
      items: [
        {
          id:
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random()}`,
          kind,
          message,
          at: new Date().toISOString(),
          read: false,
        },
        ...s.items,
      ].slice(0, MAX),
    })),
  markAllRead: () => set((s) => ({ items: s.items.map((i) => ({ ...i, read: true })) })),
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  clear: () => set({ items: [] }),
}));

/** Unread count, for the top-bar bell badge. */
export const selectUnreadCount = (s: NotificationsState) =>
  s.items.reduce((n, i) => n + (i.read ? 0 : 1), 0);
