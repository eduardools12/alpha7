import { createUniformAttributes, withAttribute } from './attributes';
import {
  biggestRisers,
  overallHistory,
  playerStandings,
  readAttributes,
  teamOverallSeries,
  topByOverall,
} from './insights';
import { DEFAULT_OVERALL_WEIGHTS } from './overall';
import { makeEvaluation, makePlayer } from '@/test/factories';

const a = makePlayer({ name: 'Ana Alves', primaryPosition: 'ponteiro' });
const b = makePlayer({ name: 'Bia Borges', primaryPosition: 'oposto' });
const c = makePlayer({ name: 'Cris Costa', primaryPosition: 'central' });

const evaluations = [
  makeEvaluation(a.id, '2026-05-10', createUniformAttributes(60)),
  makeEvaluation(a.id, '2026-08-10', createUniformAttributes(70)),
  makeEvaluation(b.id, '2026-08-20', createUniformAttributes(80)),
  makeEvaluation(b.id, '2026-09-20', createUniformAttributes(82)),
];

describe('teamOverallSeries', () => {
  const series = teamOverallSeries([a, b, c], evaluations, DEFAULT_OVERALL_WEIGHTS);

  it('cria um ponto por mês entre a primeira e a última avaliação', () => {
    expect(series.map((p) => p.month)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
  });

  it('usa a última avaliação de cada atleta até o fim do mês e informa o tamanho da amostra', () => {
    expect(series[0]).toMatchObject({ value: 60, sampleSize: 1 }); // só Ana
    expect(series[2]).toMatchObject({ value: 60, sampleSize: 1 }); // Ana ainda em 60
    expect(series[3]).toMatchObject({ value: 75, sampleSize: 2 }); // Ana 70 + Bia 80
    expect(series[4]).toMatchObject({ value: 76, sampleSize: 2 }); // Ana 70 + Bia 82
  });

  it('atleta sem nenhuma avaliação não puxa a média para zero', () => {
    expect(series.every((p) => p.sampleSize <= 2)).toBe(true);
  });

  it('sem avaliações, a série é vazia', () => {
    expect(teamOverallSeries([a], [], DEFAULT_OVERALL_WEIGHTS)).toEqual([]);
  });
});

describe('histórico e classificação', () => {
  it('overallHistory recalcula cada avaliação em ordem cronológica', () => {
    expect(overallHistory(a, evaluations, DEFAULT_OVERALL_WEIGHTS).map((p) => p.overall)).toEqual([60, 70]);
  });

  it('playerStandings ignora quem não tem avaliação e calcula a variação', () => {
    const standings = playerStandings([a, b, c], evaluations, DEFAULT_OVERALL_WEIGHTS);
    expect(standings.map((s) => s.player.id)).toEqual([a.id, b.id]);
    expect(standings.find((s) => s.player.id === a.id)?.delta).toBe(10);
    expect(standings.find((s) => s.player.id === b.id)?.delta).toBe(2);
  });

  it('um atleta com uma única avaliação tem variação null (não 0)', () => {
    const only = [makeEvaluation(c.id, '2026-09-01')];
    expect(playerStandings([c], only, DEFAULT_OVERALL_WEIGHTS)[0]?.delta).toBeNull();
  });

  it('topByOverall e biggestRisers ordenam e limitam', () => {
    const standings = playerStandings([a, b], evaluations, DEFAULT_OVERALL_WEIGHTS);
    expect(topByOverall(standings, 1)[0]?.player.id).toBe(b.id);
    expect(biggestRisers(standings, 5).map((s) => s.player.id)).toEqual([a.id, b.id]);
  });
});

describe('readAttributes', () => {
  it('separa pontos fortes e a desenvolver sem repetir atributos', () => {
    const attrs = withAttribute(withAttribute(createUniformAttributes(60), 'ATA', 95), 'DEF', 30);
    const reading = readAttributes(attrs);
    expect(reading.strengths[0]).toBe('ATA');
    expect(reading.needsWork[0]).toBe('DEF');
    expect(reading.strengths.filter((k) => reading.needsWork.includes(k))).toEqual([]);
  });
});
