import { useId } from 'react';
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
  /** Atleta marcado (só no modo interativo). */
  selectedId?: string | null;
  /** Quando informado, cada posição vira um botão que escolhe o atleta; sem ele a quadra é só leitura. */
  onSelect?: (playerId: string) => void;
}

/** Formação em quadra na rotação atual. Mostra quem saca (P1) e onde está o levantador; não simula substituições. */
export function RotationCourt({ set, rotation, servingSide, playersById, selectedId = null, onSelect }: Props) {
  const idBase = useId();
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
          const name = player ? `${shortName(player.name)} #${player.jerseyNumber}` : '—';
          const role = entry ? POSITION_LABEL[entry.role] : '';
          const content = (
            <>
              <span className={styles.pos}>P{position}</span>
              <strong className={styles.name}>{name}</strong>
              <small className={styles.role}>{role}</small>
              {serving && <span className={styles.tag}>Saque</span>}
            </>
          );
          const spotClass = `${styles.spot} ${serving ? styles.serving : ''}`;
          if (!onSelect) {
            return (
              <li key={position} className={spotClass}>
                {content}
              </li>
            );
          }
          const describedBy = `${idBase}-p${position}`;
          const selected = player !== undefined && selectedId === player.id;
          return (
            <li key={position} className={styles.cell}>
              <button
                type="button"
                className={`${spotClass} ${styles.pick} ${selected ? styles.selected : ''}`}
                aria-label={name}
                aria-pressed={selected}
                aria-describedby={describedBy}
                disabled={player === undefined}
                onClick={() => player && onSelect(player.id)}
              >
                {content}
              </button>
              <span id={describedBy} className="sr-only">
                posição P{position}
                {role ? `, ${role}` : ''}
              </span>
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
