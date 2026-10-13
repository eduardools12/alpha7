import { screen, waitFor, within } from '@testing-library/react';
import { createEmptyWorkspace } from '@/data/demo';
import { STORAGE_KEY } from '@/data/localStorageGateway';
import type { Fundamental } from '@/domain/fundamentals';
import type { Training, TrainingEvent } from '@/domain/training';
import {
  attackStats,
  formatEfficiency,
  formatScore,
  receptionStats,
  serveStats,
  settingStats,
} from '@/domain/trainingStats';
import { formatPercent } from '@/domain/metrics';
import { makeEvent, makeExercise, makePlayer, makeTraining } from '@/test/factories';
import { demoWorkspace, renderApp } from '@/test/renderApp';
import type { Workspace } from '@/data/types';

type Ctx = ReturnType<typeof renderApp>;
const saved = (ctx: Pick<Ctx, 'storage'>) =>
  JSON.parse(ctx.storage.map.get(STORAGE_KEY) ?? '{}') as { trainings: Training[]; trainingEvents: TrainingEvent[]; exercises: unknown[] };

const fundamentalCard = (name: string) => within(screen.getByRole('region', { name }));
const metric = (card: ReturnType<typeof within>, label: string) => card.getByText(label).closest('div') as HTMLElement;

/** Cenário determinístico: 4 atletas, um treino concluído com quantidades conhecidas. */
function scenario(extra: (events: TrainingEvent[]) => void = () => {}): Workspace {
  const ws = createEmptyWorkspace();
  const [ana, bia, caio, dani] = [
    makePlayer({ id: 'ana', name: 'Ana Alves', jerseyNumber: 3 }),
    makePlayer({ id: 'bia', name: 'Bia Borges', jerseyNumber: 4 }),
    makePlayer({ id: 'caio', name: 'Caio Costa', jerseyNumber: 5 }),
    makePlayer({ id: 'dani', name: 'Dani Dias', jerseyNumber: 6, primaryPosition: 'levantador' }),
  ];
  ws.players = [ana, bia, caio, dani];
  ws.trainings = [
    makeTraining({
      id: 'tt',
      name: 'Treino de teste',
      date: '2026-10-10',
      durationMinutes: 100,
      notes: 'Observação do responsável: bom ritmo.',
      responsible: 'Coach Teste',
      status: 'concluido',
      completedAt: '2026-10-10T21:40:00.000Z',
      participantIds: ['ana', 'bia', 'caio', 'dani'],
    }),
  ];
  ws.exercises = [makeExercise('tt', { id: 'x1', name: 'Bloco A', order: 0, focus: 'saque' }), makeExercise('tt', { id: 'x2', name: 'Bloco B', order: 1 })];
  const events: TrainingEvent[] = [];
  const many = (player: string, fundamental: Fundamental, counts: Record<string, number>, exercise = 'x1') => {
    for (const [outcome, n] of Object.entries(counts)) {
      for (let i = 0; i < n; i += 1) events.push(makeEvent('tt', exercise, player, fundamental, outcome));
    }
  };
  many('ana', 'saque', { ace: 4, valido: 8 }); // 12
  many('bia', 'saque', { ace: 1, valido: 9 }); // 10
  many('caio', 'saque', { ace: 1, valido: 2 }); // 3
  many('ana', 'ataque', { ponto: 8, erro: 2, bloqueado: 1, outra: 9 }, 'x2'); // 20
  many('bia', 'recepcao', { A: 10, B: 6, C: 3, erro: 1 }, 'x2'); // 20
  many('dani', 'levantamento', { excelente: 8, atacavel: 6, quebrado: 4, erro: 2 }, 'x2'); // 20
  extra(events);
  ws.trainingEvents = events;
  return ws;
}

describe('Resumo do treino (demonstração)', () => {
  const demo = demoWorkspace();
  const t01 = demo.trainingEvents.filter((e) => e.trainingId === 'demo-t-01');

  it('mostra data, duração, participantes, exercícios, registros e responsável', async () => {
    renderApp({ path: '/treinos/demo-t-01' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Transição e saque' })).toBeInTheDocument();
    expect(screen.getByText(/1 h 40 min/)).toBeInTheDocument();
    expect(screen.getByText('Concluído')).toBeInTheDocument();
    expect(screen.getByText('Demo')).toBeInTheDocument();
    expect(screen.getByText(/Responsável: Treinador \(demo\)/)).toBeInTheDocument();
    const tiles = within(screen.getByRole('region', { name: 'Números do treino' }));
    expect(tiles.getByText('Participantes').nextElementSibling).toHaveTextContent('14');
    expect(tiles.getByText('Exercícios').nextElementSibling).toHaveTextContent('3');
    expect(tiles.getByText('Registros válidos').nextElementSibling).toHaveTextContent(String(t01.length));
    expect(tiles.getByText('Fundamentos registrados').nextElementSibling).toHaveTextContent('6');
  });

  it('as estatísticas na tela coincidem com as fórmulas do domínio, com tentativas e denominadores', async () => {
    renderApp({ path: '/treinos/demo-t-01' });
    await screen.findByRole('heading', { level: 1, name: 'Transição e saque' });

    const serve = serveStats(t01);
    const serveCard = fundamentalCard('Saque');
    expect(serveCard.getByText(String(serve.attempts))).toBeInTheDocument();
    expect(metric(serveCard, 'Taxa de ace')).toHaveTextContent(`${formatPercent(serve.aceRate)}${serve.aces} de ${serve.attempts}`);
    expect(metric(serveCard, 'Taxa de erro')).toHaveTextContent(`${formatPercent(serve.errorRate)}${serve.errors} de ${serve.attempts}`);

    const rec = receptionStats(t01);
    const recCard = fundamentalCard('Recepção');
    expect(metric(recCard, 'Nota interna de qualidade')).toHaveTextContent(`${formatScore(rec.score)} de 3,00`);
    expect(metric(recCard, 'Recepção positiva (A + B)')).toHaveTextContent(`${rec.counts.A + rec.counts.B} de ${rec.attempts}`);

    const atk = attackStats(t01);
    const atkCard = fundamentalCard('Ataque');
    expect(metric(atkCard, 'Eficiência de ataque')).toHaveTextContent(formatEfficiency(atk.efficiency));
    expect(metric(atkCard, 'Eficiência de ataque')).toHaveTextContent(`(${atk.kills} − ${atk.errors} − ${atk.blocked}) de ${atk.attempts} tentativas`);

    const set = settingStats(t01);
    expect(metric(fundamentalCard('Levantamento'), 'Excelentes ou atacáveis')).toHaveTextContent(`${set.counts.excelente + set.counts.atacavel} de ${set.attempts}`);
  });

  it('a distribuição da recepção lista A, B, C e erro com as contagens registradas', async () => {
    renderApp({ path: '/treinos/demo-t-01' });
    await screen.findByRole('heading', { level: 1, name: 'Transição e saque' });
    const rec = receptionStats(t01);
    const bars = within(screen.getByRole('list', { name: 'Distribuição de Recepção' }));
    const rows = bars.getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining(`A${rec.counts.A}`),
      expect.stringContaining(`B${rec.counts.B}`),
      expect.stringContaining(`C${rec.counts.C}`),
      expect.stringContaining(`Erro${rec.counts.erro}`),
    ]);
  });

  it('lista os exercícios com a quantidade de registros de cada um', async () => {
    renderApp({ path: '/treinos/demo-t-01' });
    const table = within(await screen.findByRole('table', { name: 'Registros por exercício' }));
    for (const id of ['demo-x-01-1', 'demo-x-01-2', 'demo-x-01-3']) {
      const count = t01.filter((e) => e.exerciseId === id).length;
      const name = demo.exercises.find((e) => e.id === id)!.name;
      expect(table.getByRole('row', { name: new RegExp(`${name}.*${count}$`) })).toBeInTheDocument();
    }
  });

  it('exibe as observações do responsável e a nota de que os dados são locais', async () => {
    renderApp({ path: '/treinos/demo-t-01' });
    expect(await screen.findByText(/Dado de demonstração\. Boa intensidade/)).toBeInTheDocument();
    expect(screen.getByText(/ficam salvos só neste navegador/)).toBeInTheDocument();
  });

  it('treino em andamento sem registros: sem estatísticas inventadas e sem zeros', async () => {
    renderApp({ path: '/treinos/demo-t-04' });
    expect(await screen.findByText('Treino em andamento')).toBeInTheDocument();
    expect(screen.getByText(/Nenhuma tentativa registrada neste treino/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Saque' })).not.toBeInTheDocument();
    const tiles = within(screen.getByRole('region', { name: 'Números do treino' }));
    expect(tiles.getByText('Registros válidos').nextElementSibling).toHaveTextContent('0'); // contagem real de registros
    expect(screen.getByRole('link', { name: 'Registrar' })).toHaveAttribute('href', '/treinos/demo-t-04/registrar');
  });

  it('treino inexistente mostra estado de não encontrado', async () => {
    renderApp({ path: '/treinos/nao-existe' });
    expect(await screen.findByText('Treino não encontrado')).toBeInTheDocument();
  });
});

describe('Resumo do treino (cenário com números conhecidos)', () => {
  it('calcula e mostra as fórmulas exatamente, com contexto', async () => {
    renderApp({ path: '/treinos/tt', workspace: scenario() });
    await screen.findByRole('heading', { level: 1, name: 'Treino de teste' });

    expect(metric(fundamentalCard('Saque'), 'Taxa de ace')).toHaveTextContent('24,0%6 de 25'); // (4+1+1) aces em 25 saques
    expect(metric(fundamentalCard('Saque'), 'Taxa de erro')).toHaveTextContent('0,0%0 de 25'); // zero medido, com denominador
    expect(metric(fundamentalCard('Ataque'), 'Eficiência de ataque')).toHaveTextContent('25,0%(8 − 2 − 1) de 20 tentativas');
    expect(metric(fundamentalCard('Ataque'), 'Taxa de ponto')).toHaveTextContent('40,0%8 de 20');
    expect(metric(fundamentalCard('Recepção'), 'Nota interna de qualidade')).toHaveTextContent('2,25 de 3,0020 recepções');
    expect(metric(fundamentalCard('Recepção'), 'Recepção positiva (A + B)')).toHaveTextContent('80,0%16 de 20');
    expect(metric(fundamentalCard('Recepção'), 'Recepção perfeita (A)')).toHaveTextContent('50,0%10 de 20');
    expect(metric(fundamentalCard('Levantamento'), 'Excelentes ou atacáveis')).toHaveTextContent('70,0%14 de 20');
  });

  it('a qualidade do levantamento é um indicador separado do resultado do ataque', async () => {
    renderApp({ path: '/treinos/tt', workspace: scenario() });
    await screen.findByRole('heading', { level: 1, name: 'Treino de teste' });
    expect(within(screen.getByRole('region', { name: 'Levantamento' })).getByText(/O resultado do ataque é outro indicador/)).toBeInTheDocument();
    // a distribuição do levantamento não traz nenhuma categoria de ataque
    const labels = within(screen.getByRole('list', { name: 'Distribuição de Levantamento' })).getAllByRole('listitem').map((li) => li.textContent);
    expect(labels.join(' ')).toMatch(/Excelente.*Atacável.*Quebrado.*Erro/);
    expect(labels.join(' ')).not.toMatch(/Ponto|Bloqueado/);
  });

  it('fundamentos sem tentativas não viram cartões com zeros: são listados como sem registros', async () => {
    renderApp({ path: '/treinos/tt', workspace: scenario() });
    await screen.findByRole('heading', { level: 1, name: 'Treino de teste' });
    expect(screen.getByText('Sem tentativas registradas em: Bloqueio, Defesa.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Bloqueio' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Defesa' })).not.toBeInTheDocument();
  });

  it('sinaliza amostra insuficiente em fundamentos com poucas tentativas', async () => {
    const ws = scenario((events) => {
      for (let i = 0; i < 4; i += 1) events.push(makeEvent('tt', 'x2', 'ana', 'defesa', 'positiva'));
    });
    renderApp({ path: '/treinos/tt', workspace: ws });
    await screen.findByRole('heading', { level: 1, name: 'Treino de teste' });
    expect(within(screen.getByRole('region', { name: 'Defesa' })).getByRole('note')).toHaveTextContent(
      'Amostra insuficiente: só 4 tentativas. Não tire conclusões destes percentuais.',
    );
    // fundamentos com amostra adequada não recebem o aviso
    expect(within(screen.getByRole('region', { name: 'Ataque' })).queryByRole('note')).not.toBeInTheDocument();
  });

  it('registros desfeitos ficam fora das contas e aparecem como contagem à parte', async () => {
    const ws = scenario((events) => {
      for (let i = 0; i < 5; i += 1) events.push(makeEvent('tt', 'x1', 'ana', 'saque', 'erro', { voidedAt: '2026-10-10T20:00:00.000Z' }));
    });
    renderApp({ path: '/treinos/tt', workspace: ws });
    await screen.findByRole('heading', { level: 1, name: 'Treino de teste' });
    expect(screen.getByText('5 desfeitos, fora das contas')).toBeInTheDocument();
    expect(metric(fundamentalCard('Saque'), 'Taxa de erro')).toHaveTextContent('0,0%0 de 25'); // os 5 erros desfeitos não contam
  });

  describe('resultados individuais e comparação', () => {
    const table = () => screen.getByRole('table', { name: /Resultados individuais em/ });

    it('compara só quem tem amostra adequada, ordenando pelo indicador; os demais ficam sem ranking', async () => {
      renderApp({ path: '/treinos/tt', workspace: scenario() });
      await screen.findByRole('heading', { level: 1, name: 'Treino de teste' });
      expect(screen.getByRole('table', { name: 'Resultados individuais em Saque' })).toBeInTheDocument(); // saque é o mais registrado
      expect(screen.getByText(/Os atletas com 10 tentativas ou mais estão ordenados pelo indicador/)).toBeInTheDocument();

      const rows = within(table()).getAllByRole('row').slice(1);
      const text = rows.map((r) => r.textContent ?? '');
      expect(text[0]).toMatch(/^1Ana A\. #3.*33,3%.*4 de 12/); // ace 4/12
      expect(text[1]).toMatch(/^2Bia B\. #4.*10,0%.*1 de 10/);
      expect(text[2]).toMatch(/^—Caio C\. #5.*amostra insuficiente/); // 3 tentativas: sem ranking
    });

    it('sem atletas suficientes no fundamento, não há base para comparar: aviso e ordem alfabética, sem ranking', async () => {
      const { user } = renderApp({ path: '/treinos/tt', workspace: scenario() });
      await screen.findByRole('heading', { level: 1, name: 'Treino de teste' });
      await user.click(within(screen.getByRole('group', { name: 'Fundamento da tabela' })).getByRole('button', { name: 'Ataque' }));

      expect(screen.getByText(/Sem base para comparar: é preciso ao menos 2 atletas com 10 tentativas ou mais em Ataque/)).toBeInTheDocument();
      expect(within(table()).queryByRole('columnheader', { name: '#' })).not.toBeInTheDocument();
      const names = within(table()).getAllByRole('row').slice(1).map((r) => within(r).getByRole('rowheader').textContent);
      expect(names).toEqual(['Ana A. #3', 'Bia B. #4', 'Caio C. #5', 'Dani D. #6']);
    });

    it('quem não tentou o fundamento aparece como indisponível, nunca como 0%', async () => {
      const { user } = renderApp({ path: '/treinos/tt', workspace: scenario() });
      await screen.findByRole('heading', { level: 1, name: 'Treino de teste' });
      await user.click(within(screen.getByRole('group', { name: 'Fundamento da tabela' })).getByRole('button', { name: 'Ataque' }));
      const bia = within(table()).getByRole('rowheader', { name: 'Bia B. #4' }).closest('tr') as HTMLElement;
      expect(bia).toHaveTextContent('—');
      expect(bia).toHaveTextContent('sem tentativas registradas');
      expect(bia).toHaveTextContent('indisponível');
      expect(bia).not.toHaveTextContent('0,0%');
    });

    it('a escolha do fundamento é anunciada pelos chips (aria-pressed)', async () => {
      const { user } = renderApp({ path: '/treinos/tt', workspace: scenario() });
      await screen.findByRole('heading', { level: 1, name: 'Treino de teste' });
      const group = within(screen.getByRole('group', { name: 'Fundamento da tabela' }));
      expect(group.getByRole('button', { name: 'Saque' })).toHaveAttribute('aria-pressed', 'true');
      await user.click(group.getByRole('button', { name: 'Recepção' }));
      expect(group.getByRole('button', { name: 'Recepção' })).toHaveAttribute('aria-pressed', 'true');
      expect(group.getByRole('button', { name: 'Saque' })).toHaveAttribute('aria-pressed', 'false');
    });
  });
});

describe('Resumo do treino: ações', () => {
  it('concluir e reabrir o treino, com efeito persistido após recarregar', async () => {
    const first = renderApp({ path: '/treinos/demo-t-04' });
    await first.user.click(await screen.findByRole('button', { name: 'Concluir treino' }));
    expect(await screen.findByRole('button', { name: 'Reabrir treino' })).toBeInTheDocument();
    expect(screen.queryByText('Treino em andamento')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Registrar' })).not.toBeInTheDocument();
    const t = saved(first).trainings.find((x) => x.id === 'demo-t-04')!;
    expect(t.status).toBe('concluido');
    expect(t.completedAt).not.toBeNull();
    first.unmount();

    const second = renderApp({ path: '/treinos/demo-t-04', storage: first.storage });
    await screen.findByRole('button', { name: 'Reabrir treino' });
    await second.user.click(screen.getByRole('button', { name: 'Reabrir treino' }));
    expect(await screen.findByText('Treino em andamento')).toBeInTheDocument();
    expect(saved(second).trainings.find((x) => x.id === 'demo-t-04')!.completedAt).toBeNull();
  });

  it('concluir não altera nenhum registro', async () => {
    const ctx = renderApp({ path: '/treinos/demo-t-04' });
    const before = JSON.stringify(saved(ctx).trainingEvents);
    await ctx.user.click(await screen.findByRole('button', { name: 'Concluir treino' }));
    await screen.findByRole('button', { name: 'Reabrir treino' });
    expect(JSON.stringify(saved(ctx).trainingEvents)).toBe(before);
  });

  it('excluir pelo resumo: confirmação com a contagem da cascata, volta à lista e remove só aquele treino', async () => {
    const t02 = demoWorkspace().trainingEvents.filter((e) => e.trainingId === 'demo-t-02').length;
    const ctx = renderApp({ path: '/treinos/demo-t-02' });
    await ctx.user.click(await screen.findByRole('button', { name: 'Excluir treino' }));
    expect(screen.getByText(new RegExp(`Serão apagados 2 exercícios e ${t02} registros`))).toBeInTheDocument();
    await ctx.user.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));

    expect(await screen.findByText('Treino "Recepção e levantamento" excluído.')).toBeInTheDocument();
    await waitFor(() => expect(saved(ctx).trainings.map((t) => t.id)).toEqual(['demo-t-01', 'demo-t-03', 'demo-t-04']));
    expect(saved(ctx).trainingEvents.some((e) => e.trainingId === 'demo-t-02')).toBe(false);
    expect(saved(ctx).trainingEvents.some((e) => e.trainingId === 'demo-t-01')).toBe(true);
  });

  it('o resumo tem atalhos para editar e, se aberto, registrar', async () => {
    renderApp({ path: '/treinos/demo-t-04' });
    expect(await screen.findByRole('link', { name: 'Editar' })).toHaveAttribute('href', '/treinos/demo-t-04/editar');
    expect(screen.getByRole('link', { name: 'Registrar' })).toBeInTheDocument();
  });
});

describe('Treinos: integração com perfil e dashboard', () => {
  it('o perfil do atleta mostra o indicador de saque calculado dos treinos, com denominador', async () => {
    const ws = scenario();
    renderApp({ path: '/elenco/ana', workspace: ws });
    await screen.findByRole('heading', { level: 2, name: 'Ana Alves' });
    const card = within(screen.getByRole('heading', { name: 'Métricas observadas' }).closest('section') as HTMLElement);
    expect(card.getByText(/32 tentativas em 1 treino/)).toBeInTheDocument(); // 12 saques + 20 ataques
    const serve = card.getByText('Taxa de ace', { selector: 'small' }).closest('div') as HTMLElement;
    expect(serve).toHaveTextContent('33,3%4 de 12');
    const attack = card.getByText('Eficiência de ataque', { selector: 'small' }).closest('div') as HTMLElement;
    expect(attack).toHaveTextContent('25,0%(8 − 2 − 1) de 20 tentativas');
    expect(card.getByText('Treinos com participação').closest('div')).toHaveTextContent('1 de 1');
  });

  it('o perfil sinaliza amostra pequena e não mistura notas subjetivas com estatísticas', async () => {
    const ws = scenario();
    renderApp({ path: '/elenco/caio', workspace: ws });
    await screen.findByRole('heading', { level: 2, name: 'Caio Costa' });
    expect(screen.getByText(/amostra insuficiente/)).toBeInTheDocument(); // 3 saques
    // sem avaliação técnica: o Overall segue indisponível, mesmo com estatísticas de treino
    expect(screen.getByRole('img', { name: 'Overall indisponível: sem avaliação' })).toBeInTheDocument();
  });

  it('registrar tentativas não altera as notas nem o Overall (separação entre avaliação e estatística)', async () => {
    const ctx = renderApp({ path: '/elenco/demo-p-08' });
    await screen.findByRole('img', { name: 'Overall 85' });
    const evaluationsBefore = JSON.stringify(
      (JSON.parse(ctx.storage.map.get(STORAGE_KEY) ?? '{}') as { evaluations: unknown }).evaluations,
    );
    ctx.unmount();

    const rec = renderApp({ path: '/treinos/demo-t-04/registrar', storage: ctx.storage });
    await screen.findByRole('heading', { level: 1, name: 'Registrar treino' });
    await rec.user.click(screen.getByRole('button', { name: /Gabriel S\., camisa 8/ }));
    for (let i = 0; i < 3; i += 1) {
      const button = screen.getByRole('button', { name: /^Ace,/ });
      await waitFor(() => expect(button).toBeEnabled());
      await rec.user.click(button);
    }
    await waitFor(() => expect(screen.getByText('3 no treino')).toBeInTheDocument());
    rec.unmount();

    const profile = renderApp({ path: '/elenco/demo-p-08', storage: ctx.storage });
    expect(await screen.findByRole('img', { name: 'Overall 85' })).toBeInTheDocument();
    expect(JSON.stringify((JSON.parse(profile.storage.map.get(STORAGE_KEY) ?? '{}') as { evaluations: unknown }).evaluations)).toBe(evaluationsBefore);
  });

  it('o dashboard conta treinos concluídos dos registros e mostra o último treino', async () => {
    renderApp({ workspace: scenario() });
    await screen.findByText('Treinos concluídos');
    const tile = screen.getByText('Treinos concluídos').closest('div') as HTMLElement;
    expect(within(tile).getByText('1')).toBeInTheDocument();
    expect(within(tile).getByText(/\d+ registros válidos/)).toBeInTheDocument();
    expect(within(tile).queryByText('Demo')).not.toBeInTheDocument(); // são registros reais, não demonstração
    expect(screen.getByRole('link', { name: 'Ver resumo do treino' })).toHaveAttribute('href', '/treinos/tt');
    expect(screen.getByText('Treino de teste')).toBeInTheDocument();
  });
});
