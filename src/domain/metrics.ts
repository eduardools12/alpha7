/**
 * Métricas observadas (estatísticas). Princípio central: ausência de dado NÃO é zero.
 * Sem tentativas registradas, o valor é null e a interface mostra "indisponível".
 */
export interface Ratio {
  successes: number;
  attempts: number;
  /** Fração de 0 a 1, ou null quando não há tentativas. */
  value: number | null;
}

export function ratio(successes: number, attempts: number): Ratio {
  if (!Number.isInteger(successes) || !Number.isInteger(attempts) || successes < 0 || attempts < 0) {
    throw new RangeError('Acertos e tentativas devem ser inteiros não negativos.');
  }
  if (successes > attempts) throw new RangeError('Acertos não podem superar as tentativas.');
  return { successes, attempts, value: attempts === 0 ? null : successes / attempts };
}

export const UNAVAILABLE = '—';

export function formatPercent(r: Ratio, fractionDigits = 1): string {
  return r.value === null ? UNAVAILABLE : `${(r.value * 100).toFixed(fractionDigits).replace('.', ',')}%`;
}

/** "162/300" ou "sem tentativas": o contexto que deve acompanhar todo percentual. */
export function formatRatioContext(r: Ratio): string {
  return r.attempts === 0 ? 'sem tentativas registradas' : `${r.successes} de ${r.attempts}`;
}

/** Média aritmética, ou null para lista vazia. */
export function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
