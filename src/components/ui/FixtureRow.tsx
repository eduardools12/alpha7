import type { ReactNode } from 'react';
import styles from './FixtureRow.module.css';

interface Stat {
  label: string;
  value: ReactNode;
}

interface FixtureRowProps {
  /** Bloco de data à esquerda: dia grande e mês pequeno (ou "—" sem data). */
  day: string;
  month: string;
  title: ReactNode;
  tags?: ReactNode;
  meta?: ReactNode;
  stats?: readonly Stat[];
  /** Resultado de destaque à direita (placar). */
  result?: ReactNode;
  actions?: ReactNode;
  /** Faixa lateral que indica a situação (não é o único sinal: a situação também vem em texto nas etiquetas). */
  tone?: 'open' | 'done' | 'plain';
  /** Painel que abre abaixo da linha (confirmação de exclusão). */
  below?: ReactNode;
}

/** Linha de agenda esportiva (treino, partida): data em bloco, título, números em linha e ações à direita. */
export function FixtureRow({ day, month, title, tags, meta, stats, result, actions, tone = 'plain', below }: FixtureRowProps) {
  return (
    <article className={`${styles.row} ${styles[tone]}`}>
      <div className={styles.date} aria-hidden="true">
        <span className={styles.day}>{day}</span>
        <span className={styles.month}>{month}</span>
      </div>
      <div className={styles.main}>
        <header className={styles.head}>
          <h2 className={styles.title}>{title}</h2>
          {tags && <span className={styles.tags}>{tags}</span>}
        </header>
        {meta && <p className={styles.meta}>{meta}</p>}
        {stats && stats.length > 0 && (
          <dl className={styles.stats}>
            {stats.map((stat) => (
              <div key={stat.label}>
                <dt>{stat.label}</dt>
                <dd className="tabular">{stat.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      {result && <div className={styles.result}>{result}</div>}
      {actions && <div className={styles.actions}>{actions}</div>}
      {below && <div className={styles.below}>{below}</div>}
    </article>
  );
}
