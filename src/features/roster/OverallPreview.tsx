import { OverallShield } from '@/components/brand/OverallShield';
import { formatSigned } from '@/domain/format';
import { POSITION_LABEL, type Position } from '@/domain/positions';
import styles from './OverallPreview.module.css';

interface OverallPreviewProps {
  overall: number | null;
  position: Position | null;
  /** Overall da avaliação vigente, para mostrar a variação. */
  previous?: number | null;
}

/** Prévia ao vivo: deixa claro que o Overall é calculado, e por qual posição. */
export function OverallPreview({ overall, position, previous = null }: OverallPreviewProps) {
  let text: string;
  if (overall === null) {
    text = position
      ? 'Preencha todas as notas de 1 a 99 para ver o Overall.'
      : 'Escolha a posição principal e preencha as notas para ver o Overall.';
  } else {
    const delta = previous === null ? '' : ` (${formatSigned(overall - previous)} em relação à avaliação atual)`;
    text = `Overall calculado para ${position ? POSITION_LABEL[position].toLowerCase() : 'a posição'}${delta}.`;
  }
  return (
    <div className={styles.preview} aria-live="polite">
      <OverallShield overall={overall} />
      <p>{text}</p>
    </div>
  );
}
