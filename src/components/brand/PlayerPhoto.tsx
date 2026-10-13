import { useState, type ReactNode } from 'react';
import { usePlayerPhotoUrl } from '@/data/usePlayerPhoto';
import { shortName, type Player } from '@/domain/player';
import styles from './PlayerPhoto.module.css';

type PhotoPlayer = Pick<Player, 'name' | 'jerseyNumber' | 'photo'>;

interface PlayerPhotoProps {
  player: PhotoPlayer;
  /** `portrait`: 4:5 (carta, perfil). `avatar`: círculo pequeno para listas e seletores. */
  variant?: 'portrait' | 'avatar';
  className?: string;
  /** Retrato sem foto (ou carregando/com falha): o que mostrar no lugar (por exemplo, a camisa). */
  fallback?: ReactNode;
}

/**
 * A foto cadastrada do atleta, sempre a mesma referência (`player.photo`). No retrato, sem foto devolve null para quem
 * chama mostrar a camisa; no avatar, mostra o número da camisa em um círculo (avatar padrão).
 */
export function PlayerPhoto({ player, variant = 'portrait', className, fallback = null }: PlayerPhotoProps) {
  const url = usePlayerPhotoUrl(player.photo);
  const [failed, setFailed] = useState<string | null>(null);
  const usable = url !== null && failed !== url;

  if (variant === 'avatar') {
    return (
      <span className={[styles.avatar, className].filter(Boolean).join(' ')}>
        {usable ? (
          <img className={styles.avatarImg} src={url} alt="" onError={() => setFailed(url)} />
        ) : (
          <span className={styles.avatarFallback} aria-hidden="true">
            {player.jerseyNumber}
          </span>
        )}
      </span>
    );
  }
  if (!usable) return <>{fallback}</>;
  return <img className={[styles.portrait, className].filter(Boolean).join(' ')} src={url} alt={`Foto de ${shortName(player.name)}`} onError={() => setFailed(url)} />;
}
