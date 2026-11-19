import { capturePendingInvite, clearPendingInvite, readPendingInvite } from './pendingInvite';

afterEach(() => {
  clearPendingInvite();
  window.history.replaceState(null, '', '/');
});

describe('convite pendente', () => {
  it('guarda o código do link e o tira do endereço', () => {
    window.history.replaceState(null, '', '/?convite=a1b2c3d4e5f6&x=1#topo');
    expect(capturePendingInvite()).toBe('A1B2-C3D4-E5F6');
    expect(window.location.search).toBe('?x=1');
    expect(window.location.hash).toBe('#topo');
    expect(readPendingInvite()).toBe('A1B2-C3D4-E5F6');
  });

  it('sem link, devolve o que já estava guardado (por exemplo, depois de confirmar o e-mail)', () => {
    window.history.replaceState(null, '', '/?convite=a1b2c3d4e5f6');
    capturePendingInvite();
    window.history.replaceState(null, '', '/');
    expect(capturePendingInvite()).toBe('A1B2-C3D4-E5F6');
  });

  it('link com código incompleto é ignorado e limpar esquece o código', () => {
    window.history.replaceState(null, '', '/?convite=curto');
    expect(capturePendingInvite()).toBeNull();
    window.history.replaceState(null, '', '/?convite=a1b2c3d4e5f6');
    capturePendingInvite();
    clearPendingInvite();
    expect(readPendingInvite()).toBeNull();
  });
});
