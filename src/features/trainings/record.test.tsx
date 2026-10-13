import { screen, waitFor, within } from '@testing-library/react';
import { FUNDAMENTALS, FUNDAMENTAL_LABEL, OUTCOME_INFO, OUTCOME_VALUES, type Fundamental } from '@/domain/fundamentals';
import type { TrainingEvent } from '@/domain/training';
import { STORAGE_KEY } from '@/data/localStorageGateway';
import { createEmptyWorkspace } from '@/data/demo';
import { makeExercise, makePlayer, makeTraining } from '@/test/factories';
import { renderApp } from '@/test/renderApp';

type Ctx = ReturnType<typeof renderApp>;

/** Todos os registros salvos (inclusive os treinos de demonstração). */
const allStored = (ctx: Pick<Ctx, 'storage'>) =>
  (JSON.parse(ctx.storage.map.get(STORAGE_KEY) ?? '{}') as { trainingEvents: TrainingEvent[] }).trainingEvents;

/** Só os registros do treino aberto usado nestes testes (demo-t-04, que começa sem registros). */
const stored = (ctx: Pick<Ctx, 'storage'>) => allStored(ctx).filter((e) => e.trainingId === 'demo-t-04');

async function open(path = '/treinos/demo-t-04/registrar') {
  const ctx = renderApp({ path });
  await screen.findByRole('heading', { level: 1, name: 'Registrar treino' });
  return ctx;
}

const pickPlayer = (ctx: Ctx, label: RegExp = /Gabriel S\., camisa 8/) => ctx.user.click(screen.getByRole('button', { name: label }));
const pickFundamental = (ctx: Ctx, name: string) =>
  ctx.user.click(within(screen.getByRole('group', { name: 'Fundamento' })).getByRole('button', { name }));

/** Espera o bloqueio anti-toque-duplo terminar e toca no botão de resultado. */
async function tap(ctx: Ctx, name: RegExp) {
  const button = screen.getByRole('button', { name });
  await waitFor(() => expect(button).toBeEnabled());
  await ctx.user.click(button);
}

describe('Registro rápido: seleção e botões', () => {
  it('começa com treino, exercício e fundamento definidos, e botões bloqueados até escolher um jogador', async () => {
    await open();
    expect(screen.getByRole('heading', { level: 1, name: 'Registrar treino' })).toBeInTheDocument();
    expect(screen.getByText('Treino de hoje')).toBeInTheDocument();
    expect(screen.getByText('Escolha um jogador para liberar os botões.')).toBeInTheDocument();
    const group = within(screen.getByRole('group', { name: 'Exercício atual' }));
    expect(group.getByRole('button', { name: /Aquecimento com bola/ })).toHaveAttribute('aria-pressed', 'true');
    for (const name of [/^Ace,/, /^Válido,/, /^Erro,/]) expect(screen.getByRole('button', { name })).toBeDisabled();
  });

  it.each(FUNDAMENTALS)('%s mostra todos os resultados definidos como botões', async (fundamental) => {
    const ctx = await open();
    await pickPlayer(ctx);
    await pickFundamental(ctx, FUNDAMENTAL_LABEL[fundamental]);
    const table = OUTCOME_INFO[fundamental] as Record<string, { label: string; short: string }>;
    for (const outcome of OUTCOME_VALUES[fundamental]) {
      const info = table[outcome]!;
      expect(screen.getByRole('button', { name: `${info.label}, ${info.short}` })).toBeEnabled();
    }
  });

  it('só os participantes do treino aparecem como jogadores', async () => {
    await open();
    expect(screen.getByRole('button', { name: /Gabriel S\./ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Vitor K\./ })).not.toBeInTheDocument(); // lesionado, não participa
  });

  it('mostra o critério de cada resultado do fundamento atual', async () => {
    const ctx = await open();
    await pickFundamental(ctx, 'Recepção');
    await ctx.user.click(screen.getByText('Critérios de Recepção'));
    expect(
      screen.getByText('Recepção que permite manter praticamente todas as opções ofensivas treinadas.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Recepção que concede o ponto diretamente ao adversário.')).toBeInTheDocument();
  });
});

describe('Registro rápido: gravar tentativas', () => {
  it('um toque cria exatamente um registro ligado a treino, exercício, jogador, fundamento, resultado e hora', async () => {
    const ctx = await open();
    await pickPlayer(ctx);
    await pickFundamental(ctx, 'Recepção');
    await tap(ctx, /^A, Praticamente/);

    await waitFor(() => expect(stored(ctx)).toHaveLength(1));
    expect(stored(ctx)[0]).toMatchObject({
      trainingId: 'demo-t-04',
      exerciseId: 'demo-x-04-1',
      playerId: 'demo-p-08',
      fundamental: 'recepcao',
      outcome: 'A',
      voidedAt: null,
      demo: false,
    });
    expect(stored(ctx)[0]!.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(stored(ctx)[0]!.attemptKey).not.toBe('');
  });

  it('dá feedback visual e textual e mostra o histórico recente', async () => {
    const ctx = await open();
    await pickPlayer(ctx);
    await pickFundamental(ctx, 'Saque');
    await tap(ctx, /^Ace,/);

    expect(await screen.findByText('Registrado: Gabriel S. #8 · Saque Ace')).toBeInTheDocument();
    const history = within(screen.getByRole('heading', { name: 'Últimos registros' }).closest('section') as HTMLElement);
    expect(history.getByText('Gabriel S. #8 · Saque Ace')).toBeInTheDocument();
    expect(history.getByText('1 no treino')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Ace,/ })).toHaveClass(/flash/);
  });

  it('mantém jogador, exercício e fundamento para o registro seguinte (sem preencher de novo)', async () => {
    const ctx = await open();
    await pickPlayer(ctx);
    await pickFundamental(ctx, 'Recepção');
    await tap(ctx, /^A, Praticamente/);
    await tap(ctx, /^B, Controlada/);

    await waitFor(() => expect(stored(ctx)).toHaveLength(2));
    expect(stored(ctx).map((e) => [e.playerId, e.exerciseId, e.fundamental, e.outcome])).toEqual([
      ['demo-p-08', 'demo-x-04-1', 'recepcao', 'A'],
      ['demo-p-08', 'demo-x-04-1', 'recepcao', 'B'],
    ]);
    expect(screen.getByRole('button', { name: /Gabriel S\., camisa 8/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('group', { name: 'Fundamento' })).getByRole('button', { name: 'Recepção' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('o contador mostra tentativas do jogador no fundamento e exercício atuais, e separa por exercício', async () => {
    const ctx = await open();
    await pickPlayer(ctx);
    await pickFundamental(ctx, 'Recepção');
    await tap(ctx, /^A, Praticamente/);
    await tap(ctx, /^A, Praticamente/);
    await tap(ctx, /^C, Quebrada/);

    const counter = () => screen.getByText(/Tentativas de .* neste exercício/).closest('div') as HTMLElement;
    await waitFor(() => expect(counter()).toHaveTextContent('Recepção neste exercício: 3'));
    expect(counter()).toHaveTextContent(/A 2/);
    expect(counter()).toHaveTextContent(/C 1/);

    // outro exercício (foco em saque): contagem própria, começando do zero registrado
    await ctx.user.click(within(screen.getByRole('group', { name: 'Exercício atual' })).getByRole('button', { name: /Saque e recepção/ }));
    expect(counter()).toHaveTextContent('Saque neste exercício: 0');
    await tap(ctx, /^Ace,/);
    await waitFor(() => expect(counter()).toHaveTextContent('Saque neste exercício: 1'));
    expect(stored(ctx).map((e) => e.exerciseId)).toEqual(['demo-x-04-1', 'demo-x-04-1', 'demo-x-04-1', 'demo-x-04-2']);
  });

  it('registros de jogadores diferentes ficam com o jogador certo', async () => {
    const ctx = await open();
    await pickFundamental(ctx, 'Saque');
    await pickPlayer(ctx, /Gabriel S\./);
    await tap(ctx, /^Ace,/);
    await pickPlayer(ctx, /Lucas M\./);
    await tap(ctx, /^Erro,/);
    await waitFor(() => expect(stored(ctx)).toHaveLength(2));
    expect(stored(ctx).map((e) => [e.playerId, e.outcome])).toEqual([
      ['demo-p-08', 'ace'],
      ['demo-p-04', 'erro'],
    ]);
  });

  it('registrar em um treino não altera os registros de outro treino', async () => {
    const ctx = await open();
    const others = () => allStored(ctx).filter((e) => e.trainingId !== 'demo-t-04');
    const snapshot = JSON.stringify(others());
    expect(others().length).toBeGreaterThan(0);
    await pickPlayer(ctx);
    await pickFundamental(ctx, 'Saque');
    await tap(ctx, /^Válido,/);
    await waitFor(() => expect(stored(ctx)).toHaveLength(1));
    expect(JSON.stringify(others())).toBe(snapshot); // nenhum outro treino foi tocado
  });

  it.each(FUNDAMENTALS)('registra cada resultado de %s com o par fundamento/resultado correto', async (fundamental: Fundamental) => {
    const ctx = await open();
    await pickPlayer(ctx);
    await pickFundamental(ctx, FUNDAMENTAL_LABEL[fundamental]);
    const table = OUTCOME_INFO[fundamental] as Record<string, { label: string; short: string }>;
    for (const outcome of OUTCOME_VALUES[fundamental]) {
      await tap(ctx, new RegExp(`^${table[outcome]!.label},`));
    }
    await waitFor(() => expect(stored(ctx)).toHaveLength(OUTCOME_VALUES[fundamental].length));
    expect(stored(ctx).map((e) => [e.fundamental, e.outcome])).toEqual(OUTCOME_VALUES[fundamental].map((o) => [fundamental, o]));
  });
});

describe('Registro rápido: toques repetidos e desfazer', () => {
  it('toque duplo acidental registra uma única tentativa', async () => {
    const ctx = await open();
    await pickPlayer(ctx);
    await pickFundamental(ctx, 'Ataque');
    await ctx.user.dblClick(screen.getByRole('button', { name: /^Ponto,/ }));
    await waitFor(() => expect(stored(ctx)).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(stored(ctx)).toHaveLength(1);
  });

  it('depois do breve bloqueio, um novo toque deliberado registra outra tentativa', async () => {
    const ctx = await open();
    await pickPlayer(ctx);
    await pickFundamental(ctx, 'Ataque');
    await tap(ctx, /^Ponto,/);
    await tap(ctx, /^Ponto,/);
    await waitFor(() => expect(stored(ctx)).toHaveLength(2));
    expect(new Set(stored(ctx).map((e) => e.attemptKey)).size).toBe(2);
  });

  it('desfazer anula o último registro sem apagá-lo e ele sai das contagens', async () => {
    const ctx = await open();
    await pickPlayer(ctx);
    await pickFundamental(ctx, 'Saque');
    await tap(ctx, /^Ace,/);
    await tap(ctx, /^Erro,/);
    await waitFor(() => expect(stored(ctx)).toHaveLength(2));

    await tap(ctx, /Desfazer último registro/);
    expect(await screen.findByText('Desfeito: Gabriel S. #8 · Saque Erro')).toBeInTheDocument();
    await waitFor(() => expect(stored(ctx).filter((e) => e.voidedAt !== null)).toHaveLength(1));
    expect(stored(ctx)).toHaveLength(2); // histórico preservado
    expect(stored(ctx).find((e) => e.outcome === 'erro')!.voidedAt).not.toBeNull();
    expect(stored(ctx).find((e) => e.outcome === 'ace')!.voidedAt).toBeNull();
    expect(screen.getByText('1 no treino')).toBeInTheDocument();
    expect(screen.getByText(/Desfaz: Gabriel S\. #8 · Saque Ace/)).toBeInTheDocument();
  });

  it('toque duplo em "Desfazer" desfaz só UM registro', async () => {
    const ctx = await open();
    await pickPlayer(ctx);
    await pickFundamental(ctx, 'Saque');
    await tap(ctx, /^Ace,/);
    await tap(ctx, /^Válido,/);
    await tap(ctx, /^Erro,/);
    await waitFor(() => expect(stored(ctx)).toHaveLength(3));

    const undoButton = screen.getByRole('button', { name: /Desfazer último registro/ });
    await waitFor(() => expect(undoButton).toBeEnabled()); // espera o bloqueio do último registro acabar
    await ctx.user.dblClick(undoButton);
    await waitFor(() => expect(stored(ctx).filter((e) => e.voidedAt !== null)).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(stored(ctx).filter((e) => e.voidedAt !== null)).toHaveLength(1);
  });

  it('desfazer repetidas vezes percorre os registros do mais novo ao mais antigo e termina desativado', async () => {
    const ctx = await open();
    await pickPlayer(ctx);
    await pickFundamental(ctx, 'Saque');
    await tap(ctx, /^Ace,/);
    await tap(ctx, /^Erro,/);
    await tap(ctx, /Desfazer último registro/);
    await tap(ctx, /Desfazer último registro/);
    await waitFor(() => expect(stored(ctx).every((e) => e.voidedAt !== null)).toBe(true));
    expect(screen.getByRole('button', { name: /Desfazer último registro/ })).toBeDisabled();
    expect(screen.getByText(/Nenhum registro ainda/)).toBeInTheDocument();
  });

  it('sem registros, "Desfazer" fica desativado', async () => {
    await open();
    expect(screen.getByRole('button', { name: /Desfazer último registro/ })).toBeDisabled();
  });

  it('o registro desfeito pode ser refeito com um novo toque (nova tentativa, nova chave)', async () => {
    const ctx = await open();
    await pickPlayer(ctx);
    await pickFundamental(ctx, 'Saque');
    await tap(ctx, /^Ace,/);
    await tap(ctx, /Desfazer último registro/);
    await tap(ctx, /^Ace,/);
    await waitFor(() => expect(stored(ctx)).toHaveLength(2));
    expect(stored(ctx).filter((e) => e.voidedAt === null)).toHaveLength(1);
  });
});

describe('Registro rápido: persistência e integridade', () => {
  it('os registros continuam lá depois de recarregar a aplicação', async () => {
    const first = await open();
    await pickPlayer(first);
    await pickFundamental(first, 'Recepção');
    await tap(first, /^A, Praticamente/);
    await tap(first, /^B, Controlada/);
    await waitFor(() => expect(stored(first)).toHaveLength(2));
    first.unmount();

    const second = renderApp({ path: '/treinos/demo-t-04/registrar', storage: first.storage });
    await screen.findByRole('heading', { level: 1, name: 'Registrar treino' });
    expect(screen.getByText('2 no treino')).toBeInTheDocument();
    const history = within(screen.getByRole('heading', { name: 'Últimos registros' }).closest('section') as HTMLElement);
    expect(history.getByText('Gabriel S. #8 · Recepção B')).toBeInTheDocument();
    expect(history.getByText('Gabriel S. #8 · Recepção A')).toBeInTheDocument();
    second.unmount();
  });

  it('falha de gravação: avisa, não registra e mantém a tela pronta para tentar de novo', async () => {
    const ctx = renderApp({
      path: '/treinos/demo-t-04/registrar',
      wrapGateway: (gw) =>
        new Proxy(gw, {
          get(target, prop, receiver) {
            if (prop === 'addTrainingEvent') return () => Promise.reject(new Error('quota'));
            return Reflect.get(target, prop, receiver) as unknown;
          },
        }),
    });
    await screen.findByRole('heading', { level: 1, name: 'Registrar treino' });
    await pickPlayer(ctx);
    await pickFundamental(ctx, 'Saque');
    await tap(ctx, /^Ace,/);
    expect(await screen.findByText(/Não foi possível salvar\. Verifique o espaço do navegador/)).toBeInTheDocument();
    expect(stored(ctx)).toHaveLength(0);
    expect(screen.getByText(/Nenhum registro ainda/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Ace,/ })).toBeEnabled());
  });

  it('treino concluído bloqueia o registro e permite reabrir', async () => {
    const ctx = await open('/treinos/demo-t-01/registrar');
    expect(await screen.findByText('Este treino está concluído')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Ace,/ })).not.toBeInTheDocument();
    await ctx.user.click(screen.getByRole('button', { name: 'Reabrir para registrar' }));
    expect(await screen.findByRole('heading', { name: 'Resultado da tentativa' })).toBeInTheDocument();
  });

  it('treino sem exercícios pede para criar um antes de registrar', async () => {
    const ws = createEmptyWorkspace();
    ws.players = [makePlayer({ id: 'a', name: 'Ana Alves', jerseyNumber: 3 })];
    ws.trainings = [makeTraining({ id: 'sem-ex', name: 'Treino vazio', participantIds: ['a'] })];
    renderApp({ path: '/treinos/sem-ex/registrar', workspace: ws });
    expect(await screen.findByText('Adicione um exercício para registrar')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Editar treino' })).toHaveAttribute('href', '/treinos/sem-ex/editar');
  });

  it('treino sem participantes pede para escolhê-los', async () => {
    const ws = createEmptyWorkspace();
    ws.players = [makePlayer({ id: 'a', name: 'Ana Alves', jerseyNumber: 3 })];
    ws.trainings = [makeTraining({ id: 'sem-p', name: 'Treino vazio', participantIds: [] })];
    ws.exercises = [makeExercise('sem-p', { id: 'x1' })];
    renderApp({ path: '/treinos/sem-p/registrar', workspace: ws });
    expect(await screen.findByText('Escolha os participantes para registrar')).toBeInTheDocument();
  });

  it('treino inexistente mostra estado de não encontrado', async () => {
    renderApp({ path: '/treinos/nao-existe/registrar' });
    expect(await screen.findByText('Treino não encontrado')).toBeInTheDocument();
  });
});
