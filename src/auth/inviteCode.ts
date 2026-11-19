/**
 * Código de convite: 12 caracteres hexadecimais mostrados em três grupos ("A1B2-C3D4-E5F6"). A pessoa pode digitar em
 * minúsculas, com espaços ou sem hífens; o banco normaliza do mesmo jeito (só letras e números, em maiúsculas).
 */
export const INVITE_CODE_LENGTH = 12;

/** Letras e números em maiúsculas, sem separadores. */
export const normalizeInviteCode = (value: string): string => value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

export const isInviteCodeComplete = (value: string): boolean => normalizeInviteCode(value).length === INVITE_CODE_LENGTH;

/** "a1b2c3d4e5f6" → "A1B2-C3D4-E5F6" (o que ainda não tem 12 caracteres é agrupado até onde der). */
export function formatInviteCode(value: string): string {
  const raw = normalizeInviteCode(value).slice(0, INVITE_CODE_LENGTH);
  return (raw.match(/.{1,4}/g) ?? []).join('-');
}

/** Código vindo de `?convite=` na barra de endereço, ou null se estiver ausente ou incompleto. */
export function inviteCodeFromSearch(search: string): string | null {
  const raw = new URLSearchParams(search).get('convite');
  return raw !== null && isInviteCodeComplete(raw) ? formatInviteCode(raw) : null;
}

/** Endereço que a pessoa recebe para abrir o app já com o código preenchido. */
export const inviteLink = (origin: string, code: string): string => `${origin}/?convite=${encodeURIComponent(formatInviteCode(code))}`;
