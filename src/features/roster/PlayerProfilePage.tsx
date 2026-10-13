import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { PATHS } from '@/app/routes';
import { AttributeBar } from '@/components/brand/AttributeBar';
import { Jersey } from '@/components/brand/Jersey';
import { OverallShield } from '@/components/brand/OverallShield';
import { TrendChart } from '@/components/charts/TrendChart';
import { ButtonLink } from '@/components/ui/Button';
import { DemoTag, StatusBadge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { useWorkspace } from '@/data/WorkspaceProvider';
import { buildPlayerCard } from '@/data/selectors';
import {
  ATTRIBUTE_GROUP_LABEL,
  ATTRIBUTE_META,
  attributeKeysByGroup,
  type AttributeGroup,
} from '@/domain/attributes';
import { formatDate, formatDayMonth, formatSigned } from '@/domain/format';
import { overallHistory, readAttributes } from '@/domain/insights';
import { explainOverall } from '@/domain/overall';
import { UNAVAILABLE } from '@/domain/metrics';
import { evaluationsFor } from '@/domain/player';
import { POSITION_LABEL } from '@/domain/positions';
import styles from './PlayerProfilePage.module.css';

const GROUPS: AttributeGroup[] = ['tecnico', 'fisico-mental'];

/** Estatísticas que dependem do registro de treinos e partidas (ainda não implementado). */
const OBSERVED_METRICS = [
  'Partidas disputadas',
  'Pontos por jogo',
  'Aproveitamento de ataque',
  'Erros de saque por jogo',
  'Presença nos treinos',
];

export function PlayerProfilePage() {
  const { playerId } = useParams();
  const { data } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const flash = (location.state as { flash?: string } | null)?.flash;

  // Mostra a confirmação uma vez: limpa o estado do histórico para que recarregar não a repita.
  useEffect(() => {
    if (flash) navigate(location.pathname, { replace: true, state: null });
  }, [flash, location.pathname, navigate]);

  const player = data.players.find((p) => p.id === playerId);
  const weights = data.settings.weights;

  const card = useMemo(
    () => (player ? buildPlayerCard(player, data.evaluations, weights) : null),
    [player, data.evaluations, weights],
  );
  const history = useMemo(() => (player ? overallHistory(player, data.evaluations, weights) : []), [player, data.evaluations, weights]);

  if (!player || !card) {
    return (
      <>
        <PageHeader title="Perfil do atleta" back={{ to: PATHS.roster, label: 'Elenco' }} />
        <EmptyState
          icon="user"
          title="Atleta não encontrado"
          action={<ButtonLink to={PATHS.roster}>Voltar ao elenco</ButtonLink>}
        >
          Este atleta não está no elenco. Ele pode ter sido removido ou o endereço está incorreto.
        </EmptyState>
      </>
    );
  }

  const evaluations = evaluationsFor(data.evaluations, player.id);
  const latest = evaluations[evaluations.length - 1] ?? null;
  const last = history[history.length - 1];
  const previous = history[history.length - 2];
  const attributes = card.attributes;
  const reading = attributes ? readAttributes(attributes) : null;
  const explanation = attributes ? explainOverall(attributes, player.primaryPosition, weights) : null;

  return (
    <>
      <PageHeader
        title="Perfil do atleta"
        back={{ to: PATHS.roster, label: 'Elenco' }}
        actions={
          <>
            <ButtonLink to={PATHS.editPlayer(player.id)} icon="edit">
              Editar perfil
            </ButtonLink>
            <ButtonLink to={PATHS.evaluatePlayer(player.id)} variant="primary" icon="plus">
              Registrar avaliação
            </ButtonLink>
          </>
        }
      />

      {flash && <Notice tone="success">{flash}</Notice>}

      <section className={styles.hero} aria-label="Resumo do atleta">
        <div className={styles.jersey}>
          <Jersey color={player.uniform} number={player.jerseyNumber} />
        </div>
        <div className={styles.identity}>
          <h2 className={styles.name}>{player.name}</h2>
          <p className={styles.sub}>
            Nº {player.jerseyNumber} · {POSITION_LABEL[player.primaryPosition]} (principal)
            {player.secondaryPosition && <> / {POSITION_LABEL[player.secondaryPosition]} (secundária)</>}
          </p>
          <p className={styles.badges}>
            <StatusBadge status={player.status} />
            {player.demo && <DemoTag />}
          </p>
        </div>
        <OverallShield overall={card.overall} size="lg" showLabel />
      </section>

      <div className={styles.grid}>
        <Card title="Avaliação de atributos (1–99)">
          {attributes ? (
            GROUPS.map((group) => (
              <div key={group} className={styles.attrGroup}>
                <h3 className={styles.groupTitle}>{ATTRIBUTE_GROUP_LABEL[group]}</h3>
                {attributeKeysByGroup(group).map((key) => (
                  <AttributeBar key={key} attribute={key} value={attributes[key]} />
                ))}
              </div>
            ))
          ) : (
            <EmptyState
              icon="chart"
              title="Este atleta ainda não foi avaliado"
              action={
                <ButtonLink to={PATHS.evaluatePlayer(player.id)} variant="primary" icon="plus">
                  Registrar a primeira avaliação
                </ButtonLink>
              }
            >
              Sem notas, o Overall fica indisponível. Ele nunca aparece como zero.
            </EmptyState>
          )}
        </Card>

        <Card title="Evolução do Overall">
          {history.length >= 2 ? (
            <>
              <TrendChart
                data={history.map((p) => ({ label: formatDayMonth(p.evaluatedAt), value: p.overall, detail: p.evaluator }))}
                ariaLabel={`Evolução do Overall de ${player.name}`}
                valueLabel="Overall"
              />
              {last && previous && (
                <p className={styles.last}>
                  Última avaliação: <strong>{last.overall}</strong> ({formatSigned(last.overall - previous.overall)})
                </p>
              )}
            </>
          ) : (
            <p className={styles.muted}>
              {history.length === 1
                ? 'Só existe uma avaliação. A evolução aparece a partir da segunda.'
                : 'O gráfico aparece quando houver pelo menos duas avaliações.'}
            </p>
          )}
        </Card>

        <Card title="Métricas reais de partidas e treinos">
          <p className={styles.muted}>
            Estatísticas observadas dependem do registro de treinos e partidas, que ainda não existe. Ficam
            indisponíveis em vez de aparecer como zero.
          </p>
          <dl className={styles.metrics}>
            {OBSERVED_METRICS.map((label) => (
              <div key={label} className={styles.metric}>
                <dt>{label}</dt>
                <dd>
                  <span aria-label="indisponível">{UNAVAILABLE}</span>
                </dd>
              </div>
            ))}
          </dl>
        </Card>

        {reading && (
          <Card title="Análise técnica">
            <p className={styles.muted}>Lida diretamente das notas atuais, sem opinião gerada.</p>
            <div className={styles.cols}>
              <div>
                <h3 className={styles.groupTitle}>Pontos fortes</h3>
                <ul className={styles.pills}>
                  {reading.strengths.map((key) => (
                    <li key={key} className={styles.strong}>
                      {ATTRIBUTE_META[key].label}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className={styles.groupTitle}>A desenvolver</h3>
                <ul className={styles.pills}>
                  {reading.needsWork.map((key) => (
                    <li key={key} className={styles.work}>
                      {ATTRIBUTE_META[key].label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        )}

        {explanation && (
          <Card title="Como o Overall foi calculado">
            <p className={styles.muted}>
              Média ponderada das notas com os pesos de {POSITION_LABEL[player.primaryPosition].toLowerCase()}. Os pesos
              são uma escolha de modelagem do Alpha7 e podem ser ajustados em Configurações.
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Atributo</th>
                    <th scope="col">Nota</th>
                    <th scope="col">Peso</th>
                    <th scope="col">Pontos</th>
                  </tr>
                </thead>
                <tbody>
                  {explanation.contributions
                    .filter((c) => c.weightPercent > 0)
                    .map((c) => (
                      <tr key={c.key}>
                        <th scope="row">{ATTRIBUTE_META[c.key].label}</th>
                        <td className="tabular">{c.value}</td>
                        <td className="tabular">{c.weightPercent.toFixed(0)}%</td>
                        <td className="tabular">{c.points.toFixed(1)}</td>
                      </tr>
                    ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={3}>
                      Soma, arredondada
                    </th>
                    <td className="tabular">
                      {explanation.rawScore.toFixed(1)} → <strong>{explanation.overall}</strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        )}

        <Card title="Histórico de avaliações">
          {evaluations.length === 0 ? (
            <p className={styles.muted}>Nenhuma avaliação registrada.</p>
          ) : (
            <ol className={styles.history}>
              {[...history].reverse().map((point, index, list) => {
                const older = list[index + 1];
                const evaluation = evaluations.find((e) => e.id === point.evaluationId);
                return (
                  <li key={point.evaluationId}>
                    <span className={styles.histDate}>{formatDate(point.evaluatedAt)}</span>
                    <strong className={`${styles.histOverall} tabular`}>{point.overall}</strong>
                    {older && (
                      <span className={styles.delta}>{formatSigned(point.overall - older.overall)}</span>
                    )}
                    <span className={styles.histBy}>{point.evaluator}</span>
                    {evaluation?.note && <span className={styles.histNote}>{evaluation.note}</span>}
                  </li>
                );
              })}
            </ol>
          )}
        </Card>

        <Card title="Observações do treinador">
          {player.coachNotes ? (
            <p className={styles.notes}>{player.coachNotes}</p>
          ) : (
            <p className={styles.muted}>Sem observações. Use “Editar perfil” para adicionar.</p>
          )}
          {latest && <p className={styles.muted}>Última avaliação em {formatDate(latest.evaluatedAt)}.</p>}
        </Card>
      </div>
    </>
  );
}
