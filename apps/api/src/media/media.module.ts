import { Global, Module } from '@nestjs/common';
import { DiskMediaStorage } from './disk-media.storage';
import { MEDIA_STORAGE } from './media-storage.interface';

@Global()
@Module({
  providers: [{ provide: MEDIA_STORAGE, useClass: DiskMediaStorage }],
  exports: [MEDIA_STORAGE],
})
export class MediaModule {}
