import type { Fundamental } from './fundamentals';
import type { TrainingEvent } from './training';
import {
  MIN_SAMPLE,
  RECEPTION_SCORE_MAX,
  attackStats,
  blockStats,
  compareParticipants,
  defenseStats,
  formatEfficiency,
  formatScore,
  headline,
  receptionStats,
  sampleLevel,
  serveStats,
  settingStats,
  summarizeTraining,
} from './trainingStats';
import { makeEvent, makeExercise, makeTraining } from '@/test/factories';

/** Cria uma lista de eventos a partir de { resultado: quantidade }. */
function events(fundamental: Fundamental, counts: Record<string, number>, playerId = 'p1'): TrainingEvent[] {
  return Object.entries(counts).flatMap(([outcome, n]) =>
    Array.from({ length: n }, () => makeEvent('tr', 'ex', playerId, fundamental, outcome)),
  );
}
const voided = (list: TrainingEvent[]) => list.map((e) => ({ ...e, voidedAt: '2026-10-01T12:00:00.000Z' }));

describe('amostra', () => {
  it.each([
    [0, 'none'],
    [1, 'small'],
    [MIN_SAMPLE - 1, 'small'],
    [MIN_SAMPLE, 'adequate'],
    [500, 'adequate'],
  ] as const)('%i tentativas → %s', (n, level) => {
    expect(sampleLevel(n)).toBe(level);
  });
});

describe('saque', () => {
  it('taxa de ace = aces ÷ tentativas e taxa de erro = erros ÷ tentativas', () => {
    const s = serveStats(events('saque', { ace: 3, valido: 15, erro: 6 }));
    expect(s).toMatchObject({ attempts: 24, aces: 3, valid: 15, errors: 6, sample: 'adequate' });
    expect(s.aceRate).toEqual({ successes: 3, attempts: 24, value: 0.125 });
    expect(s.errorRate).toEqual({ successes: 6, attempts: 24, value: 0.25 });
  });

  it('as três categorias são exclusivas e somam as tentativas', () => {
    const s = serveStats(events('saque', { ace: 2, valido: 5, erro: 1 }));
    expect(s.aces + s.valid + s.errors).toBe(s.attempts);
  });

  it('sem tentativas: taxas indisponíveis (null), nunca 0%', () => {
    const s = serveStats([]);
    expect(s.attempts).toBe(0);
    expect(s.aceRate.value).toBeNull();
    expect(s.errorRate.value).toBeNull();
    expect(s.sample).toBe('none');
  });

  it('só conta saques: eventos de outros fundamentos não entram', () => {
    expect(serveStats([...events('saque', { ace: 1 }), ...events('ataque', { ponto: 5 })]).attempts).toBe(1);
  });

  it('eventos anulados (desfeitos) não contam', () => {
    const list = [...events('saque', { ace: 2 }), ...voided(events('saque', { ace: 5, erro: 5 }))];
    const s = serveStats(list);
    expect(s.attempts).toBe(2);
    expect(s.aces).toBe(2);
  });
});

describe('recepção', () => {
  const list = events('recepcao', { A: 10, B: 6, C: 3, erro: 1 });

  it('distribuição A/B/C/erro com denominador', () => {
    const r = receptionStats(list);
    expect(r.attempts).toBe(20);
    expect(r.counts).toEqual({ A: 10, B: 6, C: 3, erro: 1 });
    expect(r.shares.A).toEqual({ successes: 10, attempts: 20, value: 0.5 });
    expect(r.shares.erro.value).toBe(0.05);
    expect(r.counts.A + r.counts.B + r.counts.C + r.counts.erro).toBe(r.attempts);
  });

  it('recepção positiva = (A + B) ÷ n e perfeita = A ÷ n', () => {
    const r = receptionStats(list);
    expect(r.positive).toEqual({ successes: 16, attempts: 20, value: 0.8 });
    expect(r.perfect).toEqual({ successes: 10, attempts: 20, value: 0.5 });
  });

  it('nota interna = (3A + 2B + 1C + 0·erro) ÷ n, de 0 a 3', () => {
    // (30 + 12 + 3 + 0) / 20 = 2,25
    expect(receptionStats(list).score).toBe(2.25);
    expect(receptionStats(events('recepcao', { A: 4 })).score).toBe(RECEPTION_SCORE_MAX);
    expect(receptionStats(events('recepcao', { erro: 4 })).score).toBe(0);
  });

  it('nota 0 com tentativas (só erros) é diferente de indisponível (sem tentativas)', () => {
    expect(receptionStats(events('recepcao', { erro: 3 })).score).toBe(0);
    expect(receptionStats([]).score).toBeNull();
    expect(formatScore(0)).toBe('0,00');
    expect(formatScore(null)).toBe('—');
  });

  it('sem tentativas, toda a distribuição é indisponível', () => {
    const r = receptionStats([]);
    expect(r.positive.value).toBeNull();
    expect(r.shares.A.value).toBeNull();
    expect(r.sample).toBe('none');
  });

  it('formatação da nota usa vírgula', () => {
    expect(formatScore(2.25)).toBe('2,25');
    expect(formatScore(2.256, 1)).toBe('2,3');
  });
});

describe('levantamento', () => {
  it('distribuição e proporção de bolas excelentes ou atacáveis', () => {
    const s = settingStats(events('levantamento', { excelente: 8, atacavel: 6, quebrado: 4, erro: 2 }, 'lev'));
    expect(s.attempts).toBe(20);
    expect(s.counts).toEqual({ excelente: 8, atacavel: 6, quebrado: 4, erro: 2 });
    expect(s.attackable).toEqual({ successes: 14, attempts: 20, value: 0.7 });
    expect(s.shares.quebrado.value).toBe(0.2);
  });

  it('a qualidade da levantada independe do resultado do ataque (indicadores distintos)', () => {
    const lev = events('levantamento', { excelente: 10 });
    const antes = settingStats(lev);
    const comAtaquesRuins = settingStats([...lev, ...events('ataque', { erro: 10, bloqueado: 5 })]);
    expect(comAtaquesRuins).toEqual(antes);
    expect(attackStats([...lev, ...events('ataque', { ponto: 4 })]).attempts).toBe(4);
  });

  it('sem tentativas é indisponível', () => {
    expect(settingStats([]).attackable.value).toBeNull();
  });
});

describe('ataque', () => {
  it('eficiência = (pontos − erros − bloqueados) ÷ tentativas', () => {
    const a = attackStats(events('ataque', { ponto: 8, erro: 2, bloqueado: 1, outra: 9 }));
    expect(a.attempts).toBe(20);
    expect(a.efficiency).toEqual({ numerator: 5, attempts: 20, value: 0.25 });
    expect(formatEfficiency(a.efficiency)).toBe('25,0%');
  });

  it('as quatro categorias são mutuamente exclusivas: somam as tentativas, sem contar duas vezes', () => {
    const a = attackStats(events('ataque', { ponto: 3, erro: 2, bloqueado: 4, outra: 5 }));
    expect(a.kills + a.errors + a.blocked + a.other).toBe(a.attempts);
    expect(a.attempts).toBe(14);
  });

  it('"outra tentativa" conta no denominador mas não pontua nem desconta', () => {
    const base = attackStats(events('ataque', { ponto: 2, erro: 1 }));
    const comOutras = attackStats(events('ataque', { ponto: 2, erro: 1, outra: 3 }));
    expect(base.efficiency.numerator).toBe(comOutras.efficiency.numerator);
    expect(comOutras.efficiency.attempts).toBe(base.efficiency.attempts + 3);
  });

  it('eficiência pode ser negativa e aparece com sinal', () => {
    const a = attackStats(events('ataque', { ponto: 1, erro: 3, bloqueado: 2 }));
    expect(a.efficiency.value).toBeCloseTo(-4 / 6, 10);
    expect(formatEfficiency(a.efficiency)).toBe('−66,7%');
  });

  it('eficiência 0% com tentativas é diferente de indisponível', () => {
    const zero = attackStats(events('ataque', { ponto: 2, erro: 2 }));
    expect(zero.efficiency.value).toBe(0);
    expect(formatEfficiency(zero.efficiency)).toBe('0,0%');
    const none = attackStats([]);
    expect(none.efficiency.value).toBeNull();
    expect(formatEfficiency(none.efficiency)).toBe('—');
  });

  it('taxas de ponto, erro e bloqueio usam as tentativas como denominador', () => {
    const a = attackStats(events('ataque', { ponto: 5, erro: 2, bloqueado: 3 }));
    expect(a.killRate).toEqual({ successes: 5, attempts: 10, value: 0.5 });
    expect(a.errorRate.value).toBe(0.2);
    expect(a.blockedRate.value).toBe(0.3);
  });
});

describe('bloqueio e defesa', () => {
  it('bloqueio: pontos diretos, sem ponto e erros, com taxas sobre as tentativas', () => {
    const b = blockStats(events('bloqueio', { ponto: 3, sem_ponto: 6, erro: 1 }));
    expect(b).toMatchObject({ attempts: 10, points: 3, noPoint: 6, errors: 1 });
    expect(b.pointRate.value).toBe(0.3);
    expect(b.errorRate.value).toBe(0.1);
  });

  it('defesa: positivas, recuperadas e erros somam as tentativas', () => {
    const d = defenseStats(events('defesa', { positiva: 6, recuperada: 3, erro: 1 }));
    expect(d.positive + d.recovered + d.errors).toBe(d.attempts);
    expect(d.positiveRate.value).toBe(0.6);
    expect(d.recoveredRate.value).toBe(0.3);
    expect(d.errorRate.value).toBe(0.1);
  });

  it('sem registros, indisponíveis', () => {
    expect(blockStats([]).pointRate.value).toBeNull();
    expect(defenseStats([]).positiveRate.value).toBeNull();
  });
});

describe('headline (indicador principal por fundamento)', () => {
  it('traz valor, contexto com denominador e nível de amostra', () => {
    expect(headline('saque', events('saque', { ace: 3, valido: 15, erro: 6 }))).toMatchObject({
      label: 'Taxa de ace',
      display: '12,5%',
      context: '3 de 24',
      attempts: 24,
      sample: 'adequate',
    });
    expect(headline('recepcao', events('recepcao', { A: 10, B: 6, C: 3, erro: 1 }))).toMatchObject({
      display: '2,25',
      context: '20 recepções',
    });
    expect(headline('ataque', events('ataque', { ponto: 8, erro: 2, bloqueado: 1, outra: 9 }))).toMatchObject({
      display: '25,0%',
      context: '(8 − 2 − 1) de 20 tentativas',
    });
    expect(headline('levantamento', events('levantamento', { excelente: 1, quebrado: 1 })).context).toBe('1 de 2');
    expect(headline('bloqueio', events('bloqueio', { ponto: 1 })).label).toBe('Taxa de ponto de bloqueio');
    expect(headline('defesa', events('defesa', { positiva: 1 })).label).toBe('Defesas positivas');
  });

  it('sem tentativas: "—" e "sem tentativas registradas", nunca zero', () => {
    for (const f of ['saque', 'recepcao', 'levantamento', 'ataque', 'bloqueio', 'defesa'] as const) {
      const h = headline(f, []);
      expect(h.display).toBe('—');
      expect(h.context).toBe('sem tentativas registradas');
      expect(h.value).toBeNull();
      expect(h.sample).toBe('none');
    }
  });

  it('amostra pequena é sinalizada', () => {
    expect(headline('saque', events('saque', { ace: 1, valido: 2 })).sample).toBe('small');
  });
});

describe('comparação entre participantes', () => {
  const rich = (playerId: string, aces: number, valid: number) => events('saque', { ace: aces, valido: valid }, playerId);
  const all = [...rich('ana', 5, 10), ...rich('bia', 2, 13), ...rich('caio', 1, 2)];

  it('ordena por desempenho só quem tem amostra adequada; insuficientes vão ao fim', () => {
    const c = compareParticipants(all, ['caio', 'bia', 'ana'], 'saque');
    expect(c.rows.map((r) => r.playerId)).toEqual(['ana', 'bia', 'caio']);
    expect(c.rows.map((r) => r.eligible)).toEqual([true, true, false]);
    expect(c.eligibleCount).toBe(2);
    expect(c.canCompare).toBe(true);
  });

  it('com menos de dois atletas de amostra adequada, não há base para comparar', () => {
    const c = compareParticipants(all, ['ana', 'caio'], 'saque');
    expect(c.canCompare).toBe(false);
    expect(c.eligibleCount).toBe(1);
  });

  it('participante sem nenhum registro aparece como indisponível e inelegível', () => {
    const c = compareParticipants(all, ['ana', 'sem-registro'], 'saque');
    const row = c.rows.find((r) => r.playerId === 'sem-registro')!;
    expect(row.eligible).toBe(false);
    expect(row.headline.display).toBe('—');
    expect(row.headline.sample).toBe('none');
  });

  it('compara apenas o fundamento pedido', () => {
    const c = compareParticipants([...all, ...events('ataque', { ponto: 12 }, 'ana')], ['ana', 'bia'], 'ataque');
    expect(c.rows.find((r) => r.playerId === 'ana')?.headline.attempts).toBe(12);
    expect(c.rows.find((r) => r.playerId === 'bia')?.headline.attempts).toBe(0);
  });

  it('anulados não contam para a elegibilidade', () => {
    const base = [...voided(rich('ana', 6, 6)), ...rich('bia', 5, 5)];
    const c = compareParticipants(base, ['ana', 'bia'], 'saque');
    expect(c.rows.find((r) => r.playerId === 'ana')?.eligible).toBe(false);
  });
});

describe('summarizeTraining', () => {
  const training = makeTraining({ id: 'tr', participantIds: ['p1', 'p2', 'p3'] });
  const ex1 = makeExercise('tr', { id: 'ex1', name: 'Saque', order: 1 });
  const ex0 = makeExercise('tr', { id: 'ex0', name: 'Aquecimento', order: 0 });
  const list = [
    makeEvent('tr', 'ex1', 'p1', 'saque', 'ace'),
    makeEvent('tr', 'ex1', 'p1', 'saque', 'erro'),
    makeEvent('tr', 'ex0', 'p2', 'defesa', 'positiva'),
    makeEvent('tr', 'ex0', 'p2', 'defesa', 'erro', { voidedAt: 'x' }),
    makeEvent('outro', 'exz', 'p1', 'saque', 'ace'),
  ];

  it('conta participantes, exercícios, registros válidos e anulados do treino', () => {
    const s = summarizeTraining(training, [ex1, ex0, makeExercise('outro')], list);
    expect(s).toMatchObject({ participants: 3, exercises: 2, validEvents: 3, voidedEvents: 1 });
    expect(s.attemptsByFundamental).toMatchObject({ saque: 2, defesa: 1, ataque: 0 });
  });

  it('lista exercícios em ordem e contagem por exercício', () => {
    const s = summarizeTraining(training, [ex1, ex0], list);
    expect(s.perExercise).toEqual([
      { exerciseId: 'ex0', name: 'Aquecimento', count: 1 },
      { exerciseId: 'ex1', name: 'Saque', count: 2 },
    ]);
  });

  it('inclui todos os participantes, mesmo os sem registros (total 0 só aqui, como contagem)', () => {
    const s = summarizeTraining(training, [ex1, ex0], list);
    expect(s.perPlayer.map((p) => p.playerId)).toEqual(['p1', 'p2', 'p3']);
    expect(s.perPlayer.find((p) => p.playerId === 'p3')?.total).toBe(0);
    expect(s.perPlayer.find((p) => p.playerId === 'p1')?.byFundamental.saque).toBe(2);
  });

  it('treino sem registros resume com zeros de contagem e nenhuma estatística inventada', () => {
    const s = summarizeTraining(training, [], []);
    expect(s.validEvents).toBe(0);
    expect(Object.values(s.attemptsByFundamental).every((n) => n === 0)).toBe(true);
  });
});
