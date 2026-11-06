// FR-03: launch params (CR§1). `lang`/`deck` are validated before they can reach any path.
export const LAUNCH_SLUG_PATTERN = /^[a-z0-9-]{1,64}$/;
export const USER_ID_MAX_LENGTH = 128;

export interface LaunchParams {
  lang: string;
  deck: string;
  userId: string;
}

export type LaunchParamsResult =
  | { ok: true; params: LaunchParams }
  | { ok: false; error: 'E1' };

export function parseLaunchParams(search: string): LaunchParamsResult {
  const query = new URLSearchParams(search);
  const lang = query.get('cr_lang');
  const deck = query.get('cr_book');
  if (lang === null || deck === null || !LAUNCH_SLUG_PATTERN.test(lang) || !LAUNCH_SLUG_PATTERN.test(deck)) {
    return { ok: false, error: 'E1' };
  }
  return { ok: true, params: { lang, deck, userId: parseUserId(query.get('cr_user_id')) } };
}

// Opaque: trimmed only, never validated further and never invented (CR§6.2).
function parseUserId(raw: string | null): string {
  const userId = (raw ?? '').trim();
  return userId.length > USER_ID_MAX_LENGTH ? '' : userId;
}
