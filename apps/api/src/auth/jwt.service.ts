import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { randomUUID } from 'crypto';

export interface NexusJwtPayload extends JWTPayload {
  sub: string;
  instancia: string;
  role: 'admin' | 'operator';
  jti: string;
}

@Injectable()
export class NexusJwtService {
  private readonly secret: Uint8Array;
  private readonly accessTtlSec: number;
  private readonly refreshTtlSec: number;

  constructor(private readonly config: ConfigService) {
    this.secret = new TextEncoder().encode(
      config.getOrThrow<string>('JWT_SECRET'),
    );
    this.accessTtlSec = Math.floor(
      parseInt(config.get<string>('JWT_EXPIRATION_MS', '900000'), 10) / 1000,
    );
    this.refreshTtlSec = Math.floor(
      parseInt(config.get<string>('JWT_REFRESH_EXPIRATION_MS', '2592000000'), 10) / 1000,
    );
  }

  async signAccess(
    payload: Omit<NexusJwtPayload, 'jti' | 'iat' | 'exp'>,
  ): Promise<string> {
    return new SignJWT({ ...payload })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${this.accessTtlSec}s`)
      .setJti(randomUUID())
      .sign(this.secret);
  }

  async signRefresh(
    payload: Omit<NexusJwtPayload, 'jti' | 'iat' | 'exp'>,
  ): Promise<string> {
    return new SignJWT({ ...payload })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${this.refreshTtlSec}s`)
      .setJti(randomUUID())
      .sign(this.secret);
  }

  async verify(token: string): Promise<NexusJwtPayload> {
    const { payload } = await jwtVerify(token, this.secret);
    return payload as NexusJwtPayload;
  }
}
