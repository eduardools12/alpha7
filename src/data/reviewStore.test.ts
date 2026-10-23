import { afterEach, describe, expect, it } from 'vitest';
import { assignTrack, emptyReview, reviewKey, setSync } from '@/domain/videoReviewData';
import { createMemoryReviewStore, getReviewStore, isReviewData, setReviewStoreForTests } from './reviewStore';

const video = { name: 'jogo.mp4', size: 1000, lastModified: 1 };
const sample = () => setSync(assignTrack(emptyReview('m1', video, 'abc-1'), 3, 'p1'), 1, { rallyId: 'r1', videoMs: 500 });

afterEach(() => setReviewStoreForTests(null));

describe('armazenamento em memória', () => {
  it('guarda e devolve o que foi salvo, e devolve null para chave desconhecida', async () => {
    const store = createMemoryReviewStore();
    expect(store.persistent).toBe(false);
    expect(await store.load('nada')).toBeNull();
    await store.save(reviewKey(sample()), sample());
    expect(await store.load(reviewKey(sample()))).toEqual(sample());
  });

  it('isola por chave (outra partida, vídeo ou análise não enxerga estes dados)', async () => {
    const store = createMemoryReviewStore();
    await store.save(reviewKey(sample()), sample());
    expect(await store.load(reviewKey(emptyReview('m2', video, 'abc-1')))).toBeNull();
    expect(await store.load(reviewKey(emptyReview('m1', video, 'abc-2')))).toBeNull();
  });

  it('guarda cópias: mexer no objeto depois não altera o que está salvo (nem no que foi lido)', async () => {
    const store = createMemoryReviewStore();
    const data = sample();
    await store.save('k', data);
    data.assignments[3] = 'alterado';
    const read = await store.load('k');
    expect(read?.assignments[3]).toBe('p1');
    if (read) read.assignments[3] = 'outro';
    expect((await store.load('k'))?.assignments[3]).toBe('p1');
  });
});

describe('isReviewData: registro lido do navegador é tratado como não confiável', () => {
  it('aceita o formato certo', () => {
    expect(isReviewData(sample())).toBe(true);
    expect(isReviewData(emptyReview('m1', video, 'abc-1'))).toBe(true);
  });

  it('recusa lixo, campos faltando e tipos errados', () => {
    for (const bad of [null, 'texto', 7, [], {}, { ...sample(), matchId: 5 }, { ...sample(), video: { name: 'x' } }, { ...sample(), analysisId: undefined }]) {
      expect(isReviewData(bad), JSON.stringify(bad)).toBe(false);
    }
    expect(isReviewData({ ...sample(), assignments: { x: 'p1' } })).toBe(false); // chave não numérica
    expect(isReviewData({ ...sample(), assignments: { 1: '' } })).toBe(false);
    expect(isReviewData({ ...sample(), assignments: { 1: 9 } })).toBe(false);
    expect(isReviewData({ ...sample(), syncs: { 1: { rallyId: 'r', videoMs: -1 } } })).toBe(false);
    expect(isReviewData({ ...sample(), syncs: { 1: { rallyId: 3, videoMs: 1 } } })).toBe(false);
  });
});

describe('getReviewStore', () => {
  it('sem IndexedDB (como no jsdom ou em navegação privada) cai para a memória, que avisa não ser persistente', () => {
    expect(getReviewStore().persistent).toBe(false);
  });

  it('pode ser trocado nos testes e volta ao padrão', async () => {
    const custom = createMemoryReviewStore();
    setReviewStoreForTests(custom);
    expect(getReviewStore()).toBe(custom);
    setReviewStoreForTests(null);
    expect(getReviewStore()).not.toBe(custom);
  });
});
