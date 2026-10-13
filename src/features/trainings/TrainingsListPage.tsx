import { Can } from '@/auth/AccessContext';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PATHS } from '@/app/routes';
import { DemoTag } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FixtureRow } from '@/components/ui/FixtureRow';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { useWorkspace } from '@/data/WorkspaceProvider';
import { dateBlock, formatDate } from '@/domain/format';
import { TRAINING_STATUS_LABEL, cascadeCounts, validEvents } from '@/domain/training';
import { formatDuration } from './trainingFormat';
import styles from './TrainingsListPage.module.css';

export function TrainingsListPage() {
  const { data, actions, backend } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const incoming = (location.state as { flash?: string } | null)?.flash;
  // A confirmação fica guardada no componente: se dependesse do estado do histórico, sumiria no render seguinte à limpeza.
  const [flash] = useState(incoming);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Mostra a confirmação uma vez: limpa o estado do histórico para que recarregar não a repita.
  useEffect(() => {
    if (incoming) navigate(location.pathname, { replace: true, state: null });
  }, [incoming, location.pathname, navigate]);

  const trainings = [...data.trainings].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );

  const remove = async (id: string) => {
    setBusy(true);
    setFailure(null);
    try {
      await actions.deleteTraining(id);
      setConfirming(null);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Não foi possível excluir.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Treinos"
        subtitle="Registre tentativas por fundamento e acompanhe cada sessão"
        actions={
          <Can to="trainings:write"><ButtonLink to={PATHS.newTraining} variant="primary" icon="plus">
            Novo treino
          </ButtonLink></Can>
        }
      />

      {flash && <Notice tone="success">{flash}</Notice>}
      {failure && (
        <Notice tone="error" title="Não foi possível excluir">
          {failure}
        </Notice>
      )}

      {trainings.length === 0 ? (
        <EmptyState
          icon="list"
          title="Nenhum treino cadastrado"
          action={
            <Can to="trainings:write"><ButtonLink to={PATHS.newTraining} variant="primary" icon="plus">
              Criar o primeiro treino
            </ButtonLink></Can>
          }
        >
          Crie um treino, escolha quem participa e os exercícios, e registre as tentativas pelo celular. As estatísticas
          são calculadas só do que for registrado.
        </EmptyState>
      ) : (
        <div className={`${styles.ledger} enter`}>
          {trainings.map((training) => {
            const counts = cascadeCounts(training.id, data.exercises, data.trainingEvents);
            const valid = validEvents(data.trainingEvents.filter((e) => e.trainingId === training.id)).length;
            const open = training.status === 'aberto';
            const block = dateBlock(training.date);
            return (
              <FixtureRow
                key={training.id}
                day={block.day}
                month={block.month}
                tone={open ? 'open' : 'done'}
                title={training.name}
                tags={
                  <>
                    <span className={`${styles.status} ${open ? styles.open : styles.done}`}>{TRAINING_STATUS_LABEL[training.status]}</span>
                    {training.demo && <DemoTag />}
                  </>
                }
                meta={`${formatDate(training.date)} · ${formatDuration(training.durationMinutes)}${training.responsible ? ` · ${training.responsible}` : ''}`}
                stats={[
                  { label: 'Participantes', value: training.participantIds.length },
                  { label: 'Exercícios', value: counts.exercises },
                  { label: 'Registros', value: valid },
                ]}
                actions={
                  <>
                    {open && (
                      <Can to="events:record"><ButtonLink to={PATHS.recordTraining(training.id)} variant="primary" icon="plus">
                        Registrar
                      </ButtonLink></Can>
                    )}
                    <ButtonLink to={PATHS.training(training.id)} variant={open ? 'secondary' : 'primary'}>
                      Resumo
                    </ButtonLink>
                    <Can to="trainings:write"><ButtonLink to={PATHS.editTraining(training.id)} variant="ghost" icon="edit" aria-label={`Editar ${training.name}`}>
                      Editar
                    </ButtonLink></Can>
                    {confirming !== training.id && (
                      <Can to="trainings:delete">
                        <Button variant="ghost" icon="trash" aria-label={`Excluir ${training.name}`} onClick={() => setConfirming(training.id)}>
                          Excluir
                        </Button>
                      </Can>
                    )}
                  </>
                }
                below={
                  confirming === training.id ? (
                    <>
                      <Notice tone="warning" title={`Excluir "${training.name}"?`}>
                        Serão apagados {counts.exercises} {counts.exercises === 1 ? 'exercício' : 'exercícios'} e{' '}
                        {counts.events} {counts.events === 1 ? 'registro' : 'registros'} deste treino. Isso não pode ser desfeito.
                      </Notice>
                      <div className={styles.confirmActions}>
                        <Button variant="danger" icon="trash" disabled={busy} onClick={() => void remove(training.id)}>
                          Confirmar exclusão
                        </Button>
                        <Button variant="ghost" onClick={() => setConfirming(null)}>
                          Cancelar
                        </Button>
                      </div>
                    </>
                  ) : undefined
                }
              />
            );
          })}
        </div>
      )}

      <p className={styles.footnote}>
        {backend === 'remote'
          ? 'Os treinos ficam salvos no servidor da equipe (nuvem).'
          : 'Os treinos ficam salvos só neste navegador (armazenamento local), sem sincronização com a nuvem.'}
      </p>
    </>
  );
}
