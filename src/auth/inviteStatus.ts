import type { InviteRow } from './TeamGate';

export type InviteStatus = 'active' | 'revoked' | 'expired' | 'used_up';

export const INVITE_STATUS_LABEL: Record<InviteStatus, string> = {
  active: 'Ativo',
  revoked: 'Revogado',
  expired: 'Expirado',
  used_up: 'Esgotado',
};

/** Mesma ordem de precedência do banco: revogado, depois expirado, depois esgotado. */
export function inviteStatus(invite: Pick<InviteRow, 'revokedAt' | 'expiresAt' | 'usedCount' | 'maxUses'>, now: Date): InviteStatus {
  if (invite.revokedAt !== null) return 'revoked';
  if (Date.parse(invite.expiresAt) <= now.getTime()) return 'expired';
  if (invite.usedCount >= invite.maxUses) return 'used_up';
  return 'active';
}
