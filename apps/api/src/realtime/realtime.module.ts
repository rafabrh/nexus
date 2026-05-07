import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventsGateway } from './events.gateway';
import { KeyspaceListener } from './keyspace.listener';
import { EventTranslator } from './event.translator';
import { EventPublisher } from './event.publisher';
import { StreamReplayService } from './stream-replay.service';

@Module({
  imports: [AuthModule],
  providers: [
    EventsGateway,
    KeyspaceListener,
    EventTranslator,
    EventPublisher,
    StreamReplayService,
  ],
  exports: [EventPublisher],
})
export class RealtimeModule {}
