import { Link } from 'react-router-dom';
import { PATHS } from '@/app/routes';
import { Card } from '@/components/ui/Card';
import { FUNDAMENTALS, FUNDAMENTAL_LABEL } from '@/domain/fundamentals';
import { formatRatioContext, ratio, UNAVAILABLE } from '@/domain/metrics';
import type { Player } from '@/domain/player';
import { validEvents, type Training, type TrainingEvent } from '@/domain/training';
import { headline } from '@/domain/trainingStats';
import styles from './PlayerObservedMetrics.module.css';

/** Estatísticas que dependem do registro de partidas (ainda não implementado). */
const MATCH_METRICS = ['Partidas disputadas', 'Pontos por jogo', 'Erros de saque por jogo'];

interface Props {
  player: Player;
  trainings: readonly Training[];
  trainingEvents: readonly TrainingEvent[];
}

/**
 * Registros OBSERVADOS do atleta (estatística), separados das notas técnicas (avaliação).
 * Vêm só de eventos de treino válidos; cada indicador mostra o denominador, e amostras
 * pequenas são sinalizadas. Sem tentativas: "—", nunca zero.
 */
export function PlayerObservedMetrics({ player, trainings, trainingEvents }: Props) {
  const own = validEvents(trainingEvents.filter((e) => e.playerId === player.id));
  const trainingsWithRecords = new Set(own.map((e) => e.trainingId)).size;
  const concluded = trainings.filter((t) => t.status === 'concluido');
  const participated = concluded.filter((t) => t.participantIds.includes(player.id)).length;
  const participation = ratio(participated, concluded.length);

  return (
    <Card title="Métricas observadas">
      <section aria-labelledby="obs-treinos" className={styles.block}>
        <h3 id="obs-treinos" className={styles.heading}>
          Treinos
        </h3>
        {own.length === 0 ? (
          <p className={styles.muted}>
            Nenhum registro de treino deste atleta ainda. Os indicadores aparecem quando houver tentativas registradas,
            e nunca como zero.
          </p>
        ) : (
          <p className={styles.muted}>
            {own.length} {own.length === 1 ? 'tentativa' : 'tentativas'} em {trainingsWithRecords}{' '}
            {trainingsWithRecords === 1 ? 'treino' : 'treinos'}.
          </p>
        )}
        <dl className={styles.list}>
          {FUNDAMENTALS.map((f) => {
            const h = headline(f, own);
            return (
              <div key={f} className={styles.row}>
                <dt>
                  {FUNDAMENTAL_LABEL[f]}
                  <small>{h.label}</small>
                </dt>
                <dd>
                  <strong className="tabular">{h.display}</strong>
                  <small>
                    {h.context}
                    {h.sample === 'small' && <span className={styles.flag}> · amostra insuficiente</span>}
                  </small>
                </dd>
              </div>
            );
          })}
          <div className={styles.row}>
            <dt>Treinos com participação</dt>
            <dd>
              <strong className="tabular">{participation.value === null ? UNAVAILABLE : `${participated} de ${concluded.length}`}</strong>
              <small>{participation.value === null ? 'nenhum treino concluído ainda' : `${formatRatioContext(participation)} concluídos`}</small>
            </dd>
          </div>
        </dl>
        {own.length > 0 && (
          <p className={styles.muted}>
            Detalhe por sessão no <Link to={PATHS.trainings}>resumo de cada treino</Link>.
          </p>
        )}
      </section>

      <section aria-labelledby="obs-partidas" className={styles.block}>
        <h3 id="obs-partidas" className={styles.heading}>
          Partidas
        </h3>
        <p className={styles.muted}>O registro de partidas ainda não existe. Estes indicadores ficam indisponíveis, não zerados.</p>
        <dl className={styles.list}>
          {MATCH_METRICS.map((label) => (
            <div key={label} className={styles.row}>
              <dt>{label}</dt>
              <dd>
                <span aria-label="indisponível">{UNAVAILABLE}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </Card>
  );
}
