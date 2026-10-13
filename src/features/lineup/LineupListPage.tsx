import { useState } from 'react';
import { PATHS } from '@/app/routes';
import { DemoTag } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { useWorkspace } from '@/data/WorkspaceProvider';
import { formatDateTime } from '@/domain/format';
import { starterCount } from '@/domain/lineup';
import { shortName } from '@/domain/player';
import styles from './LineupListPage.module.css';

export function LineupListPage() {
  const { data, actions } = useWorkspace();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const players = new Map(data.players.map((p) => [p.id, p]));
  const lineups = [...data.lineups].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const remove = async (id: string) => {
    try {
      await actions.deleteLineup(id);
      setConfirming(null);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Não foi possível excluir.');
    }
  };

  return (
    <>
      <PageHeader
        title="Escalações"
        subtitle="Monte e guarde as escalações dos jogos"
        actions={
          <ButtonLink to={PATHS.newLineup} variant="primary" icon="plus">
            Nova escalação
          </ButtonLink>
        }
      />

      {failure && (
        <Notice tone="error" title="Não foi possível excluir">
          {failure}
        </Notice>
      )}

      {lineups.length === 0 ? (
        <EmptyState
          icon="lineup"
          title="Nenhuma escalação salva"
          action={
            <ButtonLink to={PATHS.newLineup} variant="primary" icon="plus">
              Montar a primeira escalação
            </ButtonLink>
          }
        >
          Escolha seis titulares, o líbero e os reservas; a ordem de saque é definida pela posição na quadra.
        </EmptyState>
      ) : (
        <ul className={styles.grid}>
          {lineups.map((lineup) => {
            const libero = lineup.liberoId ? players.get(lineup.liberoId) : undefined;
            return (
              <li key={lineup.id}>
                <Card as="article" className={styles.card}>
                  <header className={styles.head}>
                    <h2 className={styles.title}>{lineup.title}</h2>
                    {lineup.demo && <DemoTag />}
                  </header>
                  <p className={styles.meta}>
                    {[lineup.opponent && `vs ${lineup.opponent}`, lineup.competition, formatDateTime(lineup.scheduledAt), lineup.venue]
                      .filter(Boolean)
                      .join(' · ') || 'Sem adversário, data ou local definidos'}
                  </p>
                  <dl className={styles.facts}>
                    <div>
                      <dt>Formação</dt>
                      <dd>{lineup.formation}</dd>
                    </div>
                    <div>
                      <dt>Titulares</dt>
                      <dd>{starterCount(lineup)} de 6</dd>
                    </div>
                    <div>
                      <dt>Reservas</dt>
                      <dd>{lineup.benchIds.length}</dd>
                    </div>
                    <div>
                      <dt>Líbero</dt>
                      <dd>{libero ? shortName(libero.name) : '—'}</dd>
                    </div>
                  </dl>
                  <div className={styles.actions}>
                    <ButtonLink to={PATHS.lineup(lineup.id)} variant="primary" icon="edit">
                      Abrir
                    </ButtonLink>
                    {confirming === lineup.id ? (
                      <>
                        <Button variant="danger" icon="trash" onClick={() => void remove(lineup.id)}>
                          Confirmar exclusão
                        </Button>
                        <Button variant="ghost" onClick={() => setConfirming(null)}>
                          Cancelar
                        </Button>
                      </>
                    ) : (
                      <Button variant="ghost" icon="trash" onClick={() => setConfirming(lineup.id)}>
                        Excluir
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
