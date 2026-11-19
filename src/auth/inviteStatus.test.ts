import { inviteStatus } from './inviteStatus';

const NOW = new Date('2026-11-19T12:00:00Z');
const base = { revokedAt: null, expiresAt: '2026-11-26T12:00:00Z', usedCount: 0, maxUses: 1 };

describe('situação do convite', () => {
  it('ativo enquanto não revogado, não vencido e com usos sobrando', () => {
    expect(inviteStatus(base, NOW)).toBe('active');
    expect(inviteStatus({ ...base, usedCount: 2, maxUses: 5 }, NOW)).toBe('active');
  });
  it('revogado vence qualquer outra situação', () => {
    expect(inviteStatus({ ...base, revokedAt: '2026-11-19T11:00:00Z', usedCount: 1 }, NOW)).toBe('revoked');
  });
  it('expirado no instante do vencimento e depois dele', () => {
    expect(inviteStatus({ ...base, expiresAt: '2026-11-19T12:00:00Z' }, NOW)).toBe('expired');
    expect(inviteStatus({ ...base, expiresAt: '2026-11-18T12:00:00Z' }, NOW)).toBe('expired');
  });
  it('esgotado quando os usos acabaram', () => {
    expect(inviteStatus({ ...base, usedCount: 1 }, NOW)).toBe('used_up');
  });
});
