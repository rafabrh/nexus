import { describe, it, expect } from 'vitest';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

// Public (pre-auth) controllers — must opt out of the global JwtAuthGuard.
import { AuthController } from '../auth.controller';
import { WebhookController } from '../../webhook/webhook.controller';
import { HealthController } from '../../core/health/health.controller';
import { MetricsController } from '../../core/metrics/metrics.controller';

// Protected controllers — must NOT carry @Public anywhere (auth leak = critical).
import { ConversationController } from '../../conversation/conversation.controller';
import { DashboardController } from '../../dashboard/dashboard.controller';
import { LeadController } from '../../lead/lead.controller';
import { AiControlController } from '../../ai-control/ai-control.controller';
import { OnboardingController } from '../../onboarding/onboarding.controller';
import { QuickRepliesController } from '../../quick-replies/quick-replies.controller';
import { RemindersController } from '../../reminders/reminders.controller';
import { WhatsAppController } from '../../whatsapp/whatsapp.controller';
import { AdminController } from '../../admin/admin.controller';

const reflector = new Reflector();

/**
 * Replicates how the global JwtAuthGuard resolves @Public: method metadata
 * overrides class metadata (getAllAndOverride([handler, class])).
 */
function isHandlerPublic(controller: new (...args: any[]) => object, method: string): boolean {
  const handler = (controller.prototype as Record<string, unknown>)[method];
  return (
    reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      handler as (...args: unknown[]) => unknown,
      controller,
    ]) === true
  );
}

/** Every public instance method declared on the controller prototype. */
function handlerNames(controller: new (...args: any[]) => object): string[] {
  return Object.getOwnPropertyNames(controller.prototype).filter(
    (n) => n !== 'constructor' && typeof (controller.prototype as any)[n] === 'function',
  );
}

describe('@Public coverage — pre-auth routes are reachable', () => {
  // auth: magic-link, callback, refresh are public; logout is NOT.
  it('auth magic-link / callback / refresh are @Public', () => {
    expect(isHandlerPublic(AuthController, 'sendMagicLink')).toBe(true);
    expect(isHandlerPublic(AuthController, 'callback')).toBe(true);
    expect(isHandlerPublic(AuthController, 'refresh')).toBe(true);
  });

  it('auth logout is NOT @Public (requires a valid token to blacklist it)', () => {
    expect(isHandlerPublic(AuthController, 'logout')).toBe(false);
  });

  it('webhook controller is @Public (signed by Evolution apikey, no JWT)', () => {
    for (const m of handlerNames(WebhookController)) {
      expect(isHandlerPublic(WebhookController, m), `webhook.${m}`).toBe(true);
    }
  });

  it('health endpoints (check/liveness/readiness) are @Public', () => {
    for (const m of handlerNames(HealthController)) {
      expect(isHandlerPublic(HealthController, m), `health.${m}`).toBe(true);
    }
  });

  it('metrics is @Public for the JWT guard (still gated by MetricsAuthGuard)', () => {
    for (const m of handlerNames(MetricsController)) {
      expect(isHandlerPublic(MetricsController, m), `metrics.${m}`).toBe(true);
    }
  });
});

describe('@Public coverage — protected routes never leak auth', () => {
  const protectedControllers: Array<[string, new (...args: any[]) => object]> = [
    ['conversation', ConversationController],
    ['dashboard', DashboardController],
    ['lead', LeadController],
    ['ai-control', AiControlController],
    ['onboarding', OnboardingController],
    ['quick-replies', QuickRepliesController],
    ['reminders', RemindersController],
    ['whatsapp', WhatsAppController],
    ['admin', AdminController],
  ];

  for (const [name, controller] of protectedControllers) {
    it(`${name} controller exposes no @Public route`, () => {
      for (const m of handlerNames(controller)) {
        expect(isHandlerPublic(controller, m), `${name}.${m} must require auth`).toBe(false);
      }
    });
  }
});
