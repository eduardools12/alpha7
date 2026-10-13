import { Can } from '@/auth/AccessContext';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { PATHS } from '@/app/routes';
import { DemoTag } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { useWorkspace } from '@/data/WorkspaceProvider';
import { FUNDAMENTALS, FUNDAMENTAL_LABEL, type Fundamental } from '@/domain/fundamentals';
import { formatDate, formatDateTime } from '@/domain/format';
import { shortName } from '@/domain/player';
import { TRAINING_STATUS_LABEL, cascadeCounts } from '@/domain/training';
import { MIN_SAMPLE, compareParticipants, summarizeTraining } from '@/domain/trainingStats';
import { DistributionBars } from './DistributionBars';
import { SAMPLE_NOTE, viewFundamental } from './fundamentalView';
import { formatDuration, playerLabel } from './trainingFormat';
import styles from './TrainingSummaryPage.module.css';

export function TrainingSummaryPage() {
  const { trainingId } = useParams();
  const { data, actions, backend } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const flash = (location.state as { flash?: string } | null)?.flash;

  const training = data.trainings.find((t) => t.id === trainingId);
  const events = useMemo(() => data.trainingEvents.filter((e) => e.trainingId === trainingId), [data.trainingEvents, trainingId]);
  const summary = useMemo(
    () => (training ? summarizeTraining(training, data.exercises, events) : null),
    [training, data.exercises, events],
  );
  const playersById = useMemo(() => new Map(data.players.map((p) => [p.id, p])), [data.players]);

  // Fundamento inicial da tabela individual: o mais registrado neste treino.
  const busiest = useMemo<Fundamental>(() => {
    if (!summary) return 'saque';
    return FUNDAMENTALS.reduce((best, f) => (summary.attemptsByFundamental[f] > summary.attemptsByFundamental[best] ? f : best), 'saque');
  }, [summary]);
  const [chosen, setChosen] = useState<Fundamental | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const comparisonFundamental = chosen ?? busiest;

  useEffect(() => {
    if (flash) navigate(location.pathname, { replace: true, state: null });
  }, [flash, location.pathname, navigate]);

  if (!training || !summary) {
    return (
      <>
        <PageHeader title="Resumo do treino" back={{ to: PATHS.trainings, label: 'Treinos' }} />
        <EmptyState
          icon="list"
          title="Treino não encontrado"
          action={<ButtonLink to={PATHS.trainings}>Voltar aos treinos</ButtonLink>}
        >
          Este treino não existe mais ou o endereço está incorreto.
        </EmptyState>
      </>
    );
  }

  const open = training.status === 'aberto';
  const cascade = cascadeCounts(training.id, data.exercises, data.trainingEvents);
  const exercises = data.exercises.filter((e) => e.trainingId === training.id).sort((a, b) => a.order - b.order);
  const withAttempts = FUNDAMENTALS.filter((f) => summary.attemptsByFundamental[f] > 0);
  const withoutAttempts = FUNDAMENTALS.filter((f) => summary.attemptsByFundamental[f] === 0);

  const comparison = compareParticipants(events, training.participantIds, comparisonFundamental);
  const rows = comparison.canCompare
    ? comparison.rows
    : [...comparison.rows].sort((a, b) =>
        shortName(playersById.get(a.playerId)?.name ?? '~').localeCompare(shortName(playersById.get(b.playerId)?.name ?? '~'), 'pt-BR'),
      );
  const totals = new Map(summary.perPlayer.map((p) => [p.playerId, p.total]));

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setFailure(null);
    try {
      await work();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Não foi possível concluir a ação.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title={training.name}
        subtitle={`${formatDate(training.date)} · ${formatDuration(training.durationMinutes)}`}
        back={{ to: PATHS.trainings, label: 'Treinos' }}
        actions={
          <>
            {open && (
              <Can to="events:record"><ButtonLink to={PATHS.recordTraining(training.id)} variant="primary" icon="plus">
                Registrar
              </ButtonLink></Can>
            )}
            <Can to="trainings:write">
              <Button
                variant={open ? 'secondary' : 'primary'}
                icon={open ? 'check' : 'rotate'}
                disabled={busy}
                onClick={() => void run(() => actions.setTrainingStatus(training.id, open ? 'concluido' : 'aberto'))}
              >
                {open ? 'Concluir treino' : 'Reabrir treino'}
              </Button>
            </Can>
            <Can to="trainings:write"><ButtonLink to={PATHS.editTraining(training.id)} icon="edit">
              Editar
            </ButtonLink></Can>
          </>
        }
      />

      {flash && <Notice tone="success">{flash}</Notice>}
      {failure && (
        <Notice tone="error" title="Não foi possível concluir a ação">
          {failure}
        </Notice>
      )}
      {open && (
        <Notice tone="info" title="Treino em andamento">
          Os números abaixo mudam a cada registro. Conclua o treino quando terminar para fechá-lo.
        </Notice>
      )}

      <section className={styles.identity} aria-label="Identificação do treino">
        <span className={`${styles.status} ${open ? styles.open : styles.done}`}>{TRAINING_STATUS_LABEL[training.status]}</span>
        {training.demo && <DemoTag />}
        <span className={styles.meta}>
          {training.responsible ? `Responsável: ${training.responsible}` : 'Responsável não informado'}
          {training.completedAt && ` · concluído em ${formatDateTime(training.completedAt.slice(0, 16))}`}
        </span>
      </section>
      {training.description && <p className={styles.description}>{training.description}</p>}

      <section className={styles.tiles} aria-label="Números do treino">
        <div className={styles.tile}>
          <p>Participantes</p>
          <strong className="tabular">{summary.participants}</strong>
        </div>
        <div className={styles.tile}>
          <p>Exercícios</p>
          <strong className="tabular">{summary.exercises}</strong>
        </div>
        <div className={styles.tile}>
          <p>Registros válidos</p>
          <strong className="tabular">{summary.validEvents}</strong>
          {summary.voidedEvents > 0 && <small>{summary.voidedEvents} desfeitos, fora das contas</small>}
        </div>
        <div className={styles.tile}>
          <p>Fundamentos registrados</p>
          <strong className="tabular">{withAttempts.length}</strong>
          <small>de {FUNDAMENTALS.length}</small>
        </div>
      </section>

      <Card title="Participantes">
        <ul className={styles.people}>
          {training.participantIds.map((id) => (
            <li key={id}>{playerLabel(playersById.get(id))}</li>
          ))}
          {training.participantIds.length === 0 && <li className={styles.muted}>Nenhum participante selecionado.</li>}
        </ul>
      </Card>

      <Card title="Estatísticas por fundamento">
        {summary.validEvents === 0 ? (
          <p className={styles.muted}>
            Nenhuma tentativa registrada neste treino. As estatísticas aparecem a partir do primeiro registro, e nada é
            mostrado como zero.
          </p>
        ) : (
          <>
            <div className={styles.cards}>
              {withAttempts.map((f) => {
                const view = viewFundamental(f, events);
                return (
                  <section key={f} className={styles.fcard} aria-label={FUNDAMENTAL_LABEL[f]}>
                    <header className={styles.fhead}>
                      <h3>{FUNDAMENTAL_LABEL[f]}</h3>
                      <span className={styles.attempts}>
                        <b className="tabular">{view.attempts}</b> {view.attempts === 1 ? 'tentativa' : 'tentativas'}
                      </span>
                    </header>
                    {view.sample !== 'adequate' && (
                      <p className={styles.sample} role="note">
                        {SAMPLE_NOTE[view.sample](view.attempts)}
                      </p>
                    )}
                    <DistributionBars items={view.distribution} label={`Distribuição de ${FUNDAMENTAL_LABEL[f]}`} />
                    <dl className={styles.metrics}>
                      {view.metrics.map((m) => (
                        <div key={m.label}>
                          <dt>{m.label}</dt>
                          <dd>
                            <strong className="tabular">{m.value}</strong>
                            <small>{m.context}</small>
                          </dd>
                          {m.formula && <dd className={styles.formula}>{m.formula}</dd>}
                        </div>
                      ))}
                    </dl>
                    {view.note && <p className={styles.muted}>{view.note}</p>}
                  </section>
                );
              })}
            </div>
            {withoutAttempts.length > 0 && (
              <p className={styles.muted}>Sem tentativas registradas em: {withoutAttempts.map((f) => FUNDAMENTAL_LABEL[f]).join(', ')}.</p>
            )}
          </>
        )}
      </Card>

      <Card title="Exercícios">
        {exercises.length === 0 ? (
          <p className={styles.muted}>Nenhum exercício neste treino.</p>
        ) : (
          <table className={styles.table}>
            <caption className="sr-only">Registros por exercício</caption>
            <thead>
              <tr>
                <th scope="col">Exercício</th>
                <th scope="col">Foco</th>
                <th scope="col">Registros</th>
              </tr>
            </thead>
            <tbody>
              {summary.perExercise.map((row) => {
                const exercise = exercises.find((e) => e.id === row.exerciseId);
                return (
                  <tr key={row.exerciseId}>
                    <th scope="row">{row.name}</th>
                    <td>{exercise?.focus ? FUNDAMENTAL_LABEL[exercise.focus] : 'Geral'}</td>
                    <td className="tabular">{row.count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Resultados individuais">
        <div role="group" aria-label="Fundamento da tabela" className={styles.chips}>
          {FUNDAMENTALS.map((f) => (
            <Chip key={f} pressed={comparisonFundamental === f} onClick={() => setChosen(f)}>
              {FUNDAMENTAL_LABEL[f]}
            </Chip>
          ))}
        </div>
        <p className={styles.muted} aria-live="polite">
          {comparison.canCompare
            ? `Os atletas com ${MIN_SAMPLE} tentativas ou mais estão ordenados pelo indicador. Quem tem menos fica ao final, sem ranking.`
            : `Sem base para comparar: é preciso ao menos 2 atletas com ${MIN_SAMPLE} tentativas ou mais em ${FUNDAMENTAL_LABEL[comparisonFundamental]}. Os valores abaixo são só descritivos.`}
        </p>
        {/* Rola na horizontal em telas estreitas: precisa ser focável para quem usa teclado. */}
        <div className={styles.tableWrap} role="region" aria-label="Tabela de resultados individuais" tabIndex={0}>
          <table className={styles.table}>
            <caption className="sr-only">Resultados individuais em {FUNDAMENTAL_LABEL[comparisonFundamental]}</caption>
            <thead>
              <tr>
                {comparison.canCompare && <th scope="col">#</th>}
                <th scope="col">Atleta</th>
                <th scope="col">Registros no treino</th>
                <th scope="col">Tentativas</th>
                <th scope="col">{rows[0]?.headline.label ?? 'Indicador'}</th>
                <th scope="col">Contexto</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.playerId} className={row.eligible ? '' : styles.dim}>
                  {comparison.canCompare && <td className="tabular">{row.eligible ? index + 1 : '—'}</td>}
                  <th scope="row">{playerLabel(playersById.get(row.playerId))}</th>
                  <td className="tabular">{totals.get(row.playerId) ?? 0}</td>
                  <td className="tabular">{row.headline.attempts}</td>
                  <td className="tabular">
                    <strong>{row.headline.display}</strong>
                  </td>
                  <td>
                    {row.headline.context}
                    {row.headline.sample === 'small' && <span className={styles.flag}> · amostra insuficiente</span>}
                    {row.headline.sample === 'none' && <span className={styles.flag}> · indisponível</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Observações do responsável">
        {training.notes ? <p className={styles.notes}>{training.notes}</p> : <p className={styles.muted}>Sem observações. Use “Editar” para adicionar.</p>}
      </Card>

      <Can to="trainings:delete">
      <Card title="Excluir treino">
        {confirmDelete ? (
          <>
            <Notice tone="warning" title={`Excluir "${training.name}"?`}>
              Serão apagados {cascade.exercises} {cascade.exercises === 1 ? 'exercício' : 'exercícios'} e {cascade.events}{' '}
              {cascade.events === 1 ? 'registro' : 'registros'} (inclusive os desfeitos). Isso não pode ser desfeito.
            </Notice>
            <div className={styles.row}>
              <Button
                variant="danger"
                icon="trash"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await actions.deleteTraining(training.id);
                    navigate(PATHS.trainings, { state: { flash: `Treino "${training.name}" excluído.` } });
                  })
                }
              >
                Confirmar exclusão
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </Button>
            </div>
          </>
        ) : (
          <div className={styles.row}>
            <Button variant="danger" icon="trash" onClick={() => setConfirmDelete(true)}>
              Excluir treino
            </Button>
          </div>
        )}
      </Card>
      </Can>

      <p className={styles.footnote}>
        {backend === 'remote'
          ? 'Estes dados ficam salvos no servidor da equipe (nuvem).'
          : 'Estes dados ficam salvos só neste navegador (armazenamento local), sem sincronização com a nuvem.'}
      </p>
    </>
  );
}
