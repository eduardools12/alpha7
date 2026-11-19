/**
 * Criar a própria conta e entrar numa equipe com convite por código, com o cliente SIMULADO (src/test/fakeSupabase.ts):
 * sem rede, sem contas reais. As regras reais das funções do banco são provadas por supabase/tests/invites.test.sql;
 * aqui se prova o comportamento do aplicativo e a fidelidade do simulador a elas.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { clearPendingInvite } from './pendingInvite';
import { makePlayer } from '@/test/factories';
import { FakeSupabase } from '@/test/fakeSupabase';
import { renderRemote } from '@/test/renderRemote';
import { TEAM_A, TEAM_B, USERS, newFake, seedTeam, seedWorkspace } from '@/test/remoteFixtures';

const CODE = 'A1B2-C3D4-E5F6';
const dashboard = () => screen.findByRole('heading', { level: 1, name: 'Alpha7 Performance' });

afterEach(() => {
  clearPendingInvite();
  window.history.replaceState(null, '', '/');
});

function seedInvite(fake: FakeSupabase, teamId: string, overrides: Record<string, unknown> = {}, code = CODE) {
  fake.seed('team_invites', [
    {
      id: `inv-${fake.rows('team_invites').length + 1}`,
      team_id: teamId,
      code_hash: code.replace(/-/g, ''),
      role: 'analyst',
      label: null,
      max_uses: 1,
      used_count: 0,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      revoked_at: null,
      created_by: USERS.coach.id,
      created_at: new Date().toISOString(),
      ...overrides,
    },
  ]);
}

function teamA() {
  const fake = newFake();
  seedTeam(fake, TEAM_A, 'Equipe A', { coach: 'coach' });
  seedWorkspace(fake, TEAM_A, { players: [makePlayer({ id: 'p1', name: 'Ana Alves', jerseyNumber: 1 })] });
  return fake;
}

describe('Criar a própria conta', () => {
  it('o login oferece "Criar conta"; ter conta não abre nenhum dado da equipe', async () => {
    const { user } = renderRemote(teamA());
    await screen.findByRole('heading', { level: 2, name: 'Entrar' });
    expect(screen.queryByRole('navigation', { name: 'Principal' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Criar conta' })).toBeInTheDocument();
    expect(screen.getByLabelText('Confirmar senha')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Voltar ao login' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Entrar' })).toBeInTheDocument();
  });

  it('valida e-mail, tamanho da senha e confirmação antes de chamar o servidor', async () => {
    const fake = teamA();
    const { user } = renderRemote(fake);
    await user.click(await screen.findByRole('button', { name: 'Criar conta' }));
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByText('Informe um e-mail válido.')).toBeInTheDocument();
    expect(screen.getByText('Use pelo menos 8 caracteres.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('E-mail'), 'nova@t.test');
    await user.type(screen.getByLabelText('Senha'), 'senha-comprida-ok');
    await user.type(screen.getByLabelText('Confirmar senha'), 'outra-senha-ok');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByText('As senhas não são iguais.')).toBeInTheDocument();
    expect(fake.signUps).toHaveLength(0);
  });

  it('cria a conta, entra e cai na escolha de convite ou de criar equipe (sem acesso a dado nenhum)', async () => {
    const fake = teamA();
    const { user } = renderRemote(fake);
    await user.click(await screen.findByRole('button', { name: 'Criar conta' }));
    await user.type(screen.getByLabelText('E-mail'), 'nova@t.test');
    await user.type(screen.getByLabelText('Senha'), 'senha-comprida-ok');
    await user.type(screen.getByLabelText('Confirmar senha'), 'senha-comprida-ok');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Entrar numa equipe' })).toBeInTheDocument();
    expect(fake.signUps).toEqual([{ email: 'nova@t.test', emailRedirectTo: `${window.location.origin}/` }]);
    expect(screen.queryByRole('navigation', { name: 'Principal' })).not.toBeInTheDocument();
    expect(fake.rows('team_members')).toHaveLength(1); // só o coach da equipe A; a conta nova não entrou em equipe nenhuma
  });

  it('com a confirmação de e-mail ligada, pede para abrir o link e não abre sessão', async () => {
    const fake = new FakeSupabase({ users: [], confirmEmail: true });
    const { user } = renderRemote(fake);
    await user.click(await screen.findByRole('button', { name: 'Criar conta' }));
    await user.type(screen.getByLabelText('E-mail'), 'nova@t.test');
    await user.type(screen.getByLabelText('Senha'), 'senha-comprida-ok');
    await user.type(screen.getByLabelText('Confirmar senha'), 'senha-comprida-ok');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByText('Confirme seu e-mail')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Entrar numa equipe' })).not.toBeInTheDocument();
    expect(fake.session).toBeNull();
  });

  it('e-mail já cadastrado e falta de conexão têm mensagem própria', async () => {
    const fake = teamA();
    const { user } = renderRemote(fake);
    await user.click(await screen.findByRole('button', { name: 'Criar conta' }));
    await user.type(screen.getByLabelText('E-mail'), USERS.coach.email);
    await user.type(screen.getByLabelText('Senha'), 'senha-comprida-ok');
    await user.type(screen.getByLabelText('Confirmar senha'), 'senha-comprida-ok');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByText(/Já existe uma conta com este e-mail/)).toBeInTheDocument();
    fake.offline = true;
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByText(/Sem conexão com o servidor/)).toBeInTheDocument();
  });

  it('cadastro desligado no projeto: explica em vez de falhar em silêncio', async () => {
    const fake = teamA();
    const { user } = renderRemote(fake);
    await user.click(await screen.findByRole('button', { name: 'Criar conta' }));
    await user.type(screen.getByLabelText('E-mail'), 'nova@t.test');
    await user.type(screen.getByLabelText('Senha'), 'senha-comprida-ok');
    await user.type(screen.getByLabelText('Confirmar senha'), 'senha-comprida-ok');
    fake.authFailure = { message: 'Signups not allowed for this instance', status: 422, code: 'signup_disabled', name: 'AuthApiError' };
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByText(/cadastro de novas contas está desligado/)).toBeInTheDocument();
  });
});

describe('Entrar numa equipe com o código do convite', () => {
  function outsiderWithInvite(overrides: Record<string, unknown> = {}) {
    const fake = teamA();
    seedInvite(fake, TEAM_A, overrides);
    fake.signInAs(USERS.outsider.id);
    return fake;
  }

  it('código em minúsculas e sem hífens entra na equipe com o papel do convite e gasta um uso', async () => {
    const fake = outsiderWithInvite();
    const { user } = renderRemote(fake);
    await screen.findByRole('heading', { level: 2, name: 'Entrar numa equipe' });
    await user.type(screen.getByLabelText('Código do convite'), 'a1b2c3d4e5f6');
    expect(screen.getByLabelText('Código do convite')).toHaveValue(CODE); // formata enquanto digita
    await user.click(screen.getByRole('button', { name: 'Entrar na equipe' }));
    await dashboard();
    expect(fake.rows('team_members', TEAM_A).find((m) => m.user_id === USERS.outsider.id)).toMatchObject({ role: 'analyst' });
    expect(fake.rows('team_invites')[0]).toMatchObject({ used_count: 1 });
    expect(screen.getAllByText('Equipe A').length).toBeGreaterThan(0);
  });

  it('dois cliques no mesmo instante gastam um uso só', async () => {
    const fake = outsiderWithInvite({ max_uses: 5 });
    const { user } = renderRemote(fake);
    await user.type(await screen.findByLabelText('Código do convite'), CODE);
    const form = screen.getByRole('form', { name: 'Entrar com convite' });
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    await dashboard();
    expect(fake.rpcCalls.filter((c) => c.name === 'redeem_team_invite')).toHaveLength(1);
    expect(fake.rows('team_invites')[0]).toMatchObject({ used_count: 1 });
  });

  it('código incompleto não chama o servidor', async () => {
    const fake = outsiderWithInvite();
    const { user } = renderRemote(fake);
    await user.type(await screen.findByLabelText('Código do convite'), 'A1B2');
    await user.click(screen.getByRole('button', { name: 'Entrar na equipe' }));
    expect(await screen.findByText(/O código tem 12 letras e números/)).toBeInTheDocument();
    expect(fake.rpcCalls.filter((c) => c.name === 'redeem_team_invite')).toHaveLength(0);
  });

  it.each([
    ['inexistente', {}, 'FFFF-FFFF-FFFF'],
    ['expirado', { expires_at: new Date(Date.now() - 1000).toISOString() }, CODE],
    ['revogado', { revoked_at: new Date().toISOString() }, CODE],
    ['esgotado', { used_count: 1 }, CODE],
  ])('convite %s: a mesma mensagem, e ninguém entra', async (_name, overrides, typed) => {
    const fake = outsiderWithInvite(overrides);
    const { user } = renderRemote(fake);
    await user.type(await screen.findByLabelText('Código do convite'), typed);
    await user.click(screen.getByRole('button', { name: 'Entrar na equipe' }));
    expect(await screen.findByText(/Convite inválido, expirado ou já usado/)).toBeInTheDocument();
    expect(fake.rows('team_members', TEAM_A).some((m) => m.user_id === USERS.outsider.id)).toBe(false);
    expect(screen.queryByRole('navigation', { name: 'Principal' })).not.toBeInTheDocument();
  });

  it('depois de 10 códigos inválidos, bloqueia por um tempo mesmo com o código certo', async () => {
    const fake = outsiderWithInvite({ max_uses: 5 });
    const { user } = renderRemote(fake);
    const field = await screen.findByLabelText('Código do convite');
    for (let n = 0; n < 10; n += 1) {
      await user.clear(field);
      await user.type(field, `0000-0000-00${String(n).padStart(2, '0')}`);
      await user.click(screen.getByRole('button', { name: 'Entrar na equipe' }));
      await screen.findByText(/Convite inválido, expirado ou já usado/);
    }
    await user.clear(field);
    await user.type(field, CODE);
    await user.click(screen.getByRole('button', { name: 'Entrar na equipe' }));
    expect(await screen.findByText(/Muitas tentativas com código inválido/)).toBeInTheDocument();
    expect(fake.rows('team_members', TEAM_A).some((m) => m.user_id === USERS.outsider.id)).toBe(false);
  });

  it('quem já é da equipe e usa o convite só entra nela de novo: papel e usos ficam como estavam', async () => {
    const fake = teamA();
    seedInvite(fake, TEAM_A, { role: 'viewer' });
    fake.signInAs(USERS.coach.id);
    window.history.replaceState(null, '', `/?convite=${CODE}`);
    const { user } = renderRemote(fake);
    await screen.findByRole('heading', { level: 2, name: 'Você recebeu um convite' });
    await user.click(screen.getByRole('button', { name: 'Entrar na equipe' }));
    await dashboard();
    expect(fake.rows('team_members', TEAM_A).find((m) => m.user_id === USERS.coach.id)).toMatchObject({ role: 'coach' });
    expect(fake.rows('team_invites')[0]).toMatchObject({ used_count: 0 });
  });
});

describe('Convite recebido por link', () => {
  it('antes do login, avisa do convite e tira o código do endereço', async () => {
    window.history.replaceState(null, '', `/?convite=${CODE.toLowerCase()}`);
    renderRemote(teamA());
    await screen.findByRole('heading', { level: 2, name: 'Entrar' });
    expect(screen.getByText('Você recebeu um convite')).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });

  it('depois do login mostra o convite com o código preenchido; "Agora não" segue para as outras opções', async () => {
    const fake = teamA();
    seedInvite(fake, TEAM_A);
    fake.signInAs(USERS.outsider.id);
    window.history.replaceState(null, '', `/?convite=${CODE}`);
    const { user } = renderRemote(fake);
    await screen.findByRole('heading', { level: 2, name: 'Você recebeu um convite' });
    expect(screen.getByLabelText('Código do convite')).toHaveValue(CODE);
    await user.click(screen.getByRole('button', { name: 'Agora não' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Entrar numa equipe' })).toBeInTheDocument();
    expect(fake.rpcCalls.filter((c) => c.name === 'redeem_team_invite')).toHaveLength(0);
  });

  it('quem já tem equipe usa o convite de OUTRA equipe e passa a ela, com o papel do convite', async () => {
    const fake = teamA();
    seedTeam(fake, TEAM_B, 'Equipe B', { analyst: 'coach' });
    seedInvite(fake, TEAM_B, { role: 'viewer' });
    fake.signInAs(USERS.coach.id);
    window.history.replaceState(null, '', `/?convite=${CODE}`);
    const { user } = renderRemote(fake);
    await screen.findByRole('heading', { level: 2, name: 'Você recebeu um convite' });
    await user.click(screen.getByRole('button', { name: 'Entrar na equipe' }));
    await dashboard();
    expect(fake.rows('team_members', TEAM_B).find((m) => m.user_id === USERS.coach.id)).toMatchObject({ role: 'viewer' });
    expect(screen.getAllByText('Equipe B').length).toBeGreaterThan(0);
    expect(screen.getByText('Acesso somente leitura')).toBeInTheDocument();
  });
});

describe('Convites na equipe (Configurações → Conta e equipe)', () => {
  const settings = '/configuracoes';
  const form = () => screen.findByRole('form', { name: 'Criar convite' });

  it('só a comissão técnica vê a criação e a lista de convites', async () => {
    for (const who of ['analyst', 'viewer'] as const) {
      const fake = newFake();
      seedTeam(fake, TEAM_A, 'Equipe A', { coach: 'coach', analyst: 'analyst', viewer: 'viewer' });
      fake.signInAs(USERS[who].id);
      const view = renderRemote(fake, { path: settings });
      await screen.findByRole('heading', { level: 2, name: 'Conta e equipe' });
      expect(screen.queryByRole('form', { name: 'Criar convite' })).not.toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Convites criados' })).not.toBeInTheDocument();
      expect(fake.calls.filter((c) => c.table === 'team_invites')).toHaveLength(0);
      view.unmount();
    }
  });

  it('cria o convite, mostra o código UMA vez com o link, e a lista não repete o código', async () => {
    const fake = teamA();
    fake.signInAs(USERS.coach.id);
    const { user } = renderRemote(fake, { path: settings });
    const panel = within(await form());
    await user.selectOptions(panel.getByLabelText('Papel'), 'analyst');
    await user.selectOptions(panel.getByLabelText('Validade'), '30');
    await user.selectOptions(panel.getByLabelText('Quantas pessoas podem usar'), '5');
    await user.type(panel.getByLabelText('Rótulo (opcional)'), 'Ana, analista');
    await user.click(panel.getByRole('button', { name: 'Criar convite' }));
    expect(await screen.findByText('Convite criado')).toBeInTheDocument();
    const code = fake.rows('team_invites')[0]?.code_hash as string;
    expect(fake.rows('team_invites')[0]).toMatchObject({ role: 'analyst', max_uses: 5, label: 'Ana, analista', team_id: TEAM_A });
    const shown = `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`;
    expect(screen.getByText(shown)).toBeInTheDocument();
    expect(screen.getByText(`${window.location.origin}/?convite=${shown}`)).toBeInTheDocument();
    expect(screen.getByText(/o código não será mostrado de novo/)).toBeInTheDocument();
    const list = within(screen.getByRole('region', { name: 'Convites criados' }));
    expect(await list.findByText('Ana, analista')).toBeInTheDocument();
    expect(list.getByText(/Analista · 0 de 5 usos · vale até/)).toBeInTheDocument();
    expect(list.queryByText(shown)).not.toBeInTheDocument(); // a lista nunca recebe o código
    // a consulta da lista pede só as colunas permitidas (nunca o hash)
    const listCall = fake.calls.find((c) => c.table === 'team_invites' && c.op === 'select');
    expect(listCall?.eq).toEqual({ team_id: TEAM_A });
  });

  it('copiar código e copiar link usam a área de transferência', async () => {
    const fake = teamA();
    fake.signInAs(USERS.coach.id);
    const { user } = renderRemote(fake, { path: settings });
    await user.click(within(await form()).getByRole('button', { name: 'Criar convite' }));
    await screen.findByText('Convite criado');
    await user.click(screen.getByRole('button', { name: 'Copiar código' }));
    expect(await screen.findByText('Código copiado.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copiar link' }));
    expect(await screen.findByText('Link copiado.')).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toContain('/?convite=');
  });

  it('convite de comissão técnica traz um aviso claro antes de criar', async () => {
    const fake = teamA();
    fake.signInAs(USERS.coach.id);
    const { user } = renderRemote(fake, { path: settings });
    const panel = within(await form());
    expect(panel.queryByText('Convite de comissão técnica')).not.toBeInTheDocument();
    await user.selectOptions(panel.getByLabelText('Papel'), 'coach');
    expect(panel.getByText('Convite de comissão técnica')).toBeInTheDocument();
    expect(panel.getByText(/acesso total à equipe/)).toBeInTheDocument();
  });

  it('dois envios no mesmo instante criam um convite só; falha do servidor aparece e nada é criado', async () => {
    const fake = teamA();
    fake.signInAs(USERS.coach.id);
    const { user } = renderRemote(fake, { path: settings });
    const panel = within(await form());
    const element = screen.getByRole('form', { name: 'Criar convite' });
    act(() => {
      fireEvent.submit(element);
      fireEvent.submit(element);
    });
    await screen.findByText('Convite criado');
    expect(fake.rpcCalls.filter((c) => c.name === 'create_team_invite')).toHaveLength(1);

    fake.rpcFailure = { code: '42501', message: 'permission denied', details: '', hint: '' };
    await user.click(panel.getByRole('button', { name: 'Criar convite' }));
    expect(await screen.findByText(/Não foi possível criar o convite/)).toBeInTheDocument();
    expect(fake.rows('team_invites')).toHaveLength(1);
  });

  it('rótulo longo demais é recusado antes de chamar o servidor', async () => {
    const fake = teamA();
    fake.signInAs(USERS.coach.id);
    const { user } = renderRemote(fake, { path: settings });
    const panel = within(await form());
    fireEvent.change(panel.getByLabelText('Rótulo (opcional)'), { target: { value: 'x'.repeat(61) } });
    await user.click(panel.getByRole('button', { name: 'Criar convite' }));
    expect(await panel.findByText('Use até 60 caracteres.')).toBeInTheDocument();
    expect(fake.rpcCalls.filter((c) => c.name === 'create_team_invite')).toHaveLength(0);
  });

  it('revogar muda a situação na lista e o convite deixa de funcionar', async () => {
    const fake = teamA();
    seedInvite(fake, TEAM_A, { label: 'Bia', max_uses: 3 });
    fake.signInAs(USERS.coach.id);
    const { user } = renderRemote(fake, { path: settings });
    const list = within(await screen.findByRole('region', { name: 'Convites criados' }));
    expect(await list.findByText(/Analista · 0 de 3 usos · vale até/)).toBeInTheDocument();
    await user.click(list.getByRole('button', { name: 'Revogar convite Bia' }));
    expect(await list.findByText(/Analista · 0 de 3 usos · Revogado/)).toBeInTheDocument();
    expect(list.queryByRole('button', { name: 'Revogar convite Bia' })).not.toBeInTheDocument();
    expect(fake.rows('team_invites')[0]?.revoked_at).not.toBeNull();
  });

  it('lista vazia diz que ainda não há convites', async () => {
    const fake = teamA();
    fake.signInAs(USERS.coach.id);
    renderRemote(fake, { path: settings });
    expect(await screen.findByText('Nenhum convite criado ainda.')).toBeInTheDocument();
  });

  it('"Entrar em outra equipe": qualquer papel usa um código e passa para a outra equipe', async () => {
    const fake = newFake();
    seedTeam(fake, TEAM_A, 'Equipe A', { viewer: 'viewer' });
    seedTeam(fake, TEAM_B, 'Equipe B', { coach: 'coach' });
    seedInvite(fake, TEAM_B, { role: 'analyst' });
    fake.signInAs(USERS.viewer.id);
    const { user } = renderRemote(fake, { path: settings });
    const joinForm = within(await screen.findByRole('form', { name: 'Entrar em outra equipe com convite' }));
    await user.type(joinForm.getByLabelText('Código do convite'), CODE);
    await user.click(joinForm.getByRole('button', { name: 'Entrar na equipe' }));
    await waitFor(() => expect(fake.rows('team_members', TEAM_B).find((m) => m.user_id === USERS.viewer.id)).toMatchObject({ role: 'analyst' }));
    expect((await screen.findAllByText('Equipe B')).length).toBeGreaterThan(0);
  });
});
