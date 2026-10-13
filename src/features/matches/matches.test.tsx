import { screen, waitFor, within } from '@testing-library/react';
import { STORAGE_KEY } from '@/data/localStorageGateway';
import { createEmptyWorkspace } from '@/data/demo';
import type { Workspace } from '@/data/types';
import type { Lineup } from '@/domain/lineup';
import type { Match, MatchSet, Rally, RallyAction } from '@/domain/match';
import { makeMatch, makePlayer } from '@/test/factories';
import { renderApp } from '@/test/renderApp';

type Ctx = ReturnType<typeof renderApp>;

const NOW = '2026-10-01T10:00:00.000Z';
const NAMES: [string, string, 'levantador' | 'oposto' | 'ponteiro' | 'central' | 'libero'][] = [
  ['p1', 'Ana Alves', 'levantador'],
  ['p2', 'Bia Borges', 'oposto'],
  ['p3', 'Cris Costa', 'ponteiro'],
  ['p4', 'Dani Dias', 'central'],
  ['p5', 'Eva Esteves', 'ponteiro'],
  ['p6', 'Fabi Faria', 'central'],
  ['p7', 'Gabi Gomes', 'libero'],
];
const players = NAMES.map(([id, name, primaryPosition], index) => makePlayer({ id, name, jerseyNumber: index + 1, primaryPosition }));
const roles = ['levantador', 'oposto', 'ponteiro', 'central', 'ponteiro', 'central'] as const;
const lineup: Lineup = {
  id: 'l1',
  title: 'Titular',
  opponent: '',
  competition: '',
  scheduledAt: '',
  venue: '',
  formation: '5-1',
  starters: roles.map((role, i) => ({ playerId: `p${i + 1}`, role })),
  liberoId: 'p7',
  benchIds: [],
  createdAt: NOW,
  updatedAt: NOW,
  demo: false,
};
/** Formato curto (melhor de 3, 5 pontos, decisivo de 3) para os testes serem legíveis; a regra é a mesma. */
const SHORT = { bestOf: 3, setPoints: 5, decidingSetPoints: 3, minLead: 2 } as const;
const baseMatch = (overrides: Partial<Match> = {}) => makeMatch({ id: 'm1', opponent: 'Rivais', lineupId: 'l1', format: { ...SHORT }, ...overrides });

const world = (extra: Partial<Workspace> = {}): Workspace => ({ ...createEmptyWorkspace(), players, lineups: [lineup], matches: [baseMatch()], ...extra });

const stored = (ctx: Pick<Ctx, 'storage'>) => JSON.parse(ctx.storage.map.get(STORAGE_KEY) ?? '{}') as Workspace;

async function openLive(workspace: Workspace = world()) {
  const ctx = renderApp({ path: '/partidas/m1/acompanhar', workspace });
  await screen.findByRole('heading', { level: 1, name: 'Alpha7 x Rivais' });
  return ctx;
}

async function startFirstSet(ctx: Ctx) {
  await ctx.user.click(await screen.findByRole('button', { name: 'Iniciar set 1' }));
  await screen.findByRole('region', { name: 'Placar' });
  await screen.findByRole('button', { name: 'Ponto do Alpha7' });
}

/** Espera o toque anterior terminar de gravar e toca no botão. */
async function tap(ctx: Ctx, name: string) {
  const button = screen.getByRole('button', { name });
  await waitFor(() => expect(button).toBeEnabled());
  await ctx.user.click(button);
}

const pointsOf = (side: 'Alpha7' | 'Rivais') => screen.getByLabelText(new RegExp(`^${side}: \\d+ pontos$`)).textContent;

describe('Lista e cadastro de partidas', () => {
  it('sem partidas, convida a cadastrar; cadastrar valida o adversário com foco no erro', async () => {
    const ctx = renderApp({ path: '/partidas', workspace: createEmptyWorkspace() });
    expect(await screen.findByText('Nenhuma partida cadastrada')).toBeInTheDocument();
    await ctx.user.click(screen.getByRole('link', { name: 'Cadastrar a primeira partida' }));
    await ctx.user.click(await screen.findByRole('button', { name: 'Cadastrar partida' }));
    expect(await screen.findByText('Informe o adversário (mínimo de 2 letras).')).toBeInTheDocument();
    expect(screen.getByLabelText('Adversário')).toHaveFocus();
    expect(stored(ctx).matches ?? []).toHaveLength(0);

    await ctx.user.type(screen.getByLabelText('Adversário'), 'Time Rival');
    await ctx.user.type(screen.getByLabelText('Campeonato ou amistoso (opcional)'), 'Liga Estadual');
    await ctx.user.click(screen.getByRole('button', { name: 'Cadastrar partida' }));
    expect(await screen.findByText('Partida cadastrada.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Alpha7 x Time Rival' })).toBeInTheDocument();
    expect(screen.getByText(/Sem data definida · Liga Estadual/)).toBeInTheDocument();
    expect(within(screen.getByRole('article')).getByText('Agendada')).toBeInTheDocument();
    expect(stored(ctx).matches).toHaveLength(1);
    expect(stored(ctx).matches[0]).toMatchObject({ opponent: 'Time Rival', status: 'agendada', format: { bestOf: 5, setPoints: 25, decidingSetPoints: 15, minLead: 2 } });
  });

  it('o formato configurável é validado (pontos fora da faixa) e gravado', async () => {
    const ctx = renderApp({ path: '/partidas/nova', workspace: createEmptyWorkspace() });
    await ctx.user.type(await screen.findByLabelText('Adversário'), 'Time Rival');
    await ctx.user.clear(screen.getByLabelText('Pontos de cada set'));
    await ctx.user.type(screen.getByLabelText('Pontos de cada set'), '0');
    await ctx.user.click(screen.getByRole('button', { name: 'Cadastrar partida' }));
    expect(await screen.findByText(/Pontos do set: informe um número inteiro de 1 a 99/)).toBeInTheDocument();
    await ctx.user.clear(screen.getByLabelText('Pontos de cada set'));
    await ctx.user.type(screen.getByLabelText('Pontos de cada set'), '21');
    await ctx.user.selectOptions(screen.getByLabelText('Quantidade de sets'), '3');
    await ctx.user.click(screen.getByRole('button', { name: 'Cadastrar partida' }));
    await screen.findByText('Partida cadastrada.');
    expect(stored(ctx).matches[0]?.format).toMatchObject({ bestOf: 3, setPoints: 21, minLead: 2 });
  });

  it('filtra por situação e por busca, e mostra o resultado das concluídas', async () => {
    const done = baseMatch({ id: 'm2', opponent: 'Já Jogado', status: 'concluida', finalSetsUs: 2, finalSetsThem: 1, concludedAt: NOW });
    const ctx = renderApp({ path: '/partidas', workspace: world({ matches: [baseMatch(), done], lineups: [lineup] }) });
    expect(await screen.findByText('2 partidas')).toBeInTheDocument();
    expect(screen.getByText('Vitória')).toBeInTheDocument();
    await ctx.user.click(screen.getByRole('button', { name: 'Concluída' }));
    expect(screen.getByText('1 partida de 2')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Alpha7 x Rivais' })).not.toBeInTheDocument();
    await ctx.user.click(screen.getByRole('button', { name: 'Todas' }));
    await ctx.user.type(screen.getByLabelText('Buscar adversário, campeonato ou local'), 'riva');
    expect(screen.getByRole('heading', { name: 'Alpha7 x Rivais' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Alpha7 x Já Jogado' })).not.toBeInTheDocument();
    await ctx.user.clear(screen.getByLabelText('Buscar adversário, campeonato ou local'));
    await ctx.user.type(screen.getByLabelText('Buscar adversário, campeonato ou local'), 'nada disso');
    expect(await screen.findByText('Nenhuma partida com esses filtros')).toBeInTheDocument();
    await ctx.user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(screen.getByText('2 partidas')).toBeInTheDocument();
  });

  it('editar mantém os pontos e o formato fica travado depois do primeiro set', async () => {
    const set: MatchSet = { matchId: 'm1', number: 1, firstServer: 'us', starters: roles.map((role, slot) => ({ slot, playerId: `p${slot + 1}`, role })), liberoId: null, createdAt: NOW };
    const ctx = renderApp({ path: '/partidas/m1/editar', workspace: world({ matches: [baseMatch({ status: 'em_andamento' })], matchSets: [set] }) });
    expect(await screen.findByText(/O formato fica travado depois que o primeiro set é iniciado/)).toBeInTheDocument();
    expect(screen.getByLabelText('Quantidade de sets')).toBeDisabled();
    expect(screen.getByLabelText('Pontos de cada set')).toBeDisabled();
    await ctx.user.type(screen.getByLabelText('Local (opcional)'), 'Ginásio Central');
    await ctx.user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText('Partida atualizada. Os pontos registrados foram mantidos.')).toBeInTheDocument();
    expect(stored(ctx).matches[0]).toMatchObject({ venue: 'Ginásio Central', status: 'em_andamento' });
    expect(stored(ctx).matchSets).toHaveLength(1);
  });

  it('excluir pede confirmação com as contagens e leva só os dados da partida', async () => {
    const set: MatchSet = { matchId: 'm1', number: 1, firstServer: 'us', starters: roles.map((role, slot) => ({ slot, playerId: `p${slot + 1}`, role })), liberoId: null, createdAt: NOW };
    const rally: Rally = { id: 'r1', matchId: 'm1', setNumber: 1, seq: 1, servingSide: 'us', winnerSide: 'us', rotation: 0, serverPlayerId: 'p1', reason: null, playerId: null, attemptKey: 'k1', recordedAt: NOW, voidedAt: null };
    const other = baseMatch({ id: 'm2', opponent: 'Outro Time' });
    const ctx = renderApp({ path: '/partidas', workspace: world({ matches: [baseMatch({ status: 'em_andamento' }), other], matchSets: [set], rallies: [rally] }) });
    await ctx.user.click(await screen.findByRole('button', { name: 'Excluir partida contra Rivais' }));
    expect(screen.getByText(/Serão apagados 1 set, 1 pontos e 0 ações técnicas/)).toBeInTheDocument();
    await ctx.user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(stored(ctx).matches).toHaveLength(2);
    await ctx.user.click(screen.getByRole('button', { name: 'Excluir partida contra Rivais' }));
    await ctx.user.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    await waitFor(() => expect(stored(ctx).matches.map((m) => m.id)).toEqual(['m2']));
    expect(stored(ctx).matchSets).toHaveLength(0);
    expect(stored(ctx).rallies).toHaveLength(0);
  });
});

describe('Acompanhamento ao vivo', () => {
  it('inicia o set com a formação da escalação salva e mostra quem saca', async () => {
    const ctx = await openLive();
    expect(screen.getByText('Iniciar o set 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Atleta em P1')).toHaveValue('p1');
    expect(screen.getByLabelText('Atleta em P6')).toHaveValue('p6');
    await startFirstSet(ctx);
    expect(pointsOf('Alpha7')).toBe('0');
    expect(screen.getByText('Saca agora: Ana A. #1.')).toBeInTheDocument();
    expect(stored(ctx).matchSets[0]).toMatchObject({ number: 1, firstServer: 'us', liberoId: 'p7' });
    expect(stored(ctx).matches[0]?.status).toBe('em_andamento');
  });

  it('não deixa iniciar o set sem seis titulares distintos', async () => {
    const ctx = await openLive(world({ lineups: [], matches: [baseMatch({ lineupId: null })] }));
    await ctx.user.click(screen.getByRole('button', { name: 'Iniciar set 1' }));
    expect(await screen.findByText('Escolha um atleta para cada posição de P1 a P6.')).toBeInTheDocument();
    expect(stored(ctx).matchSets ?? []).toHaveLength(0);
  });

  it('um toque registra o ponto; os motivos oferecidos dependem de quem saca', async () => {
    const ctx = await openLive();
    await startFirstSet(ctx);
    // O Alpha7 saca: ace e erro de recepção do adversário fazem sentido; erro de saque do adversário, não.
    const mine = () => within(screen.getByRole('region', { name: 'Ponto do Alpha7' }));
    const theirs = () => within(screen.getByRole('region', { name: 'Ponto do adversário' }));
    expect(mine().getByRole('button', { name: 'Ace' })).toBeInTheDocument();
    expect(mine().getByRole('button', { name: 'Erro de recepção do adversário' })).toBeInTheDocument();
    expect(mine().queryByRole('button', { name: 'Erro de saque do adversário' })).not.toBeInTheDocument();
    expect(theirs().queryByRole('button', { name: 'Ace sofrido' })).not.toBeInTheDocument();

    await ctx.user.click(mine().getByRole('button', { name: 'Ace' }));
    await waitFor(() => expect(pointsOf('Alpha7')).toBe('1'));
    expect(stored(ctx).rallies).toHaveLength(1);
    expect(stored(ctx).rallies[0]).toMatchObject({ winnerSide: 'us', servingSide: 'us', reason: 'ace', rotation: 0, serverPlayerId: 'p1', seq: 1 });

    await tap(ctx, 'Ponto do adversário');
    await waitFor(() => expect(pointsOf('Rivais')).toBe('1'));
    // Agora o adversário saca: ace sofrido e erro de saque do Alpha7 são os motivos possíveis do lado dele.
    expect(screen.getByText('O adversário saca. Se o Alpha7 ganhar o ponto, conquista o saque e gira.')).toBeInTheDocument();
    expect(theirs().getByRole('button', { name: 'Ace sofrido' })).toBeInTheDocument();
    expect(mine().getByRole('button', { name: 'Erro de saque do adversário' })).toBeInTheDocument();
    expect(mine().queryByRole('button', { name: 'Ace' })).not.toBeInTheDocument();
  });

  it('o saque troca de lado, o Alpha7 só gira quando conquista o saque e o sacador acompanha a rotação', async () => {
    const ctx = await openLive();
    await startFirstSet(ctx);
    await tap(ctx, 'Ponto do adversário'); // o adversário ganha: passa a sacar
    await tap(ctx, 'Ponto do Alpha7'); // side-out: o Alpha7 conquista o saque e gira
    await waitFor(() => expect(screen.getByText('Saca agora: Bia B. #2.')).toBeInTheDocument());
    const rallies = stored(ctx).rallies;
    expect(rallies.map((r) => [r.servingSide, r.winnerSide, r.rotation])).toEqual([
      ['us', 'them', 0],
      ['them', 'us', 0],
    ]);
    await tap(ctx, 'Ponto do Alpha7'); // quem saca e ganha mantém a rotação e o sacador
    await waitFor(() => expect(pointsOf('Alpha7')).toBe('2'));
    expect(screen.getByText('Saca agora: Bia B. #2.')).toBeInTheDocument();
    expect(stored(ctx).rallies[2]).toMatchObject({ rotation: 1, serverPlayerId: 'p2' });
  });

  it('o set só fecha com a pontuação E a diferença: 5 a 4 continua, 6 a 4 fecha; depois não aceita pontos', async () => {
    const ctx = await openLive();
    await startFirstSet(ctx);
    for (const name of ['Ponto do Alpha7', 'Ponto do adversário', 'Ponto do Alpha7', 'Ponto do adversário', 'Ponto do Alpha7', 'Ponto do adversário', 'Ponto do Alpha7', 'Ponto do adversário', 'Ponto do Alpha7']) {
      await tap(ctx, name);
    }
    await waitFor(() => expect(pointsOf('Alpha7')).toBe('5'));
    expect(pointsOf('Rivais')).toBe('4');
    expect(screen.queryByText(/Set 1 encerrado/)).not.toBeInTheDocument(); // 5 a 4: falta a diferença
    await tap(ctx, 'Ponto do Alpha7');
    expect(await screen.findByText('Set 1 encerrado: 6 x 4')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ponto do Alpha7' })).not.toBeInTheDocument();
    expect(screen.getByText('Iniciar o set 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Atleta em P1')).toHaveValue('p1'); // repete a formação do set anterior
    expect(within(screen.getByRole('group', { name: /Quem saca primeiro/ })).getByLabelText('Adversário')).toBeChecked(); // alterna
  });

  it('desfazer anula o último ponto, libera o número e reabre o set que tinha fechado', async () => {
    const ctx = await openLive();
    await startFirstSet(ctx);
    for (let i = 0; i < 5; i += 1) await tap(ctx, 'Ponto do Alpha7');
    expect(await screen.findByText('Set 1 encerrado: 5 x 0')).toBeInTheDocument();
    await ctx.user.click(screen.getByRole('button', { name: 'Desfazer último ponto' }));
    await waitFor(() => expect(screen.queryByText(/Set 1 encerrado/)).not.toBeInTheDocument());
    expect(pointsOf('Alpha7')).toBe('4');
    const rallies = stored(ctx).rallies;
    expect(rallies).toHaveLength(5); // o ponto desfeito continua guardado
    expect(rallies.filter((r) => r.voidedAt !== null)).toHaveLength(1);
    await tap(ctx, 'Ponto do adversário');
    await waitFor(() => expect(pointsOf('Rivais')).toBe('1'));
    expect(stored(ctx).rallies.filter((r) => r.voidedAt === null).map((r) => r.seq)).toEqual([1, 2, 3, 4, 5]);
  });

  it('toques repetidos enquanto grava são ignorados: um ponto só', async () => {
    const ctx = renderApp({
      path: '/partidas/m1/acompanhar',
      workspace: world(),
      wrapGateway: (local) => {
        const original = local.recordRally.bind(local);
        local.recordRally = async (matchId, input) => {
          await new Promise((resolve) => setTimeout(resolve, 60));
          return original(matchId, input);
        };
        return local;
      },
    });
    await screen.findByRole('heading', { level: 1, name: 'Alpha7 x Rivais' });
    await startFirstSet(ctx);
    const button = screen.getByRole('button', { name: 'Ponto do Alpha7' });
    await Promise.all([ctx.user.click(button), ctx.user.click(button), ctx.user.click(button)]);
    await waitFor(() => expect(pointsOf('Alpha7')).toBe('1'));
    expect(stored(ctx).rallies).toHaveLength(1);
  });

  it('o atleta envolvido vale só para o próximo ponto', async () => {
    const ctx = await openLive();
    await startFirstSet(ctx);
    const group = screen.getByRole('group', { name: /Atleta envolvido no próximo ponto/ });
    await ctx.user.click(within(group).getByRole('button', { name: 'Bia B. #2' }));
    expect(within(group).getByRole('button', { name: 'Bia B. #2' })).toHaveAttribute('aria-pressed', 'true');
    await tap(ctx, 'Ataque vencedor');
    await waitFor(() => expect(stored(ctx).rallies).toHaveLength(1));
    expect(stored(ctx).rallies[0]).toMatchObject({ reason: 'ataque', playerId: 'p2' });
    expect(within(group).getByRole('button', { name: 'Bia B. #2' })).toHaveAttribute('aria-pressed', 'false');
    await tap(ctx, 'Ponto do Alpha7');
    await waitFor(() => expect(stored(ctx).rallies).toHaveLength(2));
    expect(stored(ctx).rallies[1]?.playerId).toBeNull();
  });

  it('ações técnicas ficam separadas do motivo, são opcionais e podem ser desfeitas', async () => {
    const ctx = await openLive();
    await startFirstSet(ctx);
    await tap(ctx, 'Ace');
    await screen.findByText('Detalhar o último ponto (opcional)');
    await ctx.user.click(screen.getByText('Registrar fundamentos de um atleta neste ponto'));
    await ctx.user.selectOptions(screen.getByLabelText('Atleta'), 'p1');
    await ctx.user.click(within(screen.getByRole('group', { name: 'Resultado do fundamento' })).getByRole('button', { name: 'Ace' }));
    expect(await screen.findByText('Ana A. #1 · Saque: Ace')).toBeInTheDocument();
    expect(stored(ctx).rallyActions).toHaveLength(1);
    expect(stored(ctx).rallyActions[0]).toMatchObject({ fundamental: 'saque', outcome: 'ace', playerId: 'p1', matchId: 'm1' });
    expect(stored(ctx).rallies[0]?.reason).toBe('ace');
    await ctx.user.click(screen.getByRole('button', { name: 'Desfazer ação técnica de Ana A. #1' }));
    await waitFor(() => expect(screen.queryByText('Ana A. #1 · Saque: Ace')).not.toBeInTheDocument());
    expect(stored(ctx).rallyActions[0]?.voidedAt).not.toBeNull();
  });

  it('encerrar a partida pede confirmação, mostra o resultado e bloqueia novos registros', async () => {
    const ctx = await openLive();
    await startFirstSet(ctx);
    for (let i = 0; i < 5; i += 1) await tap(ctx, 'Ponto do Alpha7');
    await screen.findByText('Set 1 encerrado: 5 x 0');
    await ctx.user.click(screen.getByRole('button', { name: 'Encerrar partida' }));
    expect(within(screen.getByRole('alert')).getByText('1 x 0')).toBeInTheDocument();
    expect(screen.getByText(/O formato ainda não decidiu a partida: ela será encerrada antes da hora/)).toBeInTheDocument();
    expect(stored(ctx).matches[0]?.status).toBe('em_andamento'); // nada muda sem confirmar
    await ctx.user.click(screen.getByRole('button', { name: 'Confirmar encerramento' }));
    expect(await screen.findByText('Esta partida está concluída')).toBeInTheDocument();
    expect(stored(ctx).matches[0]).toMatchObject({ status: 'concluida', finalSetsUs: 1, finalSetsThem: 0 });
    expect(screen.queryByRole('button', { name: 'Ponto do Alpha7' })).not.toBeInTheDocument();
    // a comissão técnica (e o modo local) pode reabrir para corrigir
    await ctx.user.click(screen.getByRole('button', { name: 'Reabrir para corrigir' }));
    await waitFor(() => expect(stored(ctx).matches[0]?.status).toBe('em_andamento'));
  });

  it('a falha ao gravar aparece na tela e nada muda no placar', async () => {
    const ctx = renderApp({
      path: '/partidas/m1/acompanhar',
      workspace: world(),
      wrapGateway: (local) => {
        local.recordRally = () => Promise.reject(new Error('disco cheio'));
        return local;
      },
    });
    await screen.findByRole('heading', { level: 1, name: 'Alpha7 x Rivais' });
    await startFirstSet(ctx);
    await tap(ctx, 'Ponto do Alpha7');
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar');
    expect(pointsOf('Alpha7')).toBe('0');
    expect(stored(ctx).rallies ?? []).toHaveLength(0);
  });

  it('partida que não existe mostra estado de erro com saída', async () => {
    renderApp({ path: '/partidas/nao-existe/acompanhar', workspace: world() });
    expect(await screen.findByText('Partida não encontrada')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar às partidas' })).toBeInTheDocument();
  });
});

describe('Detalhes da partida', () => {
  function played(): Workspace {
    const set: MatchSet = { matchId: 'm1', number: 1, firstServer: 'us', starters: roles.map((role, slot) => ({ slot, playerId: `p${slot + 1}`, role })), liberoId: null, createdAt: NOW };
    const mk = (seq: number, winner: 'us' | 'them', serving: 'us' | 'them', rotation: number, reason: Rally['reason'], voidedAt: string | null = null): Rally => ({
      id: `r${seq}`,
      matchId: 'm1',
      setNumber: 1,
      seq,
      servingSide: serving,
      winnerSide: winner,
      rotation,
      serverPlayerId: serving === 'us' ? `p${rotation + 1}` : null,
      reason,
      playerId: null,
      attemptKey: `k${seq}`,
      recordedAt: NOW,
      voidedAt,
    });
    const action: RallyAction = { id: 'a1', matchId: 'm1', rallyId: 'r1', playerId: 'p1', attemptKey: 'ak1', recordedAt: NOW, voidedAt: null, fundamental: 'saque', outcome: 'ace' };
    return world({ matches: [baseMatch({ status: 'em_andamento' })], matchSets: [set], rallies: [mk(1, 'us', 'us', 0, 'ace'), mk(2, 'them', 'us', 0, null), mk(3, 'us', 'them', 0, 'erro_saque')], rallyActions: [action] });
  }

  it('mostra sets, motivos com denominador, ações técnicas e o histórico', async () => {
    renderApp({ path: '/partidas/m1', workspace: played() });
    expect(await screen.findByRole('heading', { level: 1, name: 'Alpha7 x Rivais' })).toBeInTheDocument();
    const sets = within(screen.getByRole('table'));
    expect(sets.getByText('2 x 1')).toBeInTheDocument();
    expect(sets.getByText('Em andamento')).toBeInTheDocument();
    const mine = within(screen.getByRole('region', { name: 'Pontos do Alpha7' }));
    expect(mine.getByText('Ace')).toBeInTheDocument();
    expect(mine.getByText('Erro de saque do adversário')).toBeInTheDocument();
    expect(mine.getAllByText('1 de 2')).toHaveLength(2);
    const theirs = within(screen.getByRole('region', { name: 'Pontos do Adversário' }));
    expect(theirs.getByText('Motivo não informado')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Saque \(1 registro\)/ })).toBeInTheDocument();
    expect(screen.getByText(/Ace: 1 de 1/)).toBeInTheDocument();
    expect(screen.getByText(/Set 1: 2 x 1 \(3 pontos\)/)).toBeInTheDocument();
  });

  it('sem ações técnicas, diz que não foram registradas em vez de mostrar zeros', async () => {
    renderApp({ path: '/partidas/m1', workspace: { ...played(), rallyActions: [] } });
    expect(await screen.findByText(/Nenhuma ação técnica foi registrada nesta partida/)).toBeInTheDocument();
    expect(screen.queryByText(/Saque \(/)).not.toBeInTheDocument();
  });
});
