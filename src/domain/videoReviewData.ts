/**
 * Revisão com vídeo (etapa 4): associação de trilhas a atletas e sincronização dos pontos com o instante do vídeo.
 * Regras puras. Estes dados NÃO fazem parte do workspace nem do backup do app: vivem só no navegador (IndexedDB) e no
 * arquivo exportado. Associar não altera notas, Overall, escalações nem estatísticas, e não cria ponto nem ação técnica.
 * Os números de trilha são TEMPORÁRIOS: várias trilhas podem ser do mesmo atleta.
 */

import type { Rally } from './match';

export const REVIEW_SCHEMA = 'alpha7.video-review/1';
/** Quanto antes do ponto o vídeo começa ao pular para ele (para ver a jogada inteira). */
export const LEAD_IN_MS = 5000;

const MAX_FILE_CHARS = 5 * 1024 * 1024;
const MAX_ASSIGNMENTS = 20_000;
const MAX_SYNCS = 20;
const MAX_PROBLEMS = 8;

export interface VideoFingerprint {
  name: string;
  size: number;
  lastModified: number;
}

export interface SyncReference {
  /** Ponto da partida que foi marcado no vídeo. */
  rallyId: string;
  /** Instante do vídeo (ms) em que esse ponto aconteceu. */
  videoMs: number;
}

export interface ReviewData {
  matchId: string;
  video: VideoFingerprint;
  analysisId: string;
  /** Número de trilha → id do atleta. */
  assignments: Record<number, string>;
  /** Número do set → ponto de referência no vídeo. */
  syncs: Record<number, SyncReference>;
}

export const emptyReview = (matchId: string, video: VideoFingerprint, analysisId: string): ReviewData => ({ matchId, video, analysisId, assignments: {}, syncs: {} });

/** Chave de armazenamento: a mesma partida, o mesmo vídeo e a MESMA análise. Outra análise tem outros números de trilha. */
export const reviewKey = (data: Pick<ReviewData, 'matchId' | 'video' | 'analysisId'>): string =>
  [data.matchId, data.video.name, data.video.size, data.video.lastModified, data.analysisId].join('|');

/** Associa a trilha ao atleta (ou remove com `null`). Devolve uma cópia. */
export function assignTrack(data: ReviewData, trackId: number, playerId: string | null): ReviewData {
  const assignments = { ...data.assignments };
  if (playerId === null) delete assignments[trackId];
  else assignments[trackId] = playerId;
  return { ...data, assignments };
}

/** Atletas associados a duas ou mais trilhas que estão visíveis ao mesmo tempo (provável troca de número: a pessoa confere). */
export function duplicatedAthletes(data: ReviewData, visibleTrackIds: readonly (number | null)[]): string[] {
  const seen = new Set<number>();
  const count = new Map<string, number>();
  for (const id of visibleTrackIds) {
    if (id === null || seen.has(id)) continue;
    seen.add(id);
    const player = data.assignments[id];
    if (player !== undefined) count.set(player, (count.get(player) ?? 0) + 1);
  }
  return [...count].filter(([, n]) => n > 1).map(([player]) => player);
}

/**
 * Atletas associados às trilhas visíveis no quadro, sem repetir e só os que ainda estão no elenco: a SUGESTÃO para detalhar um
 * ponto. Quem confirma é a pessoa; isto nunca cria ação técnica.
 */
export function suggestedAthletes(data: ReviewData, visibleTrackIds: readonly number[], playerIds: ReadonlySet<string>): string[] {
  const result: string[] = [];
  for (const id of visibleTrackIds) {
    const player = data.assignments[id];
    if (player !== undefined && playerIds.has(player) && !result.includes(player)) result.push(player);
  }
  return result;
}

export const setSync = (data: ReviewData, setNumber: number, reference: SyncReference): ReviewData => ({ ...data, syncs: { ...data.syncs, [setNumber]: reference } });

export function clearSync(data: ReviewData, setNumber: number): ReviewData {
  const syncs = { ...data.syncs };
  delete syncs[setNumber];
  return { ...data, syncs };
}

/**
 * Instante do vídeo (ms) de um ponto: o instante do ponto de referência mais a diferença entre os horários em que os dois
 * foram REGISTRADOS. Null sem referência, com a referência fora dos pontos ativos do set (anulada) ou com horário ilegível.
 * Aproximado: o horário de registro é o do toque, depois da jogada.
 */
export function syncedVideoMs(
  reference: SyncReference | undefined,
  activeRalliesOfSet: readonly Pick<Rally, 'id' | 'recordedAt'>[],
  target: Pick<Rally, 'recordedAt'>,
): number | null {
  if (!reference) return null;
  const anchor = activeRalliesOfSet.find((r) => r.id === reference.rallyId);
  if (!anchor) return null;
  const difference = Date.parse(target.recordedAt) - Date.parse(anchor.recordedAt);
  return Number.isFinite(difference) ? reference.videoMs + difference : null;
}

export const seekTarget = (videoMs: number): number => Math.max(0, videoMs - LEAD_IN_MS);

/** Nome do arquivo exportado: alpha7-revisao-<adversario>-<AAAA-MM-DD>.json, sem acentos nem caracteres que o sistema recusa. */
export function reviewFilename(opponent: string, now: Date): string {
  const slug = opponent
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `alpha7-revisao-${slug === '' ? 'partida' : slug.slice(0, 40)}-${now.toISOString().slice(0, 10)}.json`;
}

/** Arquivo para guardar fora do navegador (não inclui o caminho do vídeo, só nome, tamanho e data). */
export function serializeReview(data: ReviewData, now: Date): string {
  return JSON.stringify(
    {
      schema_version: REVIEW_SCHEMA,
      exported_at: now.toISOString(),
      match_id: data.matchId,
      analysis_id: data.analysisId,
      video: { name: data.video.name, size: data.video.size, last_modified: data.video.lastModified },
      assignments: Object.entries(data.assignments).map(([track, player]) => ({ track_id: Number(track), player_id: player })),
      syncs: Object.entries(data.syncs).map(([set, ref]) => ({ set_number: Number(set), rally_id: ref.rallyId, video_ms: ref.videoMs })),
    },
    null,
    1,
  );
}

export interface ImportContext {
  matchId: string;
  analysisId: string;
  trackIds: ReadonlySet<number>;
  playerIds: ReadonlySet<string>;
  rallyIds: ReadonlySet<string>;
}

export type ImportResult = { ok: true; value: Pick<ReviewData, 'assignments' | 'syncs'>; ignored: number } | { ok: false; problems: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isInt = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);

/**
 * Lê um arquivo de revisão exportado. Recusa o arquivo INTEIRO se for lixo, de outra partida ou de outra análise; o que
 * apontar para trilha, atleta ou ponto que já não existe é ignorado (e contado), porque o elenco muda com o tempo.
 */
export function parseReviewFile(text: string, context: ImportContext): ImportResult {
  const problems: string[] = [];
  const add = (message: string) => {
    if (problems.length < MAX_PROBLEMS) problems.push(message);
  };
  if (text.length > MAX_FILE_CHARS) return { ok: false, problems: ['O arquivo é grande demais para ser um arquivo de revisão.'] };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, problems: ['O arquivo não é um JSON válido. Use um arquivo exportado pela tela de revisão.'] };
  }
  if (!isRecord(data)) return { ok: false, problems: ['O conteúdo precisa ser um objeto JSON.'] };
  if (data.schema_version !== REVIEW_SCHEMA) add(`O arquivo precisa ter schema_version "${REVIEW_SCHEMA}".`);
  if (data.match_id !== context.matchId) add('Este arquivo é de outra partida.');
  else if (data.analysis_id !== context.analysisId) add('Este arquivo é de outra análise de vídeo: os números de trilha mudam a cada análise, então as associações não valem para esta.');

  const assignments: Record<number, string> = {};
  const syncs: Record<number, SyncReference> = {};
  let ignored = 0;

  if (!Array.isArray(data.assignments) || data.assignments.length > MAX_ASSIGNMENTS) {
    add('O campo assignments precisa ser uma lista (de até 20 000 itens).');
  } else {
    const seen = new Set<number>();
    data.assignments.forEach((item: unknown, index) => {
      if (!isRecord(item) || !isInt(item.track_id) || typeof item.player_id !== 'string' || item.player_id === '') {
        return add(`assignments[${index}] precisa ter track_id (inteiro) e player_id (texto).`);
      }
      const trackId = item.track_id;
      if (seen.has(trackId)) return add(`assignments[${index}]: a trilha ${trackId} está duplicada.`);
      seen.add(trackId);
      if (context.trackIds.has(trackId) && context.playerIds.has(item.player_id)) assignments[trackId] = item.player_id;
      else ignored += 1;
    });
  }

  if (!Array.isArray(data.syncs) || data.syncs.length > MAX_SYNCS) {
    add('O campo syncs precisa ser uma lista (de até 20 itens).');
  } else {
    const seen = new Set<number>();
    data.syncs.forEach((item: unknown, index) => {
      if (!isRecord(item) || !isInt(item.set_number) || typeof item.rally_id !== 'string' || typeof item.video_ms !== 'number' || !Number.isFinite(item.video_ms) || item.video_ms < 0) {
        return add(`syncs[${index}] precisa ter set_number (inteiro), rally_id (texto) e video_ms (número, 0 ou mais).`);
      }
      const setNumber = item.set_number;
      if (seen.has(setNumber)) return add(`syncs[${index}]: o set ${setNumber} está duplicado.`);
      seen.add(setNumber);
      if (context.rallyIds.has(item.rally_id)) syncs[setNumber] = { rallyId: item.rally_id, videoMs: item.video_ms };
      else ignored += 1;
    });
  }

  return problems.length > 0 ? { ok: false, problems } : { ok: true, value: { assignments, syncs }, ignored };
}
