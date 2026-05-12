import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { RemindersService } from './reminders.service';

@Injectable()
export class RemindersScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RemindersScheduler.name);
  private intervalRef: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly remindersService: RemindersService) {}

  onModuleInit() {
    // Check for due reminders every 60 seconds
    this.intervalRef = setInterval(async () => {
      try {
        await this.remindersService.processDueReminders();
      } catch (err: any) {
        this.logger.error(`Reminder scheduler error: ${err.message}`);
      }
    }, 60_000);

    this.logger.log('Reminder scheduler started (60s interval)');
  }

  onModuleDestroy() {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = null;
    }
    this.logger.log('Reminder scheduler stopped');
  }
}
