import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import styles from './Card.module.css';

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  tone?: 'plain' | 'purple';
  title?: string;
  /** Conteúdo à direita do título (ação ou etiqueta). */
  titleAside?: ReactNode;
  children: ReactNode;
}

export function Card({ as: Tag = 'section', tone = 'plain', title, titleAside, className, children, ...rest }: CardProps) {
  return (
    <Tag className={[styles.card, tone === 'purple' ? styles.purple : '', className].filter(Boolean).join(' ')} {...rest}>
      {title && (
        <header className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          {titleAside}
        </header>
      )}
      {children}
    </Tag>
  );
}
