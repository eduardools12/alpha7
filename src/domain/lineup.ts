import { isCourtRole, type CourtRole } from './positions';
import { PLAYER_STATUS_LABEL, shortName, type Player } from './player';
import { POSITION_LABEL } from './positions';

/**
 * Escalação.
 *
 * Três conceitos distintos, que não devem ser misturados:
 * - posição habitual: o que o atleta é (Player.primaryPosition / secondaryPosition);
 * - posição tática: o papel que ele exerce NESTA escalação (LineupStarter.role);
 * - zona de quadra / rotação: onde ele está agora (P1 a P6), que muda a cada rodízio.
 *
 * `starters[i]` guarda quem ocupa a zona P(i+1) na ROTAÇÃO INICIAL do set.
 * A ordem de saque base é P1, P2, P3, P4, P5, P6: o jogador de P1 saca primeiro e,
 * a cada rodízio (sentido horário), quem estava em P2 vai para P1 e passa a sacar.
 */
export const COURT_SLOTS = [1, 2, 3, 4, 5, 6] as const;
export type CourtSlot = (typeof COURT_SLOTS)[number];

/** Disposição visual (vista de trás da quadra, rede no topo): linha da rede e linha de fundo. */
export const COURT_LAYOUT: { front: CourtSlot[]; back: CourtSlot[] } = {
  front: [4, 3, 2],
  back: [5, 6, 1],
};

export const FORMATIONS = ['5-1', '4-2', '6-2'] as const;
export type Formation = (typeof FORMATIONS)[number];

export const FORMATION_SETTERS: Record<Formation, number> = { '5-1': 1, '4-2': 2, '6-2': 2 };

export interface LineupStarter {
  playerId: string;
  role: CourtRole;
}

export interface Lineup {
  id: string;
  title: string;
  opponent: string;
  competition: string;
  /** Texto "AAAA-MM-DDTHH:mm" (campo datetime-local), ou vazio. */
  scheduledAt: string;
  venue: string;
  formation: Formation;
  /** Sempre 6 posições; índice 0 = P1. */
  starters: (LineupStarter | null)[];
  liberoId: string | null;
  benchIds: string[];
  createdAt: string;
  updatedAt: string;
  demo: boolean;
}

export type LineupMetaFields = Pick<
  Lineup,
  'title' | 'opponent' | 'competition' | 'scheduledAt' | 'venue' | 'formation'
>;

export function createEmptyLineup(id: string, nowIso: string): Lineup {
  return {
    id,
    title: 'Nova escalação',
    opponent: '',
    competition: '',
    scheduledAt: '',
    venue: '',
    formation: '5-1',
    starters: [null, null, null, null, null, null],
    liberoId: null,
    benchIds: [],
    createdAt: nowIso,
    updatedAt: nowIso,
    demo: false,
  };
}

const indexOfSlot = (slot: CourtSlot) => slot - 1;

export function starterAt(lineup: Lineup, slot: CourtSlot): LineupStarter | null {
  return lineup.starters[indexOfSlot(slot)] ?? null;
}

export function starterSlotOf(lineup: Lineup, playerId: string): CourtSlot | null {
  const index = lineup.starters.findIndex((s) => s?.playerId === playerId);
  return index === -1 ? null : ((index + 1) as CourtSlot);
}

export function starterCount(lineup: Lineup): number {
  return lineup.starters.filter((s) => s !== null).length;
}

/** Todos os atletas já usados em qualquer vaga da escalação. */
export function selectedPlayerIds(lineup: Lineup): string[] {
  const ids = lineup.starters.flatMap((s) => (s ? [s.playerId] : []));
  if (lineup.liberoId) ids.push(lineup.liberoId);
  ids.push(...lineup.benchIds);
  return ids;
}

export type LineupRole = 'titular' | 'libero' | 'reserva' | null;

export function roleInLineup(lineup: Lineup, playerId: string): LineupRole {
  if (starterSlotOf(lineup, playerId) !== null) return 'titular';
  if (lineup.liberoId === playerId) return 'libero';
  if (lineup.benchIds.includes(playerId)) return 'reserva';
  return null;
}

/** Papel tático inicial de um atleta numa zona de quadra, ou null se só atua como líbero. */
export function defaultRoleFor(player: Player): CourtRole | null {
  if (isCourtRole(player.primaryPosition)) return player.primaryPosition;
  if (player.secondaryPosition && isCourtRole(player.secondaryPosition)) return player.secondaryPosition;
  return null;
}

export type LineupChange = { ok: true; lineup: Lineup } | { ok: false; reason: string };

function touch(lineup: Lineup, changes: Partial<Lineup>): Lineup {
  return { ...lineup, ...changes };
}

/**
 * Coloca o atleta numa zona. Nunca duplica: se ele já estava na escalação, é movido.
 * Se vinha de outra zona titular e o destino estava ocupado, os dois trocam de lugar.
 */
export function assignStarter(lineup: Lineup, slot: CourtSlot, player: Player): LineupChange {
  const baseRole = defaultRoleFor(player);
  if (!baseRole) {
    return {
      ok: false,
      reason: `${shortName(player.name)} só atua como líbero. Use a vaga de líbero.`,
    };
  }

  const targetIndex = indexOfSlot(slot);
  const fromIndex = lineup.starters.findIndex((s) => s?.playerId === player.id);
  const occupant = lineup.starters[targetIndex] ?? null;
  if (occupant?.playerId === player.id) return { ok: true, lineup };

  const starters = [...lineup.starters];
  const previous = fromIndex === -1 ? null : (lineup.starters[fromIndex] ?? null);
  if (fromIndex !== -1) starters[fromIndex] = occupant;
  starters[targetIndex] = { playerId: player.id, role: previous?.role ?? baseRole };

  return {
    ok: true,
    lineup: touch(lineup, {
      starters,
      benchIds: lineup.benchIds.filter((id) => id !== player.id),
      liberoId: lineup.liberoId === player.id ? null : lineup.liberoId,
    }),
  };
}

export function clearStarter(lineup: Lineup, slot: CourtSlot): Lineup {
  const starters = [...lineup.starters];
  starters[indexOfSlot(slot)] = null;
  return touch(lineup, { starters });
}

export function swapStarters(lineup: Lineup, a: CourtSlot, b: CourtSlot): Lineup {
  if (a === b) return lineup;
  const starters = [...lineup.starters];
  const first = starters[indexOfSlot(a)] ?? null;
  starters[indexOfSlot(a)] = starters[indexOfSlot(b)] ?? null;
  starters[indexOfSlot(b)] = first;
  return touch(lineup, { starters });
}

export function setStarterRole(lineup: Lineup, slot: CourtSlot, role: CourtRole): Lineup {
  const current = starterAt(lineup, slot);
  if (!current) return lineup;
  const starters = [...lineup.starters];
  starters[indexOfSlot(slot)] = { ...current, role };
  return touch(lineup, { starters });
}

/** Define (ou remove, com null) o líbero. O atleta sai de qualquer outra vaga. */
export function setLibero(lineup: Lineup, playerId: string | null): Lineup {
  if (playerId === null) return touch(lineup, { liberoId: null });
  return touch(lineup, {
    liberoId: playerId,
    starters: lineup.starters.map((s) => (s?.playerId === playerId ? null : s)),
    benchIds: lineup.benchIds.filter((id) => id !== playerId),
  });
}

/** Adiciona ou remove um reserva. Quem já é titular ou líbero não pode ser reserva ao mesmo tempo. */
export function toggleBench(lineup: Lineup, playerId: string): Lineup {
  if (lineup.benchIds.includes(playerId)) {
    return touch(lineup, { benchIds: lineup.benchIds.filter((id) => id !== playerId) });
  }
  if (starterSlotOf(lineup, playerId) !== null || lineup.liberoId === playerId) return lineup;
  return touch(lineup, { benchIds: [...lineup.benchIds, playerId] });
}

export function updateLineupMeta(lineup: Lineup, meta: Partial<LineupMetaFields>): Lineup {
  return touch(lineup, meta);
}

export interface ServingEntry {
  /** 1 = saca primeiro. */
  order: number;
  slot: CourtSlot;
  starter: LineupStarter;
}

export function servingOrder(lineup: Lineup): ServingEntry[] {
  return COURT_SLOTS.flatMap((slot) => {
    const starter = starterAt(lineup, slot);
    return starter ? [{ order: slot, slot, starter }] : [];
  });
}

/**
 * Posições após `steps` rodízios no sentido horário.
 * Cada rodízio: P2→P1, P1→P6, P6→P5, P5→P4, P4→P3, P3→P2.
 */
export function rotateStarters(
  starters: readonly (LineupStarter | null)[],
  steps = 1,
): (LineupStarter | null)[] {
  const n = ((steps % 6) + 6) % 6;
  return starters.map((_, index) => starters[(index + n) % 6] ?? null);
}

export interface LineupReport {
  errors: string[];
  warnings: string[];
}

export function validateLineup(lineup: Lineup, players: readonly Player[]): LineupReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const byId = new Map(players.map((p) => [p.id, p]));

  if (lineup.title.trim() === '') errors.push('Dê um nome para a escalação.');

  const missing = 6 - starterCount(lineup);
  if (missing > 0) errors.push(`Faltam ${missing} ${missing === 1 ? 'titular' : 'titulares'} para completar os seis.`);

  const ids = selectedPlayerIds(lineup);
  if (new Set(ids).size !== ids.length) errors.push('Há atleta repetido na escalação.');
  if (ids.some((id) => !byId.has(id))) errors.push('Há atleta que não está mais no elenco.');

  const starters = lineup.starters.flatMap((s) => (s ? [s] : []));

  for (const starter of starters) {
    const player = byId.get(starter.playerId);
    if (!player) continue;
    if (player.status !== 'ativo') {
      warnings.push(`${shortName(player.name)} está com situação "${PLAYER_STATUS_LABEL[player.status]}".`);
    }
    const knownRoles = [player.primaryPosition, player.secondaryPosition];
    if (!knownRoles.includes(starter.role)) {
      warnings.push(
        `${shortName(player.name)} está como ${POSITION_LABEL[starter.role].toLowerCase()}, fora de suas posições habituais.`,
      );
    }
  }

  if (lineup.liberoId) {
    const libero = byId.get(lineup.liberoId);
    if (libero && libero.primaryPosition !== 'libero' && libero.secondaryPosition !== 'libero') {
      warnings.push(`${shortName(libero.name)} não tem líbero entre suas posições habituais.`);
    }
    if (libero && libero.status !== 'ativo') {
      warnings.push(`${shortName(libero.name)} está com situação "${PLAYER_STATUS_LABEL[libero.status]}".`);
    }
  }

  if (starters.length === 6) {
    const setters = starters.filter((s) => s.role === 'levantador').length;
    const expected = FORMATION_SETTERS[lineup.formation];
    if (setters !== expected) {
      warnings.push(
        `A formação ${lineup.formation} usa ${expected} ${expected === 1 ? 'levantador' : 'levantadores'}; a escalação tem ${setters}.`,
      );
    }
  }

  return { errors, warnings };
}
