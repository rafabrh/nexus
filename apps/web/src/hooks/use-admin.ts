import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { TenantEntry } from '@nexus/shared';

/** Tenant administration (superadmin only). Mirrors the AdminController routes;
 *  every mutation invalidates the tenants list so the UI reflects the server. */
const KEY = ['admin', 'tenants'] as const;

export function useTenants() {
  return useQuery<TenantEntry[]>({
    queryKey: KEY,
    queryFn: () => api('/api/v1/admin/tenants'),
  });
}

export function useRegisterTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { instancia: string; adminEmail: string }) =>
      api<TenantEntry>('/api/v1/admin/tenants', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useToggleTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ instancia, active }: { instancia: string; active: boolean }) =>
      api<TenantEntry>(`/api/v1/admin/tenants/${encodeURIComponent(instancia)}`, {
        method: 'PATCH',
        body: JSON.stringify({ active }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Grava a URL do webhook do fluxo N8N do cliente (conecta a instância à IA). */
export function useSetInstanceConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ instancia, n8nWebhookUrl }: { instancia: string; n8nWebhookUrl: string }) =>
      api<TenantEntry>(
        `/api/v1/admin/tenants/${encodeURIComponent(instancia)}/config`,
        { method: 'PATCH', body: JSON.stringify({ n8nWebhookUrl }) },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Adota uma instância que já existe na Evolution (registra + n8nWebhookUrl). */
export function useAdoptInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { instancia: string; adminEmail: string; n8nWebhookUrl: string }) =>
      api<TenantEntry>('/api/v1/admin/tenants/adopt', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useAddUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      instancia,
      ...body
    }: {
      instancia: string;
      email: string;
      role: 'admin' | 'operator';
    }) =>
      api<TenantEntry>(
        `/api/v1/admin/tenants/${encodeURIComponent(instancia)}/users`,
        { method: 'POST', body: JSON.stringify(body) },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRemoveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ instancia, email }: { instancia: string; email: string }) =>
      api(
        `/api/v1/admin/tenants/${encodeURIComponent(instancia)}/users/${encodeURIComponent(email)}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
