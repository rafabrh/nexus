'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import { Bot, Mail, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { gsap } from 'gsap';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';

const LoginParticles = dynamic(
  () => import('@/components/three/login-particles').then((m) => ({ default: m.LoginParticles })),
  { ssr: false },
);

type LoginState = 'idle' | 'loading' | 'success' | 'error';

// ─── Animated background radials ─────────────────────────────────────────────
function MeshBackground() {
  const r1 = useRef<HTMLDivElement>(null);
  const r2 = useRef<HTMLDivElement>(null);
  const r3 = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tl = gsap.timeline({ repeat: -1, yoyo: true, defaults: { ease: 'sine.inOut' } });

    tl.to(r1.current, { x: 60, y: -40, duration: 20 }, 0)
      .to(r2.current, { x: -80, y: 50, duration: 20 }, 0)
      .to(r3.current, { x: 40, y: 70, duration: 18 }, 0);

    return () => { tl.kill(); };
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {/* Radial 1 — teal top-left */}
      <div
        ref={r1}
        style={{
          position: 'absolute',
          top: '-10%',
          left: '-5%',
          width: '55vw',
          height: '55vw',
          maxWidth: 700,
          maxHeight: 700,
          borderRadius: '50%',
          background:
            'radial-gradient(ellipse at center, rgba(45,212,191,0.10) 0%, transparent 65%)',
          filter: 'blur(1px)',
        }}
      />
      {/* Radial 2 — emerald bottom-right */}
      <div
        ref={r2}
        style={{
          position: 'absolute',
          bottom: '-15%',
          right: '-10%',
          width: '50vw',
          height: '50vw',
          maxWidth: 640,
          maxHeight: 640,
          borderRadius: '50%',
          background:
            'radial-gradient(ellipse at center, rgba(16,185,129,0.08) 0%, transparent 65%)',
          filter: 'blur(1px)',
        }}
      />
      {/* Radial 3 — subtle center warmth */}
      <div
        ref={r3}
        style={{
          position: 'absolute',
          top: '35%',
          left: '30%',
          width: '40vw',
          height: '40vw',
          maxWidth: 500,
          maxHeight: 500,
          borderRadius: '50%',
          background:
            'radial-gradient(ellipse at center, rgba(45,212,191,0.04) 0%, transparent 70%)',
        }}
      />
    </div>
  );
}

// ─── Logo with GSAP glow pulse on mount ──────────────────────────────────────
function Logo() {
  const iconRef = useRef<SVGSVGElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!iconRef.current || !glowRef.current) return;

    // Icon entrance scale
    gsap.fromTo(
      iconRef.current,
      { scale: 0.6, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.6, ease: 'back.out(1.7)', delay: 0.3 },
    );

    // Glow pulse — continuous
    gsap.to(glowRef.current, {
      opacity: 0.8,
      duration: 2,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
      delay: 0.9,
    });
  }, []);

  return (
    <div className="flex flex-col items-center gap-1 mb-8 select-none">
      <div className="relative flex items-center gap-2.5">
        {/* Glow halo behind icon */}
        <div
          ref={glowRef}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(45,212,191,0.35) 0%, transparent 70%)',
            opacity: 0.3,
            pointerEvents: 'none',
          }}
        />
        <Bot
          ref={iconRef as unknown as React.RefObject<SVGSVGElement>}
          size={32}
          style={{ color: '#2DD4BF', opacity: 0, position: 'relative', zIndex: 1 }}
        />
        <span
          style={{
            fontFamily: 'Inter, system-ui, sans-serif',
            fontWeight: 700,
            fontSize: 28,
            letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
            lineHeight: 1,
          }}
        >
          NEXUS
        </span>
      </div>
      <span
        style={{
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--text-muted)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        Panel
      </span>
    </div>
  );
}

// ─── Success view ─────────────────────────────────────────────────────────────
function SuccessView({ email, onReset }: { email: string; onReset: () => void }) {
  const iconRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!iconRef.current) return;
    gsap.fromTo(
      iconRef.current,
      { scale: 0.4, opacity: 0 },
      {
        scale: 1,
        opacity: 1,
        duration: 0.55,
        ease: 'back.out(1.8)',
        onComplete: () => {
          gsap.to(iconRef.current, {
            filter: 'drop-shadow(0 0 12px rgba(34,197,94,0.6))',
            duration: 0.4,
            ease: 'power2.out',
          });
        },
      },
    );
  }, []);

  return (
    <motion.div
      key="success"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="text-center py-2"
    >
      <CheckCircle
        ref={iconRef as unknown as React.RefObject<SVGSVGElement>}
        size={44}
        style={{
          color: 'var(--success)',
          margin: '0 auto 16px',
          opacity: 0,
          display: 'block',
        }}
      />
      <h2
        style={{
          fontFamily: 'Inter, system-ui, sans-serif',
          fontWeight: 600,
          fontSize: 18,
          color: 'var(--text-primary)',
          marginBottom: 8,
        }}
      >
        Link enviado!
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        Verifique seu email{' '}
        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{email}</span> e clique no
        link de acesso.
      </p>
      <button
        onClick={onReset}
        style={{
          marginTop: 20,
          fontSize: 12,
          color: 'var(--text-secondary)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textDecoration: 'underline',
          textDecorationColor: 'rgba(139,149,165,0.4)',
          textUnderlineOffset: 3,
          transition: 'color 150ms ease',
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.color = 'var(--text-primary)')
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.color = 'var(--text-secondary)')
        }
      >
        Usar outro email
      </button>
    </motion.div>
  );
}

// ─── Login form view ──────────────────────────────────────────────────────────
function LoginForm({
  email,
  setEmail,
  state,
  errorMsg,
  onSubmit,
}: {
  email: string;
  setEmail: (v: string) => void;
  state: LoginState;
  errorMsg: string;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const isLoading = state === 'loading';

  return (
    <motion.div
      key="form"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <h2
        style={{
          fontFamily: 'Inter, system-ui, sans-serif',
          fontWeight: 600,
          fontSize: 18,
          color: 'var(--text-primary)',
          textAlign: 'center',
          marginBottom: 6,
        }}
      >
        Entrar no painel
      </h2>
      <p
        style={{
          fontSize: 13,
          color: 'var(--text-secondary)',
          textAlign: 'center',
          marginBottom: 28,
          lineHeight: 1.5,
        }}
      >
        Insira seu email para receber o link de acesso
      </p>

      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Email field */}
        <div>
          <label
            htmlFor="email"
            style={{
              display: 'block',
              fontSize: 12,
              color: 'var(--text-secondary)',
              marginBottom: 6,
              fontWeight: 500,
            }}
          >
            Email
          </label>
          <div style={{ position: 'relative' }}>
            <Mail
              size={14}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                pointerEvents: 'none',
                zIndex: 1,
              }}
            />
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              required
              autoComplete="email"
              style={{
                height: 44,
                paddingLeft: 38,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-input)',
                color: 'var(--text-primary)',
                fontSize: 13,
                width: '100%',
                transition: 'border-color 150ms ease, box-shadow 150ms ease',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--primary-600)';
                e.currentTarget.style.boxShadow =
                  '0 0 0 3px rgba(13,148,136,0.15)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-default)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>
        </div>

        {/* Error message */}
        <AnimatePresence>
          {state === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                borderRadius: 'var(--radius-input)',
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.15)',
              }}
            >
              <AlertCircle
                size={14}
                style={{ color: 'var(--error)', flexShrink: 0 }}
              />
              <span style={{ fontSize: 12, color: 'var(--error)' }}>{errorMsg}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Submit button */}
        <button
          type="submit"
          disabled={isLoading || !email.trim()}
          className="btn-gradient-primary"
          style={{
            width: '100%',
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            borderRadius: 'var(--radius-input)',
            background: 'var(--gradient-primary)',
            border: 'none',
            color: '#0C0F12',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontWeight: 600,
            fontSize: 13,
            cursor: isLoading || !email.trim() ? 'not-allowed' : 'pointer',
            opacity: isLoading || !email.trim() ? 0.55 : 1,
            transition: 'transform 150ms ease, box-shadow 150ms ease, opacity 150ms ease',
            letterSpacing: '0.01em',
          }}
          onMouseEnter={(e) => {
            if (isLoading || !email.trim()) return;
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow =
              '0 0 20px rgba(45,212,191,0.35), 0 4px 12px rgba(0,0,0,0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
          onMouseDown={(e) => {
            if (isLoading || !email.trim()) return;
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          {isLoading ? (
            <>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              Enviando...
            </>
          ) : (
            'Enviar link de acesso'
          )}
        </button>
      </form>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<LoginState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setState('loading');
    setErrorMsg('');

    try {
      await api('/api/v1/auth/magic-link', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      setState('success');
    } catch {
      setState('error');
      setErrorMsg('Erro ao enviar link. Tente novamente.');
    }
  };

  const handleReset = () => {
    setState('idle');
    setEmail('');
    setErrorMsg('');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-base)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        padding: '16px',
      }}
    >
      {/* Animated mesh background */}
      <MeshBackground />

      {/* R3F particles (lazy, ssr: false) */}
      <LoginParticles />

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'relative',
          zIndex: 10,
          width: '100%',
          maxWidth: 420,
          background: 'rgba(20,24,32,0.72)',
          backdropFilter: 'blur(16px) saturate(1.2)',
          WebkitBackdropFilter: 'blur(16px) saturate(1.2)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-elevated)',
          // Responsive padding handled via inline + clamp
          padding: 'clamp(24px, 5vw, 40px)',
        }}
      >
        {/* Logo */}
        <Logo />

        {/* Form / Success (crossfade) */}
        <AnimatePresence mode="wait">
          {state === 'success' ? (
            <SuccessView key="success" email={email} onReset={handleReset} />
          ) : (
            <LoginForm
              key="form"
              email={email}
              setEmail={setEmail}
              state={state}
              errorMsg={errorMsg}
              onSubmit={handleSubmit}
            />
          )}
        </AnimatePresence>

        {/* Footer */}
        <div
          style={{
            marginTop: 32,
            textAlign: 'center',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--text-muted)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            opacity: 0.6,
            userSelect: 'none',
          }}
        >
          SHK GROUP.IA
        </div>
      </motion.div>

      {/* Keyframe for spinner (not covered by Tailwind since we use inline styles) */}
      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
