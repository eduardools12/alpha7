import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PATHS } from '@/app/routes';
import { DemoTag } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { useWorkspace } from '@/data/WorkspaceProvider';
import { formatDate } from '@/domain/format';
import { TRAINING_STATUS_LABEL, cascadeCounts, validEvents } from '@/domain/training';
import { formatDuration } from './trainingFormat';
import styles from './TrainingsListPage.module.css';

export function TrainingsListPage() {
  const { data, actions } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const flash = (location.state as { flash?: string } | null)?.flash;
  const [confirming, setConfirming] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Mostra a confirmação uma vez: limpa o estado do histórico para que recarregar não a repita.
  useEffect(() => {
    if (flash) navigate(location.pathname, { replace: true, state: null });
  }, [flash, location.pathname, navigate]);

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
          <ButtonLink to={PATHS.newTraining} variant="primary" icon="plus">
            Novo treino
          </ButtonLink>
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
            <ButtonLink to={PATHS.newTraining} variant="primary" icon="plus">
              Criar o primeiro treino
            </ButtonLink>
          }
        >
          Crie um treino, escolha quem participa e os exercícios, e registre as tentativas pelo celular. As estatísticas
          são calculadas só do que for registrado.
        </EmptyState>
      ) : (
        <ul className={styles.grid}>
          {trainings.map((training) => {
            const counts = cascadeCounts(training.id, data.exercises, data.trainingEvents);
            const valid = validEvents(data.trainingEvents.filter((e) => e.trainingId === training.id)).length;
            const open = training.status === 'aberto';
            return (
              <li key={training.id}>
                <Card as="article" className={styles.card}>
                  <header className={styles.head}>
                    <h2 className={styles.title}>{training.name}</h2>
                    <span className={styles.tags}>
                      <span className={`${styles.status} ${open ? styles.open : styles.done}`}>
                        {TRAINING_STATUS_LABEL[training.status]}
                      </span>
                      {training.demo && <DemoTag />}
                    </span>
                  </header>
                  <p className={styles.meta}>
                    {formatDate(training.date)} · {formatDuration(training.durationMinutes)}
                    {training.responsible && ` · ${training.responsible}`}
                  </p>
                  <dl className={styles.facts}>
                    <div>
                      <dt>Participantes</dt>
                      <dd className="tabular">{training.participantIds.length}</dd>
                    </div>
                    <div>
                      <dt>Exercícios</dt>
                      <dd className="tabular">{counts.exercises}</dd>
                    </div>
                    <div>
                      <dt>Registros</dt>
                      <dd className="tabular">{valid}</dd>
                    </div>
                  </dl>
                  <div className={styles.actions}>
                    {open && (
                      <ButtonLink to={PATHS.recordTraining(training.id)} variant="primary" icon="plus">
                        Registrar
                      </ButtonLink>
                    )}
                    <ButtonLink to={PATHS.training(training.id)} variant={open ? 'secondary' : 'primary'}>
                      Resumo
                    </ButtonLink>
                    <ButtonLink to={PATHS.editTraining(training.id)} variant="ghost" icon="edit" aria-label={`Editar ${training.name}`}>
                      Editar
                    </ButtonLink>
                    {confirming !== training.id && (
                      <Button variant="ghost" icon="trash" aria-label={`Excluir ${training.name}`} onClick={() => setConfirming(training.id)}>
                        Excluir
                      </Button>
                    )}
                  </div>
                  {confirming === training.id && (
                    <div className={styles.confirm}>
                      <Notice tone="warning" title={`Excluir "${training.name}"?`}>
                        Serão apagados {counts.exercises} {counts.exercises === 1 ? 'exercício' : 'exercícios'} e{' '}
                        {counts.events} {counts.events === 1 ? 'registro' : 'registros'} deste treino. Isso não pode ser desfeito.
                      </Notice>
                      <div className={styles.actions}>
                        <Button variant="danger" icon="trash" disabled={busy} onClick={() => void remove(training.id)}>
                          Confirmar exclusão
                        </Button>
                        <Button variant="ghost" onClick={() => setConfirming(null)}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <p className={styles.footnote}>Os treinos ficam salvos só neste navegador (armazenamento local), sem sincronização com a nuvem.</p>
    </>
  );
}
