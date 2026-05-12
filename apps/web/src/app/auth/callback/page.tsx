'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setToken = useAuthStore((s) => s.setToken);
  const [error, setError] = useState(false);

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setError(true);
      return;
    }

    async function authenticate() {
      try {
        const res = await fetch(
          `${API_URL}/api/v1/auth/callback?token=${encodeURIComponent(token!)}`,
          {
            credentials: 'include',
            redirect: 'manual',
          },
        );

        if (res.ok || res.type === 'opaqueredirect') {
          const data = await res.json().catch(() => null);
          if (data?.accessToken) {
            setToken(data.accessToken);
          }
          router.replace('/conversations');
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      }
    }

    authenticate();
  }, [searchParams, setToken, router]);

  if (error) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center p-4">
        <div className="w-full max-w-[400px] bg-bg-surface border border-border rounded-modal p-8 text-center">
          <AlertCircle size={40} className="text-error mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-text-primary mb-1">
            Link invalido
          </h2>
          <p className="text-sm text-text-secondary mb-4">
            O link de acesso expirou ou e invalido. Solicite um novo.
          </p>
          <Button onClick={() => router.replace('/login')}>
            Voltar ao login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center">
      <div className="text-center">
        <Loader2 size={32} className="animate-spin text-primary-500 mx-auto mb-3" />
        <p className="text-sm text-text-secondary">Autenticando...</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-bg-base flex items-center justify-center">
          <Loader2 size={32} className="animate-spin text-primary-500" />
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
