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
import type { TrainingIntensity } from '@/data/types';
import { formatDate, formatDateTime, formatSigned, monthShort } from '@/domain/format';
import { biggestRisers, playerStandings, teamOverallSeries, topByOverall } from '@/domain/insights';
import { average, formatPercent, formatRatioContext, ratio, UNAVAILABLE } from '@/domain/metrics';
import { shortName } from '@/domain/player';
import { POSITION_LABEL } from '@/domain/positions';
import styles from './DashboardPage.module.css';

const INTENSITY: Record<TrainingIntensity, { label: string; level: number }> = {
  baixa: { label: 'Baixa', level: 1 },
  media: { label: 'Média', level: 2 },
  alta: { label: 'Alta', level: 3 },
};

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
  const { players, evaluations, settings, activity } = data;

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

  if (players.length === 0 && !activity) {
    return (
      <>
        <PageHeader title="Alpha7 Performance" subtitle="Dashboard principal" />
        <EmptyState
          icon="dashboard"
          title="Ainda não há dados da equipe"
          action={
            <ButtonLink to={PATHS.newPlayer} variant="primary" icon="plus">
              Adicionar jogador
            </ButtonLink>
          }
        >
          O dashboard mostra o elenco, a evolução das avaliações e, no futuro, treinos e partidas. Comece cadastrando os
          atletas, ou restaure os dados de demonstração em Configurações.
        </EmptyState>
      </>
    );
  }

  const byStatus = (status: string) => players.filter((p) => p.status === status).length;
  const win = activity ? ratio(activity.matches.wins, activity.matches.played) : null;
  const lastTraining = activity?.lastTraining ?? null;
  const attendance = lastTraining ? ratio(lastTraining.attendance.present, lastTraining.attendance.total) : null;

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
          label="Treinos realizados"
          value={activity ? String(activity.trainingsCount) : UNAVAILABLE}
          detail={activity ? 'Registro de treinos em desenvolvimento' : 'Sem registros'}
          demo={activity !== null}
        />
        <Tile
          label="Partidas disputadas"
          value={activity ? String(activity.matches.played) : UNAVAILABLE}
          detail={
            win && win.value !== null
              ? `Aproveitamento ${formatPercent(win)}: ${formatRatioContext(win)} vitórias`
              : 'Sem partidas registradas'
          }
          demo={activity !== null}
        />
      </section>

      <div className={styles.row}>
        <Card title="Próxima partida" titleAside={activity?.nextMatch ? <DemoTag /> : undefined}>
          {activity?.nextMatch ? (
            <>
              <p className={styles.versus}>Alpha7 vs. {activity.nextMatch.opponent}</p>
              <p className={styles.muted}>
                {formatDateTime(activity.nextMatch.scheduledAt)} · {activity.nextMatch.venue}
              </p>
              <p className={styles.muted}>{activity.nextMatch.competition}</p>
              <ButtonLink to={PATHS.lineups}>Ver escalações</ButtonLink>
            </>
          ) : (
            <p className={styles.muted}>Nenhuma partida agendada. O agendamento chega com o módulo de partidas.</p>
          )}
        </Card>

        <Card title="Resumo do último treino" titleAside={lastTraining ? <DemoTag /> : undefined}>
          {lastTraining && attendance ? (
            <dl className={styles.facts}>
              <div>
                <dt>Data</dt>
                <dd>{formatDate(lastTraining.date)}</dd>
              </div>
              <div>
                <dt>Foco</dt>
                <dd>{lastTraining.focus}</dd>
              </div>
              <div>
                <dt>Presença</dt>
                <dd>
                  {formatPercent(attendance, 0)} <span className={styles.muted}>({formatRatioContext(attendance)})</span>
                </dd>
              </div>
              <div>
                <dt>Intensidade</dt>
                <dd>
                  <span className={styles.meter} aria-hidden="true">
                    {[1, 2, 3].map((n) => (
                      <i key={n} className={n <= INTENSITY[lastTraining.intensity].level ? styles.on : ''} />
                    ))}
                  </span>{' '}
                  {INTENSITY[lastTraining.intensity].label}
                </dd>
              </div>
            </dl>
          ) : (
            <p className={styles.muted}>Nenhum treino registrado ainda.</p>
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
            <ButtonLink to={PATHS.newPlayer} icon="plus">
              Adicionar jogador
            </ButtonLink>
            <ButtonLink to={PATHS.newLineup} icon="lineup">
              Montar escalação
            </ButtonLink>
            <ButtonLink to={PATHS.roster} icon="users">
              Ver elenco
            </ButtonLink>
          </div>
        </Card>
      </div>
    </>
  );
}
