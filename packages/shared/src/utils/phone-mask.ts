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
};
