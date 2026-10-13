import { shortName, type Player } from '@/domain/player';
import { courtPositions, setterPosition, type MatchSet, type Side } from '@/domain/match';
import { POSITION_LABEL } from '@/domain/positions';
import styles from './RotationCourt.module.css';

/** Ordem das posições na quadra vista de cima: rede em cima (P4 P3 P2), fundo embaixo (P5 P6 P1). */
const ROWS: number[][] = [
  [4, 3, 2],
  [5, 6, 1],
];

interface Props {
  set: MatchSet;
  rotation: number;
  servingSide: Side;
  playersById: ReadonlyMap<string, Player>;
}

/** Formação em quadra na rotação atual. Mostra quem saca (P1) e onde está o levantador; não simula substituições. */
export function RotationCourt({ set, rotation, servingSide, playersById }: Props) {
  const positions = courtPositions(set, rotation); // índice 0 = P1
  const setter = setterPosition(set, rotation);
  const libero = set.liberoId ? playersById.get(set.liberoId) : undefined;
  return (
    <div className={styles.wrap}>
      <div className={styles.net}>Rede</div>
      <ol className={styles.court} aria-label={`Formação na rotação ${(rotation % 6) + 1}`}>
        {ROWS.flat().map((position) => {
          const entry = positions[position - 1];
          const player = entry ? playersById.get(entry.playerId) : undefined;
          const serving = position === 1 && servingSide === 'us';
          return (
            <li key={position} className={`${styles.spot} ${serving ? styles.serving : ''}`}>
              <span className={styles.pos}>P{position}</span>
              <strong className={styles.name}>{player ? `${shortName(player.name)} #${player.jerseyNumber}` : '—'}</strong>
              <small className={styles.role}>{entry ? POSITION_LABEL[entry.role] : ''}</small>
              {serving && <span className={styles.tag}>Saque</span>}
            </li>
          );
        })}
      </ol>
      <p className={styles.note}>
        {setter ? `Levantador na posição P${setter}. ` : 'Sem levantador entre os titulares. '}
        {libero ? `Líbero: ${shortName(libero.name)} #${libero.jerseyNumber}. ` : ''}
        Substituições e a entrada automática do líbero ainda não são registradas: a formação mostrada é a inicial girando.
      </p>
    </div>
  );
}
