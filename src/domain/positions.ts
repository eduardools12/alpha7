export const POSITIONS = ['levantador', 'oposto', 'ponteiro', 'central', 'libero'] as const;
export type Position = (typeof POSITIONS)[number];

/** Posições que podem ocupar uma das seis zonas da quadra. O líbero tem vaga própria. */
export type CourtRole = Exclude<Position, 'libero'>;

export const POSITION_LABEL: Record<Position, string> = {
  levantador: 'Levantador',
  oposto: 'Oposto',
  ponteiro: 'Ponteiro',
  central: 'Central',
  libero: 'Líbero',
};

export function isPosition(value: unknown): value is Position {
  return typeof value === 'string' && (POSITIONS as readonly string[]).includes(value);
}

export function isCourtRole(value: unknown): value is CourtRole {
  return isPosition(value) && value !== 'libero';
}
