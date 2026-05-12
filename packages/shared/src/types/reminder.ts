export type ReminderStatus = 'pending' | 'triggered' | 'dismissed';

export interface Reminder {
  id: string;
  instancia: string;
  jid: string;
  text: string;
  triggerAt: number; // Unix timestamp ms
  createdBy: string; // user email
  status: ReminderStatus;
}
