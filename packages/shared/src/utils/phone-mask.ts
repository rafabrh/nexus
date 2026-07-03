export const PhoneMask = {
  mask(jid: string): string {
    const digits = jid.replace(/\D/g, '');
    if (digits.length < 10) return jid;

    const country = digits.slice(0, 2);
    const ddd = digits.slice(2, 4);
    const last4 = digits.slice(-4);
    return `+${country} ${ddd} *****-${last4}`;
  },

  reveal(jid: string): string {
    const digits = jid.replace(/\D/g, '');
    if (digits.length < 10) return jid;

    const country = digits.slice(0, 2);
    const ddd = digits.slice(2, 4);
    const number = digits.slice(4);
    const formatted =
      number.length === 9
        ? `${number.slice(0, 5)}-${number.slice(5)}`
        : `${number.slice(0, 4)}-${number.slice(4)}`;
    return `+${country} ${ddd} ${formatted}`;
  },

  /**
   * Um valor está "mascarado" quando contém `*` (ex.: `11948**-****`). Nomes assim
   * foram gravados por origem externa/build antigo e NUNCA devem ser exibidos como
   * nome do contato — o painel mostra o número real no lugar.
   */
  isMasked(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.includes('*');
  },
};

/**
 * Nome de exibição do contato: usa o nome real quando existe e NÃO está mascarado;
 * caso contrário, revela o número completo a partir do jid. Fonte única de verdade
 * para lista, detalhe e projeção — garante que nenhum contato apareça mascarado.
 */
export function resolveDisplayName(rawName: unknown, jid: string): string {
  const trimmed = typeof rawName === 'string' ? rawName.trim() : '';
  if (trimmed && !PhoneMask.isMasked(trimmed)) return trimmed;
  return PhoneMask.reveal(jid);
}
