import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { TenantSeedService } from './tenant-seed.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [TenantSeedService],
})
export class AdminModule {}
