import { boxesAt, compareWithVideo, formatMs, isWithinAnalysis, parseVideoAnalysis, type VideoAnalysis } from './videoReview';

const base = () => ({
  schema_version: 'alpha7.video-analysis/1',
  source: { filename: 'jogo.mp4', size_bytes: 1000, width: 848, height: 478, fps: 30, duration_s: 10 },
  frames: [
    { frame_index: 0, timestamp_ms: 0, detections: [{ track_id: 1, bbox_xyxy: [10, 20, 60, 120], confidence: 0.9 }] },
    { frame_index: 6, timestamp_ms: 200, detections: [{ track_id: 1, bbox_xyxy: [20, 20, 70, 120], confidence: 0.8 }] },
  ],
  tracks: [{ track_id: 1, first_timestamp_ms: 0, last_timestamp_ms: 200, detections: 2 }],
});

const parse = (value: unknown, limits?: Parameters<typeof parseVideoAnalysis>[1]) => parseVideoAnalysis(typeof value === 'string' ? value : JSON.stringify(value), limits);
const problems = (value: unknown, limits?: Parameters<typeof parseVideoAnalysis>[1]) => {
  const result = parse(value, limits);
  return result.ok ? [] : result.problems;
};
const must = (value: unknown): VideoAnalysis => {
  const result = parse(value);
  if (!result.ok) throw new Error(result.problems.join('; '));
  return result.value;
};

describe('parseVideoAnalysis: arquivo válido', () => {
  it('lê o mínimo (2 quadros, 1 trilha) e calcula o trecho analisado', () => {
    const analysis = must(base());
    expect(analysis.source).toEqual({ filename: 'jogo.mp4', sizeBytes: 1000, width: 848, height: 478, fps: 30, durationS: 10 });
    expect(analysis.frames).toHaveLength(2);
    expect(analysis.frames[0]?.boxes[0]).toEqual({ trackId: 1, bbox: [10, 20, 60, 120], confidence: 0.9 });
    expect(analysis.tracks).toEqual([{ trackId: 1, firstMs: 0, lastMs: 200, detections: 2 }]);
    expect([analysis.analyzedFromMs, analysis.analyzedToMs]).toEqual([0, 200]);
  });

  it('aceita detecção sem trilha (track_id nulo), tamanho e duração nulos', () => {
    const value = base();
    value.frames[0]!.detections.push({ track_id: null as unknown as number, bbox_xyxy: [0, 0, 5, 5], confidence: 0.4 });
    (value.source as Record<string, unknown>).size_bytes = null;
    (value.source as Record<string, unknown>).duration_s = null;
    const analysis = must(value);
    expect(analysis.frames[0]?.boxes[1]?.trackId).toBeNull();
    expect(analysis.source.sizeBytes).toBeNull();
    expect(analysis.source.durationS).toBeNull();
  });

  it('ignora campos desconhecidos: só o que é conhecido passa adiante', () => {
    const value = { ...base(), segredo: 'x' } as Record<string, unknown>;
    (value.source as Record<string, unknown>).caminho = 'C:/Users/pessoa/jogo.mp4';
    (value.frames as Record<string, unknown>[])[0]!.extra = 1;
    const analysis = must(value);
    expect(JSON.stringify(analysis)).not.toContain('segredo');
    expect(JSON.stringify(analysis)).not.toContain('pessoa');
  });
});

describe('parseVideoAnalysis: rejeita o arquivo inteiro', () => {
  it('não é JSON, ou a raiz não é um objeto', () => {
    expect(problems('isto não é json')[0]).toMatch(/não é um JSON válido/);
    expect(problems('[1,2]')[0]).toMatch(/objeto/);
    expect(problems('null')[0]).toMatch(/objeto/);
  });

  it('esquema de outra versão', () => {
    expect(problems({ ...base(), schema_version: 'alpha7.video-analysis/2' }).join(' ')).toMatch(/alpha7\.video-analysis\/1/);
    expect(problems({ ...base(), schema_version: undefined }).join(' ')).toMatch(/alpha7\.video-analysis\/1/);
  });

  it('campo obrigatório faltando ou com tipo errado', () => {
    const noFrames = { ...base(), frames: undefined };
    expect(problems(noFrames).join(' ')).toMatch(/frames/);
    const badWidth = base();
    (badWidth.source as Record<string, unknown>).width = '848';
    expect(problems(badWidth).join(' ')).toMatch(/source\.width/);
    const badFps = base();
    badFps.source.fps = 0;
    expect(problems(badFps).join(' ')).toMatch(/source\.fps/);
  });

  it('análise sem nenhum quadro', () => {
    expect(problems({ ...base(), frames: [] }).join(' ')).toMatch(/nenhum quadro/);
  });

  it('confiança fora de 0 a 1 e caixa malformada', () => {
    const conf = base();
    conf.frames[0]!.detections[0]!.confidence = 1.2;
    expect(problems(conf).join(' ')).toMatch(/confidence/);
    const three = base();
    three.frames[0]!.detections[0]!.bbox_xyxy = [1, 2, 3] as unknown as number[];
    expect(problems(three).join(' ')).toMatch(/bbox_xyxy/);
    const nan = base();
    nan.frames[0]!.detections[0]!.bbox_xyxy = [1, 2, null as unknown as number, 4];
    expect(problems(nan).join(' ')).toMatch(/bbox_xyxy/);
    const inverted = base();
    inverted.frames[0]!.detections[0]!.bbox_xyxy = [50, 50, 10, 10];
    expect(problems(inverted).join(' ')).toMatch(/bbox_xyxy/);
  });

  it('tempo que volta', () => {
    const value = base();
    value.frames[1]!.timestamp_ms = -5;
    expect(problems(value).join(' ')).toMatch(/timestamp_ms/);
  });

  it('detecção que cita uma trilha inexistente', () => {
    const value = base();
    value.frames[1]!.detections[0]!.track_id = 9;
    expect(problems(value).join(' ')).toMatch(/trilha 9/);
  });

  it('trilha com início depois do fim', () => {
    const value = base();
    value.tracks[0]!.first_timestamp_ms = 500;
    expect(problems(value).join(' ')).toMatch(/tracks\[0\]/);
  });

  it('excesso de quadros, de detecções por quadro, de trilhas e de texto (limites injetáveis)', () => {
    expect(problems(base(), { maxFrames: 1 }).join(' ')).toMatch(/quadros/);
    expect(problems(base(), { maxDetectionsPerFrame: 0 }).join(' ')).toMatch(/detecções/);
    expect(problems(base(), { maxTracks: 0 }).join(' ')).toMatch(/trilhas/);
    expect(problems(base(), { maxChars: 50 }).join(' ')).toMatch(/grande demais/);
  });

  it('lista no máximo 8 problemas', () => {
    const value = base();
    value.frames = Array.from({ length: 30 }, (_, i) => ({ frame_index: i, timestamp_ms: i, detections: [{ track_id: 1, bbox_xyxy: [1, 2, 3], confidence: 2 }] })) as never;
    expect(problems(value).length).toBeLessThanOrEqual(8);
  });
});

describe('boxesAt', () => {
  const analysis = () => must(base());

  it('no meio de dois quadros interpola a caixa da mesma trilha em linha reta', () => {
    const [box] = boxesAt(analysis(), 100);
    expect(box?.trackId).toBe(1);
    expect(box?.bbox).toEqual([15, 20, 65, 120]);
  });

  it('em cima de um quadro devolve exatamente as caixas dele', () => {
    expect(boxesAt(analysis(), 0)[0]?.bbox).toEqual([10, 20, 60, 120]);
    expect(boxesAt(analysis(), 200)[0]?.bbox).toEqual([20, 20, 70, 120]);
  });

  it('antes do trecho analisado não há caixas; logo depois do último quadro ele ainda é mostrado por até 1 s', () => {
    const value = base();
    value.frames.forEach((f) => (f.timestamp_ms += 5000));
    value.tracks[0]!.first_timestamp_ms = 5000;
    value.tracks[0]!.last_timestamp_ms = 5200;
    const a = must(value);
    expect(boxesAt(a, 4000)).toEqual([]);
    expect(boxesAt(a, 5600)[0]?.bbox).toEqual([20, 20, 70, 120]);
    expect(boxesAt(a, 6300)).toEqual([]);
  });

  it('quem só aparece de um lado some ou surge na metade do caminho', () => {
    const value = base();
    value.frames[1]!.detections = [{ track_id: 2, bbox_xyxy: [200, 20, 250, 120], confidence: 0.9 }];
    value.tracks.push({ track_id: 2, first_timestamp_ms: 200, last_timestamp_ms: 200, detections: 1 });
    const a = must(value);
    expect(boxesAt(a, 50).map((b) => b.trackId)).toEqual([1]);
    expect(boxesAt(a, 150).map((b) => b.trackId)).toEqual([2]);
  });

  it('detecção sem trilha acompanha o lado mais próximo', () => {
    const value = base();
    value.frames[0]!.detections = [{ track_id: null as unknown as number, bbox_xyxy: [10, 10, 30, 60], confidence: 0.5 }];
    value.frames[1]!.detections = [{ track_id: null as unknown as number, bbox_xyxy: [90, 10, 110, 60], confidence: 0.5 }];
    value.tracks = [];
    const a = must(value);
    expect(boxesAt(a, 40)[0]?.bbox).toEqual([10, 10, 30, 60]);
    expect(boxesAt(a, 160)[0]?.bbox).toEqual([90, 10, 110, 60]);
  });

  it('buraco grande entre quadros (falha do detector) não estica as caixas por segundos', () => {
    const value = base();
    value.frames[1]!.timestamp_ms = 5000;
    value.tracks[0]!.last_timestamp_ms = 5000;
    const a = must(value);
    expect(boxesAt(a, 200)).toHaveLength(1);
    expect(boxesAt(a, 2500)).toEqual([]);
  });
});

describe('compareWithVideo', () => {
  const source = must(base()).source;
  const same = { name: 'jogo.mp4', sizeBytes: 1000, durationS: 10, width: 848, height: 478 };

  it('vídeo que bate com a análise não gera aviso', () => {
    expect(compareWithVideo(source, same)).toEqual([]);
  });

  it('duração, resolução, proporção e tamanho diferentes geram avisos claros', () => {
    expect(compareWithVideo(source, { ...same, durationS: 20 }).join(' ')).toMatch(/duração/);
    expect(compareWithVideo(source, { ...same, width: 1280, height: 720 }).join(' ')).toMatch(/resolução/);
    expect(compareWithVideo(source, { ...same, width: 800, height: 800 }).join(' ')).toMatch(/proporção/);
    expect(compareWithVideo(source, { ...same, sizeBytes: 5 }).join(' ')).toMatch(/tamanho do arquivo/);
  });

  it('duração parecida (até 1 s) e duração desconhecida não avisam', () => {
    expect(compareWithVideo(source, { ...same, durationS: 10.8 })).toEqual([]);
    expect(compareWithVideo(source, { ...same, durationS: null })).toEqual([]);
  });
});

describe('formatMs', () => {
  it('mostra minutos e segundos, e horas quando passa de 60 min', () => {
    expect(formatMs(0)).toBe('0:00');
    expect(formatMs(65_400)).toBe('1:05');
    expect(formatMs(3_723_000)).toBe('1:02:03');
    expect(formatMs(-50)).toBe('0:00');
  });
});

describe('isWithinAnalysis', () => {
  const a = () => must(base()); // trecho de 0 a 200 ms

  it('dentro do trecho (e até 1 s depois do último quadro) é verdadeiro; antes e bem depois, falso', () => {
    expect(isWithinAnalysis(a(), 0)).toBe(true);
    expect(isWithinAnalysis(a(), 150)).toBe(true);
    expect(isWithinAnalysis(a(), 1200)).toBe(true);
    expect(isWithinAnalysis(a(), 1201)).toBe(false);
    expect(isWithinAnalysis(a(), -1)).toBe(false);
  });
});

describe('id da análise', () => {
  it('é estável para o mesmo texto e muda quando o conteúdo muda', () => {
    const text = JSON.stringify(base());
    const a = parseVideoAnalysis(text);
    const b = parseVideoAnalysis(text);
    const other = base();
    other.frames[1]!.detections[0]!.bbox_xyxy = [21, 20, 70, 120];
    const c = parseVideoAnalysis(JSON.stringify(other));
    if (!a.ok || !b.ok || !c.ok) throw new Error('arquivo de teste inválido');
    expect(a.value.id).toBe(b.value.id);
    expect(a.value.id).not.toBe(c.value.id);
    expect(a.value.id).toMatch(/^[0-9a-f]{8}-\d+$/);
  });
});

