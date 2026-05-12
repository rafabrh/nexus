'use client';

import { formatCurrency, timeAgo } from '@/lib/utils';
import { useLeads } from '@/hooks/use-leads';
import { Badge } from '@/components/ui/badge';

export function SalesTable() {
  const { data: leads, isLoading } = useLeads();

  const paidLeads = leads?.filter((l) => l.status === 'pago') ?? [];

  if (isLoading) {
    return (
      <div className="bg-bg-surface border border-border rounded-card p-4">
        <div className="h-4 w-24 skeleton mb-4" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 skeleton" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-bg-surface border border-border rounded-card p-4">
      <h3 className="text-sm font-medium text-text-secondary mb-4">
        Vendas Recentes
      </h3>

      {paidLeads.length === 0 ? (
        <div className="py-8 text-center text-xs text-text-muted">
          Nenhuma venda registrada
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-text-muted border-b border-border">
                <th className="text-left pb-2 font-medium">Nome</th>
                <th className="text-left pb-2 font-medium">Telefone</th>
                <th className="text-right pb-2 font-medium">Valor</th>
                <th className="text-right pb-2 font-medium">Quando</th>
              </tr>
            </thead>
            <tbody>
              {paidLeads.slice(0, 10).map((lead) => (
                <tr
                  key={lead.leadId}
                  className="border-b border-border last:border-b-0 hover:bg-bg-hover transition-colors duration-150"
                >
                  <td className="py-2 text-text-primary">{lead.name}</td>
                  <td className="py-2 text-text-muted font-mono text-xs">
                    {lead.phone}
                  </td>
                  <td className="py-2 text-right text-success font-medium">
                    {formatCurrency(lead.valorPago)}
                  </td>
                  <td className="py-2 text-right text-text-muted text-xs">
                    {timeAgo(lead.lastContact)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
