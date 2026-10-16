import type { Attributes } from './attributes';
import { formatDateTime } from './format';
import { playerTrait } from './insights';
import type { Lineup } from './lineup';
import type { Match, MatchState } from './match';
import { shortName, type Player, type UniformColor } from './player';
import { POSITION_LABEL, type Position } from './positions';

/**
 * ARTES: o que aparece em cada arte. Regra PURA: só reúne e valida dados reais (partida, escalação, atleta,
 * avaliações) e textos digitados pela comissão. Nada de IA, nenhum rosto gerado, nenhum dado inventado: o que não
 * está cadastrado não aparece (ou aparece como "a definir"). O desenho fica em features/arts.
 */

export const ART_FORMATS = {
  feed: { id: 'feed', label: 'Feed 4:5', width: 1080, height: 1350 },
  story: { id: 'story', label: 'Story 9:16', width: 1080, height: 1920 },
  square: { id: 'square', label: 'Quadrado 1:1', width: 1080, height: 1080 },
} as const;
export type ArtFormatId = keyof typeof ART_FORMATS;
export type ArtFormat = (typeof ART_FORMATS)[ArtFormatId];

/** Fundo da arte: roxo (escuro) ou branco (claro). Corresponde ao uniforme roxo ou branco. */
export type ArtTone = 'dark' | 'light';
export const ART_TONE_LABEL: Record<ArtTone, string> = { dark: 'Fundo roxo', light: 'Fundo branco' };
export const toneForUniform = (uniform: UniformColor): ArtTone => (uniform === 'white' ? 'light' : 'dark');

export const ART_KINDS = ['lineup', 'matchday', 'result', 'athlete', 'card', 'spotlight', 'highlights', 'brand', 'cover'] as const;
export type ArtKind = (typeof ART_KINDS)[number];

export const ART_KIND_LABEL: Record<ArtKind, string> = {
  lineup: 'Escalação',
  matchday: 'Dia de jogo',
  result: 'Resultado',
  athlete: 'Atleta',
  card: 'Carta do atleta',
  spotlight: 'Destaque',
  highlights: 'Capa de lances',
  brand: 'Institucional',
  cover: 'Capas de destaques',
};

/** Formatos de cada tipo: as capas dos destaques do Instagram são sempre quadradas. */
export const ART_KIND_FORMATS: Record<ArtKind, readonly ArtFormatId[]> = {
  lineup: ['feed', 'story'],
  matchday: ['feed', 'story'],
  result: ['feed', 'story'],
  athlete: ['feed', 'story'],
  card: ['feed', 'story'],
  spotlight: ['feed', 'story'],
  highlights: ['feed', 'story'],
  brand: ['feed', 'story'],
  cover: ['square'],
};

/** Foto do atleta já carregada (a mesma do cadastro), como data URL, com o tamanho original quando conhecido. */
export interface ArtPhoto {
  href: string;
  width?: number;
  height?: number;
}

/** Enquadramento da foto na área inclinada: aproximação (1 a 3) e posição dentro da sobra (0 a 1). */
export interface ArtFraming {
  zoom: number;
  x: number;
  y: number;
}
export const DEFAULT_FRAMING: ArtFraming = { zoom: 1, x: 0.5, y: 0.15 };

export interface ArtPlayer {
  /** Nome curto ("Ana A."), como nas listas do app. */
  name: string;
  /** Nome completo do cadastro, para as artes de um atleta só. */
  fullName: string;
  number: number;
  position: string;
  photo?: ArtPhoto;
}

interface ArtBase {
  format: ArtFormatId;
  tone: ArtTone;
}

export interface LineupArt extends ArtBase {
  kind: 'lineup';
  title: string;
  opponent: string;
  competition: string;
  dateText: string;
  venue: string;
  /** Índice 0 = P1 ... 5 = P6. */
  starters: ArtPlayer[];
  libero: ArtPlayer | null;
  reserves: ArtPlayer[];
}

export interface MatchdayArt extends ArtBase {
  kind: 'matchday';
  opponent: string;
  competition: string;
  /** Rodada ou fase, digitada pela comissão (opcional). */
  phase: string;
  dateText: string;
  timeText: string;
  venue: string;
}

export interface ResultSetScore {
  number: number;
  us: number;
  them: number;
}

export interface ResultArt extends ArtBase {
  kind: 'result';
  opponent: string;
  competition: string;
  setsUs: number;
  setsThem: number;
  sets: ResultSetScore[];
}

export interface AthleteArt extends ArtBase {
  kind: 'athlete';
  player: ArtPlayer;
  framing: ArtFraming;
}

export interface SpotlightStat {
  label: string;
  value: string;
}

export interface SpotlightArt extends ArtBase {
  kind: 'spotlight';
  player: ArtPlayer;
  /** Fundamento ou motivo do destaque, digitado pela comissão. */
  headline: string;
  stats: SpotlightStat[];
  framing: ArtFraming;
}

export const CARD_ATTRIBUTES = ['SAC', 'REC', 'LEV', 'ATA', 'BLQ', 'DEF'] as const;

export interface CardArt extends ArtBase {
  kind: 'card';
  player: ArtPlayer;
  secondaryPosition: string | null;
  /** null = sem avaliação: a carta mostra "—" e nunca 0. */
  overall: number | null;
  attributes: { key: (typeof CARD_ATTRIBUTES)[number]; value: number | null }[];
  trait: string | null;
  uniform: UniformColor;
  framing: ArtFraming;
}

export interface HighlightsArt extends ArtBase {
  kind: 'highlights';
  player: ArtPlayer;
  /** "COMPILADO DE" e o título ("LANCES"), editáveis. */
  caption: string;
  title: string;
  /** Temporada ou jogo (opcional). */
  detail: string;
  framing: ArtFraming;
}

export const BRAND_VARIANTS = ['apresentacao', 'manifesto', 'identidade'] as const;
export type BrandVariant = (typeof BRAND_VARIANTS)[number];
export const BRAND_VARIANT_LABEL: Record<BrandVariant, string> = {
  apresentacao: 'Apresentação da equipe',
  manifesto: 'Manifesto: três toques',
  identidade: 'Identidade: palavras-chave',
};

export interface BrandArt extends ArtBase {
  kind: 'brand';
  variant: BrandVariant;
}

export const COVER_VARIANTS = ['equipe', 'atletas', 'jogos', 'resultados', 'bastidores'] as const;
export type CoverVariant = (typeof COVER_VARIANTS)[number];
export const COVER_VARIANT_LABEL: Record<CoverVariant, string> = {
  equipe: 'Equipe',
  atletas: 'Atletas',
  jogos: 'Jogos',
  resultados: 'Resultados',
  bastidores: 'Bastidores',
};

export interface CoverArt extends ArtBase {
  kind: 'cover';
  variant: CoverVariant;
}

export type ArtModel = LineupArt | MatchdayArt | ResultArt | AthleteArt | SpotlightArt | CardArt | HighlightsArt | BrandArt | CoverArt;
export type ArtResult<T extends ArtModel = ArtModel> = { ok: true; model: T } | { ok: false; reason: string };

const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

/** O formato pedido só vale se o tipo o aceita; senão cai no primeiro formato do tipo. */
export function formatFor(kind: ArtKind, wanted: ArtFormatId): ArtFormatId {
  const allowed = ART_KIND_FORMATS[kind];
  return allowed.includes(wanted) ? wanted : (allowed[0] ?? 'feed');
}

/* ─────────────── textos ─────────────── */

const WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

/** "2026-11-14T19:30" → "SÁB 14/11". Sem data: "A DEFINIR". Dia da semana por conta pura (sem fuso). */
export function matchDateText(scheduledAt: string): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(scheduledAt);
  if (!parts) return 'A DEFINIR';
  const [, year, month, day] = parts;
  const weekday = WEEKDAYS[new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).getUTCDay()] ?? '';
  return `${weekday} ${day}/${month}`;
}

/** "2026-11-14T19:30" → "19H30". Sem horário: "A DEFINIR". */
export function matchTimeText(scheduledAt: string): string {
  const time = /T(\d{2}):(\d{2})/.exec(scheduledAt);
  return time ? `${time[1]}H${time[2]}` : 'A DEFINIR';
}

const slug = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** "alpha7-escalacao-time-vizinho-feed.png": sem acentos nem símbolos, estável para o mesmo conteúdo. */
export function artFilename(model: ArtModel): string {
  const base = (() => {
    switch (model.kind) {
      case 'lineup':
        return `escalacao-${slug(model.opponent) || 'partida'}`;
      case 'matchday':
        return `dia-de-jogo-${slug(model.opponent) || 'partida'}`;
      case 'result':
        return `resultado-${slug(model.opponent) || 'partida'}`;
      case 'athlete':
        return `atleta-${slug(model.player.fullName) || 'atleta'}`;
      case 'spotlight':
        return `destaque-${slug(model.player.fullName) || 'atleta'}`;
      case 'card':
        return `carta-${slug(model.player.fullName) || 'atleta'}`;
      case 'highlights':
        return `lances-${slug(model.player.fullName) || 'atleta'}`;
      case 'brand':
        return `institucional-${model.variant}`;
      case 'cover':
        return `capa-${model.variant}`;
    }
  })();
  return `alpha7-${base}-${model.format}.png`;
}

/** Descrição curta da arte, para o texto alternativo da prévia: "escalação contra Time Arte". */
export function artDescription(model: ArtModel): string {
  switch (model.kind) {
    case 'lineup':
      return `escalação contra ${model.opponent}`;
    case 'matchday':
      return `dia de jogo contra ${model.opponent}`;
    case 'result':
      return `resultado contra ${model.opponent}`;
    case 'athlete':
      return `apresentação de ${model.player.fullName}`;
    case 'spotlight':
      return `destaque de ${model.player.fullName}`;
    case 'card':
      return `carta de ${model.player.fullName}`;
    case 'highlights':
      return `capa de ${model.title.toLowerCase()} de ${model.player.fullName}`;
    case 'brand':
      return BRAND_VARIANT_LABEL[model.variant].toLowerCase();
    case 'cover':
      return `capa de destaques ${COVER_VARIANT_LABEL[model.variant].toLowerCase()}`;
  }
}

/* ─────────────── montadores ─────────────── */

const asArtPlayer = (player: Player, position: Position = player.primaryPosition, photo?: ArtPhoto): ArtPlayer => ({
  name: shortName(player.name),
  fullName: player.name,
  number: player.jerseyNumber,
  position: POSITION_LABEL[position],
  ...(photo ? { photo } : {}),
});

export interface LineupInput {
  match: Match;
  lineup: Lineup;
  players: readonly Player[];
  format: ArtFormatId;
  tone: ArtTone;
  /** Fotos já carregadas (atleta → foto). Quem não está aqui aparece com o número da camisa. */
  photos?: Readonly<Record<string, ArtPhoto>>;
}

/** Escalação: recusa escalação incompleta ou com atleta que saiu do elenco (arte com buraco enganaria). */
export function buildLineupArt({ match, lineup, players, format, tone, photos = {} }: LineupInput): ArtResult<LineupArt> {
  const byId = new Map(players.map((p) => [p.id, p]));
  const starters: ArtPlayer[] = [];
  for (const [index, starter] of lineup.starters.entries()) {
    if (!starter) return fail(`A escalação “${lineup.title}” não tem os seis titulares: falta a posição P${index + 1}.`);
    const player = byId.get(starter.playerId);
    if (!player) return fail('A escalação tem um atleta que não está mais no elenco.');
    starters.push(asArtPlayer(player, starter.role, photos[player.id]));
  }
  const libero = lineup.liberoId ? byId.get(lineup.liberoId) : undefined;
  const reserves = lineup.benchIds.flatMap((id) => {
    const player = byId.get(id);
    return player ? [asArtPlayer(player)] : [];
  });
  return {
    ok: true,
    model: {
      kind: 'lineup',
      format: formatFor('lineup', format),
      tone,
      title: 'Escalação oficial',
      opponent: match.opponent,
      competition: match.competition,
      dateText: match.scheduledAt ? formatDateTime(match.scheduledAt) : 'Data a definir',
      venue: match.venue,
      starters,
      libero: libero ? asArtPlayer(libero, 'libero', photos[libero.id]) : null,
      reserves,
    },
  };
}

export const PHASE_MAX = 30;

export interface MatchdayInput {
  match: Match;
  phase: string;
  format: ArtFormatId;
  tone: ArtTone;
}

export function buildMatchdayArt({ match, phase, format, tone }: MatchdayInput): ArtResult<MatchdayArt> {
  if (match.opponent.trim() === '') return fail('A partida não tem adversário.');
  if (phase.trim().length > PHASE_MAX) return fail(`A rodada ou fase pode ter até ${PHASE_MAX} caracteres.`);
  return {
    ok: true,
    model: {
      kind: 'matchday',
      format: formatFor('matchday', format),
      tone,
      opponent: match.opponent,
      competition: match.competition,
      phase: phase.trim(),
      dateText: matchDateText(match.scheduledAt),
      timeText: matchTimeText(match.scheduledAt),
      venue: match.venue,
    },
  };
}

export const RESULT_MAX_SETS = 5;

export interface ResultInput {
  match: Match;
  state: MatchState;
  format: ArtFormatId;
  tone: ArtTone;
}

/** Resultado: só de partida concluída. O placar vem dos pontos ativos de cada set, nunca digitado. */
export function buildResultArt({ match, state, format, tone }: ResultInput): ArtResult<ResultArt> {
  if (match.status !== 'concluida' || match.finalSetsUs === null || match.finalSetsThem === null) {
    return fail('A arte de resultado só existe para partida concluída. Encerre a partida primeiro.');
  }
  const sets = state.sets
    .filter((s) => s.score.us + s.score.them > 0)
    .slice(0, RESULT_MAX_SETS)
    .map((s) => ({ number: s.set.number, us: s.score.us, them: s.score.them }));
  return {
    ok: true,
    model: {
      kind: 'result',
      format: formatFor('result', format),
      tone,
      opponent: match.opponent,
      competition: match.competition,
      setsUs: match.finalSetsUs,
      setsThem: match.finalSetsThem,
      sets,
    },
  };
}

export interface PlayerArtInput {
  player: Player;
  photo?: ArtPhoto;
  format: ArtFormatId;
  tone: ArtTone;
  framing?: ArtFraming;
}

export function buildAthleteArt({ player, photo, format, tone, framing = DEFAULT_FRAMING }: PlayerArtInput): ArtResult<AthleteArt> {
  return { ok: true, model: { kind: 'athlete', format: formatFor('athlete', format), tone, player: asArtPlayer(player, player.primaryPosition, photo), framing } };
}

export const HEADLINE_MAX = 34;
export const STAT_LABEL_MAX = 16;
export const STAT_VALUE_MAX = 8;
export const STAT_COUNT = 3;

export interface SpotlightInput extends PlayerArtInput {
  /** Fundamento ou motivo do destaque. */
  headline: string;
  /** Até três estatísticas digitadas pela comissão (rótulo e valor). Linha totalmente vazia é ignorada. */
  stats: readonly SpotlightStat[];
}

export function buildSpotlightArt({ player, photo, format, tone, framing = DEFAULT_FRAMING, headline, stats }: SpotlightInput): ArtResult<SpotlightArt> {
  const text = headline.trim();
  if (text.length > HEADLINE_MAX) return fail(`O fundamento ou motivo pode ter até ${HEADLINE_MAX} caracteres.`);
  const kept: SpotlightStat[] = [];
  for (const [index, stat] of stats.slice(0, STAT_COUNT).entries()) {
    const label = stat.label.trim();
    const value = stat.value.trim();
    if (label === '' && value === '') continue;
    if (label === '' || value === '') return fail(`Estatística ${index + 1}: preencha o nome e o valor, ou deixe os dois vazios.`);
    if (label.length > STAT_LABEL_MAX) return fail(`Estatística ${index + 1}: o nome pode ter até ${STAT_LABEL_MAX} caracteres.`);
    if (value.length > STAT_VALUE_MAX) return fail(`Estatística ${index + 1}: o valor pode ter até ${STAT_VALUE_MAX} caracteres.`);
    kept.push({ label, value });
  }
  return {
    ok: true,
    model: { kind: 'spotlight', format: formatFor('spotlight', format), tone, player: asArtPlayer(player, player.primaryPosition, photo), headline: text, stats: kept, framing },
  };
}

export interface CardInput extends PlayerArtInput {
  /** Overall derivado (null = sem avaliação) e os atributos da avaliação vigente. */
  overall: number | null;
  attributes: Attributes | null;
}

/** A carta do atleta: a mesma da tela de elenco (Overall derivado, seis atributos, traço do maior atributo). */
export function buildCardArt({ player, photo, format, tone, framing = DEFAULT_FRAMING, overall, attributes }: CardInput): ArtResult<CardArt> {
  return {
    ok: true,
    model: {
      kind: 'card',
      format: formatFor('card', format),
      tone,
      player: asArtPlayer(player, player.primaryPosition, photo),
      secondaryPosition: player.secondaryPosition ? POSITION_LABEL[player.secondaryPosition] : null,
      overall,
      attributes: CARD_ATTRIBUTES.map((key) => ({ key, value: attributes ? attributes[key] : null })),
      trait: attributes ? playerTrait(attributes) : null,
      uniform: player.uniform,
      framing,
    },
  };
}

export const HIGHLIGHT_TITLE_MAX = 14;
export const HIGHLIGHT_CAPTION_MAX = 20;
export const HIGHLIGHT_DETAIL_MAX = 30;

export interface HighlightsInput extends PlayerArtInput {
  caption: string;
  title: string;
  detail: string;
}

export function buildHighlightsArt({ player, photo, format, tone, framing = DEFAULT_FRAMING, caption, title, detail }: HighlightsInput): ArtResult<HighlightsArt> {
  const cleanTitle = title.trim();
  if (cleanTitle === '') return fail('Informe o título da capa (por exemplo, LANCES).');
  if (cleanTitle.length > HIGHLIGHT_TITLE_MAX) return fail(`O título pode ter até ${HIGHLIGHT_TITLE_MAX} caracteres.`);
  if (caption.trim().length > HIGHLIGHT_CAPTION_MAX) return fail(`A chamada pode ter até ${HIGHLIGHT_CAPTION_MAX} caracteres.`);
  if (detail.trim().length > HIGHLIGHT_DETAIL_MAX) return fail(`A temporada ou jogo pode ter até ${HIGHLIGHT_DETAIL_MAX} caracteres.`);
  return {
    ok: true,
    model: {
      kind: 'highlights',
      format: formatFor('highlights', format),
      tone,
      player: asArtPlayer(player, player.primaryPosition, photo),
      caption: caption.trim(),
      title: cleanTitle,
      detail: detail.trim(),
      framing,
    },
  };
}

export const buildBrandArt = (variant: BrandVariant, format: ArtFormatId, tone: ArtTone): BrandArt => ({
  kind: 'brand',
  format: formatFor('brand', format),
  tone,
  variant,
});

export const buildCoverArt = (variant: CoverVariant): CoverArt => ({ kind: 'cover', format: 'square', tone: 'dark', variant });
