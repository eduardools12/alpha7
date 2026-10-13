import { createDemoWorkspace, createEmptyWorkspace } from './demo';
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  MAX_BACKUP_BYTES,
  backupFilename,
  canonicalize,
  createBackup,
  hasRealData,
  parseBackup,
  summarizeWorkspace,
  validateWorkspace,
  workspaceFingerprint,
} from './backup';
import { sha256Hex } from './sha256';
import type { Workspace } from './types';
import { createUniformAttributes } from '@/domain/attributes';
import { cloneWeights, DEFAULT_OVERALL_WEIGHTS } from '@/domain/overall';
import { makeEvaluation, makeEvent, makeExercise, makePlayer, makeTraining } from '@/test/factories';

const NOW = new Date('2026-10-13T21:05:30');
const demo = () => createDemoWorkspace(new Date('2026-10-12T15:00:00'));
const exportJson = (ws: Workspace) => {
  const result = createBackup(ws, { appVersion: '9.9.9', now: NOW });
  if (!result.ok) throw new Error(`backup falhou: ${result.errors.join(' | ')}`);
  return result;
};
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Forja um arquivo cujo hash está CERTO mas cujo conteúdo foi alterado: testa a validação de vínculos e tipos. */
function forge(mutate: (body: Record<string, unknown>) => void, ws: Workspace = demo()): string {
  const file = clone(exportJson(ws).file) as unknown as { workspace: Record<string, unknown>; checksum: { value: string } };
  mutate(file.workspace);
  file.checksum.value = sha256Hex(canonicalize(file.workspace));
  return JSON.stringify(file);
}
const rejected = (text: string) => {
  const result = parseBackup(text);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.errors;
};

describe('exportar e importar o workspace completo', () => {
  it('a ida e volta devolve exatamente o mesmo workspace (todas as coleções)', () => {
    const original = demo();
    const parsed = parseBackup(exportJson(original).json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.workspace).toEqual(original);
    expect(parsed.summary).toEqual(summarizeWorkspace(original));
    expect(parsed.warnings).toEqual([]);
  });

  it('preserva avaliações e todo o histórico, na ordem', () => {
    const original = demo();
    const parsed = parseBackup(exportJson(original).json);
    if (!parsed.ok) throw new Error('esperado ok');
    expect(parsed.workspace.evaluations).toHaveLength(original.evaluations.length);
    expect(parsed.workspace.evaluations.map((e) => e.id)).toEqual(original.evaluations.map((e) => e.id));
    const gabriel = parsed.workspace.evaluations.filter((e) => e.playerId === 'demo-p-08');
    expect(gabriel).toHaveLength(6);
    expect(gabriel.map((e) => e.evaluatedAt)).toEqual([...gabriel.map((e) => e.evaluatedAt)].sort());
    expect(gabriel[0]!.attributes).toEqual(original.evaluations.find((e) => e.id === gabriel[0]!.id)!.attributes);
  });

  it('preserva os vínculos entre treinos, exercícios, participantes, jogadores e registros', () => {
    const parsed = parseBackup(exportJson(demo()).json);
    if (!parsed.ok) throw new Error('esperado ok');
    const ws = parsed.workspace;
    const players = new Set(ws.players.map((p) => p.id));
    expect(ws.trainings).toHaveLength(4);
    for (const training of ws.trainings) training.participantIds.forEach((id) => expect(players.has(id)).toBe(true));
    for (const exercise of ws.exercises) expect(ws.trainings.some((t) => t.id === exercise.trainingId)).toBe(true);
    for (const event of ws.trainingEvents) {
      const training = ws.trainings.find((t) => t.id === event.trainingId)!;
      expect(ws.exercises.find((e) => e.id === event.exerciseId)?.trainingId).toBe(training.id);
      expect(training.participantIds).toContain(event.playerId);
      expect(players.has(event.playerId)).toBe(true);
    }
    expect(ws.trainingEvents.length).toBeGreaterThan(300);
    expect(new Set(ws.trainingEvents.map((e) => e.attemptKey)).size).toBe(ws.trainingEvents.length);
  });

  it('preserva registros desfeitos, configurações personalizadas, escalações e atividade', () => {
    const original = demo();
    original.trainingEvents[0] = { ...original.trainingEvents[0]!, voidedAt: '2026-10-12T20:00:00.000Z' };
    original.settings.weights.ponteiro.SAC = 55;
    const parsed = parseBackup(exportJson(original).json);
    if (!parsed.ok) throw new Error('esperado ok');
    expect(parsed.workspace.trainingEvents[0]!.voidedAt).toBe('2026-10-12T20:00:00.000Z');
    expect(parsed.summary.trainingEventsVoided).toBe(1);
    expect(parsed.workspace.settings.weights.ponteiro.SAC).toBe(55);
    expect(parsed.workspace.lineups).toEqual(original.lineups);
    expect(parsed.workspace.activity).toEqual(original.activity);
  });

  it('funciona com workspace vazio e com dados reais misturados à demonstração', () => {
    const empty = parseBackup(exportJson(createEmptyWorkspace()).json);
    expect(empty.ok && empty.summary.players).toBe(0);

    const mixed = demo();
    const real = makePlayer({ id: 'real-1', name: 'Rui Teixeira', jerseyNumber: 40 });
    mixed.players.push(real);
    mixed.evaluations.push(makeEvaluation('real-1', '2026-10-01', createUniformAttributes(70)));
    const parsed = parseBackup(exportJson(mixed).json);
    if (!parsed.ok) throw new Error('esperado ok');
    expect(parsed.workspace.players.find((p) => p.id === 'real-1')?.demo).toBe(false);
    expect(parsed.summary.realRecords).toBe(2);
    expect(hasRealData(mixed)).toBe(true);
    expect(hasRealData(demo())).toBe(false);
  });

  it('o arquivo identifica formato, versões, data, contagens e hash, e tem nome com a data', () => {
    const { file, filename, json } = exportJson(demo());
    expect(file).toMatchObject({
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      appVersion: '9.9.9',
      workspaceSchemaVersion: 1,
      exportedAt: NOW.toISOString(),
      checksum: { algorithm: 'sha256' },
    });
    expect(file.checksum.value).toMatch(/^[0-9a-f]{64}$/);
    expect(file.counts.players).toBe(18);
    expect(filename).toBe('alpha7-backup-2026-10-13-2105.json');
    expect(json.endsWith('\n')).toBe(true);
  });

  it('inclui todas as coleções persistidas e nenhum segredo ou credencial', () => {
    const { file, json } = exportJson(demo());
    expect(Object.keys(file.workspace).sort()).toEqual([
      'activity', 'evaluations', 'exercises', 'lineups', 'players', 'settings', 'trainingEvents', 'trainings',
    ]);
    expect(json).not.toMatch(/secret|token|password|senha|api[_-]?key|service_role|anon|supabase|credential/i);
  });

  it('o nome do arquivo usa a data e a hora locais com zeros à esquerda', () => {
    expect(backupFilename(new Date('2026-01-05T03:07:00'))).toBe('alpha7-backup-2026-01-05-0307.json');
  });

  it('não altera o workspace de origem ao exportar', () => {
    const original = demo();
    const snapshot = JSON.stringify(original);
    exportJson(original);
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});

describe('validação antes de exportar', () => {
  it('recusa exportar um workspace com vínculo quebrado e não gera arquivo', () => {
    const broken = demo();
    broken.trainingEvents.push(makeEvent('treino-fantasma', 'x', 'demo-p-01', 'saque', 'ace'));
    const result = createBackup(broken, { appVersion: '1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/treino "treino-fantasma" não existe/);
  });
});

describe('rejeição de arquivos inválidos', () => {
  const valid = () => exportJson(demo()).json;

  it.each([
    ['vazio', ''],
    ['texto qualquer', 'isto não é json'],
    ['JSON truncado', valid().slice(0, valid().length / 2)],
    ['lista em vez de objeto', '[1,2,3]'],
    ['número', '42'],
    ['null', 'null'],
    ['objeto sem formato', '{"players":[]}'],
    ['outro formato', JSON.stringify({ ...JSON.parse(valid()), format: 'outro-app' })],
  ])('recusa arquivo %s', (_label, text) => {
    expect(rejected(text).length).toBeGreaterThan(0);
  });

  it('JSON truncado orienta a escolher um backup do Alpha7', () => {
    expect(rejected(valid().slice(0, 500))[0]).toMatch(/não é um JSON válido/);
  });

  it.each([
    [0, /versão do formato .* inválida/],
    [-1, /inválida/],
    [1.5, /inválida/],
    ['1', /inválida/],
    [2, /mais novo.*Atualize/],
    [99, /mais novo/],
  ])('versão do formato %s é recusada', (formatVersion, message) => {
    const file = { ...JSON.parse(valid()), formatVersion };
    expect(rejected(JSON.stringify(file))[0]).toMatch(message);
  });

  it('versão do esquema de dados diferente é recusada', () => {
    const file = { ...JSON.parse(valid()), workspaceSchemaVersion: 7 };
    expect(rejected(JSON.stringify(file))[0]).toMatch(/esquema de dados/);
  });

  it('sem checksum ou com hash errado: recusa (arquivo alterado ou corrompido)', () => {
    const file = JSON.parse(valid()) as { checksum?: unknown; workspace: { players: { name: string }[] } };
    delete file.checksum;
    expect(rejected(JSON.stringify(file))[0]).toMatch(/verificação de integridade/);

    const tampered = JSON.parse(valid()) as { workspace: { players: { name: string }[] } };
    tampered.workspace.players[0]!.name = 'Nome Alterado';
    expect(rejected(JSON.stringify(tampered))[0]).toMatch(/foi alterado ou está incompleto/);
  });

  it('arquivo grande demais é recusado antes de ser lido', () => {
    expect(rejected('x'.repeat(MAX_BACKUP_BYTES + 1))[0]).toMatch(/grande demais/);
  });

  it('aceita arquivo salvo com BOM (alguns editores adicionam)', () => {
    expect(parseBackup(`﻿${valid()}`).ok).toBe(true);
  });

  describe('conteúdo com hash correto, mas inválido (tipos e vínculos)', () => {
    const cases: [string, (b: Record<string, any>) => void, RegExp][] = [
      ['avaliação de atleta inexistente', (b) => { b.evaluations[0].playerId = 'ninguem'; }, /atleta "ninguem" não existe/],
      ['nota fora da escala', (b) => { b.evaluations[0].attributes.ATA = 150; }, /Ataque: use um inteiro de 1 a 99/],
      ['data de avaliação impossível', (b) => { b.evaluations[0].evaluatedAt = '2026-02-30'; }, /AAAA-MM-DD válida/],
      ['id de atleta repetido', (b) => { b.players[1].id = b.players[0].id; }, /aparece repetido/],
      ['camisa repetida', (b) => { b.players[1].jerseyNumber = b.players[0].jerseyNumber; }, /número de camisa/],
      ['posição inválida', (b) => { b.players[0].primaryPosition = 'goleiro'; }, /primaryPosition/],
      ['secundária igual à principal', (b) => { b.players[0].secondaryPosition = b.players[0].primaryPosition; }, /igual à posição principal/],
      ['nome de atleta curto demais', (b) => { b.players[0].name = ' a '; }, /pelo menos 2 caracteres/],
      ['demo que não é booleano', (b) => { b.players[0].demo = 'sim'; }, /verdadeiro ou falso/],
      ['participante inexistente', (b) => { b.trainings[0].participantIds.push('ninguem'); }, /atleta "ninguem" não existe/],
      ['participante repetido', (b) => { b.trainings[0].participantIds.push(b.trainings[0].participantIds[0]); }, /participante repetido/],
      ['exercício de treino inexistente', (b) => { b.exercises[0].trainingId = 'treino-fantasma'; }, /treino "treino-fantasma" não existe/],
      ['registro com exercício de outro treino', (b) => { b.trainingEvents[0].exerciseId = b.exercises.find((e: any) => e.trainingId !== b.trainingEvents[0].trainingId).id; }, /pertence a outro treino/],
      ['registro com treino inexistente', (b) => { b.trainingEvents[0].trainingId = 'treino-fantasma'; }, /treino "treino-fantasma" não existe/],
      ['registro com atleta inexistente', (b) => { b.trainingEvents[0].playerId = 'ninguem'; }, /atleta "ninguem" não existe/],
      ['registro válido de atleta que não participa', (b) => { const t = b.trainings.find((x: any) => x.id === b.trainingEvents[0].trainingId); t.participantIds = t.participantIds.filter((p: string) => p !== b.trainingEvents[0].playerId); }, /não participa do treino/],
      ['resultado de outro fundamento', (b) => { b.trainingEvents[0].fundamental = 'recepcao'; b.trainingEvents[0].outcome = 'ace'; }, /resultado não é válido/],
      ['tentativa duplicada (mesma chave)', (b) => { b.trainingEvents[1].attemptKey = b.trainingEvents[0].attemptKey; }, /tentativa duplicada/],
      ['data e hora de registro inválidas', (b) => { b.trainingEvents[0].recordedAt = 'ontem'; }, /ISO 8601/],
      ['escalação com atleta repetido', (b) => { b.lineups[0].benchIds.push(b.lineups[0].liberoId); }, /mais de uma vez/],
      ['escalação com seis posições a menos', (b) => { b.lineups[0].starters.pop(); }, /lista de 6 posições/],
      ['escalação com atleta inexistente', (b) => { b.lineups[0].liberoId = 'ninguem'; }, /atleta "ninguem" não existe/],
      ['papel tático de líbero em zona', (b) => { b.lineups[0].starters[0].role = 'libero'; }, /role/],
      ['peso negativo', (b) => { b.settings.weights.ponteiro.SAC = -1; }, /de 0 a 100/],
      ['pesos todos zero numa posição', (b) => { Object.keys(b.settings.weights.libero).forEach((k) => { b.settings.weights.libero[k] = 0; }); }, /maior que zero/],
      ['configurações ausentes', (b) => { delete b.settings; }, /pesos do Overall/],
      ['lista que não é lista', (b) => { b.players = 'oi'; }, /deve ser uma lista/],
      ['item que não é objeto', (b) => { b.players.push(7); }, /deve ser um objeto/],
      ['texto absurdamente grande', (b) => { b.players[0].coachNotes = 'x'.repeat(6000); }, /no máximo/],
    ];
    it.each(cases)('recusa: %s', (_label, mutate, message) => {
      const errors = rejected(forge((b) => mutate(b as Record<string, any>)));
      expect(errors.join(' | ')).toMatch(message);
    });
  });

  it('mostra no máximo 25 problemas e informa o total', () => {
    const result = parseBackup(forge((b) => { (b.players as any[]).forEach((p) => { p.demo = 'x'; }); (b.evaluations as any[]).forEach((e) => { e.demo = 'x'; }); }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(25);
      expect(result.totalErrors).toBeGreaterThan(25);
    }
  });

  it('rejeitar não devolve workspace parcial: o resultado é só erro', () => {
    const result = parseBackup(forge((b) => { (b.players as any[])[0].jerseyNumber = 0; }));
    expect(result).not.toHaveProperty('workspace');
  });
});

describe('arquivo não confiável: nada é copiado como veio', () => {
  it('campos desconhecidos são descartados com aviso (não chegam ao workspace)', () => {
    const text = forge((b) => {
      (b.players as any[])[0].isAdmin = true;
      (b.players as any[])[0].senha = 'x';
      (b.trainings as any[])[0].extra = { qualquer: 'coisa' };
    });
    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.errors.join(' | '));
    expect(parsed.workspace.players[0]).not.toHaveProperty('isAdmin');
    expect(parsed.workspace.players[0]).not.toHaveProperty('senha');
    expect(parsed.workspace.trainings[0]).not.toHaveProperty('extra');
    expect(parsed.warnings.join(' ')).toMatch(/Campos desconhecidos em Atleta foram ignorados: isAdmin, senha/);
    expect(parsed.warnings.join(' ')).toMatch(/Campos desconhecidos em Treino/);
  });

  it('o workspace retornado é um objeto novo, sem referência ao JSON lido', () => {
    const raw = JSON.parse(exportJson(demo()).json) as { workspace: { players: unknown[] } };
    const parsed = parseBackup(JSON.stringify(raw));
    if (!parsed.ok) throw new Error('esperado ok');
    expect(parsed.workspace.players[0]).not.toBe(raw.workspace.players[0]);
  });

  it('payload de poluição de protótipo não contamina Object.prototype', () => {
    const text = forge((b) => {
      (b.players as any[])[0] = { ...(b.players as any[])[0], ['__proto__']: { poluido: true }, constructor: { prototype: { poluido: true } } };
    }).replace('"constructor"', '"constructor"');
    // JSON.parse cria "__proto__" como propriedade própria inofensiva; o importador só lê campos conhecidos
    const injected = text.replace('{"id":"demo-p-01"', '{"__proto__":{"poluido":true},"id":"demo-p-01"');
    parseBackup(injected);
    expect(({} as Record<string, unknown>).poluido).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('poluido');
  });

  it('o texto do arquivo não é executado nem interpretado como HTML: fica como texto puro no workspace', () => {
    const text = forge((b) => { (b.players as any[])[0].coachNotes = '<img src=x onerror=alert(1)><script>alert(2)</script>'; });
    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error('esperado ok');
    expect(parsed.workspace.players[0]!.coachNotes).toBe('<img src=x onerror=alert(1)><script>alert(2)</script>');
  });
});

describe('validateWorkspace e impressão digital', () => {
  it('um workspace íntegro valida sem avisos e devolve cópia independente', () => {
    const original = demo();
    const result = validateWorkspace(clone(original));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.workspace).toEqual(original);
      expect(result.workspace.players).not.toBe(original.players);
    }
  });

  it('o workspace vazio é válido', () => {
    expect(validateWorkspace(createEmptyWorkspace()).ok).toBe(true);
  });

  it('a impressão digital é estável e muda com qualquer alteração de dado', () => {
    const a = demo();
    expect(workspaceFingerprint(a)).toBe(workspaceFingerprint(demo()));
    const b = demo();
    b.evaluations.push(makeEvaluation('demo-p-08', '2026-10-12', createUniformAttributes(90)));
    expect(workspaceFingerprint(b)).not.toBe(workspaceFingerprint(a));
    const c = demo();
    c.settings = { weights: { ...cloneWeights(DEFAULT_OVERALL_WEIGHTS), libero: { ...DEFAULT_OVERALL_WEIGHTS.libero, REC: 40 } } };
    expect(workspaceFingerprint(c)).not.toBe(workspaceFingerprint(a));
  });

  it('a impressão digital ignora ordem de chaves e campos extras de dados antigos', () => {
    const a = demo();
    const b = clone(a) as Workspace & { players: Record<string, unknown>[] };
    b.players[0] = { campoAntigo: 1, ...(b.players[0] as object) } as never;
    expect(workspaceFingerprint(b)).toBe(workspaceFingerprint(a));
  });

  it('canonicalize ordena chaves e ignora undefined', () => {
    expect(canonicalize({ b: 1, a: [2, { d: undefined, c: 3 }], z: null })).toBe('{"a":[2,{"c":3}],"b":1,"z":null}');
  });
});

describe('treinos completos criados pelo usuário sobrevivem à ida e volta', () => {
  it('treino real com exercícios e registros, inclusive desfeitos', () => {
    const ws = createEmptyWorkspace();
    ws.players = [makePlayer({ id: 'a', name: 'Ana Alves', jerseyNumber: 3 }), makePlayer({ id: 'b', name: 'Bia Borges', jerseyNumber: 4 })];
    ws.trainings = [makeTraining({ id: 't', name: 'Treino real', participantIds: ['a', 'b'], status: 'concluido', completedAt: '2026-10-10T21:00:00.000Z' })];
    ws.exercises = [makeExercise('t', { id: 'x', name: 'Saque', focus: 'saque' })];
    ws.trainingEvents = [
      makeEvent('t', 'x', 'a', 'saque', 'ace', { recordedAt: '2026-10-10T19:00:00.000Z' }),
      makeEvent('t', 'x', 'b', 'saque', 'erro', { recordedAt: '2026-10-10T19:00:20.000Z', voidedAt: '2026-10-10T19:01:00.000Z' }),
    ];
    const parsed = parseBackup(exportJson(ws).json);
    if (!parsed.ok) throw new Error(parsed.errors.join(' | '));
    expect(parsed.workspace).toEqual(ws);
    expect(parsed.summary).toMatchObject({ trainingEvents: 1, trainingEventsVoided: 1, realRecords: 5, demoRecords: 0 }); // 2 atletas + 1 treino + 2 registros (exercícios não levam a marca demo)
  });
});
