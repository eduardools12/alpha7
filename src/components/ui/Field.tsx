import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import styles from './Field.module.css';

interface FieldFrameProps {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  /** Texto à direita do rótulo (por exemplo, contador de caracteres). */
  aside?: ReactNode;
}

function Frame({
  id,
  label,
  error,
  hint,
  aside,
  children,
}: FieldFrameProps & { id: string; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
        {aside && <span className={styles.aside}>{aside}</span>}
      </div>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (id: string, error?: string, hint?: string) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

export function TextField({
  label,
  error,
  hint,
  aside,
  ...input
}: FieldFrameProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Frame id={id} label={label} error={error} hint={hint} aside={aside}>
      <input
        id={id}
        className={styles.control}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...input}
      />
    </Frame>
  );
}

export function SelectField({
  label,
  error,
  hint,
  aside,
  children,
  ...select
}: FieldFrameProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <Frame id={id} label={label} error={error} hint={hint} aside={aside}>
      <select
        id={id}
        className={`${styles.control} ${styles.select}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...select}
      >
        {children}
      </select>
    </Frame>
  );
}

export function TextAreaField({
  label,
  error,
  hint,
  aside,
  ...area
}: FieldFrameProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <Frame id={id} label={label} error={error} hint={hint} aside={aside}>
      <textarea
        id={id}
        className={`${styles.control} ${styles.area}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...area}
      />
    </Frame>
  );
}
