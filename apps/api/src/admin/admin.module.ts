import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { TenantService } from './tenant.service';
import { TenantSeedService } from './tenant-seed.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [TenantService, TenantSeedService],
  exports: [TenantService],
})
export class AdminModule {}
