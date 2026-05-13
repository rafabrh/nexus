'use client';

import { motion } from 'framer-motion';
import { formatCurrency, timeAgo } from '@/lib/utils';
import { useLeads } from '@/hooks/use-leads';
import { Badge } from '@/components/ui/badge';
import { staggerContainer, staggerItem } from '@/lib/motion-variants';

const glassStyle: React.CSSProperties = {
  background: 'rgba(20,24,32,0.72)',
  backdropFilter: 'blur(12px) saturate(1.2)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: '12px',
  padding: '16px',
};

export function SalesTable() {
  const { data: leads, isLoading } = useLeads();
  const paidLeads = leads?.filter((l) => l.status === 'pago') ?? [];

  if (isLoading) {
    return (
      <div style={glassStyle}>
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
    <div style={glassStyle}>
      <h3 className="text-sm font-medium text-text-secondary mb-4">Vendas Recentes</h3>

      {paidLeads.length === 0 ? (
        <div className="py-8 text-center text-xs text-text-muted">
          Nenhuma venda registrada
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="border-b border-border"
                style={{ borderColor: 'rgba(255,255,255,0.06)' }}
              >
                <th className="text-left pb-2 font-medium text-text-muted uppercase tracking-wide text-[10px]">
                  Nome
                </th>
                <th className="text-left pb-2 font-medium text-text-muted uppercase tracking-wide text-[10px]">
                  Telefone
                </th>
                <th className="text-right pb-2 font-medium text-text-muted uppercase tracking-wide text-[10px]">
                  Valor
                </th>
                <th className="text-right pb-2 font-medium text-text-muted uppercase tracking-wide text-[10px]">
                  Quando
                </th>
              </tr>
            </thead>
            <motion.tbody
              variants={staggerContainer}
              initial="initial"
              animate="animate"
            >
              {paidLeads.slice(0, 10).map((lead) => (
                <motion.tr
                  key={lead.leadId}
                  variants={staggerItem}
                  className="border-b last:border-b-0 transition-colors duration-150"
                  style={{ borderColor: 'rgba(255,255,255,0.04)' }}
                  whileHover={{ backgroundColor: 'rgba(31,39,51,0.3)' }}
                >
                  <td className="py-2 text-text-primary">{lead.name}</td>
                  <td className="py-2 text-text-muted font-mono text-xs">{lead.phone}</td>
                  <td className="py-2 text-right text-success font-medium">
                    {formatCurrency(lead.valorPago)}
                  </td>
                  <td className="py-2 text-right text-text-muted text-xs">
                    {timeAgo(lead.lastContact)}
                  </td>
                </motion.tr>
              ))}
            </motion.tbody>
          </table>
        </div>
      )}
    </div>
  );
}
