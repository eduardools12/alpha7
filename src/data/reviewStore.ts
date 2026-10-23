/**
 * Armazenamento das associações da revisão com vídeo (etapa 4). Fica SÓ neste navegador (IndexedDB), de propósito FORA do
 * `DataGateway`, do workspace e do backup do app: não é dado da equipe, é trabalho de conferência de um vídeo que só existe neste
 * computador. Limpar os dados do site apaga tudo; guardar fora do navegador é pelo arquivo exportado.
 */
import type { ReviewData } from '@/domain/videoReviewData';

export interface ReviewStore {
  /** false quando nada sobrevive a fechar a aba (memória): a tela avisa e aponta o "Exportar". */
  readonly persistent: boolean;
  /** Devolve null se não há registro ou se o registro guardado está corrompido. */
  load(key: string): Promise<ReviewData | null>;
  /** Rejeita se não conseguir gravar; a tela decide o aviso. */
  save(key: string, data: ReviewData): Promise<void>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Valida o formato de um registro lido (dado do navegador é tratado como não confiável). */
export function isReviewData(value: unknown): value is ReviewData {
  if (!isRecord(value) || typeof value.matchId !== 'string' || typeof value.analysisId !== 'string') return false;
  const video = value.video;
  if (!isRecord(video) || typeof video.name !== 'string' || typeof video.size !== 'number' || typeof video.lastModified !== 'number') return false;
  if (!isRecord(value.assignments) || !isRecord(value.syncs)) return false;
  for (const [track, player] of Object.entries(value.assignments)) {
    if (!/^\d+$/.test(track) || typeof player !== 'string' || player === '') return false;
  }
  for (const [set, reference] of Object.entries(value.syncs)) {
    if (!/^\d+$/.test(set) || !isRecord(reference) || typeof reference.rallyId !== 'string' || typeof reference.videoMs !== 'number' || !Number.isFinite(reference.videoMs) || reference.videoMs < 0) return false;
  }
  return true;
}

export function createMemoryReviewStore(): ReviewStore {
  const records = new Map<string, ReviewData>();
  return {
    persistent: false,
    load: (key) => {
      const found = records.get(key);
      return Promise.resolve(found ? structuredClone(found) : null);
    },
    save: (key, data) => {
      records.set(key, structuredClone(data));
      return Promise.resolve();
    },
  };
}

const DB_NAME = 'alpha7-revisao';
const STORE_NAME = 'reviews';

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Falha no armazenamento do navegador.'));
  });

export function createIndexedDbReviewStore(): ReviewStore {
  let opened: Promise<IDBDatabase> | null = null;
  const open = () => {
    opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Não foi possível abrir o armazenamento do navegador.'));
      req.onblocked = () => reject(new Error('O armazenamento do navegador está bloqueado por outra aba.'));
    }).catch((error: unknown) => {
      opened = null; // tenta de novo na próxima vez
      throw error;
    });
    return opened;
  };
  return {
    persistent: true,
    async load(key) {
      const db = await open();
      const value: unknown = await request(db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key));
      return isReviewData(value) ? value : null;
    },
    async save(key, data) {
      const db = await open();
      await request(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(data, key));
    },
  };
}

let override: ReviewStore | null = null;
let cached: ReviewStore | null = null;

/** IndexedDB quando existe; senão (navegação privada em alguns navegadores) a memória, avisando que não é persistente. */
export function getReviewStore(): ReviewStore {
  if (override) return override;
  cached ??= typeof indexedDB === 'undefined' ? createMemoryReviewStore() : createIndexedDbReviewStore();
  return cached;
}

/** Só para testes: troca o armazenamento (ou volta ao padrão com `null`). */
export function setReviewStoreForTests(store: ReviewStore | null): void {
  override = store;
  cached = null;
}
