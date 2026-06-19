const PERSONAL_SUFFIX = '@s.whatsapp.net';
const LID_SUFFIX = '@lid';

export interface PersonalJid {
  /**
   * Conversation identifier used for the `chathistory:{inst}-{id}` and
   * `contact:{id}` keys. For legacy contacts this is the phone digits; for
   * phone-opaque LID contacts it is the full `{lid}@lid` string. It always
   * equals `jid` with the `@s.whatsapp.net` suffix stripped, which is exactly
   * how `ConversationRepository` derives it — keeping sync, webhook and the
   * panel reading the same keys.
   */
  phone: string;
  /** Canonical JID stored in `chat:{inst}:{jid}:*` keys. */
  jid: string;
}

/**
 * Resolves a WhatsApp identifier to a canonical conversation identity.
 *
 * WhatsApp now uses `@lid` (linked-id) addressing for individual chats. When
 * the real phone is exposed (in `remoteJidAlt` / `participantAlt`) we key the
 * conversation by phone — aligned with the legacy `@s.whatsapp.net` format and
 * the N8N flow. When the phone is opaque (most LIDs), we fall back to the LID
 * itself as a stable, unique identifier so the conversation still surfaces.
 *
 * Groups (`@g.us`), broadcasts, and anything unparseable return `null` and must
 * be skipped.
 *
 * Candidates are checked in order; pass the most authoritative first. A real
 * phone always wins over a LID, regardless of position.
 *
 * Known limitation: a contact can appear under both its phone key and its LID
 * key if WhatsApp omits `remoteJidAlt` on some messages but not others. A
 * persistent `lidmap:{inst}:{lid}->phone` would fully de-duplicate; see the
 * onboarding/webhook follow-up.
 */
export function resolvePersonalJid(
  ...candidates: Array<string | null | undefined>
): PersonalJid | null {
  // 1. Prefer a real phone from any candidate.
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.endsWith(PERSONAL_SUFFIX)) {
      const phone = candidate.slice(0, -PERSONAL_SUFFIX.length);
      if (/^\d{6,}$/.test(phone)) {
        return { phone, jid: `${phone}${PERSONAL_SUFFIX}` };
      }
    }
  }

  // 2. Fall back to a LID as an opaque but stable identifier.
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.endsWith(LID_SUFFIX)) {
      const lid = candidate.slice(0, -LID_SUFFIX.length);
      if (/^\d{6,}$/.test(lid)) {
        return { phone: candidate, jid: candidate };
      }
    }
  }

  // 3. Groups, broadcasts, unparseable → skip.
  return null;
}
