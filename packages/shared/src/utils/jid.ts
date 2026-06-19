const PERSONAL_SUFFIX = '@s.whatsapp.net';

/**
 * Derives the canonical conversation JID from a phone-or-id value.
 *
 * The leads CRM (Google Sheets) keys rows by `phone` (digits) while the panel
 * and N8N key conversations by JID. A value that already carries an `@`
 * (`...@s.whatsapp.net`, `...@lid`) is treated as a JID and returned as-is;
 * bare digits get the legacy personal suffix. Empty input returns `''`.
 *
 * Keep this aligned with the API-side `resolvePersonalJid`
 * (apps/api/src/core/whatsapp/jid.util.ts).
 */
export function jidFromPhone(phoneOrJid: string | null | undefined): string {
  if (!phoneOrJid) return '';
  return phoneOrJid.includes('@') ? phoneOrJid : `${phoneOrJid}${PERSONAL_SUFFIX}`;
}
