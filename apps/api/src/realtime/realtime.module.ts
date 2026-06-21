import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { EventsGateway } from './events.gateway';
import { KeyspaceListener } from './keyspace.listener';
import { EventTranslator } from './event.translator';
import { EventPublisher } from './event.publisher';
import { StreamReplayService } from './stream-replay.service';
import { KeyspaceConfigService } from './keyspace-config.service';
import { ConnectionReconcilerService } from './connection-reconciler.service';

@Module({
  imports: [AuthModule, WhatsAppModule],
  providers: [
    EventsGateway,
    KeyspaceListener,
    EventTranslator,
    EventPublisher,
    StreamReplayService,
    KeyspaceConfigService,
    ConnectionReconcilerService,
  ],
  exports: [EventPublisher, KeyspaceConfigService, ConnectionReconcilerService],
})
export class RealtimeModule {}
