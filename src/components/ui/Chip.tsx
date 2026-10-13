import type { ButtonHTMLAttributes } from 'react';
import styles from './Chip.module.css';

interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  pressed: boolean;
}

/** Botão de alternância usado em filtros. O estado é anunciado por aria-pressed. */
export function Chip({ pressed, className, children, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={[styles.chip, pressed ? styles.on : '', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
