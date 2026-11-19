/**
 * Rodízio de atletas e atalhos de teclado do registro de treino. Regras puras: nada de React nem de armazenamento.
 * Cada registro continua sendo UM evento do atleta que estava selecionado; o rodízio só decide quem será o próximo.
 */

/** Quantas tentativas por atleta antes de trocar: de 1 a 20. */
export const MIN_SERIES = 1;
export const MAX_SERIES = 20;

/** Próximo (`1`) ou anterior (`-1`) participante, de forma circular. Sem atleta escolhido ou fora da lista, começa pelo primeiro/último. */
export function stepParticipantId(orderedIds: readonly string[], currentId: string | null, step: 1 | -1): string | null {
  if (orderedIds.length === 0) return null;
  const index = currentId === null ? -1 : orderedIds.indexOf(currentId);
  if (index === -1) return (step === 1 ? orderedIds[0] : orderedIds[orderedIds.length - 1]) ?? null;
  return orderedIds[(index + step + orderedIds.length) % orderedIds.length] ?? null;
}

/** Valor digitado de "tentativas por atleta": inteiro de 1 a 20; o que não for número vira 1. */
export function clampSeries(value: number): number {
  if (!Number.isFinite(value)) return MIN_SERIES;
  return Math.min(MAX_SERIES, Math.max(MIN_SERIES, Math.round(value)));
}

export interface RotationSettings {
  enabled: boolean;
  every: number;
}

/**
 * Depois de um registro bem-sucedido: devolve se deve passar para o próximo atleta e a nova contagem da série.
 * `doneInSeries` conta as tentativas já feitas com o atleta atual ANTES deste registro.
 */
export function afterRegistration(settings: RotationSettings, doneInSeries: number): { advance: boolean; doneInSeries: number } {
  if (!settings.enabled) return { advance: false, doneInSeries: 0 };
  const done = doneInSeries + 1;
  return done >= clampSeries(settings.every) ? { advance: true, doneInSeries: 0 } : { advance: false, doneInSeries: done };
}

export type Shortcut = { kind: 'outcome'; index: number } | { kind: 'player'; step: 1 | -1 };

/** Teclas 1 a 9 escolhem o resultado (se existir) e as setas trocam de atleta. Qualquer outra tecla não é atalho. */
export function interpretShortcut(key: string, outcomeCount: number): Shortcut | null {
  if (key === 'ArrowRight') return { kind: 'player', step: 1 };
  if (key === 'ArrowLeft') return { kind: 'player', step: -1 };
  if (/^[1-9]$/.test(key)) {
    const index = Number(key) - 1;
    return index < outcomeCount ? { kind: 'outcome', index } : null;
  }
  return null;
}
