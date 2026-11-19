import {
  LEAD_IN_MS,
  assignTrack,
  clearSync,
  duplicatedAthletes,
  emptyReview,
  parseReviewFile,
  reviewFilename,
  reviewKey,
  seekTarget,
  serializeReview,
  suggestedAthletes,
  setSync,
  syncedVideoMs,
  type ReviewData,
} from './videoReviewData';

const video = { name: 'jogo.mp4', size: 1000, lastModified: 1_700_000_000_000 };
const fresh = () => emptyReview('m1', video, 'abc-1');

describe('assignTrack', () => {
  it('associa, troca e remove sem alterar o objeto original', () => {
    const empty = fresh();
    const a = assignTrack(empty, 1, 'p1');
    expect(a.assignments).toEqual({ 1: 'p1' });
    expect(empty.assignments).toEqual({});
    const b = assignTrack(a, 1, 'p2');
    expect(b.assignments).toEqual({ 1: 'p2' });
    expect(assignTrack(b, 1, null).assignments).toEqual({});
  });

  it('várias trilhas podem ser do mesmo atleta (o rastreador troca números)', () => {
    const data = assignTrack(assignTrack(fresh(), 1, 'p1'), 7, 'p1');
    expect(data.assignments).toEqual({ 1: 'p1', 7: 'p1' });
  });

  it('remover uma trilha que não tem atleta não muda nada', () => {
    expect(assignTrack(fresh(), 3, null).assignments).toEqual({});
  });
});

describe('duplicatedAthletes', () => {
  const data = (): ReviewData => assignTrack(assignTrack(assignTrack(fresh(), 1, 'p1'), 7, 'p1'), 2, 'p2');

  it('acusa o atleta que está em duas caixas visíveis ao mesmo tempo', () => {
    expect(duplicatedAthletes(data(), [1, 7, 2])).toEqual(['p1']);
  });

  it('o mesmo atleta em trilhas que não aparecem juntas não conta', () => {
    expect(duplicatedAthletes(data(), [1, 2])).toEqual([]);
    expect(duplicatedAthletes(data(), [7, 2])).toEqual([]);
  });

  it('trilha sem atleta, trilha desconhecida e detecção sem trilha (null) são ignoradas', () => {
    expect(duplicatedAthletes(data(), [null, null, 99, 98])).toEqual([]);
  });

  it('a mesma trilha repetida na lista não vira duplicidade', () => {
    expect(duplicatedAthletes(data(), [1, 1])).toEqual([]);
  });
});

describe('sincronização com os pontos', () => {
  const t = (iso: string) => ({ recordedAt: iso });
  const rallies = [
    { id: 'r1', recordedAt: '2026-10-01T10:00:00.000Z' },
    { id: 'r2', recordedAt: '2026-10-01T10:00:30.000Z' },
    { id: 'r3', recordedAt: '2026-10-01T10:01:10.000Z' },
  ];

  it('calcula o instante do vídeo pela diferença entre os horários de registro', () => {
    const ref = { rallyId: 'r2', videoMs: 100_000 };
    expect(syncedVideoMs(ref, rallies, t('2026-10-01T10:00:30.000Z'))).toBe(100_000);
    expect(syncedVideoMs(ref, rallies, t('2026-10-01T10:01:10.000Z'))).toBe(140_000);
    expect(syncedVideoMs(ref, rallies, t('2026-10-01T10:00:00.000Z'))).toBe(70_000);
  });

  it('sem referência, ou com a referência fora dos pontos ativos (anulada), devolve null', () => {
    expect(syncedVideoMs(undefined, rallies, t('2026-10-01T10:00:30.000Z'))).toBeNull();
    expect(syncedVideoMs({ rallyId: 'r9', videoMs: 5 }, rallies, t('2026-10-01T10:00:30.000Z'))).toBeNull();
  });

  it('horário ilegível devolve null em vez de NaN', () => {
    expect(syncedVideoMs({ rallyId: 'r1', videoMs: 5 }, rallies, t('não é data'))).toBeNull();
  });

  it('setSync e clearSync trocam a referência de um set sem mexer nos outros', () => {
    const a = setSync(fresh(), 1, { rallyId: 'r1', videoMs: 1000 });
    const b = setSync(a, 2, { rallyId: 'r5', videoMs: 9000 });
    expect(b.syncs).toEqual({ 1: { rallyId: 'r1', videoMs: 1000 }, 2: { rallyId: 'r5', videoMs: 9000 } });
    expect(clearSync(b, 1).syncs).toEqual({ 2: { rallyId: 'r5', videoMs: 9000 } });
    expect(a.syncs).toEqual({ 1: { rallyId: 'r1', videoMs: 1000 } });
  });

  it('o vídeo vai 5 s antes do ponto e nunca antes do início', () => {
    expect(LEAD_IN_MS).toBe(5000);
    expect(seekTarget(20_000)).toBe(15_000);
    expect(seekTarget(3_000)).toBe(0);
  });
});

describe('reviewKey', () => {
  it('muda com a partida, o vídeo e a análise; igual quando tudo é igual', () => {
    const base = reviewKey(fresh());
    expect(reviewKey(emptyReview('m1', video, 'abc-1'))).toBe(base);
    expect(reviewKey(emptyReview('m2', video, 'abc-1'))).not.toBe(base);
    expect(reviewKey(emptyReview('m1', { ...video, size: 1001 }, 'abc-1'))).not.toBe(base);
    expect(reviewKey(emptyReview('m1', { ...video, lastModified: 5 }, 'abc-1'))).not.toBe(base);
    expect(reviewKey(emptyReview('m1', { ...video, name: 'outro.mp4' }, 'abc-1'))).not.toBe(base);
    expect(reviewKey(emptyReview('m1', video, 'abc-2'))).not.toBe(base);
  });
});

describe('arquivo de revisão (exportar e importar)', () => {
  const context = () => ({
    matchId: 'm1',
    analysisId: 'abc-1',
    trackIds: new Set([1, 2, 7]),
    playerIds: new Set(['p1', 'p2']),
    rallyIds: new Set(['r1', 'r2']),
  });
  const sample = () => setSync(assignTrack(assignTrack(fresh(), 1, 'p1'), 7, 'p2'), 1, { rallyId: 'r2', videoMs: 42_000 });
  const parse = (value: unknown, ctx = context()) => parseReviewFile(typeof value === 'string' ? value : JSON.stringify(value), ctx);
  const problems = (value: unknown, ctx = context()) => {
    const r = parse(value, ctx);
    return r.ok ? [] : r.problems;
  };
  const valid = () => JSON.parse(serializeReview(sample(), new Date('2026-10-23T12:00:00Z'))) as Record<string, unknown>;

  it('ida e volta: o que foi exportado volta igual, sem ignorados', () => {
    const result = parse(serializeReview(sample(), new Date('2026-10-23T12:00:00Z')));
    expect(result).toEqual({ ok: true, value: { assignments: { 1: 'p1', 7: 'p2' }, syncs: { 1: { rallyId: 'r2', videoMs: 42_000 } } }, ignored: 0 });
  });

  it('o arquivo exportado identifica partida, análise e vídeo, e tem esquema versionado', () => {
    const file = valid();
    expect(file.schema_version).toBe('alpha7.video-review/1');
    expect(file.match_id).toBe('m1');
    expect(file.analysis_id).toBe('abc-1');
    expect(file.video).toEqual({ name: 'jogo.mp4', size: 1000, last_modified: 1_700_000_000_000 });
    expect(file.exported_at).toBe('2026-10-23T12:00:00.000Z');
  });

  it('recusa lixo, esquema errado, outra partida e outra análise', () => {
    expect(problems('isto não é json')[0]).toMatch(/não é um JSON válido/);
    expect(problems('[]')[0]).toMatch(/objeto/);
    expect(problems({ ...valid(), schema_version: 'outro/1' }).join(' ')).toMatch(/alpha7\.video-review\/1/);
    expect(problems({ ...valid(), match_id: 'm9' }).join(' ')).toMatch(/outra partida/);
    expect(problems({ ...valid(), analysis_id: 'zzz' }).join(' ')).toMatch(/outra análise/);
  });

  it('recusa tipos errados e duplicatas', () => {
    expect(problems({ ...valid(), assignments: [{ track_id: '1', player_id: 'p1' }] }).join(' ')).toMatch(/assignments\[0\]/);
    expect(problems({ ...valid(), assignments: [{ track_id: 1, player_id: '' }] }).join(' ')).toMatch(/assignments\[0\]/);
    expect(problems({ ...valid(), assignments: [{ track_id: 1, player_id: 'p1' }, { track_id: 1, player_id: 'p2' }] }).join(' ')).toMatch(/duplicad/);
    expect(problems({ ...valid(), syncs: [{ set_number: 1, rally_id: 'r1', video_ms: -5 }] }).join(' ')).toMatch(/syncs\[0\]/);
    expect(problems({ ...valid(), syncs: [{ set_number: 1, rally_id: 'r1', video_ms: 1 }, { set_number: 1, rally_id: 'r2', video_ms: 2 }] }).join(' ')).toMatch(/duplicad/);
    expect(problems({ ...valid(), assignments: 'x' }).join(' ')).toMatch(/assignments/);
  });

  it('ignora e conta o que já não existe (trilha, atleta ou ponto de referência), sem recusar o arquivo', () => {
    const file = {
      ...valid(),
      assignments: [
        { track_id: 1, player_id: 'p1' },
        { track_id: 99, player_id: 'p1' }, // trilha que não existe nesta análise
        { track_id: 2, player_id: 'saiu' }, // atleta que saiu do elenco
      ],
      syncs: [{ set_number: 1, rally_id: 'r-apagado', video_ms: 1000 }],
    };
    expect(parse(file)).toEqual({ ok: true, value: { assignments: { 1: 'p1' }, syncs: {} }, ignored: 3 });
  });

  it('só os campos conhecidos passam adiante', () => {
    const result = parse({ ...valid(), segredo: 'x', video: { name: 'C:/Users/pessoa/jogo.mp4', size: 1, last_modified: 1 } });
    expect(JSON.stringify(result)).not.toContain('segredo');
    expect(JSON.stringify(result)).not.toContain('pessoa');
  });

  it('arquivo grande demais é recusado', () => {
    expect(problems('x'.repeat(6 * 1024 * 1024))[0]).toMatch(/grande demais/);
  });
});

describe('reviewFilename', () => {
  const now = new Date('2026-10-23T12:00:00Z');
  it('usa o adversário sem acento nem símbolos e a data', () => {
    expect(reviewFilename('Vôlei São José!', now)).toBe('alpha7-revisao-volei-sao-jose-2026-10-23.json');
  });
  it('adversário vazio ou só símbolos vira "partida"; nomes enormes são cortados', () => {
    expect(reviewFilename('???', now)).toBe('alpha7-revisao-partida-2026-10-23.json');
    expect(reviewFilename('a'.repeat(200), now).length).toBeLessThan(80);
  });
});

describe('suggestedAthletes', () => {
  const roster = new Set(['p1', 'p2']);
  const data = () => assignTrack(assignTrack(assignTrack(fresh(), 1, 'p1'), 7, 'p1'), 2, 'p2');

  it('devolve os atletas das trilhas visíveis, sem repetir, na ordem das trilhas', () => {
    expect(suggestedAthletes(data(), [2, 1, 7], roster)).toEqual(['p2', 'p1']);
  });

  it('ignora trilha sem atleta e atleta que saiu do elenco', () => {
    expect(suggestedAthletes(data(), [99, 1], new Set(['p2']))).toEqual([]);
    expect(suggestedAthletes(data(), [], roster)).toEqual([]);
  });
});
