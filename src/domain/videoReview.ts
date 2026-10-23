/**
 * Revisão com vídeo (etapa 3, só leitura): leitor ESTRITO do JSON gerado por `services/video-analysis`
 * (`alpha7.video-analysis/1`), caixas interpoladas no tempo e conferência entre o vídeo aberto e a análise.
 *
 * Regras de segurança, no estilo do `parseBackup`: o arquivo inteiro é validado antes de ser aceito, só os campos conhecidos
 * passam adiante (nada do que vem de fora é repassado como veio) e qualquer problema rejeita tudo.
 * Os números de trilha são TEMPORÁRIOS do rastreador: não identificam atletas.
 */

export const ANALYSIS_SCHEMA = 'alpha7.video-analysis/1';

export interface ParseLimits {
  maxChars: number;
  maxFrames: number;
  maxDetectionsPerFrame: number;
  maxTracks: number;
}

export const DEFAULT_LIMITS: ParseLimits = { maxChars: 64 * 1024 * 1024, maxFrames: 200_000, maxDetectionsPerFrame: 300, maxTracks: 5_000 };

/** Máximo de problemas listados (o arquivo já foi rejeitado; o resto é ruído). */
const MAX_PROBLEMS = 8;

export type Bbox = readonly [number, number, number, number];

export interface TrackBox {
  /** Número temporário do rastreador; null = detecção ainda sem trilha confirmada. */
  trackId: number | null;
  /** Pixels do vídeo ORIGINAL da análise: x1, y1, x2, y2. */
  bbox: Bbox;
  confidence: number;
}

export interface VideoAnalysis {
  /** Impressão do conteúdo do arquivo lido: identifica ESTA análise (os números de trilha mudam a cada análise nova). */
  id: string;
  source: { filename: string; sizeBytes: number | null; width: number; height: number; fps: number; durationS: number | null };
  frames: { timestampMs: number; boxes: TrackBox[] }[];
  tracks: { trackId: number; firstMs: number; lastMs: number; detections: number }[];
  analyzedFromMs: number;
  analyzedToMs: number;
}

export type ParseResult = { ok: true; value: VideoAnalysis } | { ok: false; problems: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isInt = (value: unknown): value is number => isNumber(value) && Number.isInteger(value);

/** Impressão do texto (FNV-1a de 32 bits em hexadecimal + tamanho). Serve para reconhecer a mesma análise, não é um selo de segurança. */
function contentId(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${(hash >>> 0).toString(16).padStart(8, '0')}-${text.length}`;
}

export function parseVideoAnalysis(text: string, limits: Partial<ParseLimits> = {}): ParseResult {
  const max = { ...DEFAULT_LIMITS, ...limits };
  const problems: string[] = [];
  const add = (message: string) => {
    if (problems.length < MAX_PROBLEMS) problems.push(message);
  };
  const fail = (): ParseResult => ({ ok: false, problems });

  if (text.length > max.maxChars) {
    add(`O arquivo é grande demais (limite de ${Math.round(max.maxChars / 1024 / 1024)} MB de texto).`);
    return fail();
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    add('O arquivo não é um JSON válido. Use o arquivo .analysis.json gerado pelo serviço de análise de vídeo.');
    return fail();
  }
  if (!isRecord(data)) {
    add('O conteúdo precisa ser um objeto JSON.');
    return fail();
  }
  if (data.schema_version !== ANALYSIS_SCHEMA) add(`O arquivo precisa ter schema_version "${ANALYSIS_SCHEMA}" (formato de análise de vídeo do Alpha7).`);

  const rawSource = data.source;
  let source: VideoAnalysis['source'] | null = null;
  if (!isRecord(rawSource)) {
    add('Falta o campo source (dados do vídeo analisado).');
  } else {
    const { filename, size_bytes: sizeBytes, width, height, fps, duration_s: durationS } = rawSource;
    if (typeof filename !== 'string' || filename.trim() === '' || filename.length > 255) add('source.filename precisa ser um texto de até 255 caracteres.');
    if (!(sizeBytes === null || sizeBytes === undefined || (isInt(sizeBytes) && sizeBytes >= 0))) add('source.size_bytes precisa ser um inteiro ou nulo.');
    if (!isInt(width) || width <= 0) add('source.width precisa ser um inteiro positivo.');
    if (!isInt(height) || height <= 0) add('source.height precisa ser um inteiro positivo.');
    if (!isNumber(fps) || fps <= 0) add('source.fps precisa ser um número positivo.');
    if (!(durationS === null || durationS === undefined || (isNumber(durationS) && durationS >= 0))) add('source.duration_s precisa ser um número ou nulo.');
    if (typeof filename === 'string' && isInt(width) && isInt(height) && isNumber(fps) && width > 0 && height > 0 && fps > 0) {
      source = {
        filename: filename.trim(),
        sizeBytes: isInt(sizeBytes) ? sizeBytes : null,
        width,
        height,
        fps,
        durationS: isNumber(durationS) ? durationS : null,
      };
    }
  }

  const trackIds = new Set<number>();
  const tracks: VideoAnalysis['tracks'] = [];
  if (!Array.isArray(data.tracks)) {
    add('Falta o campo tracks (lista de trilhas).');
  } else if (data.tracks.length > max.maxTracks) {
    add(`O arquivo tem trilhas demais (limite de ${max.maxTracks}).`);
  } else {
    data.tracks.forEach((track: unknown, index) => {
      if (!isRecord(track)) return add(`tracks[${index}] precisa ser um objeto.`);
      const { track_id: id, first_timestamp_ms: first, last_timestamp_ms: last, detections } = track;
      if (!isInt(id) || !isNumber(first) || !isNumber(last) || !isInt(detections) || first < 0 || last < first || detections < 0) {
        return add(`tracks[${index}] tem número de trilha, tempos ou quantidade inválidos.`);
      }
      trackIds.add(id);
      tracks.push({ trackId: id, firstMs: first, lastMs: last, detections });
    });
  }

  const frames: VideoAnalysis['frames'] = [];
  if (!Array.isArray(data.frames)) {
    add('Falta o campo frames (lista de quadros).');
  } else if (data.frames.length === 0) {
    add('A análise não tem nenhum quadro.');
  } else if (data.frames.length > max.maxFrames) {
    add(`O arquivo tem quadros demais (limite de ${max.maxFrames}).`);
  } else {
    let previous = -Infinity;
    for (const [fIndex, frame] of data.frames.entries()) {
      if (problems.length >= MAX_PROBLEMS) break;
      const where = `frames[${fIndex}]`;
      if (!isRecord(frame)) {
        add(`${where} precisa ser um objeto.`);
        continue;
      }
      const ts = frame.timestamp_ms;
      if (!isNumber(ts) || ts < 0 || ts < previous) {
        add(`${where}.timestamp_ms precisa ser um número que não diminui (e não é negativo).`);
        continue;
      }
      previous = ts;
      if (!Array.isArray(frame.detections)) {
        add(`${where}.detections precisa ser uma lista.`);
        continue;
      }
      if (frame.detections.length > max.maxDetectionsPerFrame) {
        add(`${where} tem detecções demais (limite de ${max.maxDetectionsPerFrame} por quadro).`);
        continue;
      }
      const boxes: TrackBox[] = [];
      for (const [dIndex, detection] of frame.detections.entries()) {
        const at = `${where}.detections[${dIndex}]`;
        if (!isRecord(detection)) {
          add(`${at} precisa ser um objeto.`);
          continue;
        }
        const { track_id: id, bbox_xyxy: raw, confidence } = detection;
        if (!(id === null || id === undefined || isInt(id))) add(`${at}.track_id precisa ser um inteiro ou nulo.`);
        else if (isInt(id) && !trackIds.has(id)) add(`${at}: a trilha ${id} não existe em tracks.`);
        if (!isNumber(confidence) || confidence < 0 || confidence > 1) {
          add(`${at}.confidence precisa estar entre 0 e 1.`);
          continue;
        }
        const coords: unknown[] = Array.isArray(raw) ? raw : [];
        const [x1, y1, x2, y2] = coords;
        if (coords.length !== 4 || !isNumber(x1) || !isNumber(y1) || !isNumber(x2) || !isNumber(y2) || x2 < x1 || y2 < y1) {
          add(`${at}.bbox_xyxy precisa ter 4 números (x1, y1, x2, y2) com x2 >= x1 e y2 >= y1.`);
          continue;
        }
        boxes.push({ trackId: isInt(id) ? id : null, bbox: [x1, y1, x2, y2], confidence });
      }
      frames.push({ timestampMs: ts, boxes });
    }
  }

  if (problems.length > 0 || source === null || frames.length === 0) return fail();
  return {
    ok: true,
    value: { id: contentId(text), source, frames, tracks, analyzedFromMs: frames[0]?.timestampMs ?? 0, analyzedToMs: frames[frames.length - 1]?.timestampMs ?? 0 },
  };
}

/** Quanto tempo o último quadro (ou o anterior, se o seguinte está longe) continua valendo. */
const HOLD_AFTER_LAST_MS = 1000;
const MAX_GAP_MS = 1000;
const HOLD_BEFORE_GAP_MS = 400;

function lastFrameIndexAtOrBefore(frames: VideoAnalysis['frames'], timeMs: number): number {
  let low = 0;
  let high = frames.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if ((frames[middle]?.timestampMs ?? Infinity) <= timeMs) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

/**
 * Caixas para um instante do vídeo, interpoladas entre os dois quadros analisados vizinhos (só para o desenho ficar fluido;
 * nada disto é dado novo). Mesma trilha: linha reta; só num dos lados: aparece até a metade do caminho; sem trilha: acompanha
 * o lado mais próximo. Antes do trecho analisado: nenhuma; depois do último quadro: o último por até 1 s; buraco grande entre
 * quadros (falha do detector): o anterior por 400 ms.
 */
export function boxesAt(analysis: VideoAnalysis, timeMs: number): TrackBox[] {
  const { frames } = analysis;
  const index = lastFrameIndexAtOrBefore(frames, timeMs);
  const previous = frames[index];
  if (index < 0 || !previous) return [];
  const following = frames[index + 1];
  if (!following) return timeMs - previous.timestampMs <= HOLD_AFTER_LAST_MS ? [...previous.boxes] : [];
  const gap = following.timestampMs - previous.timestampMs;
  if (gap > MAX_GAP_MS) return timeMs - previous.timestampMs <= HOLD_BEFORE_GAP_MS ? [...previous.boxes] : [];
  const alpha = gap === 0 ? 0 : (timeMs - previous.timestampMs) / gap;
  if (alpha <= 0) return [...previous.boxes];

  const later = new Map<number, TrackBox>();
  for (const box of following.boxes) if (box.trackId !== null) later.set(box.trackId, box);
  const earlierIds = new Set<number>();
  const result: TrackBox[] = [];
  for (const box of previous.boxes) {
    const match = box.trackId === null ? undefined : later.get(box.trackId);
    if (box.trackId !== null) earlierIds.add(box.trackId);
    if (match) {
      const [a1, b1, a2, b2] = box.bbox;
      const [c1, d1, c2, d2] = match.bbox;
      result.push({ trackId: box.trackId, confidence: box.confidence, bbox: [a1 + (c1 - a1) * alpha, b1 + (d1 - b1) * alpha, a2 + (c2 - a2) * alpha, b2 + (d2 - b2) * alpha] });
    } else if (alpha < 0.5) {
      result.push(box);
    }
  }
  if (alpha >= 0.5) for (const box of following.boxes) if (box.trackId === null || !earlierIds.has(box.trackId)) result.push(box);
  return result;
}

/** O instante cai dentro do trecho analisado (com a folga de 1 s depois do último quadro)? Fora dele não há caixas por falta de análise. */
export function isWithinAnalysis(analysis: Pick<VideoAnalysis, 'analyzedFromMs' | 'analyzedToMs'>, timeMs: number): boolean {
  return timeMs >= analysis.analyzedFromMs && timeMs <= analysis.analyzedToMs + HOLD_AFTER_LAST_MS;
}

export interface VideoFacts {
  name: string;
  sizeBytes: number;
  durationS: number | null;
  width: number;
  height: number;
}

/** Avisos (nunca bloqueios) quando o vídeo aberto não parece ser o que foi analisado. Vazio = bate. */
export function compareWithVideo(source: VideoAnalysis['source'], video: VideoFacts): string[] {
  const warnings: string[] = [];
  if (source.durationS !== null && video.durationS !== null && Math.abs(source.durationS - video.durationS) > 1) {
    warnings.push(`A duração do vídeo (${formatMs(video.durationS * 1000)}) é diferente da análise (${formatMs(source.durationS * 1000)}): esta análise pode ser de outro vídeo.`);
  }
  if (video.width !== source.width || video.height !== source.height) {
    warnings.push(`A resolução do vídeo (${video.width}x${video.height}) é diferente da análise (${source.width}x${source.height}). As caixas são ajustadas pela proporção da análise.`);
    if (Math.abs(video.width / video.height - source.width / source.height) > 0.01) {
      warnings.push('A proporção da imagem também é diferente, então as caixas podem ficar deslocadas.');
    }
  }
  if (source.sizeBytes !== null && video.sizeBytes !== source.sizeBytes) {
    warnings.push('O tamanho do arquivo é diferente do analisado: confira se é o mesmo vídeo.');
  }
  return warnings;
}

/** "1:05" ou "1:02:03". */
export function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}
