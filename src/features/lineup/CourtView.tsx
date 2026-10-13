import { Jersey } from '@/components/brand/Jersey';
import { COURT_LAYOUT, type CourtSlot, type LineupStarter } from '@/domain/lineup';
import { shortName, type Player } from '@/domain/player';
import { POSITION_LABEL, type CourtRole } from '@/domain/positions';
import styles from './CourtView.module.css';

export type Selection = CourtSlot | 'libero' | null;

interface CourtViewProps {
  /** Seis posições (índice 0 = P1) exatamente como devem ser exibidas. */
  starters: readonly (LineupStarter | null)[];
  libero: Player | null;
  playersById: ReadonlyMap<string, Player>;
  selection: Selection;
  /** Prévia de rodízio: sem edição. */
  readOnly: boolean;
  onSelect: (selection: Selection) => void;
}

function SlotButton({
  zone,
  label,
  player,
  role,
  selected,
  readOnly,
  onClick,
}: {
  zone: string;
  label: string;
  player: Player | null;
  role: string | null;
  selected: boolean;
  readOnly: boolean;
  onClick: () => void;
}) {
  const description = player
    ? `${label}: ${shortName(player.name)}, camisa ${player.jerseyNumber}, ${role ?? ''}`
    : `${label}: vazio`;
  return (
    <button
      type="button"
      className={`${styles.slot} ${player ? '' : styles.empty} ${selected ? styles.selected : ''}`}
      aria-pressed={readOnly ? undefined : selected}
      aria-label={description}
      disabled={readOnly}
      onClick={onClick}
    >
      <span className={styles.zone}>{zone}</span>
      {player ? (
        <>
          <span className={styles.jersey}>
            <Jersey color={player.uniform} number={player.jerseyNumber} />
          </span>
          <span className={styles.name}>{shortName(player.name)}</span>
          <span className={styles.role}>{role}</span>
        </>
      ) : (
        <span className={styles.vacant}>Escolher</span>
      )}
    </button>
  );
}

export function CourtView({ starters, libero, playersById, selection, readOnly, onSelect }: CourtViewProps) {
  const renderSlot = (slot: CourtSlot) => {
    const starter = starters[slot - 1] ?? null;
    const player = starter ? (playersById.get(starter.playerId) ?? null) : null;
    const role: CourtRole | null = starter?.role ?? null;
    return (
      <SlotButton
        key={slot}
        zone={`P${slot}`}
        label={`Zona P${slot}`}
        player={player}
        role={role ? POSITION_LABEL[role] : null}
        selected={selection === slot}
        readOnly={readOnly}
        onClick={() => onSelect(selection === slot ? null : slot)}
      />
    );
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.court}>
        <svg className={styles.floor} viewBox="0 0 100 104" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="quadra" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#9c88b5" />
              <stop offset="1" stopColor="#6c5789" />
            </linearGradient>
            <pattern id="rede" width="2.5" height="2.5" patternUnits="userSpaceOnUse">
              <path d="M0 0h2.5v2.5H0z" fill="none" stroke="#d3c4f5" strokeWidth="0.25" />
            </pattern>
          </defs>
          <polygon points="5,9 95,9 100,104 0,104" fill="url(#quadra)" />
          <polyline
            points="5,9 0,104 100,104 95,9 5,9"
            fill="none"
            stroke="#fff"
            strokeWidth="1.4"
            vectorEffect="non-scaling-stroke"
          />
          <line x1="2.4" y1="50" x2="97.6" y2="50" stroke="#fff" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
          <rect x="3" y="3" width="94" height="6" fill="url(#rede)" stroke="#e4dcf0" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className={styles.slots}>
          <div className={styles.row}>{COURT_LAYOUT.front.map(renderSlot)}</div>
          <div className={styles.row}>{COURT_LAYOUT.back.map(renderSlot)}</div>
        </div>
        <span className={styles.netLabel}>Rede</span>
      </div>
      <div className={styles.liberoRow}>
        <SlotButton
          zone="Líbero"
          label="Vaga de líbero"
          player={libero}
          role={libero ? 'Líbero' : null}
          selected={selection === 'libero'}
          readOnly={readOnly}
          onClick={() => onSelect(selection === 'libero' ? null : 'libero')}
        />
      </div>
    </div>
  );
}
