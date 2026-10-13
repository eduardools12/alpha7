/** Formatação de datas sem fuso: trabalha com texto AAAA-MM-DD, nunca com instantes. */

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function parts(isoDate: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** "2026-10-07" → "7 out 2026". Texto inválido volta como está. */
export function formatDate(isoDate: string): string {
  const p = parts(isoDate);
  if (!p) return isoDate;
  return `${p[2]} ${MONTHS_SHORT[p[1] - 1] ?? ''} ${p[0]}`;
}

/** "2026-10-07" → "7 out" (rótulo curto de eixo). */
export function formatDayMonth(isoDate: string): string {
  const p = parts(isoDate);
  if (!p) return isoDate;
  return `${p[2]} ${MONTHS_SHORT[p[1] - 1] ?? ''}`;
}

/** "2026-10-07" → { day: "07", month: "out" } para o bloco de data das listas. Sem data válida: traço e mês vazio. */
export function dateBlock(isoDate: string): { day: string; month: string } {
  const p = parts(isoDate);
  if (!p) return { day: '—', month: '' };
  return { day: String(p[2]).padStart(2, '0'), month: MONTHS_SHORT[p[1] - 1] ?? '' };
}

/** "2026-10-07" → "out 2026" */
export function formatMonthYear(isoDate: string): string {
  const p = parts(isoDate);
  if (!p) return isoDate;
  return `${MONTHS_SHORT[p[1] - 1] ?? ''} ${p[0]}`;
}

/** "2026-10" → "Out" (rótulo curto de eixo). */
export function monthShort(month: string): string {
  const m = Number(month.slice(5, 7));
  const label = MONTHS_SHORT[m - 1] ?? month;
  return label.charAt(0).toLocaleUpperCase('pt-BR') + label.slice(1);
}

/** "2026-10-15T19:30" → "15 out · 19:30". Sem horário, só a data. */
export function formatDateTime(localDateTime: string): string {
  if (!localDateTime) return '';
  const time = /T(\d{2}:\d{2})/.exec(localDateTime)?.[1];
  const date = formatDate(localDateTime.slice(0, 10));
  return time ? `${date} às ${time}` : date;
}

/** Instante ISO → "13 de out. de 2026, 21:05" no fuso do navegador. */
export function formatInstant(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatSigned(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return '0';
}
