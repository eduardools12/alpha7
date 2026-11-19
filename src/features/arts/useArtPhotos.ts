import { useEffect, useState } from 'react';
import type { ArtPhoto } from '@/domain/arts';
import { shortName, type Player } from '@/domain/player';

/**
 * Tamanho original da imagem (para o enquadramento da foto). O jsdom não carrega imagens e nunca avisa: lá não se
 * espera. Se o navegador não conseguir ler, devolve null e a arte usa o enquadramento automático (rosto no alto).
 */
export function readImageSize(href: string): Promise<{ width: number; height: number } | null> {
  if (typeof Image === 'undefined' || /jsdom/i.test(navigator.userAgent)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth > 0 ? { width: image.naturalWidth, height: image.naturalHeight } : null);
    image.onerror = () => resolve(null);
    image.src = href;
  });
}

export interface ArtPhotosState {
  photos: Record<string, ArtPhoto>;
  loading: boolean;
  /** Nomes (curtos) dos atletas cuja foto não carregou. */
  failed: string[];
}

const EMPTY: ArtPhotosState = { photos: {}, loading: false, failed: [] };

/**
 * Baixa, uma vez, as fotos cadastradas dos atletas pedidos (a MESMA referência do cadastro, como data URL) e lê o
 * tamanho de cada uma. Quem não tem foto, ou cuja foto não carregou, simplesmente não aparece em `photos`.
 */
export function useArtPhotos(players: readonly Player[], load: (reference: string) => Promise<string>): ArtPhotosState {
  const withPhoto = players.filter((p) => p.photo);
  const key = withPhoto.map((p) => `${p.id}:${p.photo}`).join('|');
  const [state, setState] = useState<ArtPhotosState>(EMPTY);

  useEffect(() => {
    let alive = true;
    if (withPhoto.length === 0) {
      setState(EMPTY);
      return;
    }
    setState((previous) => ({ ...previous, loading: true, failed: [] }));
    void Promise.allSettled(
      withPhoto.map(async (player) => {
        const href = await load(player.photo ?? '');
        const size = await readImageSize(href);
        return { id: player.id, photo: size ? { href, ...size } : { href } };
      }),
    ).then((settled) => {
      if (!alive) return;
      const photos: Record<string, ArtPhoto> = {};
      const failed: string[] = [];
      settled.forEach((outcome, index) => {
        const player = withPhoto[index];
        if (!player) return;
        if (outcome.status === 'fulfilled') photos[outcome.value.id] = outcome.value.photo;
        else failed.push(shortName(player.name));
      });
      setState({ photos, loading: false, failed });
    });
    return () => {
      alive = false;
    };
    // `key` representa o conteúdo de `withPhoto`; `load` muda a cada edição e não deve refazer os downloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
