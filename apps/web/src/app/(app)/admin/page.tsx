'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth.store';
import { isSuperadmin } from '@/lib/jwt';
import { useTenants } from '@/hooks/use-admin';
import { TenantCard } from '@/components/admin/tenant-card';
import { NewTenantDialog } from '@/components/admin/new-tenant-dialog';
import {
  pageTransition,
  pageTransitionConfig,
  staggerContainer,
} from '@/lib/motion-variants';

function Restricted() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center px-6">
      <ShieldAlert size={32} className="text-text-muted mb-3" />
      <h1 className="text-lg font-semibold text-text-primary">Acesso restrito</h1>
      <p className="text-sm text-text-secondary mt-1 max-w-sm">
        Esta área é exclusiva do administrador da plataforma.
      </p>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div
      className="glass-card p-5"
      style={{ border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-panel)' }}
    >
      <div className="h-4 w-32 skeleton mb-2" />
      <div className="h-3 w-20 skeleton mb-4" />
      <div className="h-5 w-24 skeleton mb-4" />
      <div className="h-8 w-full skeleton" />
    </div>
  );
}

export default function AdminPage() {
  const token = useAuthStore((s) => s.token);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: tenants, isLoading } = useTenants();

  if (!isSuperadmin(token)) return <Restricted />;

  const instances = tenants?.map((t) => t.instancia) ?? [];

  return (
    <motion.div
      className="p-6 max-w-5xl mx-auto"
      variants={pageTransition}
      initial="initial"
      animate="animate"
      transition={pageTransitionConfig}
    >
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <ShieldCheck size={22} className="text-primary-400" />
          <div>
            <h1 className="text-text-primary" style={{ fontWeight: 600, fontSize: 24 }}>
              Assinantes
            </h1>
            <p className="text-sm text-text-secondary mt-0.5">
              Cadastre, ative e gerencie os clientes da plataforma.
            </p>
          </div>
        </div>
        <Button variant="primary" size="sm" onClick={() => setDialogOpen(true)}>
          <Plus size={15} />
          Novo assinante
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : !tenants || tenants.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
          <p className="text-sm text-text-muted">Nenhum assinante cadastrado ainda.</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => setDialogOpen(true)}
          >
            <Plus size={15} />
            Cadastrar o primeiro
          </Button>
        </div>
      ) : (
        <motion.div
          className="grid gap-4 md:grid-cols-2"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          {tenants.map((t) => (
            <TenantCard key={t.instancia} tenant={t} />
          ))}
        </motion.div>
      )}

      <NewTenantDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        existingInstances={instances}
      />
    </motion.div>
  );
}
