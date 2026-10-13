import { Link } from 'react-router-dom';
import { playerTrait } from '@/domain/insights';
import { shortName, PLAYER_STATUS_LABEL } from '@/domain/player';
import { POSITION_LABEL } from '@/domain/positions';
import type { PlayerCardData } from '@/data/selectors';
import { Jersey } from './Jersey';
import { PlayerPhoto } from './PlayerPhoto';
import { OverallShield } from './OverallShield';
import styles from './PlayerCard.module.css';

/** Atributos exibidos na carta (os nove ficam no perfil). */
const CARD_STATS = ['SAC', 'REC', 'LEV', 'ATA', 'BLQ', 'DEF'] as const;

interface PlayerCardProps {
  card: PlayerCardData;
  to: string;
}

export function PlayerCard({ card, to }: PlayerCardProps) {
  const { player, attributes, overall } = card;
  const trait = attributes ? playerTrait(attributes) : null;
  const label = `${shortName(player.name)}, camisa ${player.jerseyNumber}, ${POSITION_LABEL[player.primaryPosition]}, ${
    overall === null ? 'sem avaliação' : `Overall ${overall}`
  }`;

  return (
    <Link to={to} className={styles.card} aria-label={label}>
      <div className={styles.inner}>
        <div className={styles.head}>
          <span className={styles.shield}>
            <OverallShield overall={overall} />
          </span>
          <span className={`${styles.trait} ${trait ? '' : styles.noTrait}`}>{trait ?? 'Sem avaliação'}</span>
          <span className={styles.photo}>
            <PlayerPhoto
              player={player}
              fallback={
                <span className={styles.jersey}>
                  <Jersey color={player.uniform} number={player.jerseyNumber} />
                </span>
              }
            />
          </span>
          {player.demo && <span className={styles.demo}>Demo</span>}
        </div>
        <div className={styles.body}>
          <h3 className={styles.name}>
            {shortName(player.name)} <span className={styles.number}>#{player.jerseyNumber}</span>
          </h3>
          <p className={styles.position}>
            {POSITION_LABEL[player.primaryPosition]}
            {player.secondaryPosition && <span> · {POSITION_LABEL[player.secondaryPosition]}</span>}
          </p>
          <dl className={styles.stats}>
            {CARD_STATS.map((key) => (
              <div key={key} className={styles.stat}>
                <dt>{key}</dt>
                <dd className="tabular">{attributes ? attributes[key] : '—'}</dd>
              </div>
            ))}
          </dl>
          {player.status !== 'ativo' && (
            <span className={`${styles.status} ${styles[player.status]}`}>{PLAYER_STATUS_LABEL[player.status]}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
