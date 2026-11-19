import { formatInviteCode, inviteCodeFromSearch, inviteLink, isInviteCodeComplete, normalizeInviteCode } from './inviteCode';

describe('código de convite', () => {
  it('normaliza maiúsculas, espaços e hífens como o banco', () => {
    expect(normalizeInviteCode(' a1b2-c3d4 e5f6 ')).toBe('A1B2C3D4E5F6');
  });

  it('formata em grupos de quatro e corta o excesso', () => {
    expect(formatInviteCode('a1b2c3d4e5f6')).toBe('A1B2-C3D4-E5F6');
    expect(formatInviteCode('a1b2c3')).toBe('A1B2-C3');
    expect(formatInviteCode('a1b2c3d4e5f6ffff')).toBe('A1B2-C3D4-E5F6');
  });

  it('só considera completo com 12 caracteres', () => {
    expect(isInviteCodeComplete('A1B2-C3D4-E5F6')).toBe(true);
    expect(isInviteCodeComplete('A1B2-C3D4-E5F')).toBe(false);
    expect(isInviteCodeComplete('')).toBe(false);
  });

  it('lê o código do link e ignora lixo ou código incompleto', () => {
    expect(inviteCodeFromSearch('?convite=a1b2c3d4e5f6')).toBe('A1B2-C3D4-E5F6');
    expect(inviteCodeFromSearch('?convite=A1B2-C3D4-E5F6&x=1')).toBe('A1B2-C3D4-E5F6');
    expect(inviteCodeFromSearch('?convite=curto')).toBeNull();
    expect(inviteCodeFromSearch('')).toBeNull();
  });

  it('monta o link com o código formatado e protegido na URL', () => {
    expect(inviteLink('https://alpha7.test', 'a1b2c3d4e5f6')).toBe('https://alpha7.test/?convite=A1B2-C3D4-E5F6');
  });
});
