import { Can } from '@/auth/AccessContext';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PATHS } from '@/app/routes';
import { TrendChart } from '@/components/charts/TrendChart';
import { DemoTag } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { useWorkspace } from '@/data/WorkspaceProvider';
import { formatDate, formatDateTime, formatSigned, monthShort } from '@/domain/format';
import { MATCH_STATUS_LABEL, matchRecord, upcomingMatch } from '@/domain/match';
import { biggestRisers, playerStandings, teamOverallSeries, topByOverall } from '@/domain/insights';
import { average, formatPercent, formatRatioContext, ratio, UNAVAILABLE } from '@/domain/metrics';
import { shortName } from '@/domain/player';
import { POSITION_LABEL } from '@/domain/positions';
import { validEvents } from '@/domain/training';
import styles from './DashboardPage.module.css';

function Tile({
  label,
  value,
  detail,
  demo = false,
}: {
  label: string;
  value: string;
  detail: string;
  demo?: boolean;
}) {
  return (
    <div className={styles.tile}>
      <p className={styles.tileLabel}>
        {label} {demo && <DemoTag />}
      </p>
      <p className={`${styles.tileValue} tabular`}>{value}</p>
      <p className={styles.tileDetail}>{detail}</p>
    </div>
  );
}

export function DashboardPage() {
  const { data } = useWorkspace();
  const { players, evaluations, settings, activity: demoActivity, trainings, exercises, trainingEvents, matches } = data;
  // Com partidas reais, o dashboard usa SÓ elas; o resumo de demonstração só aparece enquanto não houver nenhuma.
  const realMatches = matches.length > 0;
  const activity = realMatches ? null : demoActivity;

  const standings = useMemo(
    () => playerStandings(players, evaluations, settings.weights),
    [players, evaluations, settings.weights],
  );
  const series = useMemo(
    () => teamOverallSeries(players, evaluations, settings.weights),
    [players, evaluations, settings.weights],
  );
  const meanOverall = average(standings.map((s) => s.overall));
  const top = topByOverall(standings, 3);
  const risers = biggestRisers(standings, 3);

  if (players.length === 0 && !activity && trainings.length === 0 && !realMatches) {
    return (
      <>
        <PageHeader title="Alpha7 Performance" subtitle="Dashboard principal" />
        <EmptyState
          icon="dashboard"
          title="Ainda não há dados da equipe"
          action={
            <Can to="players:write"><ButtonLink to={PATHS.newPlayer} variant="primary" icon="plus">
              Adicionar jogador
            </ButtonLink></Can>
          }
        >
          O dashboard mostra o elenco, a evolução das avaliações e, no futuro, treinos e partidas. Comece cadastrando os
          atletas, ou restaure os dados de demonstração em Configurações.
        </EmptyState>
      </>
    );
  }

  const byStatus = (status: string) => players.filter((p) => p.status === status).length;
  const record = realMatches ? matchRecord(matches) : activity ? activity.matches : null;
  const win = record ? ratio(record.wins, record.played) : null;
  const next = upcomingMatch(matches);
  const concluded = trainings.filter((t) => t.status === 'concluido');
  const ongoing = trainings.length - concluded.length;
  const allTrainingsDemo = trainings.length > 0 && trainings.every((t) => t.demo);
  const lastTraining = [...trainings].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  const lastTrainingEvents = lastTraining ? validEvents(trainingEvents.filter((e) => e.trainingId === lastTraining.id)) : [];
  const lastTrainingExercises = lastTraining ? exercises.filter((e) => e.trainingId === lastTraining.id).length : 0;
  const activeCount = players.filter((p) => p.status === 'ativo').length;
  const participation = lastTraining ? ratio(Math.min(lastTraining.participantIds.length, activeCount), activeCount) : null;

  return (
    <>
      <PageHeader title="Alpha7 Performance" subtitle="Dashboard principal" />

      <section className={styles.tiles} aria-label="Indicadores">
        <Tile
          label="Atletas cadastrados"
          value={String(players.length)}
          detail={`${byStatus('ativo')} ativos · ${byStatus('lesionado')} lesionados · ${byStatus('transicao')} em transição`}
        />
        <Tile
          label="Overall médio do elenco"
          value={meanOverall === null ? UNAVAILABLE : String(Math.round(meanOverall))}
          detail={
            standings.length === 0
              ? 'Nenhum atleta avaliado ainda'
              : `Média de ${standings.length} de ${players.length} atletas avaliados`
          }
        />
        <Tile
          label="Treinos concluídos"
          value={String(concluded.length)}
          detail={
            trainings.length === 0
              ? 'Nenhum treino cadastrado ainda'
              : `${trainingEvents.length === 0 ? 'Sem registros' : `${validEvents(trainingEvents).length} registros válidos`}${ongoing > 0 ? ` · ${ongoing} em andamento` : ''}`
          }
          demo={allTrainingsDemo}
        />
        <Tile
          label="Partidas disputadas"
          value={record ? String(record.played) : UNAVAILABLE}
          detail={
            win && win.value !== null
              ? `Aproveitamento ${formatPercent(win)}: ${formatRatioContext(win)} vitórias`
              : realMatches
                ? `${matches.length} cadastrada${matches.length === 1 ? '' : 's'}, nenhuma concluída ainda`
                : 'Sem partidas registradas'
          }
          demo={activity !== null}
        />
      </section>

      <div className={styles.row}>
        <Card title="Próxima partida" titleAside={!next && activity?.nextMatch ? <DemoTag /> : undefined}>
          {next ? (
            <>
              <p className={styles.versus}>Alpha7 vs. {next.opponent}</p>
              <p className={styles.muted}>
                {[next.scheduledAt ? formatDateTime(next.scheduledAt) : 'Sem data definida', next.venue].filter(Boolean).join(' · ')}
              </p>
              <p className={styles.muted}>{[MATCH_STATUS_LABEL[next.status], next.competition].filter(Boolean).join(' · ')}</p>
              <ButtonLink to={PATHS.match(next.id)}>Ver partida</ButtonLink>
            </>
          ) : activity?.nextMatch ? (
            <>
              <p className={styles.versus}>Alpha7 vs. {activity.nextMatch.opponent}</p>
              <p className={styles.muted}>
                {formatDateTime(activity.nextMatch.scheduledAt)} · {activity.nextMatch.venue}
              </p>
              <p className={styles.muted}>{activity.nextMatch.competition}</p>
              <ButtonLink to={PATHS.lineups}>Ver escalações</ButtonLink>
            </>
          ) : (
            <p className={styles.muted}>Nenhuma partida agendada.</p>
          )}
        </Card>

        <Card title="Resumo do último treino" titleAside={lastTraining?.demo ? <DemoTag /> : undefined}>
          {lastTraining ? (
            <>
              <dl className={styles.facts}>
                <div>
                  <dt>Treino</dt>
                  <dd>{lastTraining.name}</dd>
                </div>
                <div>
                  <dt>Data</dt>
                  <dd>{formatDate(lastTraining.date)}</dd>
                </div>
                <div>
                  <dt>Participantes</dt>
                  <dd>
                    {lastTraining.participantIds.length}{' '}
                    {participation && participation.attempts > 0 && (
                      <span className={styles.muted}>({formatRatioContext(participation)} ativos)</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Exercícios e registros</dt>
                  <dd>
                    {lastTrainingExercises} · {lastTrainingEvents.length}
                  </dd>
                </div>
              </dl>
              <ButtonLink to={PATHS.training(lastTraining.id)}>Ver resumo do treino</ButtonLink>
            </>
          ) : (
            <>
              <p className={styles.muted}>Nenhum treino cadastrado ainda.</p>
              <Can to="trainings:write"><ButtonLink to={PATHS.newTraining} icon="plus">
                Criar treino
              </ButtonLink></Can>
            </>
          )}
        </Card>

        <Card title="Evolução da equipe">
          {series.length >= 2 ? (
            <>
              <TrendChart
                data={series.map((p) => ({ label: monthShort(p.month), value: p.value, detail: `${p.sampleSize} atletas` }))}
                ariaLabel="Overall médio do elenco por mês"
                valueLabel="Overall médio"
                height={170}
              />
              <p className={styles.caption}>Overall médio dos atletas avaliados, mês a mês.</p>
            </>
          ) : (
            <p className={styles.muted}>
              A evolução aparece quando houver avaliações em pelo menos dois meses diferentes.
            </p>
          )}
        </Card>
      </div>

      <div className={styles.row2}>
        <Card title="Destaques individuais">
          {standings.length === 0 ? (
            <p className={styles.muted}>Os destaques aparecem depois da primeira avaliação técnica.</p>
          ) : (
            <div className={styles.highlights}>
              <div>
                <h3 className={styles.subtitle}>Maiores Overalls</h3>
                <ol className={styles.rank}>
                  {top.map((s) => (
                    <li key={s.player.id}>
                      <Link to={PATHS.player(s.player.id)}>{shortName(s.player.name)}</Link>
                      <span className={styles.muted}>{POSITION_LABEL[s.player.primaryPosition]}</span>
                      <strong className={`${styles.score} tabular`}>{s.overall}</strong>
                    </li>
                  ))}
                </ol>
              </div>
              <div>
                <h3 className={styles.subtitle}>Maior evolução desde a avaliação anterior</h3>
                {risers.length === 0 ? (
                  <p className={styles.muted}>Nenhuma melhora registrada entre as duas últimas avaliações.</p>
                ) : (
                  <ol className={styles.rank}>
                    {risers.map((s) => (
                      <li key={s.player.id}>
                        <Link to={PATHS.player(s.player.id)}>{shortName(s.player.name)}</Link>
                        <span className={styles.muted}>Overall {s.overall}</span>
                        <strong className={`${styles.gain} tabular`}>{formatSigned(s.delta ?? 0)}</strong>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          )}
          <p className={styles.caption}>Baseados nas notas do treinador, não em estatísticas de jogo.</p>
        </Card>

        <Card title="Atalhos rápidos">
          <div className={styles.shortcuts}>
            <Can to="players:write"><ButtonLink to={PATHS.newPlayer} icon="plus">
              Adicionar jogador
            </ButtonLink></Can>
            <Can to="lineups:write"><ButtonLink to={PATHS.newLineup} icon="lineup">
              Montar escalação
            </ButtonLink></Can>
            <ButtonLink to={PATHS.roster} icon="users">
              Ver elenco
            </ButtonLink>
          </div>
        </Card>
      </div>
    </>
  );
}
