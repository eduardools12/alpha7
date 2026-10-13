import type { Attributes } from './attributes';
import { calculateOverall, DEFAULT_OVERALL_WEIGHTS, type OverallWeights } from './overall';
import { isPosition, type Position } from './positions';

export const PLAYER_STATUSES = ['ativo', 'lesionado', 'transicao'] as const;
export type PlayerStatus = (typeof PLAYER_STATUSES)[number];

export const PLAYER_STATUS_LABEL: Record<PlayerStatus, string> = {
  ativo: 'Ativo',
  lesionado: 'Lesionado',
  transicao: 'Transição',
};

export const UNIFORM_COLORS = ['white', 'purple'] as const;
export type UniformColor = (typeof UNIFORM_COLORS)[number];

export const UNIFORM_LABEL: Record<UniformColor, string> = {
  white: 'Uniforme branco',
  purple: 'Uniforme roxo',
};

export const NAME_MIN = 2;
export const NAME_MAX = 60;
export const NOTES_MAX = 500;
export const JERSEY_MIN = 1;
export const JERSEY_MAX = 99;

/** Dados cadastrais. Independentes das avaliações técnicas (veja Evaluation). */
export interface Player {
  id: string;
  name: string;
  jerseyNumber: number;
  primaryPosition: Position;
  secondaryPosition: Position | null;
  status: PlayerStatus;
  uniform: UniformColor;
  coachNotes: string;
  createdAt: string;
  updatedAt: string;
  /** true = registro de demonstração, nunca confundir com dado real. */
  demo: boolean;
  /**
   * Foto do atleta (opcional; ausente = sem foto). Nuvem: caminho do arquivo no bucket privado; modo local: data URL
   * reduzida. Sempre a MESMA referência em carta, perfil, escalação e arte. Não é avaliação nem altera o Overall.
   */
  photo?: string;
}

/** Avaliação técnica datada. O histórico é apenas acrescido, nunca sobrescrito. */
export interface Evaluation {
  id: string;
  playerId: string;
  /** Data da avaliação, formato AAAA-MM-DD. */
  evaluatedAt: string;
  evaluator: string;
  note: string;
  attributes: Attributes;
  createdAt: string;
  demo: boolean;
}

export type PlayerDraft = Pick<
  Player,
  'name' | 'jerseyNumber' | 'primaryPosition' | 'secondaryPosition' | 'status' | 'uniform' | 'coachNotes'
>;

/** Valores crus de formulário (tudo texto). */
export interface PlayerFormValues {
  name: string;
  jerseyNumber: string;
  primaryPosition: string;
  secondaryPosition: string;
  status: string;
  uniform: string;
  coachNotes: string;
}

export type PlayerFieldErrors = Partial<Record<keyof PlayerFormValues, string>>;

export type ValidationResult<T, E> = { ok: true; value: T } | { ok: false; errors: E };

export function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const [first, ...rest] = parts;
  if (!first) return '';
  const last = rest[rest.length - 1];
  return last ? `${first} ${last.charAt(0).toLocaleUpperCase('pt-BR')}.` : first;
}

export function validatePlayerForm(
  values: PlayerFormValues,
  roster: readonly Player[],
  editingId?: string,
): ValidationResult<PlayerDraft, PlayerFieldErrors> {
  const errors: PlayerFieldErrors = {};

  const name = values.name.trim().replace(/\s+/g, ' ');
  if (name.length < NAME_MIN) errors.name = `Informe o nome (mínimo ${NAME_MIN} letras).`;
  else if (name.length > NAME_MAX) errors.name = `O nome pode ter até ${NAME_MAX} caracteres.`;

  const jerseyText = values.jerseyNumber.trim();
  const jerseyNumber = Number(jerseyText);
  if (jerseyText === '') errors.jerseyNumber = 'Informe o número da camisa.';
  else if (!/^\d+$/.test(jerseyText) || jerseyNumber < JERSEY_MIN || jerseyNumber > JERSEY_MAX) {
    errors.jerseyNumber = `Use um número inteiro de ${JERSEY_MIN} a ${JERSEY_MAX}.`;
  } else {
    const holder = roster.find((p) => p.jerseyNumber === jerseyNumber && p.id !== editingId);
    if (holder) {
      // shortName já termina em "." quando há sobrenome; evita o ponto duplicado.
      const who = shortName(holder.name);
      errors.jerseyNumber = `Escolha outro número: o ${jerseyNumber} já é de ${who}${who.endsWith('.') ? '' : '.'}`;
    }
  }

  if (!isPosition(values.primaryPosition)) errors.primaryPosition = 'Escolha a posição principal.';

  if (values.secondaryPosition !== '') {
    if (!isPosition(values.secondaryPosition)) errors.secondaryPosition = 'Posição secundária inválida.';
    else if (values.secondaryPosition === values.primaryPosition) {
      errors.secondaryPosition = 'A posição secundária deve ser diferente da principal.';
    }
  }

  if (!(PLAYER_STATUSES as readonly string[]).includes(values.status)) errors.status = 'Escolha a situação.';
  if (!(UNIFORM_COLORS as readonly string[]).includes(values.uniform)) errors.uniform = 'Escolha o uniforme.';
  if (values.coachNotes.length > NOTES_MAX) {
    errors.coachNotes = `As observações podem ter até ${NOTES_MAX} caracteres.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      name,
      jerseyNumber,
      primaryPosition: values.primaryPosition as Position,
      secondaryPosition: values.secondaryPosition === '' ? null : (values.secondaryPosition as Position),
      status: values.status as PlayerStatus,
      uniform: values.uniform as UniformColor,
      coachNotes: values.coachNotes.trim(),
    },
  };
}

export function playerToFormValues(player?: Player): PlayerFormValues {
  return {
    name: player?.name ?? '',
    jerseyNumber: player ? String(player.jerseyNumber) : '',
    primaryPosition: player?.primaryPosition ?? '',
    secondaryPosition: player?.secondaryPosition ?? '',
    status: player?.status ?? 'ativo',
    uniform: player?.uniform ?? 'purple',
    coachNotes: player?.coachNotes ?? '',
  };
}

/** Avaliações do atleta em ordem cronológica (da mais antiga para a mais recente). */
export function evaluationsFor(evaluations: readonly Evaluation[], playerId: string): Evaluation[] {
  return evaluations
    .filter((e) => e.playerId === playerId)
    .sort((a, b) => a.evaluatedAt.localeCompare(b.evaluatedAt) || a.createdAt.localeCompare(b.createdAt));
}

export function latestEvaluation(evaluations: readonly Evaluation[], playerId: string): Evaluation | null {
  const own = evaluationsFor(evaluations, playerId);
  return own[own.length - 1] ?? null;
}

/** Overall atual, ou null quando o atleta ainda não tem nenhuma avaliação (nunca 0). */
export function currentOverall(
  player: Player,
  evaluations: readonly Evaluation[],
  weights: OverallWeights = DEFAULT_OVERALL_WEIGHTS,
): number | null {
  const latest = latestEvaluation(evaluations, player.id);
  return latest ? calculateOverall(latest.attributes, player.primaryPosition, weights) : null;
}

export interface EvaluationFormValues {
  evaluatedAt: string;
  evaluator: string;
  note: string;
}

export type EvaluationFieldErrors = Partial<Record<keyof EvaluationFormValues, string>>;

export function validateEvaluationMeta(
  values: EvaluationFormValues,
  today: string,
): ValidationResult<EvaluationFormValues, EvaluationFieldErrors> {
  const errors: EvaluationFieldErrors = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.evaluatedAt) || Number.isNaN(Date.parse(values.evaluatedAt))) {
    errors.evaluatedAt = 'Informe a data da avaliação.';
  } else if (values.evaluatedAt > today) {
    errors.evaluatedAt = 'A data da avaliação não pode estar no futuro.';
  }
  const evaluator = values.evaluator.trim();
  if (evaluator.length < 2) errors.evaluator = 'Informe quem fez a avaliação.';
  if (values.note.length > NOTES_MAX) errors.note = `A nota pode ter até ${NOTES_MAX} caracteres.`;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { evaluatedAt: values.evaluatedAt, evaluator, note: values.note.trim() } };
}
