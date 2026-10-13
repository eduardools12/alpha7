import { createDemoWorkspace, createEmptyWorkspace } from './demo';
import { StorageCorruptedError } from './gateway';
import { CORRUPT_BACKUP_KEY, LocalStorageGateway, STORAGE_KEY } from './localStorageGateway';
import { createUniformAttributes } from '@/domain/attributes';
import { createEmptyLineup } from '@/domain/lineup';
import { DEFAULT_OVERALL_WEIGHTS } from '@/domain/overall';
import { createMemoryStorage } from '@/test/renderApp';
import { makeEvaluation, makePlayer } from '@/test/factories';

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
