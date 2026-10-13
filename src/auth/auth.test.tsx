/**
 * Autenticação e acesso à equipe, com o cliente SIMULADO (src/test/fakeSupabase.ts): sem rede, sem contas reais,
 * sem escrever em ambiente nenhum. Provam o comportamento do aplicativo; as políticas RLS reais são provadas
 * por supabase/tests/rls.test.sql.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BackendRoot } from '@/app/BackendRoot';
import { AppRoutes } from '@/app/App';
import { makePlayer } from '@/test/factories';
import { SUPABASE_CONFIG, renderRemote } from '@/test/renderRemote';
import { TEAM_A, TEAM_B, USERS, newFake, seedTeam, seedWorkspace } from '@/test/remoteFixtures';

const dashboard = () => screen.findByRole('heading', { level: 1, name: 'Alpha7 Performance' });
const loginHeading = () => screen.findByRole('heading', { level: 2, name: 'Entrar' });

async function fillLogin(user: ReturnType<typeof renderRemote>['user'], email: string, password: string) {
  await user.type(screen.getByLabelText('E-mail'), email);
  await user.type(screen.getByLabelText('Senha'), password);
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
}

function teamWithCoach() {
  const fake = newFake();
  seedTeam(fake, TEAM_A, 'Equipe A', { coach: 'coach' });
  seedWorkspace(fake, TEAM_A, { players: [makePlayer({ id: 'p1', name: 'Ana Alves', jerseyNumber: 1 })] });
  return fake;
}

describe('Login por e-mail e senha', () => {
  it('sem sessão mostra o login e nada do aplicativo; não existe cadastro público', async () => {
    renderRemote(teamWithCoach());
    await loginHeading();
    expect(screen.queryByRole('navigation', { name: 'Principal' })).not.toBeInTheDocument();
    expect(screen.queryByText(/criar conta|cadastre-se|cadastrar-se/i)).not.toBeInTheDocument();
    expect(screen.getByText(/acesso é por convite/i)).toBeInTheDocument();
  });

  it('valida os campos antes de enviar, com foco no primeiro erro e sem chamar o servidor', async () => {
    const fake = teamWithCoach();
    const signIn = vi.spyOn(fake.auth, 'signInWithPassword');
    const { user } = renderRemote(fake);
    await loginHeading();
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('Informe um e-mail válido.')).toBeInTheDocument();
    expect(screen.getByText('Informe a senha.')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toHaveFocus();
    await user.type(screen.getByLabelText('E-mail'), 'isso-nao-e-email');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('Informe um e-mail válido.')).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('credenciais incorretas: mensagem clara, continua no login e não abre nada', async () => {
    const { user } = renderRemote(teamWithCoach());
    await loginHeading();
    await fillLogin(user, USERS.coach.email, 'senha-errada');
    expect(await screen.findByText('E-mail ou senha incorretos.')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Principal' })).not.toBeInTheDocument();
  });

  it('a mensagem de erro é a mesma para e-mail que não existe (não revela quem tem conta)', async () => {
    const { user } = renderRemote(teamWithCoach());
    await loginHeading();
    await fillLogin(user, 'ninguem@t.test', 'qualquer-senha');
    expect(await screen.findByText('E-mail ou senha incorretos.')).toBeInTheDocument();
  });

  it('login válido abre a equipe sozinho, no mesmo endereço pedido', async () => {
    const { user } = renderRemote(teamWithCoach(), { path: '/elenco' });
    await loginHeading();
    await fillLogin(user, USERS.coach.email, USERS.coach.password);
    expect(await screen.findByRole('link', { name: /Ana A\./ })).toBeInTheDocument();
    expect(screen.getAllByText('Equipe A').length).toBeGreaterThan(0);
  });

  it('mostra o carregamento enquanto entra e não permite enviar duas vezes', async () => {
    const fake = teamWithCoach();
    const signIn = vi.spyOn(fake.auth, 'signInWithPassword');
    const { user } = renderRemote(fake);
    await loginHeading();
    await user.type(screen.getByLabelText('E-mail'), USERS.coach.email);
    await user.type(screen.getByLabelText('Senha'), USERS.coach.password);
    await user.dblClick(screen.getByRole('button', { name: 'Entrar' }));
    await dashboard();
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it('sem conexão: mensagem própria, sem confundir com senha errada', async () => {
    const fake = teamWithCoach();
    fake.offline = true;
    const { user } = renderRemote(fake);
    await loginHeading();
    await fillLogin(user, USERS.coach.email, USERS.coach.password);
    expect(await screen.findByText(/Sem conexão com o servidor/)).toBeInTheDocument();
    expect(screen.queryByText('E-mail ou senha incorretos.')).not.toBeInTheDocument();
  });

  it('muitas tentativas: avisa para aguardar', async () => {
    const fake = teamWithCoach();
    fake.authFailure = { message: 'Request rate limit reached', status: 429, code: 'over_request_rate_limit' };
    const { user } = renderRemote(fake);
    await loginHeading();
    await fillLogin(user, USERS.coach.email, 'x');
    expect(await screen.findByText(/Muitas tentativas/)).toBeInTheDocument();
  });
});

describe('Sessão', () => {
  it('uma sessão já guardada abre direto, sem passar pelo login', async () => {
    const fake = teamWithCoach();
    fake.signInAs(USERS.coach.id);
    renderRemote(fake);
    await dashboard();
    expect(screen.queryByRole('heading', { name: 'Entrar' })).not.toBeInTheDocument();
  });

  it('sair volta ao login e nenhum dado da equipe continua na tela', async () => {
    const fake = teamWithCoach();
    fake.signInAs(USERS.coach.id);
    const { user } = renderRemote(fake, { path: '/elenco' });
    expect(await screen.findByRole('link', { name: /Ana A\./ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sair' }));
    await loginHeading();
    expect(fake.signOutCalls).toBe(1);
    expect(screen.queryByText(/Ana A\./)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('Equipe A');
  });

  it('sessão expirada: volta ao login, explica e limpa os dados da tela', async () => {
    const fake = teamWithCoach();
    fake.signInAs(USERS.coach.id);
    renderRemote(fake, { path: '/elenco' });
    expect(await screen.findByRole('link', { name: /Ana A\./ })).toBeInTheDocument();
    act(() => fake.expireSession());
    await loginHeading();
    expect(screen.getByText('Sua sessão expirou')).toBeInTheDocument();
    expect(screen.queryByText(/Ana A\./)).not.toBeInTheDocument();
  });

  it('sair por vontade própria NÃO mostra o aviso de sessão expirada', async () => {
    const fake = teamWithCoach();
    fake.signInAs(USERS.coach.id);
    const { user } = renderRemote(fake);
    await dashboard();
    await user.click(screen.getByRole('button', { name: 'Sair' }));
    await loginHeading();
    expect(screen.queryByText('Sua sessão expirou')).not.toBeInTheDocument();
  });

  it('depois de entrar de novo, outra pessoa não vê nada da anterior', async () => {
    const fake = teamWithCoach();
    seedTeam(fake, TEAM_B, 'Equipe B', { viewer: 'viewer' });
    seedWorkspace(fake, TEAM_B, { players: [makePlayer({ id: 'pb', name: 'Bruna Barros', jerseyNumber: 5 })] });
    fake.signInAs(USERS.coach.id);
    const { user } = renderRemote(fake, { path: '/elenco' });
    expect(await screen.findByRole('link', { name: /Ana A\./ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sair' }));
    await loginHeading();
    await fillLogin(user, USERS.viewer.email, USERS.viewer.password);
    expect(await screen.findByRole('link', { name: /Bruna B\./ })).toBeInTheDocument();
    expect(screen.queryByText(/Ana A\./)).not.toBeInTheDocument();
  });
});

describe('Recuperação de senha', () => {
  it('pede o e-mail, envia o link para o endereço do app e responde igual exista a conta ou não', async () => {
    const fake = teamWithCoach();
    const { user } = renderRemote(fake);
    await loginHeading();
    await user.click(screen.getByRole('button', { name: 'Esqueci minha senha' }));
    await user.type(screen.getByLabelText('E-mail'), 'ninguem@t.test');
    await user.click(screen.getByRole('button', { name: 'Enviar link de redefinição' }));
    expect(await screen.findByText('Verifique seu e-mail')).toBeInTheDocument();
    expect(screen.getByText(/mesmo navegador/)).toBeInTheDocument();
    expect(fake.passwordResets).toEqual([{ email: 'ninguem@t.test', redirectTo: `${window.location.origin}/` }]);
  });

  it('valida o e-mail e permite voltar ao login', async () => {
    const fake = teamWithCoach();
    const { user } = renderRemote(fake);
    await loginHeading();
    await user.click(screen.getByRole('button', { name: 'Esqueci minha senha' }));
    await user.click(screen.getByRole('button', { name: 'Enviar link de redefinição' }));
    expect(await screen.findByText('Informe um e-mail válido.')).toBeInTheDocument();
    expect(fake.passwordResets).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Voltar ao login' }));
    await loginHeading();
  });

  it('sem conexão, avisa que o e-mail não foi enviado', async () => {
    const fake = teamWithCoach();
    fake.authFailure = { message: 'Failed to fetch', status: 0, name: 'AuthRetryableFetchError' };
    const { user } = renderRemote(fake);
    await loginHeading();
    await user.click(screen.getByRole('button', { name: 'Esqueci minha senha' }));
    await user.type(screen.getByLabelText('E-mail'), USERS.coach.email);
    await user.click(screen.getByRole('button', { name: 'Enviar link de redefinição' }));
    expect(await screen.findByText(/Sem conexão com o servidor/)).toBeInTheDocument();
    expect(screen.queryByText('Verifique seu e-mail')).not.toBeInTheDocument();
  });

  it('ao abrir o link, a pessoa escolhe a nova senha antes de usar o app', async () => {
    const fake = teamWithCoach();
    const { user } = renderRemote(fake);
    await loginHeading();
    act(() => fake.startRecovery(USERS.coach.id));
    expect(await screen.findByRole('heading', { level: 2, name: 'Escolher nova senha' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Principal' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Nova senha'), 'curta');
    await user.type(screen.getByLabelText('Repita a nova senha'), 'outra-coisa');
    await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
    expect(await screen.findByText(/pelo menos 8 caracteres/)).toBeInTheDocument();
    expect(screen.getByText('As senhas não são iguais.')).toBeInTheDocument();
    expect(fake.updatedPasswords).toHaveLength(0);

    await user.clear(screen.getByLabelText('Nova senha'));
    await user.clear(screen.getByLabelText('Repita a nova senha'));
    await user.type(screen.getByLabelText('Nova senha'), 'nova-senha-de-teste');
    await user.type(screen.getByLabelText('Repita a nova senha'), 'nova-senha-de-teste');
    await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
    await dashboard();
    expect(fake.updatedPasswords).toEqual(['nova-senha-de-teste']);
  });

  it('durante a redefinição, renovar o token não tira a pessoa da tela de nova senha', async () => {
    const fake = teamWithCoach();
    renderRemote(fake);
    await loginHeading();
    act(() => fake.startRecovery(USERS.coach.id));
    await screen.findByRole('heading', { level: 2, name: 'Escolher nova senha' });
    act(() => fake.emit('TOKEN_REFRESHED', fake.session));
    expect(screen.getByRole('heading', { level: 2, name: 'Escolher nova senha' })).toBeInTheDocument();
  });

  it('cancelar a redefinição encerra a sessão temporária', async () => {
    const fake = teamWithCoach();
    const { user } = renderRemote(fake);
    await loginHeading();
    act(() => fake.startRecovery(USERS.coach.id));
    await screen.findByRole('heading', { level: 2, name: 'Escolher nova senha' });
    await user.click(screen.getByRole('button', { name: 'Cancelar e sair' }));
    await loginHeading();
    expect(fake.session).toBeNull();
  });

  it('senha recusada pelo servidor mostra o motivo', async () => {
    const fake = teamWithCoach();
    const { user } = renderRemote(fake);
    await loginHeading();
    act(() => fake.startRecovery(USERS.coach.id));
    await screen.findByRole('heading', { level: 2, name: 'Escolher nova senha' });
    fake.authFailure = { message: 'Password should be at least 6 characters.', status: 422, code: 'weak_password' };
    await user.type(screen.getByLabelText('Nova senha'), 'senha-valida-aqui');
    await user.type(screen.getByLabelText('Repita a nova senha'), 'senha-valida-aqui');
    await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
    expect(await screen.findByText(/não atende aos requisitos/)).toBeInTheDocument();
  });
});

describe('Equipe', () => {
  it('pessoa sem equipe: oferece criar uma, e clique duplo cria só uma (a pessoa vira coach)', async () => {
    const fake = newFake();
    fake.signInAs(USERS.outsider.id);
    const { user } = renderRemote(fake);
    expect(await screen.findByRole('heading', { level: 2, name: 'Criar sua equipe' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Principal' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Nome da equipe'), 'Alpha7 Vôlei');
    await user.dblClick(screen.getByRole('button', { name: 'Criar equipe' }));
    await dashboard();
    expect(fake.rpcCalls.filter((c) => c.name === 'create_team')).toHaveLength(1);
    expect(fake.rows('teams')).toHaveLength(1);
    expect(fake.rows('team_members')).toEqual([expect.objectContaining({ user_id: USERS.outsider.id, role: 'coach' })]);
    expect(screen.getAllByText('Alpha7 Vôlei').length).toBeGreaterThan(0);
  });

  it('valida o nome da equipe e mostra falhas do servidor', async () => {
    const fake = newFake();
    fake.signInAs(USERS.outsider.id);
    const { user } = renderRemote(fake);
    await screen.findByRole('heading', { level: 2, name: 'Criar sua equipe' });
    await user.click(screen.getByRole('button', { name: 'Criar equipe' }));
    expect(await screen.findByText(/Use de 2 a 80 caracteres/)).toBeInTheDocument();
    expect(fake.rpcCalls).toHaveLength(0);

    await user.type(screen.getByLabelText('Nome da equipe'), 'Equipe Nova');
    fake.rpcFailure = { code: '42501', message: 'permission denied', details: '', hint: '' };
    await user.click(screen.getByRole('button', { name: 'Criar equipe' }));
    expect(await screen.findByText(/papel na equipe não permite/)).toBeInTheDocument();
    expect(fake.rows('teams')).toHaveLength(0);
  });

  it('uma equipe só: abre sozinha, sem tela de escolha', async () => {
    const fake = teamWithCoach();
    fake.signInAs(USERS.coach.id);
    renderRemote(fake);
    await dashboard();
    expect(screen.queryByRole('heading', { name: 'Escolha a equipe' })).not.toBeInTheDocument();
  });

  it('várias equipes: pede a escolha, mostra o papel em cada uma e só abre a escolhida', async () => {
    const fake = teamWithCoach();
    seedTeam(fake, TEAM_B, 'Equipe B', { coach: 'analyst' });
    seedWorkspace(fake, TEAM_B, { players: [makePlayer({ id: 'pb', name: 'Bruna Barros', jerseyNumber: 5 })] });
    fake.signInAs(USERS.coach.id);
    const { user } = renderRemote(fake, { path: '/elenco' });
    expect(await screen.findByRole('heading', { level: 2, name: 'Escolha a equipe' })).toBeInTheDocument();
    expect(screen.queryByText(/Ana A\./)).not.toBeInTheDocument();
    const options = screen.getAllByRole('button').filter((b) => /Equipe [AB]/.test(b.textContent ?? ''));
    expect(options.map((b) => b.textContent)).toEqual(['Equipe AComissão técnica', 'Equipe BAnalista']);

    await user.click(screen.getByRole('button', { name: /Equipe B/ }));
    expect(await screen.findByRole('link', { name: /Bruna B\./ })).toBeInTheDocument();
    expect(screen.queryByText(/Ana A\./)).not.toBeInTheDocument();
  });

  it('trocar de equipe limpa os dados da anterior da tela antes de abrir a outra', async () => {
    const fake = teamWithCoach();
    seedTeam(fake, TEAM_B, 'Equipe B', { coach: 'analyst' });
    seedWorkspace(fake, TEAM_B, { players: [makePlayer({ id: 'pb', name: 'Bruna Barros', jerseyNumber: 5 })] });
    fake.signInAs(USERS.coach.id);
    const { user } = renderRemote(fake, { path: '/elenco' });
    await user.click(await screen.findByRole('button', { name: /Equipe A/ }));
    expect(await screen.findByRole('link', { name: /Ana A\./ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Trocar de equipe' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Escolha a equipe' })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('Ana A.');
    expect(document.body.textContent).not.toContain('Ana Alves');

    await user.click(screen.getByRole('button', { name: /Equipe B/ }));
    expect(await screen.findByRole('link', { name: /Bruna B\./ })).toBeInTheDocument();
    expect(screen.queryByText(/Ana A\./)).not.toBeInTheDocument();
  });

  it('o papel muda entre equipes: coach em uma e analista em outra', async () => {
    const fake = teamWithCoach();
    seedTeam(fake, TEAM_B, 'Equipe B', { coach: 'analyst' });
    fake.signInAs(USERS.coach.id);
    const { user } = renderRemote(fake, { path: '/elenco' });
    await user.click(await screen.findByRole('button', { name: /Equipe A/ }));
    expect(await screen.findByRole('link', { name: 'Adicionar jogador' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Trocar de equipe' }));
    await user.click(await screen.findByRole('button', { name: /Equipe B/ }));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Adicionar jogador' })).not.toBeInTheDocument());
  });

  it('erro ao carregar as equipes: explica e permite tentar de novo', async () => {
    const fake = teamWithCoach();
    fake.signInAs(USERS.coach.id);
    fake.offline = true;
    const { user } = renderRemote(fake);
    expect(await screen.findByRole('heading', { level: 2, name: 'Não foi possível abrir sua equipe' })).toBeInTheDocument();
    expect(screen.getByText(/Sem conexão com o servidor/)).toBeInTheDocument();
    fake.offline = false;
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await dashboard();
  });

  it('membro com papel desconhecido não ganha acesso (menor privilégio)', async () => {
    const fake = newFake();
    fake.seed('teams', [{ id: TEAM_A, name: 'Equipe A', created_at: '2026-01-01T00:00:00.000Z' }]);
    fake.seed('team_members', [{ team_id: TEAM_A, user_id: USERS.coach.id, role: 'admin', created_at: '2026-01-01T00:00:00.000Z' }]);
    fake.signInAs(USERS.coach.id);
    renderRemote(fake);
    expect(await screen.findByRole('heading', { level: 2, name: 'Criar sua equipe' })).toBeInTheDocument();
  });

  it('a pessoa não vê equipes das quais não participa', async () => {
    const fake = teamWithCoach();
    seedTeam(fake, TEAM_B, 'Equipe B', { viewer: 'viewer' });
    fake.signInAs(USERS.coach.id);
    renderRemote(fake, { path: '/elenco' });
    await dashboardOrRoster();
    expect(screen.queryByText('Equipe B')).not.toBeInTheDocument();
  });
});

async function dashboardOrRoster() {
  await screen.findByRole('link', { name: /Ana A\./ });
}

describe('Configuração do backend', () => {
  it('configuração inválida: erro explícito, sem login, sem trocar de backend e sem mexer nos dados locais', () => {
    window.localStorage.setItem('alpha7.workspace.v1', 'DADOS-LOCAIS-INTACTOS');
    render(
      <BackendRoot config={{ kind: 'invalid', problems: ['VITE_DATA_BACKEND deve ser "local" ou "supabase" (valor atual: "xyz").'] }}>
        <MemoryRouter>
          <AppRoutes />
        </MemoryRouter>
      </BackendRoot>,
    );
    expect(screen.getByText('O backend de dados não está configurado corretamente')).toBeInTheDocument();
    expect(screen.getByText(/VITE_DATA_BACKEND deve ser/)).toBeInTheDocument();
    expect(screen.getByText(/não trocou de backend sozinho/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Entrar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Como você quer começar?' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('alpha7.workspace.v1')).toBe('DADOS-LOCAIS-INTACTOS');
  });

  it('backend local (padrão): sem login, e o fluxo de primeira utilização continua o mesmo', async () => {
    render(
      <BackendRoot config={{ kind: 'local' }}>
        <MemoryRouter>
          <AppRoutes />
        </MemoryRouter>
      </BackendRoot>,
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Como você quer começar?' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Entrar' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('alpha7.workspace.v1')).toBeNull(); // nada criado antes da escolha
  });

  it('com o backend remoto, os dados locais não são lidos nem alterados', async () => {
    window.localStorage.setItem('alpha7.workspace.v1', 'DADOS-LOCAIS-INTACTOS');
    const fake = teamWithCoach();
    fake.signInAs(USERS.coach.id);
    renderRemote(fake, { path: '/elenco' });
    await screen.findByRole('link', { name: /Ana A\./ });
    expect(window.localStorage.getItem('alpha7.workspace.v1')).toBe('DADOS-LOCAIS-INTACTOS');
    // e nenhuma tela de "primeira utilização/recuperação" local aparece
    expect(screen.queryByRole('heading', { name: 'Como você quer começar?' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Recuperar os dados da equipe' })).not.toBeInTheDocument();
  });

  it('nenhuma credencial aparece na tela de erro nem no login', async () => {
    const fake = teamWithCoach();
    renderRemote(fake);
    await loginHeading();
    expect(document.body.textContent).not.toContain(SUPABASE_CONFIG.publishableKey);
    expect(within(document.body).queryByText(/service_role/i)).not.toBeInTheDocument();
  });
});

describe('Adicionar pessoas à equipe (função add_team_member do banco)', () => {
  const settings = '/configuracoes';
  const form = () => screen.findByRole('form', { name: 'Adicionar pessoa à equipe' });

  it('só a comissão técnica (coach) vê o formulário', async () => {
    for (const who of ['analyst', 'viewer'] as const) {
      const fake = newFake();
      seedTeam(fake, TEAM_A, 'Equipe A', { coach: 'coach', analyst: 'analyst', viewer: 'viewer' });
      fake.signInAs(USERS[who].id);
      const view = renderRemote(fake, { path: settings });
      await screen.findByRole('heading', { level: 2, name: 'Conta e equipe' });
      expect(screen.queryByRole('form', { name: 'Adicionar pessoa à equipe' })).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('coach adiciona uma pessoa com o papel escolhido, e dois envios no mesmo instante chamam o banco uma vez', async () => {
    const fake = teamWithCoach();
    fake.signInAs(USERS.coach.id);
    const { user } = renderRemote(fake, { path: settings });
    const panel = within(await form());
    await user.type(panel.getByLabelText('E-mail da pessoa'), 'Analista@T.test');
    await user.selectOptions(panel.getByLabelText('Papel'), 'analyst');
    const formElement = screen.getByRole('form', { name: 'Adicionar pessoa à equipe' });
    act(() => {
      fireEvent.submit(formElement);
      fireEvent.submit(formElement);
    });
    expect(await screen.findByText(/agora participa da equipe com o papel "Analista"/)).toBeInTheDocument();
    expect(fake.rpcCalls.filter((c) => c.name === 'add_team_member')).toHaveLength(1);
    expect(fake.rows('team_members', TEAM_A).find((m) => m.user_id === USERS.analyst.id)).toMatchObject({ role: 'analyst' });
    expect(panel.getByLabelText('E-mail da pessoa')).toHaveValue('');
  });

  it('adicionar quem já está na equipe atualiza o papel (sem duplicar)', async () => {
    const fake = newFake();
    seedTeam(fake, TEAM_A, 'Equipe A', { coach: 'coach', viewer: 'viewer' });
    fake.signInAs(USERS.coach.id);
    const { user } = renderRemote(fake, { path: settings });
    const panel = within(await form());
    await user.type(panel.getByLabelText('E-mail da pessoa'), USERS.viewer.email);
    await user.selectOptions(panel.getByLabelText('Papel'), 'analyst');
    await user.click(panel.getByRole('button', { name: 'Adicionar à equipe' }));
    await screen.findByText(/agora participa da equipe/);
    const rows = fake.rows('team_members', TEAM_A).filter((m) => m.user_id === USERS.viewer.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ role: 'analyst' });
  });

  it('e-mail sem conta: explica que a conta precisa ser criada antes; nada é adicionado', async () => {
    const fake = teamWithCoach();
    fake.signInAs(USERS.coach.id);
    const { user } = renderRemote(fake, { path: settings });
    const panel = within(await form());
    await user.type(panel.getByLabelText('E-mail da pessoa'), 'ninguem@t.test');
    await user.click(panel.getByRole('button', { name: 'Adicionar à equipe' }));
    expect(await screen.findByText(/Não existe conta com este e-mail/)).toBeInTheDocument();
    expect(fake.rows('team_members', TEAM_A)).toHaveLength(1);
  });

  it('valida o e-mail antes de chamar o banco', async () => {
    const fake = teamWithCoach();
    fake.signInAs(USERS.coach.id);
    const { user } = renderRemote(fake, { path: settings });
    const panel = within(await form());
    await user.click(panel.getByRole('button', { name: 'Adicionar à equipe' }));
    expect(await panel.findByText('Informe um e-mail válido.')).toBeInTheDocument();
    expect(fake.rpcCalls.filter((c) => c.name === 'add_team_member')).toHaveLength(0);
  });

  it('sem conexão, avisa e não finge que adicionou', async () => {
    const fake = teamWithCoach();
    fake.signInAs(USERS.coach.id);
    const { user } = renderRemote(fake, { path: settings });
    const panel = within(await form());
    await user.type(panel.getByLabelText('E-mail da pessoa'), USERS.analyst.email);
    fake.offline = true;
    await user.click(panel.getByRole('button', { name: 'Adicionar à equipe' }));
    expect(await screen.findByText(/Sem conexão com o servidor/)).toBeInTheDocument();
    expect(screen.queryByText(/agora participa da equipe/)).not.toBeInTheDocument();
  });
});
