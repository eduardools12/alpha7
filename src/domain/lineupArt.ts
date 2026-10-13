import { formatDateTime } from './format';
import type { Lineup } from './lineup';
import type { Match } from './match';
import { shortName, type Player, type UniformColor } from './player';
import { POSITION_LABEL } from './positions';

/**
 * ARTE DA ESCALAÇÃO: o que aparece no pôster. Regra pura: só reúne e valida os dados reais (partida, escalação salva,
 * atletas). Nada de imagem gerada por IA, nenhum rosto: o desenho é determinístico (veja features/arts/artSvg.ts).
 */

export const ART_FORMATS = {
  cartaz: { id: 'cartaz', label: 'Cartaz 4:5', width: 1080, height: 1350 },
  story: { id: 'story', label: 'Story 9:16', width: 1080, height: 1920 },
} as const;
export type ArtFormatId = keyof typeof ART_FORMATS;
export type ArtFormat = (typeof ART_FORMATS)[ArtFormatId];
export const ART_FORMAT_IDS = Object.keys(ART_FORMATS) as ArtFormatId[];

export interface ArtPlayer {
  name: string;
  number: number;
  position: string;
  /** Foto cadastrada do atleta, como data URL (a mesma do cadastro). Ausente = a arte mostra o número da camisa. */
  photo?: string;
}

export interface ArtModel {
  format: ArtFormat;
  uniform: UniformColor;
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

export interface ArtInput {
  match: Match;
  lineup: Lineup;
  players: readonly Player[];
  format: ArtFormatId;
  uniform: UniformColor;
  /** Fotos já carregadas (atleta → data URL). Quem não está aqui aparece sem foto. */
  photos?: Readonly<Record<string, string>>;
}

export type ArtResult = { ok: true; model: ArtModel } | { ok: false; reason: string };

const asArtPlayer = (player: Player, position = player.primaryPosition, photo?: string): ArtPlayer => ({
  name: shortName(player.name),
  number: player.jerseyNumber,
  position: POSITION_LABEL[position],
  ...(photo ? { photo } : {}),
});

/** Monta o modelo da arte. Recusa escalação incompleta ou com atleta que saiu do elenco (arte com buraco enganaria). */
export function buildArtModel({ match, lineup, players, format, uniform, photos = {} }: ArtInput): ArtResult {
  const byId = new Map(players.map((p) => [p.id, p]));
  const starters: ArtPlayer[] = [];
  for (const [index, starter] of lineup.starters.entries()) {
    if (!starter) return { ok: false, reason: `A escalação “${lineup.title}” não tem os seis titulares: falta a posição P${index + 1}.` };
    const player = byId.get(starter.playerId);
    if (!player) return { ok: false, reason: 'A escalação tem um atleta que não está mais no elenco.' };
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
      format: ART_FORMATS[format],
      uniform,
      title: 'Escalação Oficial',
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

/** "alpha7-escalacao-time-vizinho-cartaz.png": sem acentos nem símbolos, estável para o mesmo jogo. */
export function artFilename(match: Pick<Match, 'opponent'>, format: ArtFormatId): string {
  const slug = match.opponent
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `alpha7-escalacao-${slug || 'partida'}-${format}.png`;
}
