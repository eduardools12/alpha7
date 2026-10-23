import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { MatchState } from '@/domain/match';
import type { Player } from '@/domain/player';
import { formatMs } from '@/domain/videoReview';
import { syncedVideoMs, type ReviewData } from '@/domain/videoReviewData';
import { rallyDescription, runningScores } from '../rallyText';
import styles from './MatchReviewPage.module.css';

interface Props {
  sets: MatchState['sets'];
  review: ReviewData | null;
  /** Vídeo aberto e registro lido: só então dá para marcar ou ir. */
  enabled: boolean;
  videoOpen: boolean;
  playersById: ReadonlyMap<string, Player>;
  onMark(setNumber: number, rallyId: string): void;
  onClear(setNumber: number): void;
  onSeek(videoMs: number): void;
}

/**
 * Pontos da partida ligados ao vídeo. A pessoa marca UM ponto por set no instante em que ele aconteceu no vídeo; os outros
 * são calculados pela diferença entre os horários em que foram REGISTRADOS (aproximado: o toque vem depois da jogada, por
 * isso "Ir para o vídeo" começa alguns segundos antes). Nada disso altera ponto, placar ou estatística.
 */
export function ReviewPoints({ sets, review, enabled, videoOpen, playersById, onMark, onClear, onSeek }: Props) {
  return (
    <section aria-label="Pontos da partida">
      <Card title="Pontos da partida">
        {sets.every((s) => s.rallies.length === 0) ? (
          <p className={styles.muted}>Esta partida ainda não tem pontos registrados.</p>
        ) : (
          <>
            <p className={styles.muted}>
              Marque o instante de um ponto por set; os outros pontos do set são calculados pelo horário em que foram registrados e podem variar alguns segundos.
            </p>
            {!videoOpen && <p className={styles.muted}>Abra o vídeo do jogo para ligar os pontos ao vídeo.</p>}
            {sets
              .filter((s) => s.rallies.length > 0)
              .map((s) => {
                const reference = review?.syncs[s.set.number];
                const anchored = reference !== undefined && s.rallies.some((r) => r.id === reference.rallyId);
                const scores = runningScores(s.rallies);
                return (
                  <div key={s.set.number} className={styles.setBlock}>
                    <h3 className={styles.setTitle}>{`Set ${s.set.number}`}</h3>
                    {!anchored && videoOpen && <p className={styles.muted}>{reference ? 'O ponto de referência foi desfeito. ' : ''}Marque no vídeo o instante de um ponto para ligar os outros ao vídeo.</p>}
                    {reference && (
                      <Button disabled={!enabled} onClick={() => onClear(s.set.number)}>
                        {`Limpar referência do set ${s.set.number}`}
                      </Button>
                    )}
                    <ol className={styles.rallies}>
                      {s.rallies.map((rally) => {
                        const score = scores.get(rally.id) ?? '';
                        const ms = syncedVideoMs(reference, s.rallies, rally);
                        return (
                          <li key={rally.id} className={styles.rally}>
                            <div className={styles.rallyText}>
                              <span className="tabular">{score}</span>
                              <span>{rallyDescription(rally, playersById)}</span>
                              {ms !== null && <span className={styles.muted}>{`Vídeo ${formatMs(ms)}`}</span>}
                            </div>
                            <div className={styles.group}>
                              <Button disabled={!enabled} onClick={() => onMark(s.set.number, rally.id)}>
                                {`Marcar o ponto ${score} no instante atual`}
                              </Button>
                              <Button disabled={!enabled || ms === null} onClick={() => ms !== null && onSeek(ms)}>
                                {`Ir para o vídeo: ponto ${score}`}
                              </Button>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                );
              })}
          </>
        )}
      </Card>
    </section>
  );
}
