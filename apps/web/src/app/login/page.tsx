'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Mail, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { gsap } from 'gsap';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FilmGrain } from '@/components/cinematic/film-grain';
import { api } from '@/lib/api';

type LoginState = 'idle' | 'loading' | 'success' | 'error';

// ─── Logo with GSAP entrance ─────────────────────────────────────────────────
function Logo() {
  const iconRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!iconRef.current) return;
    gsap.fromTo(
      iconRef.current,
      { scale: 0.6, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.6, ease: 'back.out(1.7)', delay: 0.3 },
    );
  }, []);

  return (
    <div className="flex flex-col items-center gap-1 mb-8 select-none">
      <div className="flex items-center gap-2.5">
        <Bot
          ref={iconRef as unknown as React.RefObject<SVGSVGElement>}
          size={30}
          style={{
            color: 'var(--accent-500)',
            opacity: 0,
            position: 'relative',
            zIndex: 1,
          }}
        />
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 700,
            fontSize: 26,
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
          fontFamily: 'var(--font-sans)',
          fontSize: 11,
          fontWeight: 500,
          color: 'var(--text-muted)',
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
        }}
      >
        SHK Group.IA
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
      { scale: 1, opacity: 1, duration: 0.55, ease: 'back.out(1.8)' },
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
          fontFamily: 'var(--font-sans)',
          fontWeight: 600,
          fontSize: 17,
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
          textDecorationColor: 'var(--border-default)',
          textUnderlineOffset: 3,
          transition: 'color 150ms ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
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
          fontFamily: 'var(--font-sans)',
          fontWeight: 600,
          fontSize: 17,
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
                e.currentTarget.style.borderColor = 'var(--border-active)';
                e.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--accent-500) 15%, transparent)';
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
                background: 'color-mix(in srgb, var(--error) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--error) 20%, transparent)',
              }}
            >
              <AlertCircle size={14} style={{ color: 'var(--error)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--error)' }}>{errorMsg}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Submit button — Apple blue via Button variant="primary" */}
        <Button
          type="submit"
          variant="primary"
          disabled={isLoading || !email.trim()}
          style={{ width: '100%', height: 44, fontSize: 13, fontWeight: 600 }}
        >
          {isLoading ? (
            <>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              Enviando...
            </>
          ) : (
            'Enviar link de acesso'
          )}
        </Button>
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
    <>
      <FilmGrain />

      <div
        style={{
          minHeight: '100vh',
          background: 'radial-gradient(ellipse at 50% 40%, color-mix(in srgb, var(--accent-500) 4%, var(--bg-base)) 0%, var(--bg-base) 70%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          padding: '16px',
        }}
      >
        {/* Card — Liquid Glass */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="glass"
          style={{
            position: 'relative',
            zIndex: 10,
            width: '100%',
            maxWidth: 420,
            borderRadius: 'var(--radius-panel)',
            boxShadow: 'var(--shadow-panel)',
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
              fontFamily: 'var(--font-sans)',
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

        {/* Keyframe for spinner */}
        <style jsx global>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </>
  );
}
