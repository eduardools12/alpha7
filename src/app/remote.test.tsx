/**
 * Interface com o backend Supabase e os papéis da equipe, contra o cliente SIMULADO. A interface esconde ou
 * desabilita o que o banco recusaria; a recusa de verdade vem da RLS (provada em supabase/tests/rls.test.sql).
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AccessProvider } from '@/auth/AccessContext';
import { AppRoutes } from '@/app/App';
import { SupabaseGateway } from '@/data/supabase/SupabaseGateway';
import { playerToRow } from '@/data/supabase/mappers';
import { WorkspaceProvider, useWorkspace } from '@/data/WorkspaceProvider';
import { createUniformAttributes } from '@/domain/attributes';
import { makeEvaluation, makeEvent, makeExercise, makePlayer, makeTraining } from '@/test/factories';
import { renderRemote } from '@/test/renderRemote';
import { TEAM_A, USERS, gatewayFor, newFake, seedTeam, seedWorkspace } from '@/test/remoteFixtures';

function seeded() {
  const fake = newFake();
  seedTeam(fake, TEAM_A, 'Equipe A', { coach: 'coach', analyst: 'analyst', viewer: 'viewer' });
  seedWorkspace(fake, TEAM_A, {
    players: [makePlayer({ id: 'p1', name: 'Ana Alves', jerseyNumber: 1 }), makePlayer({ id: 'p2', name: 'Bia Borges', jerseyNumber: 2 })],
    evaluations: [makeEvaluation('p1', '2026-09-01', createUniformAttributes(70))],
    trainings: [makeTraining({ id: 't1', name: 'Treino A', participantIds: ['p1', 'p2'] })],
    exercises: [makeExercise('t1', { id: 'x1', name: 'Saque', order: 0 })],
    trainingEvents: [makeEvent('t1', 'x1', 'p1', 'saque', 'ace', { id: 'e1', attemptKey: 'k1' })],
  });
  return fake;
}

const as = (fake: ReturnType<typeof newFake>, who: keyof typeof USERS) => fake.signInAs(USERS[who].id);

describe('Papéis na interface: coach', () => {
  it('vê todas as ações de escrita', async () => {
    const fake = seeded();
    as(fake, 'coach');
    renderRemote(fake, { path: '/elenco' });
    expect(await screen.findByRole('link', { name: 'Adicionar jogador' })).toBeInTheDocument();
    expect(screen.queryByText('Acesso somente leitura')).not.toBeInTheDocument();
  });

  it('na lista de treinos tem criar, registrar, editar e excluir', async () => {
    const fake = seeded();
    as(fake, 'coach');
    renderRemote(fake, { path: '/treinos' });
    expect(await screen.findByRole('link', { name: 'Novo treino' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Editar Treino A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir Treino A' })).toBeInTheDocument();
  });
});

describe('Papéis na interface: analyst', () => {
  it('registra e cria treinos, mas não cadastra atleta nem exclui treino', async () => {
    const fake = seeded();
    as(fake, 'analyst');
    renderRemote(fake, { path: '/treinos' });
    expect(await screen.findByRole('link', { name: 'Novo treino' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Editar Treino A' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir Treino A' })).not.toBeInTheDocument();
  });

  it('o perfil do atleta oferece avaliar, mas não editar o cadastro', async () => {
    const fake = seeded();
    as(fake, 'analyst');
    renderRemote(fake, { path: '/elenco/p1' });
    expect(await screen.findByRole('link', { name: 'Registrar avaliação' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Editar perfil' })).not.toBeInTheDocument();
  });

  it('abrir o cadastro de atleta pelo endereço é barrado com explicação', async () => {
    const fake = seeded();
    as(fake, 'analyst');
    renderRemote(fake, { path: '/elenco/novo' });
    expect(await screen.findByText('Seu papel não permite esta ação')).toBeInTheDocument();
    expect(screen.getByText(/cadastrar ou editar atletas/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Nome completo')).not.toBeInTheDocument();
  });

  it('pode abrir o formulário de treino e o registro rápido', async () => {
    const fake = seeded();
    as(fake, 'analyst');
    renderRemote(fake, { path: '/treinos/novo' });
    expect(await screen.findByLabelText(/Nome do treino/)).toBeInTheDocument();
  });
});

describe('Papéis na interface: viewer (somente leitura)', () => {
  it('mostra o aviso de leitura e consulta os dados', async () => {
    const fake = seeded();
    as(fake, 'viewer');
    renderRemote(fake, { path: '/elenco' });
    expect(await screen.findByRole('link', { name: /Ana A\./ })).toBeInTheDocument();
    expect(screen.getByText('Acesso somente leitura')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Adicionar jogador' })).not.toBeInTheDocument();
  });

  it('não vê criar, registrar, editar nem excluir em treinos', async () => {
    const fake = seeded();
    as(fake, 'viewer');
    renderRemote(fake, { path: '/treinos' });
    expect(await screen.findByText('Treino A')).toBeInTheDocument();
    for (const name of ['Novo treino', 'Registrar', 'Editar Treino A']) expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir Treino A' })).not.toBeInTheDocument();
  });

  it.each([
    ['/elenco/novo', /cadastrar ou editar atletas/],
    ['/elenco/p1/editar', /cadastrar ou editar atletas/],
    ['/elenco/p1/avaliar', /registrar avaliações/],
    ['/escalacoes/nova', /escalações/],
    ['/treinos/novo', /criar ou editar treinos/],
    ['/treinos/t1/editar', /criar ou editar treinos/],
    ['/treinos/t1/registrar', /registrar ou desfazer tentativas/],
  ])('abrir %s pelo endereço é barrado', async (path, reason) => {
    const fake = seeded();
    as(fake, 'viewer');
    renderRemote(fake, { path });
    expect(await screen.findByText('Seu papel não permite esta ação')).toBeInTheDocument();
    expect(screen.getByText(reason)).toBeInTheDocument();
  });

  it('em Configurações vê os pesos, mas não pode salvá-los', async () => {
    const fake = seeded();
    as(fake, 'viewer');
    renderRemote(fake, { path: '/configuracoes' });
    expect(await screen.findByText(/só a comissão técnica pode alterá-los/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar pesos' })).toBeDisabled();
    expect(screen.getByText('Somente leitura')).toBeInTheDocument(); // papel na tela de conta
  });

  it('o resumo do treino não oferece concluir nem excluir', async () => {
    const fake = seeded();
    as(fake, 'viewer');
    renderRemote(fake, { path: '/treinos/t1' });
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Concluir treino|Reabrir treino/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir treino' })).not.toBeInTheDocument();
  });

  it('nenhuma gravação é enviada ao servidor durante a navegação de leitura', async () => {
    const fake = seeded();
    as(fake, 'viewer');
    renderRemote(fake, { path: '/elenco' });
    await screen.findByRole('link', { name: /Ana A\./ });
    expect(fake.calls.filter((c) => c.op !== 'select')).toEqual([]);
  });
});

describe('Defesa em profundidade: a interface não é a única proteção', () => {
  /** Chama uma ação de escrita diretamente, como faria uma tela com um botão que escapou do controle de papéis. */
  function Probe({ run }: { run: (actions: ReturnType<typeof useWorkspace>['actions']) => Promise<unknown> }) {
    const { actions, status } = useWorkspace();
    const [message, setMessage] = useState('');
    return (
      <div>
        <span>estado:{status}</span>
        <button onClick={() => run(actions).then(() => setMessage('ok'), (error: Error) => setMessage(error.message))}>executar</button>
        <p>{message}</p>
      </div>
    );
  }
  const draft = { name: 'Nova Atleta', jerseyNumber: 7, primaryPosition: 'central', secondaryPosition: null, status: 'ativo', uniform: 'purple', coachNotes: '' } as const;

  it('o provedor recusa a escrita do viewer antes de falar com o servidor', async () => {
    const fake = seeded();
    const gateway = gatewayFor(fake, 'viewer');
    const user = userEvent.setup();
    render(
      <AccessProvider role="viewer">
        <WorkspaceProvider gateway={gateway}>
          <Probe run={(a) => a.createPlayer(draft)} />
        </WorkspaceProvider>
      </AccessProvider>,
    );
    await screen.findByText('estado:ready');
    await user.click(screen.getByRole('button', { name: 'executar' }));
    expect(await screen.findByText('Seu papel (Somente leitura) não permite cadastrar ou editar atletas.')).toBeInTheDocument();
    expect(fake.calls.filter((c) => c.op !== 'select')).toEqual([]);
  });

  it('se a interface achar que a pessoa pode e o banco recusar, a recusa chega à tela e nada é gravado', async () => {
    const fake = seeded();
    const gateway = gatewayFor(fake, 'viewer'); // no banco é leitor...
    const user = userEvent.setup();
    render(
      <AccessProvider role="coach">
        {/* ...mas a interface foi enganada e acredita que é coach */}
        <WorkspaceProvider gateway={gateway}>
          <Probe run={(a) => a.createPlayer(draft)} />
        </WorkspaceProvider>
      </AccessProvider>,
    );
    await screen.findByText('estado:ready');
    await user.click(screen.getByRole('button', { name: 'executar' }));
    expect(await screen.findByText('Seu papel na equipe não permite esta ação.')).toBeInTheDocument();
    expect(fake.rows('players', TEAM_A)).toHaveLength(2);
  });

  it('desfazer registro sem permissão no banco avisa em vez de fingir que desfez', async () => {
    const fake = seeded();
    const gateway = gatewayFor(fake, 'viewer');
    const user = userEvent.setup();
    render(
      <AccessProvider role="coach">
        <WorkspaceProvider gateway={gateway}>
          <Probe run={(a) => a.undoTrainingEvent('e1')} />
        </WorkspaceProvider>
      </AccessProvider>,
    );
    await screen.findByText('estado:ready');
    await user.click(screen.getByRole('button', { name: 'executar' }));
    expect(await screen.findByText(/não permite desfazer/)).toBeInTheDocument();
    expect(fake.rows('training_events', TEAM_A)[0]?.voided_at ?? null).toBeNull();
  });
});

describe('Dados remotos: falhas e ausência de demonstração', () => {
  function mount(gateway: SupabaseGateway) {
    const user = userEvent.setup();
    render(
      <WorkspaceProvider gateway={gateway}>
        <MemoryRouter initialEntries={['/elenco']}>
          <AppRoutes />
        </MemoryRouter>
      </WorkspaceProvider>,
    );
    return user;
  }

  it('servidor fora do ar: erro explícito, sem criar demonstração, e tentar de novo funciona', async () => {
    const fake = seeded();
    const gateway = gatewayFor(fake, 'coach');
    fake.offline = true;
    const user = mount(gateway);
    expect(await screen.findByText('Não foi possível abrir os dados')).toBeInTheDocument();
    expect(screen.getByText(/Sem conexão com o servidor/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Como você quer começar?' })).not.toBeInTheDocument();
    expect(screen.queryByText('Dados de demonstração')).not.toBeInTheDocument();
    fake.offline = false;
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('link', { name: /Ana A\./ })).toBeInTheDocument();
  });

  it('sessão vencida ao carregar: mensagem própria e nada de demonstração', async () => {
    const fake = seeded();
    const gateway = gatewayFor(fake, 'coach');
    fake.expired = true;
    mount(gateway);
    expect(await screen.findByText(/Sua sessão expirou/)).toBeInTheDocument();
    expect(screen.queryByText('Dados de demonstração')).not.toBeInTheDocument();
  });

  it('equipe sem dados abre vazia, e vazia não é demonstração', async () => {
    const fake = newFake();
    seedTeam(fake, TEAM_A, 'Equipe A', { coach: 'coach' });
    const gateway = gatewayFor(fake, 'coach');
    mount(gateway);
    expect(await screen.findByText('O elenco está vazio')).toBeInTheDocument();
    expect(screen.queryByText('Dados de demonstração')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Como você quer começar?' })).not.toBeInTheDocument();
  });

  it('as ações de substituir o workspace dizem que não existem na nuvem e não alteram nada', async () => {
    const fake = seeded();
    const gateway = gatewayFor(fake, 'coach');
    const before = structuredClone(fake.db);
    const user = userEvent.setup();
    render(
      <WorkspaceProvider gateway={gateway}>
        <Probe2 />
      </WorkspaceProvider>,
    );
    await screen.findByText('estado:ready');
    await user.click(screen.getByRole('button', { name: 'demo' }));
    expect(await screen.findByText(/não está disponível com os dados na nuvem/)).toBeInTheDocument();
    expect(fake.db).toEqual(before);
  });
});

function Probe2() {
  const { actions, status } = useWorkspace();
  const [message, setMessage] = useState('');
  return (
    <div>
      <span>estado:{status}</span>
      <button onClick={() => actions.restoreDemo().then(() => setMessage('ok'), (error: Error) => setMessage(error.message))}>demo</button>
      <p>{message}</p>
    </div>
  );
}

describe('Interface com dados na nuvem', () => {
  it('Configurações: sem demonstração/apagar tudo/importar, com conta e papel', async () => {
    const fake = seeded();
    as(fake, 'coach');
    renderRemote(fake, { path: '/configuracoes' });
    expect(await screen.findByRole('heading', { level: 2, name: 'Conta e equipe' })).toBeInTheDocument();
    expect(screen.getByText(USERS.coach.email)).toBeInTheDocument();
    expect(screen.getByText('Seu papel').parentElement).toHaveTextContent('Comissão técnica');
    expect(screen.queryByRole('button', { name: 'Restaurar dados de demonstração' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apagar todos os dados' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Arquivo de backup (.json)')).not.toBeInTheDocument();
    expect(screen.getByText('Indisponível com os dados na nuvem')).toBeInTheDocument();
    expect(screen.getByText('Restaurar backup não está disponível com os dados na nuvem')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar backup' })).toBeInTheDocument();
  });

  it('não mostra o aviso de armazenamento do navegador (só faz sentido no modo local)', async () => {
    const fake = seeded();
    as(fake, 'coach');
    renderRemote(fake, { path: '/elenco' });
    await screen.findByRole('link', { name: /Ana A\./ });
    expect(screen.queryByText('Armazenamento do navegador indisponível')).not.toBeInTheDocument();
    expect(screen.getAllByText(/dados na nuvem/).length).toBeGreaterThan(0);
  });

  it('cadastrar atleta grava na equipe, com id próprio, e continua lá depois de reabrir', async () => {
    const fake = seeded();
    as(fake, 'coach');
    const first = renderRemote(fake, { path: '/elenco/novo' });
    await first.user.type(await screen.findByLabelText('Nome completo'), 'Rui Teixeira');
    await first.user.type(screen.getByLabelText('Número da camisa'), '40');
    await first.user.selectOptions(screen.getByLabelText('Posição principal'), 'oposto');
    await first.user.click(screen.getByRole('button', { name: 'Cadastrar atleta' }));
    expect(await screen.findByText('Atleta cadastrado.')).toBeInTheDocument();

    const rows = fake.rows('players', TEAM_A);
    expect(rows).toHaveLength(3);
    const created = rows.find((r) => r.name === 'Rui Teixeira');
    expect(created).toMatchObject({ team_id: TEAM_A, jersey_number: 40, primary_position: 'oposto', demo: false });
    expect(String(created?.id)).toMatch(/^player_/);

    first.unmount();
    renderRemote(fake, { path: '/elenco' });
    expect(await screen.findByRole('link', { name: /Rui T\./ })).toBeInTheDocument();
  });

  it('o formulário barra camisa repetida com a regra do domínio, sem falar com o servidor', async () => {
    const fake = seeded();
    as(fake, 'coach');
    const { user } = renderRemote(fake, { path: '/elenco/novo' });
    await user.type(await screen.findByLabelText('Nome completo'), 'Rui Teixeira');
    await user.type(screen.getByLabelText('Número da camisa'), '1');
    await user.selectOptions(screen.getByLabelText('Posição principal'), 'oposto');
    await user.click(screen.getByRole('button', { name: 'Cadastrar atleta' }));
    await waitFor(() => expect(screen.getAllByText(/Ana A|Ana Alves|já está em uso|pertence/).length).toBeGreaterThan(0));
    expect(fake.rows('players', TEAM_A)).toHaveLength(2);
    expect(fake.calls.filter((c) => c.op !== 'select')).toEqual([]);
  });

  it('dado desatualizado: se outra pessoa já usou a camisa, o banco recusa e a tela explica', async () => {
    const fake = seeded();
    as(fake, 'coach');
    const { user } = renderRemote(fake, { path: '/elenco/novo' });
    const name = await screen.findByLabelText('Nome completo');
    // depois que a tela carregou, outra pessoa cadastra a camisa 40 (a tela ainda não sabe)
    fake.seed('players', [{ ...playerToRow(TEAM_A, makePlayer({ id: 'p-outra-aba', name: 'Dani Dias', jerseyNumber: 40 })) }]);
    await user.type(name, 'Rui Teixeira');
    await user.type(screen.getByLabelText('Número da camisa'), '40');
    await user.selectOptions(screen.getByLabelText('Posição principal'), 'oposto');
    await user.click(screen.getByRole('button', { name: 'Cadastrar atleta' }));
    expect(await screen.findByText(/número de camisa já está em uso/)).toBeInTheDocument();
    expect(fake.rows('players', TEAM_A).filter((r) => r.name === 'Rui Teixeira')).toHaveLength(0);
  });

  it('exportar backup funciona com os dados da nuvem (somente leitura sobre o que está no servidor)', async () => {
    const downloads: string[] = [];
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = vi.fn(() => 'blob:teste');
    (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
    const fake = seeded();
    as(fake, 'viewer');
    const { user } = renderRemote(fake, { path: '/configuracoes' });
    await user.click(await screen.findByRole('button', { name: 'Exportar backup' }));
    expect(await screen.findByText(/Backup exportado: alpha7-backup-/)).toBeInTheDocument();
    expect(downloads[0]).toMatch(/^alpha7-backup-.*\.json$/);
    expect(fake.calls.filter((c) => c.op !== 'select')).toEqual([]); // exportar não grava nada no servidor
    vi.restoreAllMocks();
  });
});

describe('Registro com os dados na nuvem e sem conexão', () => {
  const setOnline = (value: boolean) => {
    Object.defineProperty(navigator, 'onLine', { value, configurable: true });
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
  };
  afterEach(() => Reflect.deleteProperty(navigator, 'onLine'));

  it('avisa que nada será gravado enquanto estiver sem rede, trava os botões e some quando a conexão volta', async () => {
    const fake = seeded();
    as(fake, 'coach');
    const { user } = renderRemote(fake, { path: '/treinos/t1/registrar' });
    await screen.findByRole('heading', { level: 1, name: 'Registrar treino' });
    await user.click(screen.getByRole('button', { name: /Ana A., camisa 1/ }));
    expect(screen.queryByText('Sem conexão com a nuvem')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Ace,/ })).toBeEnabled();

    act(() => setOnline(false));
    expect(await screen.findByText('Sem conexão com a nuvem')).toBeInTheDocument();
    expect(screen.getByText(/nada fica guardado no aparelho para enviar depois/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Ace,/ })).toBeDisabled();
    expect(fake.calls.filter((c) => c.op !== 'select')).toEqual([]); // nenhuma gravação foi tentada

    act(() => setOnline(true));
    await waitFor(() => expect(screen.queryByText('Sem conexão com a nuvem')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^Ace,/ })).toBeEnabled();
  });
});

describe('Backup em arquivo com os dados na nuvem', () => {
  const stubDownload = () => {
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = vi.fn(() => 'blob:teste');
    (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  };

  it('lembra de exportar uma cópia, com o texto da nuvem, e o lembrete some depois de exportar', async () => {
    localStorage.clear();
    stubDownload();
    const fake = seeded();
    as(fake, 'coach');
    const { user } = renderRemote(fake, { path: '/configuracoes' });
    expect(await screen.findByText('Faça um backup dos dados da equipe')).toBeInTheDocument();
    expect(screen.getByText(/ficam no servidor e você ainda não exportou nenhuma cópia em arquivo/)).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Exportar backup' }));
    expect(await screen.findByText(/Backup exportado: alpha7-backup-/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Faça um backup dos dados da equipe')).not.toBeInTheDocument());
    vi.restoreAllMocks();
  });

  it('a marca de último backup é por equipe e nunca usa a do modo local', async () => {
    localStorage.clear();
    stubDownload();
    const fake = seeded();
    as(fake, 'coach');
    const { user } = renderRemote(fake, { path: '/configuracoes' });
    await user.click(await screen.findByRole('button', { name: 'Exportar backup' }));
    await screen.findByText(/Backup exportado: alpha7-backup-/);
    expect(localStorage.getItem('alpha7.lastBackup.v1')).toBeNull();
    expect(localStorage.getItem(`alpha7.lastBackup.v1.remote.${TEAM_A}`)).not.toBeNull();
    vi.restoreAllMocks();
  });

  it('um backup do modo local não faz o lembrete da nuvem sumir', async () => {
    localStorage.clear();
    localStorage.setItem('alpha7.lastBackup.v1', JSON.stringify({ at: new Date().toISOString(), fingerprint: 'x', filename: 'local.json' }));
    const fake = seeded();
    as(fake, 'coach');
    renderRemote(fake, { path: '/configuracoes' });
    expect(await screen.findByText('Faça um backup dos dados da equipe')).toBeInTheDocument();
  });

  it('explica que o arquivo guarda só a referência das fotos', async () => {
    const fake = seeded();
    as(fake, 'coach');
    renderRemote(fake, { path: '/configuracoes' });
    expect(await screen.findByText('Esta é a cópia que fica fora do servidor')).toBeInTheDocument();
    expect(screen.getByText(/guarda só a referência de cada foto, não a imagem/)).toBeInTheDocument();
  });
});
