import type { Player, PlayerStatus } from './player';
import type { Position } from './positions';

export interface RosterFilter {
  query: string;
  /** null = todas as posições. Considera a posição principal. */
  position: Position | null;
  /** Situações visíveis. Conjunto vazio não mostra ninguém. */
  statuses: ReadonlySet<PlayerStatus>;
}

function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

/**
 * Busca por nome ou número da camisa.
 * - "#8" ou "8" encontra a camisa 8 (igualdade exata: "1" não traz 10, 11...).
 * - Texto encontra por trecho do nome, sem diferenciar maiúsculas nem acentos.
 */
export function matchesQuery(player: Player, rawQuery: string): boolean {
  const query = normalizeText(rawQuery).replace(/^#/, '');
  if (query === '') return true;
  if (/^\d+$/.test(query)) return player.jerseyNumber === Number(query);
  return normalizeText(player.name).includes(query);
}

export function filterRoster(players: readonly Player[], filter: RosterFilter): Player[] {
  return players
    .filter((player) => filter.statuses.has(player.status))
    .filter((player) => filter.position === null || player.primaryPosition === filter.position)
    .filter((player) => matchesQuery(player, filter.query))
    .sort((a, b) => a.jerseyNumber - b.jerseyNumber);
}
