'use client';

import { useState } from 'react';
import { Bot, Mail, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';

type LoginState = 'idle' | 'loading' | 'success' | 'error';

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
    } catch (err) {
      setState('error');
      setErrorMsg('Erro ao enviar link. Tente novamente.');
    }
  };

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center p-4">
      <div className="w-full max-w-[400px] bg-bg-surface border border-border rounded-modal p-8">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <Bot size={28} className="text-primary-400" />
          <span className="text-xl font-semibold text-text-primary tracking-tight">
            NEXUS
          </span>
        </div>

        {state === 'success' ? (
          <div className="text-center py-4">
            <CheckCircle size={40} className="text-success mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-text-primary mb-1">
              Link enviado!
            </h2>
            <p className="text-sm text-text-secondary">
              Verifique seu email <span className="text-text-primary font-medium">{email}</span> e
              clique no link de acesso.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-4"
              onClick={() => {
                setState('idle');
                setEmail('');
              }}
            >
              Usar outro email
            </Button>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-text-primary text-center mb-1">
              Entrar no painel
            </h2>
            <p className="text-sm text-text-secondary text-center mb-6">
              Insira seu email para receber o link de acesso
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm text-text-secondary mb-1.5"
                >
                  Email
                </label>
                <div className="relative">
                  <Mail
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                  />
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9"
                    disabled={state === 'loading'}
                    required
                  />
                </div>
              </div>

              {state === 'error' && (
                <div className="flex items-center gap-2 p-2.5 rounded-input bg-error/10 border border-error/20">
                  <AlertCircle size={14} className="text-error flex-shrink-0" />
                  <span className="text-xs text-error">{errorMsg}</span>
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={state === 'loading' || !email.trim()}
              >
                {state === 'loading' ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Enviando...
                  </>
                ) : (
                  'Enviar link de acesso'
                )}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
