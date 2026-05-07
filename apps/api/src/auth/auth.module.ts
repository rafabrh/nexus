import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { NexusJwtService } from './jwt.service';
import { MagicLinkService } from './magic-link.service';
import { ResendClient } from './resend.client';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    NexusJwtService,
    MagicLinkService,
    ResendClient,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [NexusJwtService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
