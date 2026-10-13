import type { OutcomeTone } from '@/domain/fundamentals';
import { shortName, type Player } from '@/domain/player';

/** "100" → "1 h 40 min"; "45" → "45 min"; null → "Duração não informada". */
export function formatDuration(minutes: number | null): string {
  if (minutes === null) return 'Duração não informada';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** Nome curto com camisa; atleta que saiu do elenco aparece de forma explícita. */
export function playerLabel(player: Player | undefined): string {
  return player ? `${shortName(player.name)} #${player.jerseyNumber}` : 'Atleta removido do elenco';
}

export const TONE_VAR: Record<OutcomeTone, string> = {
  good: 'var(--outcome-good)',
  ok: 'var(--outcome-ok)',
  warn: 'var(--outcome-warn)',
  bad: 'var(--outcome-bad)',
  neutral: 'var(--outcome-neutral)',
};

/** "2026-10-12T19:04:05.000Z" → "19:04:05" no fuso do navegador. */
export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
