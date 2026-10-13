import { useMemo, useState } from 'react';
import { PATHS } from '@/app/routes';
import { SeriesChart, type ChartRow } from '@/components/charts/SeriesChart';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField, TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import type { IconName } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatTile } from '@/components/ui/StatTile';
import { useWorkspace } from '@/data/WorkspaceProvider';
import { FUNDAMENTALS, FUNDAMENTAL_LABEL, isFundamental, type Fundamental } from '@/domain/fundamentals';
import { formatDate } from '@/domain/format';
import { SIDE_LABEL, reasonLabel, reasonTotals, resultText } from '@/domain/match';
import { formatPercent } from '@/domain/metrics';
import { POSITION_LABEL, POSITIONS, isPosition, type Position } from '@/domain/positions';
import { shortName } from '@/domain/player';
import {
  EMPTY_FILTER,
  byRotation,
  chartIndicator,
  contextComparison,
  hasFilter,
  indicatorEvolution,
  matchEvolution,
  observationsFor,
  periodComparison,
  playerMatches,
  positionComparison,
  previousPeriod,
  rallyIndicators,
  rotationLabel,
  sampleOf,
  scope,
  type PeriodRow,
  type StatsData,
  type StatsFilter,
} from '@/domain/stats';
import { MIN_SAMPLE, formatScore, receptionStats, type PlayerStatEvent, type StatEvent } from '@/domain/trainingStats';
import { DistributionBars } from '@/features/trainings/DistributionBars';
import { viewFundamental } from '@/features/trainings/fundamentalView';
import { SampleBadge, chartPct, dayMonth, pctWithContext, ratioDetail } from './statsView';
import styles from './StatsPage.module.css';

const COLORS = { training: '#b9a6d0', match: '#46c783', good: '#46c783', ok: '#8a94ee', warn: '#f3b94d', bad: '#f57b7b', lilac: '#d3c4f5' } as const;

export function StatsPage() {
  const { data } = useWorkspace();
  const [filter, setFilter] = useState<StatsFilter>(EMPTY_FILTER);
  const [compare, setCompare] = useState(false);
  const [evoFundamental, setEvoFundamental] = useState<Fundamental>('recepcao');
  const [positionChoice, setPositionChoice] = useState<Position | ''>('');

  const statsData: StatsData = useMemo(
    () => ({
      players: data.players,
      trainings: data.trainings,
      trainingEvents: data.trainingEvents,
      matches: data.matches,
      matchSets: data.matchSets,
      rallies: data.rallies,
      rallyActions: data.rallyActions,
    }),
    [data],
  );
  const scoped = useMemo(() => scope(statsData, filter), [statsData, filter]);
  // A "equipe" no mesmo recorte, sem o filtro de atleta: base para comparar o atleta com a média.
  const team = useMemo(() => scope(statsData, { ...filter, playerId: '' }), [statsData, filter]);
  const previous = previousPeriod(filter.from, filter.to);
  const previousScoped = useMemo(() => (previous ? scope(statsData, { ...filter, from: previous.from, to: previous.to }) : null), [statsData, filter, previous]);

  const playersById = useMemo(() => new Map(data.players.map((p) => [p.id, p])), [data.players]);
  const player = filter.playerId ? playersById.get(filter.playerId) : undefined;
  const fundamentals = filter.fundamental ? [filter.fundamental] : [...FUNDAMENTALS];
  const set = (patch: Partial<StatsFilter>) => setFilter((prev) => ({ ...prev, ...patch }));

  const hasAnyRecord = data.trainingEvents.length + data.rallies.length + data.rallyActions.length > 0;
  const hasScopedRecord = scoped.trainingEvents.length + scoped.rallies.length + scoped.actions.length > 0;

  const sortedPlayers = [...data.players].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const trainingOptions = [...data.trainings].sort((a, b) => b.date.localeCompare(a.date));
  const matchOptions = [...data.matches].sort((a, b) => (b.scheduledAt || b.createdAt).localeCompare(a.scheduledAt || a.createdAt));

  const header = <PageHeader title="Estatísticas" subtitle="Treinos e partidas lado a lado. Cada número mostra de quantas tentativas ele vem." />;

  if (!hasAnyRecord) {
    return (
      <>
        {header}
        <EmptyState
          icon="chart"
          title="Ainda não há registros para analisar"
          action={
            <div className={styles.actions}>
              <ButtonLink to={PATHS.trainings} variant="primary">
                Abrir os treinos
              </ButtonLink>
              <ButtonLink to={PATHS.matches}>Abrir as partidas</ButtonLink>
            </div>
          }
        >
          As estatísticas nascem do que a equipe registra: tentativas por fundamento nos treinos, e pontos e ações técnicas nas partidas. Sem registros, não há
          nada a calcular: nenhum indicador aparece como 0%.
        </EmptyState>
      </>
    );
  }

  const position: Position | '' = positionChoice || (player ? player.primaryPosition : 'ponteiro');
  const evoF = filter.fundamental || evoFundamental;

  return (
    <>
      {header}

      <Card title="Filtros">
        <div className={styles.filters}>
          <TextField label="De (início do período)" type="date" value={filter.from} onChange={(event) => set({ from: event.target.value })} />
          <TextField label="Até (fim do período)" type="date" value={filter.to} onChange={(event) => set({ to: event.target.value })} />
          <SelectField label="Atleta" value={filter.playerId} onChange={(event) => set({ playerId: event.target.value })} hint="Escolha um atleta para a visão individual.">
            <option value="">Todos (visão da equipe)</option>
            {sortedPlayers.map((p) => (
              <option key={p.id} value={p.id}>
                {shortName(p.name)} #{p.jerseyNumber}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Fundamento"
            value={filter.fundamental}
            onChange={(event) => set({ fundamental: isFundamental(event.target.value) ? event.target.value : '' })}
          >
            <option value="">Todos</option>
            {FUNDAMENTALS.map((f) => (
              <option key={f} value={f}>
                {FUNDAMENTAL_LABEL[f]}
              </option>
            ))}
          </SelectField>
          <SelectField label="Treino" value={filter.trainingId} onChange={(event) => set({ trainingId: event.target.value })}>
            <option value="">Todos os treinos do período</option>
            {trainingOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {formatDate(t.date)}
              </option>
            ))}
          </SelectField>
          <SelectField label="Partida" value={filter.matchId} onChange={(event) => set({ matchId: event.target.value })}>
            <option value="">Todas as partidas do período</option>
            {matchOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.opponent}
                {m.scheduledAt ? ` · ${formatDate(m.scheduledAt.slice(0, 10))}` : ''}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Rotação (só partidas)"
            value={filter.rotation === null ? '' : String(filter.rotation)}
            hint="Rotação do Alpha7 quando o ponto começou, contada desde a formação inicial de cada set."
            onChange={(event) => set({ rotation: event.target.value === '' ? null : Number(event.target.value) })}
          >
            <option value="">Todas</option>
            {[0, 1, 2, 3, 4, 5].map((r) => (
              <option key={r} value={r}>
                {rotationLabel(r)}
              </option>
            ))}
          </SelectField>
          <label className={styles.check}>
            <input type="checkbox" checked={compare && previous !== null} disabled={previous === null} onChange={(event) => setCompare(event.target.checked)} />
            <span>
              Comparar com o período anterior
              <small>{previous ? `${formatDate(previous.from)} a ${formatDate(previous.to)}` : 'Informe o início e o fim do período para comparar.'}</small>
            </span>
          </label>
        </div>
        <p className={styles.muted}>
          Equipe: este workspace tem uma equipe só (a que você abriu), então o filtro por equipe é ela mesma. O filtro de rotação vale para os pontos e as ações de partida.
        </p>
        <div className={styles.summaryRow}>
          <p className={styles.summary} aria-live="polite">
            Considerando {scoped.trainings.length} {scoped.trainings.length === 1 ? 'treino' : 'treinos'} ({scoped.trainingEvents.length} registros) e{' '}
            {scoped.matches.length} {scoped.matches.length === 1 ? 'partida' : 'partidas'} ({scoped.rallies.length} pontos, {scoped.actions.length} ações técnicas).
          </p>
          {hasFilter(filter) && (
            <Button
              variant="ghost"
              onClick={() => {
                setFilter(EMPTY_FILTER);
                setCompare(false);
              }}
            >
              Limpar filtros
            </Button>
          )}
        </div>
      </Card>

      {!hasScopedRecord ? (
        <EmptyState
          icon="search"
          title="Nenhum registro com esses filtros"
          action={
            <Button variant="primary" onClick={() => setFilter(EMPTY_FILTER)}>
              Limpar filtros
            </Button>
          }
        >
          Ajuste o período, o atleta ou a partida para ver os indicadores. Quando não há tentativas, a métrica aparece como “Sem dados”, nunca como 0%.
        </EmptyState>
      ) : (
        <>
          {player && (
            <IndividualPanel
              playerName={`${shortName(player.name)} #${player.jerseyNumber} · ${POSITION_LABEL[player.primaryPosition]}`}
              trainingEvents={scoped.trainingEvents}
              actions={scoped.actions}
              teamTrainingEvents={team.trainingEvents}
              teamActions={team.actions}
              rows={playerMatches(statsData, scoped, player.id)}
              fundamentals={fundamentals}
            />
          )}

          <RallySection scoped={scoped} />

          <section aria-labelledby="fundamentos-titulo" className={`${styles.section} enter`}>
            <h2 id="fundamentos-titulo" className={styles.h2}>
              Fundamentos observados: treinos e partidas
            </h2>
            <p className={styles.muted}>
              Treinos e partidas ficam sempre separados: são situações diferentes e nunca viram um número só. Nas partidas, a ação técnica é um fundamento que
              alguém observou e registrou; o que não foi registrado não é zero.
            </p>
            <div className={styles.cards}>
              {fundamentals.map((f) => (
                <Card key={f} title={FUNDAMENTAL_LABEL[f]}>
                  <div className={styles.twoCols}>
                    <FundamentalColumn title="Treinos" fundamental={f} events={scoped.trainingEvents} />
                    <FundamentalColumn title="Partidas" fundamental={f} events={scoped.actions} />
                  </div>
                </Card>
              ))}
            </div>
          </section>

          <ChartsSection
            scoped={scoped}
            fundamentals={fundamentals}
            evoFundamental={evoF}
            onEvoFundamental={setEvoFundamental}
            evoLocked={filter.fundamental !== ''}
            position={position}
            onPosition={setPositionChoice}
            baselineTraining={team.trainingEvents}
            baselineActions={team.actions}
            players={data.players}
          />

          {compare && previousScoped && previous && (
            <PeriodSection scoped={scoped} previousScoped={previousScoped} fundamentals={fundamentals} previousLabel={`${formatDate(previous.from)} a ${formatDate(previous.to)}`} />
          )}
        </>
      )}

      <p className={styles.muted}>
        Estatísticas são registros observados: não mudam as avaliações (notas de 1 a 99) nem o Overall. Amostras com menos de {MIN_SAMPLE} tentativas são sinalizadas e
        não entram em comparações. Fórmulas e critérios: documento METRICS do projeto.
      </p>
    </>
  );
}

/* ─────────────── pontos (equipe) ─────────────── */

function RallySection({ scoped }: { scoped: ReturnType<typeof scope> }) {
  const indicators = rallyIndicators(scoped.rallies);
  const rotations = byRotation(scoped.rallies);
  const evolution = matchEvolution(scoped.matches, scoped.rallies);
  const totals = reasonTotals(scoped.rallies);

  if (scoped.matches.length === 0 || scoped.rallies.length === 0) {
    return (
      <Card title="Partidas: como os pontos saem">
        <p className={styles.muted}>
          {scoped.matches.length === 0 ? 'Nenhuma partida neste recorte.' : 'Nenhum ponto registrado nas partidas deste recorte.'} Side-out e ponto de saque dependem dos pontos registrados nas partidas.
        </p>
      </Card>
    );
  }

  const rotationRows: ChartRow[] = rotations.map((r) => ({ label: r.label, sideOut: chartPct(r.sideOut), sideOutDetail: ratioDetail(r.sideOut), breakPoint: chartPct(r.breakPoint), breakPointDetail: ratioDetail(r.breakPoint) }));
  const evolutionRows: ChartRow[] = evolution.map((p) => ({ label: `${dayMonth(p.date)} ${p.label}`, sideOut: chartPct(p.sideOut), sideOutDetail: ratioDetail(p.sideOut), breakPoint: chartPct(p.breakPoint), breakPointDetail: ratioDetail(p.breakPoint), points: chartPct(p.points), pointsDetail: ratioDetail(p.points) }));

  return (
    <section aria-labelledby="pontos-titulo" className={`${styles.section} enter`}>
      <h2 id="pontos-titulo" className={styles.h2}>
        Partidas: como os pontos saem
      </h2>
      <div className={styles.tiles}>
        <Tile icon="ball" label="Pontos do Alpha7" ratio={indicators.points} formula="pontos do Alpha7 ÷ pontos jogados" />
        <Tile icon="swap" label="Side-out" ratio={indicators.sideOut} formula="pontos ganhos com o adversário sacando ÷ pontos jogados com o adversário sacando" />
        <Tile icon="rotate" label="Ponto de saque (break point)" ratio={indicators.breakPoint} formula="pontos ganhos com o Alpha7 sacando ÷ pontos jogados com o Alpha7 sacando" />
      </div>

      <div className={styles.twoCols}>
        {(['us', 'them'] as const).map((side) => {
          const own = totals.filter((t) => t.winner === side).sort((a, b) => b.count - a.count);
          const sum = own.reduce((acc, t) => acc + t.count, 0);
          return (
            <Card key={side} title={`Motivo dos pontos do ${SIDE_LABEL[side]} (${sum})`}>
              <ul className={styles.list}>
                {own.map((t) => (
                  <li key={t.reason ?? 'none'}>
                    <span>{t.reason ? reasonLabel(t.reason, side) : 'Motivo não informado'}</span>
                    <strong className="tabular">
                      {t.count} de {sum}
                    </strong>
                  </li>
                ))}
                {own.length === 0 && <li className={styles.muted}>Nenhum ponto.</li>}
              </ul>
            </Card>
          );
        })}
      </div>
      <p className={styles.muted}>
        O motivo do ponto e a ação técnica são medidas diferentes do mesmo jogo e nunca são somadas: o motivo conta pontos; a ação conta tentativas observadas.
      </p>

      <Card title="Side-out e ponto de saque por rotação">
        <SeriesChart
          kind="bars"
          rows={rotationRows}
          series={[
            { key: 'sideOut', label: 'Side-out', color: COLORS.good },
            { key: 'breakPoint', label: 'Ponto de saque', color: COLORS.lilac },
          ]}
          domain={[0, 100]}
          unit="%"
          ariaLabel="Side-out e ponto de saque do Alpha7 em cada rotação, em percentual"
          alternative={{
            columns: ['Side-out', 'Ponto de saque', 'Pontos jogados'],
            rows: rotations.map((r) => ({ label: r.label, cells: [pctWithContext(r.sideOut), pctWithContext(r.breakPoint), String(r.rallies)] })),
          }}
        />
        <RotationNotes rows={rotations} />
      </Card>

      {evolution.length > 0 && (
        <Card title="Evolução por partida">
          <SeriesChart
            kind="line"
            rows={evolutionRows}
            series={[
              { key: 'sideOut', label: 'Side-out', color: COLORS.good },
              { key: 'breakPoint', label: 'Ponto de saque', color: COLORS.lilac },
              { key: 'points', label: 'Pontos do Alpha7', color: COLORS.warn },
            ]}
            domain={[0, 100]}
            unit="%"
            ariaLabel="Evolução, partida a partida, do side-out, do ponto de saque e dos pontos do Alpha7"
            alternative={{
              columns: ['Side-out', 'Ponto de saque', 'Pontos do Alpha7'],
              rows: evolution.map((p) => ({ label: `${dayMonth(p.date)} ${p.label}`, cells: [pctWithContext(p.sideOut), pctWithContext(p.breakPoint), pctWithContext(p.points)] })),
            }}
          />
          {evolution.length === 1 && <p className={styles.muted}>Só uma partida no recorte: ainda não há evolução para mostrar.</p>}
        </Card>
      )}
    </section>
  );
}

function RotationNotes({ rows }: { rows: ReturnType<typeof byRotation> }) {
  const small = rows.filter((r) => r.rallies > 0 && (sampleOf(r.sideOut) !== 'adequate' || sampleOf(r.breakPoint) !== 'adequate'));
  return (
    <>
      {small.length > 0 && (
        <p className={styles.muted}>
          Amostra pequena (menos de {MIN_SAMPLE} pontos de saque ou de recepção): {small.map((r) => r.label).join(', ')}. Não compare rotações com poucos pontos.
        </p>
      )}
      <p className={styles.muted}>A rotação conta a partir da formação inicial de cada set; em sets com formações diferentes, a mesma rotação não é a mesma posição do levantador.</p>
    </>
  );
}

function Tile({ label, ratio, formula, icon }: { label: string; ratio: ReturnType<typeof rallyIndicators>['points']; formula: string; icon: IconName }) {
  return (
    <StatTile
      icon={icon}
      label={label}
      value={ratio.value === null ? '—' : formatPercent(ratio)}
      detail={ratio.attempts === 0 ? 'Sem dados' : `${ratio.successes} de ${ratio.attempts}`}
      footer={
        <>
          <SampleBadge attempts={ratio.attempts} />
          <p className={styles.formula}>{formula}</p>
        </>
      }
    />
  );
}

/* ─────────────── fundamentos ─────────────── */

function FundamentalColumn({ title, fundamental, events }: { title: string; fundamental: Fundamental; events: readonly StatEvent[] }) {
  const view = viewFundamental(fundamental, events);
  return (
    <div className={styles.column}>
      <header className={styles.columnHead}>
        <h3 className={styles.h3}>{title}</h3>
        <SampleBadge attempts={view.attempts} />
      </header>
      {view.attempts === 0 ? (
        <p className={styles.muted}>Sem dados de {title.toLowerCase()} neste recorte.</p>
      ) : (
        <>
          <dl className={styles.metrics}>
            {view.metrics.map((m) => (
              <div key={m.label} title={m.formula}>
                <dt>{m.label}</dt>
                <dd className="tabular">
                  <strong>{m.value}</strong> <small>{m.context}</small>
                </dd>
              </div>
            ))}
          </dl>
          <DistributionBars items={view.distribution} label={`Distribuição de ${FUNDAMENTAL_LABEL[fundamental].toLowerCase()} nos ${title.toLowerCase()}`} />
          {view.note && <p className={styles.muted}>{view.note}</p>}
        </>
      )}
    </div>
  );
}

/* ─────────────── gráficos ─────────────── */

function ChartsSection(props: {
  scoped: ReturnType<typeof scope>;
  fundamentals: readonly Fundamental[];
  evoFundamental: Fundamental;
  onEvoFundamental(f: Fundamental): void;
  evoLocked: boolean;
  position: Position | '';
  onPosition(p: Position | ''): void;
  baselineTraining: readonly PlayerStatEvent[];
  baselineActions: readonly PlayerStatEvent[];
  players: ReturnType<typeof useWorkspace>['data']['players'];
}) {
  const { scoped, fundamentals, evoFundamental } = props;

  const indicatorRows = fundamentals.map((f) => ({ f, training: chartIndicator(f, scoped.trainingEvents), match: chartIndicator(f, scoped.actions) }));
  const comparisonRows: ChartRow[] = indicatorRows.map(({ f, training, match }) => ({ label: FUNDAMENTAL_LABEL[f], training: chartPct(training.ratio), trainingDetail: `${training.label}: ${ratioDetail(training.ratio)}`, match: chartPct(match.ratio), matchDetail: `${match.label}: ${ratioDetail(match.ratio)}` }));

  const reception = {
    training: receptionStats(scoped.trainingEvents),
    match: receptionStats(scoped.actions),
  };
  const showReception = fundamentals.includes('recepcao');
  const receptionKeys = [
    ['A', 'A (perfeita)', COLORS.good],
    ['B', 'B (boa)', COLORS.ok],
    ['C', 'C (ruim)', COLORS.warn],
    ['erro', 'Erro', COLORS.bad],
  ] as const;
  const receptionRows: ChartRow[] = (['training', 'match'] as const).map((context) => ({
    label: context === 'training' ? 'Treinos' : 'Partidas',
    ...Object.fromEntries(receptionKeys.map(([key]) => [key, chartPct(reception[context].shares[key])])),
    ...Object.fromEntries(receptionKeys.map(([key]) => [`${key}Detail`, reception[context].attempts === 0 ? '' : `${reception[context].counts[key]} de ${reception[context].attempts}`])),
  }));

  const evolution = indicatorEvolution(scoped, evoFundamental);
  const evolutionRows: ChartRow[] = evolution.map((p) => ({
    label: `${dayMonth(p.date)} ${p.label}`,
    training: p.source === 'treino' ? chartPct(p.ratio) : null,
    trainingDetail: p.source === 'treino' ? ratioDetail(p.ratio) : '',
    match: p.source === 'partida' ? chartPct(p.ratio) : null,
    matchDetail: p.source === 'partida' ? ratioDetail(p.ratio) : '',
  }));

  const positionFundamental = fundamentals.length === 1 ? (fundamentals[0] ?? 'recepcao') : evoFundamental;
  const position = props.position === '' ? 'ponteiro' : props.position;
  const sameTraining = positionComparison(props.players, props.baselineTraining, position, positionFundamental);
  const sameMatch = positionComparison(props.players, props.baselineActions, position, positionFundamental);
  const playerById = new Map(props.players.map((p) => [p.id, p]));
  const comparedIds = [...new Set([...sameTraining.rows, ...sameMatch.rows].map((r) => r.playerId))];
  const eligibleIds = comparedIds.filter((id) => sameTraining.rows.some((r) => r.playerId === id && r.eligible) || sameMatch.rows.some((r) => r.playerId === id && r.eligible));
  const positionRows: ChartRow[] = eligibleIds.map((id) => {
    const forContext = (events: readonly PlayerStatEvent[], eligible: boolean) => {
      const ratio = chartIndicator(positionFundamental, events.filter((e) => e.playerId === id)).ratio;
      return eligible ? chartPct(ratio) : null;
    };
    const t = sameTraining.rows.find((r) => r.playerId === id);
    const m = sameMatch.rows.find((r) => r.playerId === id);
    const p = playerById.get(id);
    return { label: p ? shortName(p.name) : id, training: forContext(props.baselineTraining, t?.eligible ?? false), match: forContext(props.baselineActions, m?.eligible ?? false) };
  });
  const indicatorName = chartIndicator(positionFundamental, []).label;

  return (
    <section aria-labelledby="graficos-titulo" className={styles.section}>
      <h2 id="graficos-titulo" className={styles.h2}>
        Gráficos
      </h2>

      <Card title="Treino x partida, por fundamento">
        <p className={styles.muted}>Um indicador em % por fundamento. As duas barras são de origens diferentes e não se somam.</p>
        <SeriesChart
          kind="bars"
          rows={comparisonRows}
          series={[
            { key: 'training', label: 'Treinos', color: COLORS.training },
            { key: 'match', label: 'Partidas', color: COLORS.match },
          ]}
          domain={[0, 100]}
          unit="%"
          ariaLabel="Comparação por fundamento entre treinos e partidas, em percentual"
          alternative={{
            columns: ['Indicador', 'Treinos', 'Partidas'],
            rows: indicatorRows.map(({ f, training, match }) => ({ label: FUNDAMENTAL_LABEL[f], cells: [training.label, pctWithContext(training.ratio), pctWithContext(match.ratio)] })),
          }}
        />
      </Card>

      {showReception && (
        <Card title="Recepção: distribuição A, B, C e erro">
          <SeriesChart
            kind="stacked"
            rows={receptionRows}
            series={receptionKeys.map(([key, label, color]) => ({ key, label, color }))}
            domain={[0, 100]}
            unit="%"
            height={220}
            ariaLabel="Distribuição das recepções em A, B, C e erro, em treinos e em partidas, em percentual"
            alternative={{
              columns: ['A', 'B', 'C', 'Erro', 'Nota interna (0 a 3)', 'Recepções'],
              rows: (['training', 'match'] as const).map((context) => ({
                label: context === 'training' ? 'Treinos' : 'Partidas',
                cells: [
                  ...receptionKeys.map(([key]) => `${reception[context].counts[key]} de ${reception[context].attempts}`),
                  formatScore(reception[context].score),
                  String(reception[context].attempts),
                ],
              })),
            }}
          />
          <p className={styles.muted}>
            Nota interna (escolha do Alpha7: A = 3, B = 2, C = 1, erro = 0): treinos {formatScore(reception.training.score)} em {reception.training.attempts}{' '}
            {reception.training.attempts === 1 ? 'recepção' : 'recepções'}; partidas {formatScore(reception.match.score)} em {reception.match.attempts}{' '}
            {reception.match.attempts === 1 ? 'recepção' : 'recepções'}.
          </p>
        </Card>
      )}

      <Card title="Evolução no tempo">
        <SelectField
          label="Fundamento da evolução"
          value={evoFundamental}
          disabled={props.evoLocked}
          hint={props.evoLocked ? 'Definido pelo filtro de fundamento.' : undefined}
          onChange={(event) => props.onEvoFundamental(isFundamental(event.target.value) ? event.target.value : 'recepcao')}
        >
          {FUNDAMENTALS.map((f) => (
            <option key={f} value={f}>
              {FUNDAMENTAL_LABEL[f]}
            </option>
          ))}
        </SelectField>
        {evolution.length === 0 ? (
          <p className={styles.muted}>Sem dados de {FUNDAMENTAL_LABEL[evoFundamental].toLowerCase()} neste recorte.</p>
        ) : (
          <>
            <SeriesChart
              kind="line"
              rows={evolutionRows}
              series={[
                { key: 'training', label: 'Treinos', color: COLORS.training },
                { key: 'match', label: 'Partidas', color: COLORS.match },
              ]}
              domain={[0, 100]}
              unit="%"
              ariaLabel={`Evolução de ${FUNDAMENTAL_LABEL[evoFundamental].toLowerCase()} sessão a sessão: ${chartIndicator(evoFundamental, []).label}`}
              alternative={{
                columns: ['Origem', chartIndicator(evoFundamental, []).label],
                rows: evolution.map((p) => ({ label: `${dayMonth(p.date)} ${p.label}`, cells: [p.source === 'treino' ? 'Treino' : 'Partida', pctWithContext(p.ratio)] })),
              }}
            />
            <p className={styles.muted}>Indicador: {chartIndicator(evoFundamental, []).label}. Cada ponto tem o próprio número de tentativas na tabela de apoio; pontos com poucas tentativas oscilam muito.</p>
          </>
        )}
      </Card>

      <Card title="Atletas da mesma posição">
        <div className={styles.filters}>
          <SelectField label="Posição" value={position} onChange={(event) => props.onPosition(isPosition(event.target.value) ? event.target.value : '')}>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {POSITION_LABEL[p]}
              </option>
            ))}
          </SelectField>
        </div>
        <p className={styles.muted}>
          Indicador: {indicatorName} ({FUNDAMENTAL_LABEL[positionFundamental].toLowerCase()}). Só se compara atletas da mesma posição e com pelo menos {MIN_SAMPLE} tentativas;
          não há ranking entre posições diferentes.
        </p>
        {eligibleIds.length < 2 ? (
          <Notice tone="info" title="Ainda não dá para comparar">
            É preciso ao menos 2 atletas de {POSITION_LABEL[position].toLowerCase()} com {MIN_SAMPLE} ou mais tentativas de {FUNDAMENTAL_LABEL[positionFundamental].toLowerCase()} no mesmo contexto.
          </Notice>
        ) : (
          <SeriesChart
            kind="bars"
            rows={positionRows}
            series={[
              { key: 'training', label: 'Treinos', color: COLORS.training },
              { key: 'match', label: 'Partidas', color: COLORS.match },
            ]}
            domain={[0, 100]}
            unit="%"
            ariaLabel={`Comparação entre atletas de ${POSITION_LABEL[position].toLowerCase()} em ${FUNDAMENTAL_LABEL[positionFundamental].toLowerCase()}, em percentual`}
            alternative={{
              columns: ['Treinos', 'Partidas'],
              rows: eligibleIds.map((id) => {
                const p = playerById.get(id);
                const t = sameTraining.rows.find((r) => r.playerId === id);
                const m = sameMatch.rows.find((r) => r.playerId === id);
                return {
                  label: p ? shortName(p.name) : id,
                  cells: [
                    t?.eligible ? pctWithContext(chartIndicator(positionFundamental, props.baselineTraining.filter((e) => e.playerId === id)).ratio) : `Amostra insuficiente (${t?.headline.attempts ?? 0})`,
                    m?.eligible ? pctWithContext(chartIndicator(positionFundamental, props.baselineActions.filter((e) => e.playerId === id)).ratio) : `Amostra insuficiente (${m?.headline.attempts ?? 0})`,
                  ],
                };
              }),
            }}
          />
        )}
      </Card>
    </section>
  );
}

/* ─────────────── período anterior ─────────────── */

function formatDifference(fundamental: Fundamental, difference: number | null): string {
  if (difference === null) return 'Sem comparação (amostra insuficiente)';
  const sign = difference > 0 ? '+' : difference < 0 ? '−' : '';
  if (fundamental === 'recepcao') return `${sign}${Math.abs(difference).toFixed(2).replace('.', ',')} pontos na nota`;
  return `${sign}${Math.abs(difference * 100).toFixed(1).replace('.', ',')} pontos percentuais`;
}

function PeriodTable({ title, rows, previousLabel }: { title: string; rows: PeriodRow[]; previousLabel: string }) {
  return (
    <div className={styles.tableWrap} tabIndex={0} role="region" aria-label={`${title}: comparação entre períodos (role para os lados se precisar)`}>
      <table className={styles.table}>
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Fundamento</th>
            <th scope="col">Período atual</th>
            <th scope="col">Anterior ({previousLabel})</th>
            <th scope="col">Diferença</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.fundamental}>
              <th scope="row">{FUNDAMENTAL_LABEL[row.fundamental]}</th>
              <td className="tabular">
                {row.current.display} <small>{row.current.attempts === 0 ? 'Sem dados' : `(${row.current.context})`}</small>
              </td>
              <td className="tabular">
                {row.previous.display} <small>{row.previous.attempts === 0 ? 'Sem dados' : `(${row.previous.context})`}</small>
              </td>
              <td>{formatDifference(row.fundamental, row.difference)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PeriodSection({ scoped, previousScoped, fundamentals, previousLabel }: { scoped: ReturnType<typeof scope>; previousScoped: ReturnType<typeof scope>; fundamentals: readonly Fundamental[]; previousLabel: string }) {
  return (
    <Card title="Comparação com o período anterior">
      <p className={styles.muted}>
        A diferença só aparece quando os dois períodos têm {MIN_SAMPLE} ou mais tentativas do fundamento. Indicador de cada fundamento: o principal do cartão.
      </p>
      <PeriodTable title="Treinos" rows={periodComparison(scoped.trainingEvents, previousScoped.trainingEvents, fundamentals)} previousLabel={previousLabel} />
      <PeriodTable title="Partidas" rows={periodComparison(scoped.actions, previousScoped.actions, fundamentals)} previousLabel={previousLabel} />
    </Card>
  );
}

/* ─────────────── visão individual ─────────────── */

function IndividualPanel(props: {
  playerName: string;
  trainingEvents: readonly StatEvent[];
  actions: readonly StatEvent[];
  teamTrainingEvents: readonly StatEvent[];
  teamActions: readonly StatEvent[];
  rows: ReturnType<typeof playerMatches>;
  fundamentals: readonly Fundamental[];
}) {
  const { fundamentals } = props;
  const observations = [
    ...observationsFor('treino', props.trainingEvents, props.teamTrainingEvents, fundamentals),
    ...observationsFor('partida', props.actions, props.teamActions, fundamentals),
  ];
  const context = contextComparison(props.trainingEvents, props.actions, fundamentals);
  return (
    <section aria-labelledby="individual-titulo" className={styles.section}>
      <h2 id="individual-titulo" className={styles.h2}>
        Visão individual: {props.playerName}
      </h2>
      <p className={styles.muted}>
        Estatísticas observadas ficam separadas dos atributos de 1 a 99: nada aqui altera a avaliação nem o Overall do atleta.
      </p>

      <Card title="O que os dados mostram">
        {observations.length === 0 ? (
          <p className={styles.muted}>
            Nenhuma diferença de destaque: só se cita um fundamento quando o atleta e a equipe têm {MIN_SAMPLE} ou mais tentativas no mesmo contexto e a diferença passa de{' '}
            10 pontos percentuais (0,30 na nota de recepção).
          </p>
        ) : (
          <ul className={styles.list}>
            {observations.map((o) => (
              <li key={`${o.context}-${o.fundamental}`}>
                <span>
                  <strong>{o.direction === 'acima' ? 'Acima da média' : 'Abaixo da média'}:</strong> {o.text}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className={styles.muted}>São números observados, não explicações: a média da equipe inclui o atleta e o resultado depende de quantas tentativas foram registradas.</p>
      </Card>

      <Card title="Treinos e partidas do atleta, por fundamento">
        <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Fundamentos do atleta em treinos e partidas (role para os lados se precisar)">
          <table className={styles.table}>
            <caption className="sr-only">Indicador principal do atleta por fundamento, em treinos e em partidas</caption>
            <thead>
              <tr>
                <th scope="col">Fundamento</th>
                <th scope="col">Treinos</th>
                <th scope="col">Partidas</th>
              </tr>
            </thead>
            <tbody>
              {context.map((row) => (
                <tr key={row.fundamental}>
                  <th scope="row">
                    {FUNDAMENTAL_LABEL[row.fundamental]} <small>{row.training.label}</small>
                  </th>
                  <td className="tabular">
                    {row.training.display} <small>{row.training.attempts === 0 ? 'Sem dados' : `(${row.training.context})`}</small> <SampleBadge attempts={row.training.attempts} />
                  </td>
                  <td className="tabular">
                    {row.match.display} <small>{row.match.attempts === 0 ? 'Sem dados' : `(${row.match.context})`}</small> <SampleBadge attempts={row.match.attempts} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Resultado em cada partida">
        {props.rows.length === 0 ? (
          <p className={styles.muted}>O atleta não tem ações técnicas, pontos como envolvido nem saques registrados nas partidas deste recorte.</p>
        ) : (
          <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Resultado do atleta em cada partida (role para os lados se precisar)">
            <table className={styles.table}>
              <caption className="sr-only">Participação do atleta em cada partida</caption>
              <thead>
                <tr>
                  <th scope="col">Partida</th>
                  <th scope="col">Resultado do jogo</th>
                  <th scope="col">Ações técnicas registradas</th>
                  <th scope="col">Pontos em que foi o envolvido</th>
                  <th scope="col">Pontos ganhos quando sacou</th>
                </tr>
              </thead>
              <tbody>
                {props.rows.map((row) => (
                  <tr key={row.match.id}>
                    <th scope="row">
                      {row.match.opponent} <small>{row.match.scheduledAt ? formatDate(row.match.scheduledAt.slice(0, 10)) : 'sem data'}</small>
                    </th>
                    <td className="tabular">{resultText(row.match) ?? `${row.setsUs} x ${row.setsThem} em sets (em andamento)`}</td>
                    <td className="tabular">
                      {row.total === 0
                        ? 'Nenhuma registrada'
                        : (Object.entries(row.attempts) as [Fundamental, number][]).map(([f, n]) => `${FUNDAMENTAL_LABEL[f]}: ${n}`).join(' · ')}
                    </td>
                    <td className="tabular">{row.involved}</td>
                    <td className="tabular">{row.servedRallies === 0 ? 'Não sacou' : `${row.servedWon} de ${row.servedRallies}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={styles.muted}>
          “Pontos em que foi o envolvido” conta os pontos em que o atleta foi indicado como quem fez ou errou a jogada; “quando sacou” usa a rotação registrada. Eficiência
          de ataque e levantamento, por exemplo, não saem desses pontos: vêm das ações técnicas.
        </p>
      </Card>
    </section>
  );
}

