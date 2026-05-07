import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { TenantService } from './tenant.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [TenantService],
  exports: [TenantService],
})
export class AdminModule {}
