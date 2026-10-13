import { createDemoWorkspace, createEmptyWorkspace } from './demo';
import { IntegrityError, StorageCorruptedError } from './gateway';
import { CORRUPT_BACKUP_KEY, LocalStorageGateway, STORAGE_KEY } from './localStorageGateway';
import { createUniformAttributes } from '@/domain/attributes';
import { createEmptyLineup } from '@/domain/lineup';
import { DEFAULT_OVERALL_WEIGHTS } from '@/domain/overall';
import type { TrainingEvent } from '@/domain/training';
import { createMemoryStorage } from '@/test/renderApp';
import { makeEvaluation, makeEvent, makeExercise, makePlayer, makeTraining } from '@/test/factories';

const NOW = new Date('2026-10-12T15:00:00');

function setup() {
  const storage = createMemoryStorage();
  const gateway = new LocalStorageGateway(storage, () => createDemoWorkspace(NOW));
  return { storage, gateway };
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
    const storage = createMemoryStorage();
    const base = createEmptyWorkspace();
    base.players = [makePlayer({ id: 'p1', jerseyNumber: 1 }), makePlayer({ id: 'p2', jerseyNumber: 2 })];
    const gateway = new LocalStorageGateway(storage, () => structuredClone(base));
    return { storage, gateway };
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
    const gateway = new LocalStorageGateway(null, () => structuredClone(base));
    await gateway.load();
    await gateway.saveTraining(training, [ex]);
    await gateway.addTrainingEvent(event());
    expect((await gateway.load()).trainingEvents).toHaveLength(1);
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
      const gateway = new LocalStorageGateway(null, () => createDemoWorkspace(NOW));
      expect(gateway.persistent).toBe(false);
      await gateway.load();
      await gateway.savePlayer(makePlayer({ id: 'm1', jerseyNumber: 77 }));
      expect((await gateway.load()).players.some((p) => p.id === 'm1')).toBe(true);
    });
  });
});
