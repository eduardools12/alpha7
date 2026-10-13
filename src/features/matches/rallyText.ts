import { SIDE_LABEL, reasonLabel, type Rally } from '@/domain/match';
import { shortName, type Player } from '@/domain/player';

/** "Alpha7 · Ace · Ana #7". Ponto sem motivo conhecido diz isso, em vez de inventar um. */
export function rallyDescription(rally: Rally, playersById: ReadonlyMap<string, Player>): string {
  const parts: string[] = [SIDE_LABEL[rally.winnerSide], rally.reason ? reasonLabel(rally.reason, rally.winnerSide) : 'motivo não informado'];
  const player = rally.playerId ? playersById.get(rally.playerId) : undefined;
  if (player) parts.push(`${shortName(player.name)} #${player.jerseyNumber}`);
  return parts.join(' · ');
}

/** Placar acumulado DEPOIS de cada ponto: id do ponto → "18 x 15". Os pontos devem ser os ativos do set, em ordem. */
export function runningScores(rallies: readonly Rally[]): Map<string, string> {
  const result = new Map<string, string>();
  let us = 0;
  let them = 0;
  for (const rally of rallies) {
    if (rally.winnerSide === 'us') us += 1;
    else them += 1;
    result.set(rally.id, `${us} x ${them}`);
  }
  return result;
}
