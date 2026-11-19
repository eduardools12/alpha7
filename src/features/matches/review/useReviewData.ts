import { useCallback, useEffect, useRef, useState } from 'react';
import { getReviewStore } from '@/data/reviewStore';
import type { VideoAnalysis } from '@/domain/videoReview';
import { emptyReview, reviewKey, type ReviewData } from '@/domain/videoReviewData';

export interface ReviewDataState {
  /** null enquanto faltar a partida, o vídeo ou a análise. */
  review: ReviewData | null;
  /** false enquanto o registro guardado está sendo lido (a tela não deixa editar antes, para não sobrescrever). */
  ready: boolean;
  loadFailed: boolean;
  saveFailed: boolean;
  /** false quando nada sobrevive a fechar a aba (armazenamento em memória). */
  persistent: boolean;
  /** Aplica a mudança sobre o valor mais recente, mostra na hora e grava em seguida (a falha não desfaz o que está na tela). */
  update(change: (data: ReviewData) => ReviewData): void;
}

/**
 * Associações e sincronia da revisão com vídeo: lidas e gravadas SÓ neste navegador, por partida + vídeo + análise.
 * Outra análise, outro vídeo ou outra partida nunca recebem estes dados (os números de trilha mudam a cada análise).
 */
export function useReviewData(matchId: string | undefined, video: File | null, analysis: VideoAnalysis | null): ReviewDataState {
  const [review, setReview] = useState<ReviewData | null>(null);
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const latest = useRef<ReviewData | null>(null);
  const request = useRef(0);

  useEffect(() => {
    const id = (request.current += 1);
    setLoadFailed(false);
    setSaveFailed(false);
    if (!matchId || !video || !analysis) {
      latest.current = null;
      setReview(null);
      setReady(false);
      return;
    }
    const fresh = emptyReview(matchId, { name: video.name, size: video.size, lastModified: video.lastModified }, analysis.id);
    latest.current = fresh;
    setReview(fresh);
    setReady(false);
    getReviewStore()
      .load(reviewKey(fresh))
      .then(
        (saved) => {
          if (id !== request.current) return; // outro vídeo, análise ou partida já foi escolhido
          if (saved) {
            latest.current = saved;
            setReview(saved);
          }
          setReady(true);
        },
        () => {
          if (id !== request.current) return;
          setLoadFailed(true);
          setReady(true);
        },
      );
  }, [matchId, video, analysis]);

  const update = useCallback((change: (data: ReviewData) => ReviewData) => {
    const current = latest.current;
    if (!current) return;
    const next = change(current);
    latest.current = next;
    setReview(next);
    const id = request.current;
    getReviewStore()
      .save(reviewKey(next), next)
      .then(
        () => {
          if (id === request.current) setSaveFailed(false);
        },
        () => {
          if (id === request.current) setSaveFailed(true);
        },
      );
  }, []);

  return { review, ready, loadFailed, saveFailed, persistent: getReviewStore().persistent, update };
}
