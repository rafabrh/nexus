import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { QuickRepliesController } from './quick-replies.controller';
import { PublicQuickReplyMediaController } from './public-quick-reply-media.controller';
import { QuickRepliesService } from './quick-replies.service';
import { QuickReplyMediaSweeper } from './quick-reply-media.sweeper';

@Module({
  imports: [AuthModule],
  controllers: [QuickRepliesController, PublicQuickReplyMediaController],
  providers: [QuickRepliesService, QuickReplyMediaSweeper],
  exports: [QuickRepliesService, QuickReplyMediaSweeper],
})
export class QuickRepliesModule {}
