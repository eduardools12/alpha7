import { createDemoWorkspace, createEmptyWorkspace } from './demo';
import { IntegrityError, StorageCorruptedError, WorkspaceMissingError } from './gateway';
import type { Workspace } from './types';
import { CORRUPT_BACKUP_KEY, LocalStorageGateway, SEEN_KEY, SNAPSHOT_KEY, STORAGE_KEY } from './localStorageGateway';
import { createUniformAttributes } from '@/domain/attributes';
import { createEmptyLineup } from '@/domain/lineup';
import { DEFAULT_OVERALL_WEIGHTS } from '@/domain/overall';
import type { TrainingEvent } from '@/domain/training';
import { createMemoryStorage } from '@/test/renderApp';
import { makeEvaluation, makeEvent, makeExercise, makePlayer, makeTraining } from '@/test/factories';

const NOW = new Date('2026-10-12T15:00:00');

/**
 * Gateway com um workspace já criado (como se a pessoa tivesse escolhido como começar). O gateway nunca
 * cria dados sozinho: sem isto, `load` falha com WorkspaceMissingError. A gravação é síncrona por dentro.
 */
function gatewayWith(workspace: Workspace) {
  const storage = createMemoryStorage();
  const gateway = new LocalStorageGateway(storage);
  void gateway.replaceWorkspace(structuredClone(workspace), 'teste');
  return { storage, gateway };
}

/** O mesmo, sem armazenamento do navegador (tudo em memória). */
function memoryGatewayWith(workspace: Workspace) {
  const gateway = new LocalStorageGateway(null);
  void gateway.replaceWorkspace(structuredClone(workspace), 'teste');
  return { gateway };
}

function setup() {
  return gatewayWith(createDemoWorkspace(NOW));
}

describe('dados de demonstração', () => {
  const demo = createDemoWorkspace(NOW);

  it('todo registro de demonstração é marcado como tal', () => {
    expect(demo.players.every((p) => p.demo)).toBe(true);
    expect(demo.evaluations.every((e) => e.demo)).toBe(true);
    expect(demo.lineups.every((l) => l.demo)).toBe(true);
    expect(demo.activity?.demo).toBe(true);
  });

  it('tem 18 atletas com números de camisa únicos', () => {
    expect(demo.players).toHaveLength(18);
    expect(new Set(demo.players.map((p) => p.jerseyNumber)).size).toBe(18);
  });

  it('todas as notas ficam na escala de 1 a 99', () => {
    for (const e of demo.evaluations) {
      for (const value of Object.values(e.attributes)) {
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(99);
      }
    }
  });

  it('há um atleta sem avaliação para exercitar o caso de dado ausente', () => {
    const rated = new Set(demo.evaluations.map((e) => e.playerId));
    expect(demo.players.filter((p) => !rated.has(p.id))).toHaveLength(1);
  });

  it('a escalação de exemplo referencia atletas existentes, sem repetição', () => {
    const ids = new Set(demo.players.map((p) => p.id));
    const lineup = demo.lineups[0]!;
    const used = [...lineup.starters.map((s) => s?.playerId), lineup.liberoId, ...lineup.benchIds];
    expect(used.every((id) => id && ids.has(id))).toBe(true);
    expect(new Set(used).size).toBe(used.length);
  });
});

describe('treinos de demonstração', () => {
  const demo = createDemoWorkspace(NOW);

  it('são 4 treinos: 3 concluídos com registros e 1 em andamento sem registros', () => {
    expect(demo.trainings.map((t) => [t.id, t.status])).toEqual([
      ['demo-t-01', 'concluido'],
      ['demo-t-02', 'concluido'],
      ['demo-t-03', 'concluido'],
      ['demo-t-04', 'aberto'],
    ]);
    expect(demo.trainingEvents.filter((e) => e.trainingId === 'demo-t-04')).toHaveLength(0);
    expect(demo.trainingEvents.length).toBeGreaterThan(300);
  });

  it('todo registro é de demonstração e referencia treino, exercício e atleta participante existentes', () => {
    const players = new Set(demo.players.map((p) => p.id));
    for (const e of demo.trainingEvents) {
      expect(e.demo).toBe(true);
      const training = demo.trainings.find((t) => t.id === e.trainingId)!;
      expect(training).toBeDefined();
      expect(training.participantIds).toContain(e.playerId);
      expect(players.has(e.playerId)).toBe(true);
      expect(demo.exercises.find((x) => x.id === e.exerciseId)?.trainingId).toBe(e.trainingId);
      expect(e.voidedAt).toBeNull();
    }
  });

  it('chaves de tentativa e ids são únicos (nenhuma tentativa duplicada)', () => {
    expect(new Set(demo.trainingEvents.map((e) => e.attemptKey)).size).toBe(demo.trainingEvents.length);
    expect(new Set(demo.trainingEvents.map((e) => e.id)).size).toBe(demo.trainingEvents.length);
  });

  it('é determinístico: duas gerações com a mesma data dão os mesmos registros', () => {
    expect(createDemoWorkspace(NOW).trainingEvents).toEqual(demo.trainingEvents);
  });

  it('cobre os seis fundamentos', () => {
    const covered = new Set(demo.trainingEvents.map((e) => e.fundamental));
    expect([...covered].sort()).toEqual(['ataque', 'bloqueio', 'defesa', 'levantamento', 'recepcao', 'saque']);
  });
});

describe('LocalStorageGateway: treinos, exercícios e eventos', () => {
  function fresh() {
    const base = createEmptyWorkspace();
    base.players = [makePlayer({ id: 'p1', jerseyNumber: 1 }), makePlayer({ id: 'p2', jerseyNumber: 2 })];
    return gatewayWith(base);
  }
  const training = makeTraining({ id: 'tr', participantIds: ['p1'] });
  const ex = makeExercise('tr', { id: 'ex' });
  const event = (
    overrides: Partial<Pick<TrainingEvent, 'id' | 'trainingId' | 'exerciseId' | 'playerId' | 'attemptKey'>> = {},
  ): TrainingEvent => ({
    ...makeEvent('tr', 'ex', 'p1', 'saque', 'ace'),
    attemptKey: 'key-1',
    id: 'ev-1',
    ...overrides,
  });

  it('cria treino com exercícios e os mantém após recarregar (novo gateway, mesmo armazenamento)', async () => {
    const { storage, gateway } = fresh();
    await gateway.load();
    await gateway.saveTraining(training, [ex]);
    await gateway.addTrainingEvent(event());

    const reopened = await new LocalStorageGateway(storage).load();
    expect(reopened.trainings.map((t) => t.id)).toEqual(['tr']);
    expect(reopened.exercises.map((e) => e.id)).toEqual(['ex']);
    expect(reopened.trainingEvents).toHaveLength(1);
  });

  it('editar o treino preserva os registros e troca só os exercícios sem registros', async () => {
    const { gateway } = fresh();
    await gateway.load();
    const ex2 = makeExercise('tr', { id: 'ex2', order: 1 });
    await gateway.saveTraining(training, [ex, ex2]);
    await gateway.addTrainingEvent(event());

    await gateway.saveTraining({ ...training, name: 'Outro nome' }, [{ ...ex, name: 'Renomeado' }]); // ex2 sai (sem registros)
    const ws = await gateway.load();
    expect(ws.trainings[0]!.name).toBe('Outro nome');
    expect(ws.exercises.map((e) => [e.id, e.name])).toEqual([['ex', 'Renomeado']]);
    expect(ws.trainingEvents).toHaveLength(1);
  });

  it('recusa remover exercício que tem registros (IntegrityError) e não altera nada', async () => {
    const { gateway } = fresh();
    await gateway.load();
    await gateway.saveTraining(training, [ex]);
    await gateway.addTrainingEvent(event());
    await expect(gateway.saveTraining(training, [])).rejects.toBeInstanceOf(IntegrityError);
    expect((await gateway.load()).exercises).toHaveLength(1);
  });

  it('recusa tirar da lista um atleta com registros válidos', async () => {
    const { gateway } = fresh();
    await gateway.load();
    await gateway.saveTraining(training, [ex]);
    await gateway.addTrainingEvent(event());
    await expect(gateway.saveTraining({ ...training, participantIds: [] }, [ex])).rejects.toBeInstanceOf(IntegrityError);
  });

  it('recusa exercício ligado a outro treino', async () => {
    const { gateway } = fresh();
    await gateway.load();
    await expect(gateway.saveTraining(training, [makeExercise('outro')])).rejects.toBeInstanceOf(IntegrityError);
  });

  describe('addTrainingEvent: integridade referencial', () => {
    async function ready() {
      const ctx = fresh();
      await ctx.gateway.load();
      await ctx.gateway.saveTraining(training, [ex]);
      return ctx;
    }

    it('recusa treino inexistente', async () => {
      const { gateway } = await ready();
      await expect(gateway.addTrainingEvent(event({ trainingId: 'fantasma' }))).rejects.toThrow(/treino deste registro não existe/);
    });

    it('recusa exercício inexistente ou de outro treino', async () => {
      const { gateway } = await ready();
      await gateway.saveTraining(makeTraining({ id: 'tr2', participantIds: ['p1'] }), [makeExercise('tr2', { id: 'ex-tr2' })]);
      await expect(gateway.addTrainingEvent(event({ exerciseId: 'fantasma' }))).rejects.toThrow(/não pertence ao treino/);
      await expect(gateway.addTrainingEvent(event({ exerciseId: 'ex-tr2' }))).rejects.toThrow(/não pertence ao treino/);
    });

    it('recusa atleta inexistente ou que não participa do treino', async () => {
      const { gateway } = await ready();
      await expect(gateway.addTrainingEvent(event({ playerId: 'fantasma' }))).rejects.toThrow(/atleta deste registro não existe/);
      await expect(gateway.addTrainingEvent(event({ playerId: 'p2' }))).rejects.toThrow(/não participa do treino/);
    });

    it('é idempotente por attemptKey: repetir não duplica nem regrava', async () => {
      const { gateway, storage } = await ready();
      await gateway.addTrainingEvent(event());
      const before = storage.getItem(STORAGE_KEY);
      await gateway.addTrainingEvent(event({ id: 'ev-outro-id' })); // mesma attemptKey
      expect(storage.getItem(STORAGE_KEY)).toBe(before);
      expect((await gateway.load()).trainingEvents).toHaveLength(1);
    });

    it('registros inválidos não deixam nada pela metade no armazenamento', async () => {
      const { gateway, storage } = await ready();
      const before = storage.getItem(STORAGE_KEY);
      await expect(gateway.addTrainingEvent(event({ playerId: 'p2' }))).rejects.toBeInstanceOf(IntegrityError);
      expect(storage.getItem(STORAGE_KEY)).toBe(before);
    });
  });

  describe('desfazer (anular) registros', () => {
    it('marca voidedAt sem apagar o registro e persiste', async () => {
      const { storage, gateway } = fresh();
      await gateway.load();
      await gateway.saveTraining(training, [ex]);
      await gateway.addTrainingEvent(event());
      await gateway.voidTrainingEvent('ev-1', '2026-10-12T12:00:00.000Z');

      const ws = await new LocalStorageGateway(storage).load();
      expect(ws.trainingEvents).toHaveLength(1);
      expect(ws.trainingEvents[0]!.voidedAt).toBe('2026-10-12T12:00:00.000Z');
    });

    it('é idempotente: desfazer de novo não muda a data original nem regrava', async () => {
      const { storage, gateway } = fresh();
      await gateway.load();
      await gateway.saveTraining(training, [ex]);
      await gateway.addTrainingEvent(event());
      await gateway.voidTrainingEvent('ev-1', '2026-10-12T12:00:00.000Z');
      const before = storage.getItem(STORAGE_KEY);
      await gateway.voidTrainingEvent('ev-1', '2026-10-12T13:00:00.000Z');
      expect(storage.getItem(STORAGE_KEY)).toBe(before);
    });

    it('registro inexistente é recusado', async () => {
      const { gateway } = fresh();
      await gateway.load();
      await expect(gateway.voidTrainingEvent('nada', 'x')).rejects.toBeInstanceOf(IntegrityError);
    });

    it('uma attemptKey já desfeita continua ocupada: o mesmo toque não reaparece', async () => {
      const { gateway } = fresh();
      await gateway.load();
      await gateway.saveTraining(training, [ex]);
      await gateway.addTrainingEvent(event());
      await gateway.voidTrainingEvent('ev-1', 'x');
      await gateway.addTrainingEvent(event({ id: 'ev-2' }));
      expect((await gateway.load()).trainingEvents).toHaveLength(1);
    });
  });

  describe('excluir treino: cascata consistente', () => {
    it('apaga exercícios e registros (válidos e desfeitos) DESTE treino e só dele', async () => {
      const { gateway } = fresh();
      await gateway.load();
      const other = makeTraining({ id: 'other', participantIds: ['p1'] });
      const otherEx = makeExercise('other', { id: 'ex-other' });
      await gateway.saveTraining(training, [ex]);
      await gateway.saveTraining(other, [otherEx]);
      await gateway.addTrainingEvent(event());
      await gateway.addTrainingEvent(event({ id: 'ev-2', attemptKey: 'key-2' }));
      await gateway.voidTrainingEvent('ev-2', 'x');
      await gateway.addTrainingEvent({ ...makeEvent('other', 'ex-other', 'p1', 'saque', 'erro'), id: 'ev-other', attemptKey: 'key-other' });

      await gateway.deleteTraining('tr');
      const ws = await gateway.load();
      expect(ws.trainings.map((t) => t.id)).toEqual(['other']);
      expect(ws.exercises.map((e) => e.id)).toEqual(['ex-other']);
      expect(ws.trainingEvents.map((e) => e.id)).toEqual(['ev-other']);
    });

    it('excluir treino inexistente não quebra nada', async () => {
      const { gateway } = fresh();
      await gateway.load();
      await expect(gateway.deleteTraining('nada')).resolves.toBeUndefined();
    });

    it('guarda antes uma cópia de segurança com o treino e seus registros (dá para desfazer)', async () => {
      const { gateway } = fresh();
      await gateway.load();
      await gateway.saveTraining(training, [ex]);
      await gateway.addTrainingEvent(event());

      await gateway.deleteTraining('tr');
      expect((await gateway.snapshotInfo())?.reason).toContain(training.name);
      expect((await gateway.load()).trainings.map((t) => t.id)).not.toContain('tr');

      await gateway.restoreSnapshot();
      const ws = await gateway.load();
      expect(ws.trainings.map((t) => t.id)).toContain('tr');
      expect(ws.trainingEvents.map((e) => e.id)).toEqual(['ev-1']);
    });
  });

  describe('compatibilidade e corrupção', () => {
    it('dados salvos antes dos treinos (sem as novas listas) abrem com listas vazias', async () => {
      const storage = createMemoryStorage();
      const old = createEmptyWorkspace();
      storage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 1, players: old.players, evaluations: [], lineups: [], settings: { weights: old.settings.weights }, activity: null }),
      );
      const ws = await new LocalStorageGateway(storage).load();
      expect(ws.trainings).toEqual([]);
      expect(ws.exercises).toEqual([]);
      expect(ws.trainingEvents).toEqual([]);
    });

    it('atividade no formato antigo (com treinos fictícios) é lida sem os campos descartados', async () => {
      const storage = createMemoryStorage();
      storage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          players: [],
          evaluations: [],
          lineups: [],
          activity: { demo: true, trainingsCount: 42, matches: { played: 14, wins: 11 }, nextMatch: null, lastTraining: { date: 'x' } },
        }),
      );
      const ws = await new LocalStorageGateway(storage).load();
      expect(ws.activity).toEqual({ demo: true, matches: { played: 14, wins: 11 }, nextMatch: null });
    });

    it.each([
      ['treino', { trainings: [{ id: 't' }] }],
      ['exercício', { exercises: [{ id: 'e', trainingId: 't', name: 'x' }] }],
      ['registro com resultado de outro fundamento', { trainingEvents: [{ id: 'e', trainingId: 't', exerciseId: 'x', playerId: 'p', attemptKey: 'k', recordedAt: 'r', voidedAt: null, fundamental: 'recepcao', outcome: 'ace' }] }],
      ['lista que não é lista', { trainingEvents: 'oi' }],
    ])('%s malformado é recusado como dado corrompido', async (_label, extra) => {
      const storage = createMemoryStorage();
      storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, players: [], evaluations: [], lineups: [], ...extra }));
      await expect(new LocalStorageGateway(storage).load()).rejects.toBeInstanceOf(StorageCorruptedError);
    });
  });

  it('sem armazenamento do navegador, treinos e registros funcionam em memória', async () => {
    const base = createEmptyWorkspace();
    base.players = [makePlayer({ id: 'p1' })];
    const { gateway } = memoryGatewayWith(base);
    await gateway.load();
    await gateway.saveTraining(training, [ex]);
    await gateway.addTrainingEvent(event());
    expect((await gateway.load()).trainingEvents).toHaveLength(1);
  });
});

describe('LocalStorageGateway: substituição segura do workspace', () => {
  function setup() {
    return gatewayWith(createDemoWorkspace(NOW));
  }
  const rawOf = (storage: ReturnType<typeof createMemoryStorage>) => storage.getItem(STORAGE_KEY);

  it('guarda uma cópia de segurança do conteúdo anterior antes de substituir', async () => {
    const { storage, gateway } = setup();
    await gateway.load();
    const before = rawOf(storage);
    await gateway.replaceWorkspace(createEmptyWorkspace(), 'exclusão de todos os dados');

    expect(await gateway.load()).toMatchObject({ players: [], trainings: [] });
    const info = await gateway.snapshotInfo();
    expect(info).toMatchObject({ reason: 'exclusão de todos os dados' });
    expect(info?.summary).toMatchObject({ players: 18, trainings: 4 });
    // a cópia guarda o texto anterior, byte a byte
    const stored = JSON.parse(storage.getItem(SNAPSHOT_KEY) ?? '{}') as { previousRaw: string };
    expect(stored.previousRaw).toBe(before);
  });

  it('antes da primeira substituição não há cópia de segurança', async () => {
    const { gateway } = setup();
    await gateway.load();
    expect(await gateway.snapshotInfo()).toBeNull();
  });

  it('desfazer devolve exatamente o conteúdo anterior e guarda o atual (dá para ir e voltar)', async () => {
    const { storage, gateway } = setup();
    await gateway.load();
    const original = rawOf(storage);
    await gateway.replaceWorkspace(createEmptyWorkspace(), 'apagar');
    const empty = rawOf(storage);

    await gateway.restoreSnapshot();
    expect(rawOf(storage)).toBe(original);
    expect((await gateway.snapshotInfo())?.reason).toBe('desfazer a última substituição');

    await gateway.restoreSnapshot(); // volta ao vazio
    expect(rawOf(storage)).toBe(empty);
  });

  it('só a última substituição fica guardada', async () => {
    const { gateway } = setup();
    await gateway.load();
    await gateway.replaceWorkspace(createEmptyWorkspace(), 'primeira');
    await gateway.replaceWorkspace(createDemoWorkspace(NOW), 'segunda');
    const info = await gateway.snapshotInfo();
    expect(info?.reason).toBe('segunda');
    expect(info?.summary?.players).toBe(0); // o conteúdo anterior à segunda era o vazio
  });

  it('sem espaço para a cópia de segurança, ABORTA e os dados atuais ficam intactos', async () => {
    const { storage, gateway } = setup();
    await gateway.load();
    const before = rawOf(storage);
    const realSet = storage.setItem;
    storage.setItem = (key: string, value: string) => {
      if (key === SNAPSHOT_KEY) throw new Error('QuotaExceededError');
      realSet(key, value);
    };
    await expect(gateway.replaceWorkspace(createEmptyWorkspace(), 'apagar')).rejects.toBeInstanceOf(IntegrityError);
    await expect(gateway.replaceWorkspace(createEmptyWorkspace(), 'apagar')).rejects.toThrow(/Nada foi alterado/);
    expect(rawOf(storage)).toBe(before);
    expect((await gateway.load()).players).toHaveLength(18);
  });

  it('se a gravação do novo conteúdo falhar, o conteúdo anterior continua intacto (nunca pela metade)', async () => {
    const { storage, gateway } = setup();
    await gateway.load();
    const before = rawOf(storage);
    const realSet = storage.setItem;
    storage.setItem = (key: string, value: string) => {
      if (key === STORAGE_KEY) throw new Error('QuotaExceededError');
      realSet(key, value);
    };
    await expect(gateway.replaceWorkspace(createEmptyWorkspace(), 'apagar')).rejects.toThrow();
    storage.setItem = realSet;
    expect(rawOf(storage)).toBe(before);
    expect((await gateway.load()).players).toHaveLength(18);
  });

  it('desfazer sem cópia de segurança é recusado com mensagem clara', async () => {
    const { gateway } = setup();
    await gateway.load();
    await expect(gateway.restoreSnapshot()).rejects.toThrow(/Não há cópia de segurança/);
  });

  it('cópia de segurança ilegível não é restaurada e não estraga os dados atuais', async () => {
    const { storage, gateway } = setup();
    await gateway.load();
    const before = rawOf(storage);
    storage.setItem(SNAPSHOT_KEY, JSON.stringify({ savedAt: 'x', reason: 'y', previousRaw: '{quebrado' }));
    await expect(gateway.restoreSnapshot()).rejects.toThrow(/ilegível/);
    expect(rawOf(storage)).toBe(before);
    expect((await gateway.snapshotInfo())?.summary).toBeNull();
  });

  it('snapshot corrompido no armazenamento é ignorado (null)', async () => {
    const { storage, gateway } = setup();
    await gateway.load();
    storage.setItem(SNAPSHOT_KEY, 'não é json');
    expect(await gateway.snapshotInfo()).toBeNull();
  });

  it('exportRaw devolve o texto salvo, mesmo ilegível', async () => {
    const storage = createMemoryStorage();
    storage.setItem(STORAGE_KEY, '{dados quebrados');
    const gateway = new LocalStorageGateway(storage);
    expect(await gateway.exportRaw()).toBe('{dados quebrados');
    await expect(gateway.load()).rejects.toBeInstanceOf(StorageCorruptedError);
    // a substituição de um workspace ilegível também preserva o texto antigo na cópia de segurança
    await gateway.replaceWorkspace(createEmptyWorkspace(), 'recomeçar');
    const snapshot = JSON.parse(storage.getItem(SNAPSHOT_KEY) ?? '{}') as { previousRaw: string };
    expect(snapshot.previousRaw).toBe('{dados quebrados');
  });

  it('sem armazenamento do navegador, a substituição e o desfazer funcionam em memória', async () => {
    const { gateway } = memoryGatewayWith(createDemoWorkspace(NOW));
    await gateway.load();
    await gateway.replaceWorkspace(createEmptyWorkspace(), 'apagar');
    expect((await gateway.load()).players).toEqual([]);
    expect((await gateway.snapshotInfo())?.summary?.players).toBe(18);
    await gateway.restoreSnapshot();
    expect((await gateway.load()).players).toHaveLength(18);
  });

  it('usage mede workspace e cópia de segurança; sem armazenamento devolve null', async () => {
    const { gateway } = setup();
    await gateway.load();
    const before = await gateway.usage();
    expect(before?.workspaceChars).toBeGreaterThan(1000);
    expect(before?.snapshotChars).toBe(0);
    expect(before?.usedChars).toBeLessThan(before?.limitChars ?? 0);

    await gateway.replaceWorkspace(createEmptyWorkspace(), 'apagar');
    const after = await gateway.usage();
    expect(after?.snapshotChars).toBeGreaterThan(before?.workspaceChars ?? 0); // a cópia contém o workspace antigo
    expect(after?.usedChars).toBeGreaterThanOrEqual((after?.workspaceChars ?? 0) + (after?.snapshotChars ?? 0));

    expect(await new LocalStorageGateway(null).usage()).toBeNull();
  });

  it('savePlayer recusa camisa já usada por outro atleta, mesmo se a tela estava desatualizada', async () => {
    const { storage, gateway } = setup();
    const ws = await gateway.load();
    const holder = ws.players[0];
    if (!holder) throw new Error('demo sem atletas');
    const before = rawOf(storage);
    await expect(gateway.savePlayer(makePlayer({ id: 'novo', jerseyNumber: holder.jerseyNumber }))).rejects.toBeInstanceOf(IntegrityError);
    expect(rawOf(storage)).toBe(before);
    // o próprio atleta pode ser salvo com a camisa que já tem
    await expect(gateway.savePlayer({ ...holder, name: 'Nome novo' })).resolves.toBeUndefined();
  });

  it('subscribe avisa quando OUTRA aba altera os dados (evento storage) e pode ser cancelado', async () => {
    const { gateway } = setup();
    const listener = vi.fn();
    const stop = gateway.subscribe(listener);
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'outra-chave' }));
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('LocalStorageGateway', () => {
  it('na primeira carga grava a demonstração e a devolve', async () => {
    const { storage, gateway } = setup();
    const loaded = await gateway.load();
    expect(loaded.players).toHaveLength(18);
    expect(storage.map.has(STORAGE_KEY)).toBe(true);
    expect(gateway.persistent).toBe(true);
  });

  it('persiste jogador novo, edição e avaliação entre cargas', async () => {
    const { storage, gateway } = setup();
    await gateway.load();
    const player = makePlayer({ id: 'novo', name: 'Rui Teixeira', jerseyNumber: 40 });
    await gateway.savePlayer(player);
    await gateway.savePlayer({ ...player, name: 'Rui T. Editado' });
    await gateway.addEvaluation(makeEvaluation('novo', '2026-10-01', createUniformAttributes(66)));

    const reopened = await new LocalStorageGateway(storage).load();
    expect(reopened.players.filter((p) => p.id === 'novo')).toEqual([{ ...player, name: 'Rui T. Editado' }]);
    expect(reopened.evaluations.filter((e) => e.playerId === 'novo')).toHaveLength(1);
    expect(reopened.players).toHaveLength(19);
  });

  it('avaliações só são acrescentadas: as anteriores continuam', async () => {
    const { gateway } = setup();
    const before = await gateway.load();
    await gateway.addEvaluation(makeEvaluation('demo-p-08', '2026-10-10'));
    const after = await gateway.load();
    expect(after.evaluations).toHaveLength(before.evaluations.length + 1);
    for (const old of before.evaluations) expect(after.evaluations).toContainEqual(old);
  });

  it('salva e exclui escalações', async () => {
    const { gateway } = setup();
    await gateway.load();
    await gateway.saveLineup(createEmptyLineup('l-novo', '2026-10-12T00:00:00.000Z'));
    expect((await gateway.load()).lineups.map((l) => l.id)).toEqual(['demo-l-01', 'l-novo']);
    await gateway.deleteLineup('demo-l-01');
    expect((await gateway.load()).lineups.map((l) => l.id)).toEqual(['l-novo']);
  });

  it('salva as configurações de pesos', async () => {
    const { gateway } = setup();
    await gateway.load();
    const weights = structuredClone(DEFAULT_OVERALL_WEIGHTS);
    weights.libero.REC = 50;
    await gateway.saveSettings({ weights });
    expect((await gateway.load()).settings.weights.libero.REC).toBe(50);
  });

  it('replaceWorkspace troca tudo (usado por restaurar e limpar)', async () => {
    const { gateway } = setup();
    await gateway.load();
    await gateway.replaceWorkspace(createEmptyWorkspace());
    const ws = await gateway.load();
    expect(ws.players).toEqual([]);
    expect(ws.activity).toBeNull();
  });

  describe('dados corrompidos', () => {
    it('JSON inválido gera StorageCorruptedError e guarda cópia para recuperação', async () => {
      const storage = createMemoryStorage();
      storage.setItem(STORAGE_KEY, '{nao-e-json');
      await expect(new LocalStorageGateway(storage).load()).rejects.toBeInstanceOf(StorageCorruptedError);
      expect(storage.getItem(CORRUPT_BACKUP_KEY)).toBe('{nao-e-json');
    });

    it('versão desconhecida e listas inválidas também são recusadas', async () => {
      for (const content of [
        { version: 99, players: [], evaluations: [], lineups: [] },
        { version: 1, players: 'x', evaluations: [], lineups: [] },
        { version: 1, players: [{ id: 'a' }], evaluations: [], lineups: [] },
        { version: 1, players: [], evaluations: [{ id: 'e', playerId: 'a', evaluatedAt: '2026-01-01', attributes: { SAC: 500 } }], lineups: [] },
        { version: 1, players: [], evaluations: [], lineups: [{ id: 'l', formation: '5-1', starters: [], benchIds: [] }] },
      ]) {
        const storage = createMemoryStorage();
        storage.setItem(STORAGE_KEY, JSON.stringify(content));
        await expect(new LocalStorageGateway(storage).load()).rejects.toBeInstanceOf(StorageCorruptedError);
      }
    });

    it('pesos inválidos salvos voltam ao padrão da posição, sem derrubar o resto', async () => {
      const storage = createMemoryStorage();
      const ws = createEmptyWorkspace();
      storage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          ...ws,
          settings: { weights: { ponteiro: { SAC: -4 }, central: { BLQ: 80 } } },
        }),
      );
      const loaded = await new LocalStorageGateway(storage).load();
      expect(loaded.settings.weights.ponteiro).toEqual(DEFAULT_OVERALL_WEIGHTS.ponteiro);
      expect(loaded.settings.weights.central.BLQ).toBe(80);
    });
  });

  describe('sem armazenamento do navegador', () => {
    it('funciona só em memória e informa persistent=false', async () => {
      const { gateway } = memoryGatewayWith(createDemoWorkspace(NOW));
      expect(gateway.persistent).toBe(false);
      await gateway.load();
      await gateway.savePlayer(makePlayer({ id: 'm1', jerseyNumber: 77 }));
      expect((await gateway.load()).players.some((p) => p.id === 'm1')).toBe(true);
    });
  });
});

describe('LocalStorageGateway: inicialização nunca cria dados sozinha', () => {
  const missing = async (gateway: LocalStorageGateway) => {
    try {
      await gateway.load();
    } catch (error) {
      return error;
    }
    return null;
  };

  it('sem workspace e sem sinais de uso: primeira utilização, e nada é gravado', async () => {
    const storage = createMemoryStorage();
    const error = await missing(new LocalStorageGateway(storage));
    expect(error).toBeInstanceOf(WorkspaceMissingError);
    expect((error as WorkspaceMissingError).kind).toBe('first-use');
    expect(storage.map.size).toBe(0);
  });

  it('carregar repetidamente sem workspace continua sem gravar nada', async () => {
    const storage = createMemoryStorage();
    const gateway = new LocalStorageGateway(storage);
    for (let i = 0; i < 3; i += 1) await missing(gateway);
    expect(storage.map.size).toBe(0);
  });

  it.each([
    ['a marca de uso', SEEN_KEY, 'x'],
    ['a cópia de segurança', SNAPSHOT_KEY, '{}'],
    ['a cópia do dado ilegível', CORRUPT_BACKUP_KEY, 'x'],
    ['o registro do último backup', 'alpha7.lastBackup.v1', '{}'],
  ])('%s indica workspace perdido (lost), sem recriar nada', async (_label, key, value) => {
    const storage = createMemoryStorage();
    storage.setItem(key, value);
    const before = new Map(storage.map);
    const error = await missing(new LocalStorageGateway(storage));
    expect((error as WorkspaceMissingError).kind).toBe('lost');
    expect(new Map(storage.map)).toEqual(before);
    expect(storage.map.has(STORAGE_KEY)).toBe(false);
  });

  it('a primeira gravação deixa a marca de uso, e perder só a chave principal vira "lost"', async () => {
    const { storage, gateway } = setup();
    expect(storage.getItem(SEEN_KEY)).not.toBeNull();
    storage.removeItem(STORAGE_KEY);
    const error = await missing(gateway);
    expect((error as WorkspaceMissingError).kind).toBe('lost');
  });

  it('abrir dados existentes grava a marca (dados de versões anteriores) sem tocar no workspace', async () => {
    const { storage, gateway } = setup();
    storage.removeItem(SEEN_KEY);
    const before = storage.getItem(STORAGE_KEY);
    await gateway.load();
    expect(storage.getItem(SEEN_KEY)).not.toBeNull();
    expect(storage.getItem(STORAGE_KEY)).toBe(before);
  });

  it('se a marca não puder ser gravada, o uso segue normalmente', async () => {
    const storage = createMemoryStorage();
    const realSet = storage.setItem;
    storage.setItem = (key: string, value: string) => {
      if (key === SEEN_KEY) throw new Error('QuotaExceededError');
      realSet(key, value);
    };
    const gateway = new LocalStorageGateway(storage);
    await expect(gateway.replaceWorkspace(createEmptyWorkspace(), 'teste')).resolves.toBeUndefined();
    expect((await gateway.load()).players).toEqual([]);
  });

  it('dado ilegível continua sendo StorageCorruptedError e o texto original é preservado', async () => {
    const storage = createMemoryStorage();
    storage.setItem(STORAGE_KEY, '{quebrado');
    await expect(new LocalStorageGateway(storage).load()).rejects.toBeInstanceOf(StorageCorruptedError);
    expect(storage.getItem(STORAGE_KEY)).toBe('{quebrado');
    expect(storage.getItem(CORRUPT_BACKUP_KEY)).toBe('{quebrado');
  });

  it('gravar depois que o workspace sumiu (outra aba, limpeza) é recusado e NÃO recria demonstração', async () => {
    const { storage, gateway } = setup();
    await gateway.load();
    storage.removeItem(STORAGE_KEY);
    await expect(gateway.savePlayer(makePlayer({ id: 'novo', jerseyNumber: 77 }))).rejects.toBeInstanceOf(IntegrityError);
    await expect(gateway.saveSettings({ weights: DEFAULT_OVERALL_WEIGHTS })).rejects.toThrow(/não foram encontrados/);
    await expect(gateway.deleteTraining('qualquer')).rejects.toBeInstanceOf(IntegrityError);
    expect(storage.map.has(STORAGE_KEY)).toBe(false);
  });

  it('sem armazenamento do navegador: primeira utilização até a pessoa escolher; depois funciona em memória', async () => {
    const gateway = new LocalStorageGateway(null);
    await expect(gateway.load()).rejects.toBeInstanceOf(WorkspaceMissingError);
    await gateway.replaceWorkspace(createEmptyWorkspace(), 'início');
    expect((await gateway.load()).players).toEqual([]);
  });

  it('recoveryCopies lista só o que existe: dados salvos, cópia do ilegível e cópia automática', async () => {
    const storage = createMemoryStorage();
    expect(await new LocalStorageGateway(storage).recoveryCopies()).toEqual([]);

    storage.setItem(STORAGE_KEY, '{quebrado');
    const gateway = new LocalStorageGateway(storage);
    await gateway.load().catch(() => undefined); // grava a cópia do ilegível (igual ao atual: não repete)
    expect((await gateway.recoveryCopies()).map((c) => c.id)).toEqual(['current']);

    await gateway.replaceWorkspace(createEmptyWorkspace(), 'recomeçar'); // o ilegível vai para a cópia automática
    const ids = (await gateway.recoveryCopies()).map((c) => c.id);
    expect(ids).toEqual(['current', 'unreadable', 'snapshot']);
    const texts = Object.fromEntries((await gateway.recoveryCopies()).map((c) => [c.id, c.text]));
    expect(texts.unreadable).toBe('{quebrado');
    expect(texts.snapshot).toBe('{quebrado');
  });
});
