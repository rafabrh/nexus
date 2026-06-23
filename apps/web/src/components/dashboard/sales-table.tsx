'use client';

import { motion } from 'framer-motion';
import { Receipt } from 'lucide-react';
import { timeAgo } from '@/lib/utils';
import { useConversations } from '@/hooks/use-conversations';
import { staggerContainer, staggerItem } from '@/lib/motion-variants';

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  backdropFilter: 'blur(12px) saturate(1.4)',
  border: '1px solid var(--separator)',
  borderRadius: 'var(--radius-card)',
  padding: '16px',
  boxShadow: 'var(--shadow-control)',
};

export function SalesTable() {
  const { data: conversations, isLoading } = useConversations();
  // Pagamento aprovado vive na conversa (Redis chat:*:paymentStatus). O valor
  // monetário só existe no CRM (Sheets), então listamos o status do pagamento.
  const paid = conversations?.filter((c) => c.paymentStatus) ?? [];

  if (isLoading) {
    return (
      <div style={cardStyle}>
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
    <div style={cardStyle}>
      <h3 className="text-sm font-medium text-text-secondary mb-4">Vendas Recentes</h3>

      {paid.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Receipt size={20} className="text-text-muted/50 mb-2" />
          <p className="text-xs text-text-muted max-w-[220px]">
            Nenhuma venda registrada ainda.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="border-b"
                style={{ borderColor: 'var(--separator)' }}
              >
                <th className="text-left pb-2 font-medium text-text-secondary uppercase tracking-wide text-[10px]">
                  Nome
                </th>
                <th className="text-left pb-2 font-medium text-text-secondary uppercase tracking-wide text-[10px]">
                  Telefone
                </th>
                <th className="text-right pb-2 font-medium text-text-secondary uppercase tracking-wide text-[10px]">
                  Pagamento
                </th>
                <th className="text-right pb-2 font-medium text-text-secondary uppercase tracking-wide text-[10px]">
                  Quando
                </th>
              </tr>
            </thead>
            <motion.tbody variants={staggerContainer} initial="initial" animate="animate">
              {paid.slice(0, 10).map((conv) => (
                <motion.tr
                  key={conv.jid}
                  variants={staggerItem}
                  className="border-b last:border-b-0 transition-colors duration-150 cursor-default"
                  style={{ borderColor: 'var(--separator)' }}
                  whileHover={{ backgroundColor: 'var(--bg-hover)' }}
                >
                  <td className="py-2 text-text-primary">
                    {conv.contactName || conv.phoneDisplay}
                  </td>
                  <td className="py-2 text-text-muted font-mono text-xs">{conv.phoneDisplay}</td>
                  <td className="py-2 text-right">
                    <span
                      className="inline-block rounded-full px-2 py-0.5 font-medium text-success"
                      style={{
                        fontSize: 10,
                        background: 'color-mix(in srgb, var(--success) 12%, transparent)',
                        border: '1px solid color-mix(in srgb, var(--success) 25%, transparent)',
                      }}
                    >
                      {conv.paymentStatus}
                    </span>
                  </td>
                  <td className="py-2 text-right text-text-muted text-xs">
                    {timeAgo(conv.lastActivity)}
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
