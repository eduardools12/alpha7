import { useMemo, useState } from 'react';
import { useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Can, useCan } from '@/auth/AccessContext';
import { PATHS } from '@/app/routes';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { useWorkspace } from '@/data/WorkspaceProvider';
import { FUNDAMENTALS, FUNDAMENTAL_LABEL, OUTCOME_VALUES, outcomeLabel } from '@/domain/fundamentals';
import { formatDateTime, formatInstant } from '@/domain/format';
import { MATCH_STATUS_LABEL, SIDE_LABEL, reasonLabel, reasonTotals, resultText } from '@/domain/match';
import { shortName } from '@/domain/player';
import { POSITION_LABEL } from '@/domain/positions';
import { formatSummary, outcomeText, stateFor } from './matchView';
import { rallyDescription, runningScores } from './rallyText';
import styles from './MatchDetailPage.module.css';

export function MatchDetailPage() {
  const { matchId } = useParams();
  const { data, actions } = useWorkspace();
  const canWrite = useCan('matches:write');
  const location = useLocation();
  const navigate = useNavigate();
  const incoming = (location.state as { flash?: string } | null)?.flash;
  // A confirmação fica guardada no componente: se dependesse do estado do histórico, sumiria no render seguinte à limpeza.
  const [flash] = useState(incoming);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const match = data.matches.find((m) => m.id === matchId);
  const playersById = useMemo(() => new Map(data.players.map((p) => [p.id, p])), [data.players]);

  // Mostra a confirmação uma vez: limpa o estado do histórico para que recarregar não a repita.
  useEffect(() => {
    if (incoming) navigate(location.pathname, { replace: true, state: null });
  }, [incoming, location.pathname, navigate]);

  if (!match) {
    return (
      <>
        <PageHeader title="Partida" back={{ to: PATHS.matches, label: 'Partidas' }} />
        <EmptyState icon="court" title="Partida não encontrada" action={<ButtonLink to={PATHS.matches}>Voltar às partidas</ButtonLink>}>
          Esta partida não existe mais ou o endereço está incorreto.
        </EmptyState>
      </>
    );
  }

  const state = stateFor(match, data.matchSets, data.rallies);
  const rallies = state.sets.flatMap((s) => s.rallies);
  const totals = reasonTotals(rallies);
  const actionsOfMatch = data.rallyActions.filter((a) => a.matchId === match.id && a.voidedAt === null);
  const result = resultText(match);
  const outcome = outcomeText(match);
  const done = match.status === 'concluida';

  const reopen = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await actions.reopenMatch(match.id);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Não foi possível reabrir.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title={`Alpha7 x ${match.opponent}`}
        subtitle={[match.competition, match.scheduledAt ? formatDateTime(match.scheduledAt) : '', match.venue].filter(Boolean).join(' · ') || 'Sem data definida'}
        back={{ to: PATHS.matches, label: 'Partidas' }}
        actions={
          <>
            {canWrite && !done && (
              <ButtonLink to={PATHS.liveMatch(match.id)} variant="primary" icon="plus">
                {match.status === 'agendada' ? 'Iniciar partida' : 'Acompanhar'}
              </ButtonLink>
            )}
            <Can to="matches:write">
              <ButtonLink to={PATHS.editMatch(match.id)} icon="edit">
                Editar dados
              </ButtonLink>
            </Can>
            {done && (
              <Can to="matches:reopen">
                <Button disabled={busy} onClick={() => void reopen()}>
                  Reabrir para corrigir
                </Button>
              </Can>
            )}
          </>
        }
      />

      {flash && <Notice tone="success">{flash}</Notice>}
      {failure && (
        <Notice tone="error" title="Não foi possível reabrir">
          {failure}
        </Notice>
      )}

      <Card title="Resumo">
        <dl className={styles.facts}>
          <div>
            <dt>Situação</dt>
            <dd>{MATCH_STATUS_LABEL[match.status]}</dd>
          </div>
          <div>
            <dt>Sets</dt>
            <dd className="tabular">
              {done && result ? result : `${state.setsUs} x ${state.setsThem}`}
            </dd>
          </div>
          {outcome && (
            <div>
              <dt>Resultado</dt>
              <dd>{outcome}</dd>
            </div>
          )}
          <div>
            <dt>Formato</dt>
            <dd className={styles.small}>{formatSummary(match)}</dd>
          </div>
          {match.concludedAt && (
            <div>
              <dt>Encerrada em</dt>
              <dd className={styles.small}>{formatInstant(match.concludedAt)}</dd>
            </div>
          )}
        </dl>
      </Card>

      <Card title="Sets">
        {state.sets.length === 0 ? (
          <p className={styles.muted}>Nenhum set iniciado.</p>
        ) : (
          <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Sets da partida (role para os lados se precisar)">
            <table className={styles.table}>
              <caption className="sr-only">Placar de cada set</caption>
              <thead>
                <tr>
                  <th scope="col">Set</th>
                  <th scope="col">Placar</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Sacou primeiro</th>
                  <th scope="col">Formação inicial (P1 a P6)</th>
                </tr>
              </thead>
              <tbody>
                {state.sets.map((s) => (
                  <tr key={s.set.number}>
                    <th scope="row">{s.set.number}</th>
                    <td className="tabular">
                      <strong>
                        {s.score.us} x {s.score.them}
                      </strong>
                    </td>
                    <td>{s.closed ? (s.winner === 'us' ? 'Alpha7 venceu' : 'Adversário venceu') : 'Em andamento'}</td>
                    <td>{SIDE_LABEL[s.set.firstServer]}</td>
                    <td className={styles.lineup}>
                      {s.set.starters
                        .map((st) => {
                          const p = playersById.get(st.playerId);
                          return `P${st.slot + 1} ${p ? `${shortName(p.name)} #${p.jerseyNumber}` : '—'} (${POSITION_LABEL[st.role]})`;
                        })
                        .join(' · ')}
                      {s.set.liberoId && playersById.get(s.set.liberoId) ? ` · Líbero ${shortName(playersById.get(s.set.liberoId)?.name ?? '')}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Motivos dos pontos">
        {rallies.length === 0 ? (
          <p className={styles.muted}>Nenhum ponto registrado.</p>
        ) : (
          <>
            <p className={styles.muted}>
              {rallies.length} pontos registrados. Ponto sem motivo fica como “motivo não informado”: não entra em nenhum motivo.
            </p>
            <div className={styles.reasonGrid}>
              {(['us', 'them'] as const).map((side) => {
                const own = totals.filter((t) => t.winner === side).sort((a, b) => b.count - a.count);
                const sum = own.reduce((acc, t) => acc + t.count, 0);
                return (
                  <section key={side} aria-label={`Pontos do ${SIDE_LABEL[side]}`}>
                    <h3 className={styles.subtitle}>
                      Pontos do {SIDE_LABEL[side]} <span className="tabular">({sum})</span>
                    </h3>
                    <ul className={styles.reasonList}>
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
                  </section>
                );
              })}
            </div>
          </>
        )}
      </Card>

      <Card title="Ações técnicas (fundamentos observados)">
        {actionsOfMatch.length === 0 ? (
          <p className={styles.muted}>
            Nenhuma ação técnica foi registrada nesta partida. “Não registrado” não é zero: as estatísticas por fundamento só consideram o que foi observado.
          </p>
        ) : (
          <ul className={styles.fundamentals}>
            {FUNDAMENTALS.map((fundamental) => {
              const own = actionsOfMatch.filter((a) => a.fundamental === fundamental);
              if (own.length === 0) return null;
              return (
                <li key={fundamental}>
                  <h3 className={styles.subtitle}>
                    {FUNDAMENTAL_LABEL[fundamental]} <span className="tabular">({own.length} {own.length === 1 ? 'registro' : 'registros'})</span>
                  </h3>
                  <p className={`${styles.muted} tabular`}>
                    {(OUTCOME_VALUES[fundamental] as readonly string[])
                      .map((outcomeValue) => `${outcomeLabel(fundamental, outcomeValue)}: ${own.filter((a) => a.outcome === outcomeValue).length} de ${own.length}`)
                      .join(' · ')}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Histórico dos pontos">
        {state.sets.length === 0 ? (
          <p className={styles.muted}>Sem pontos.</p>
        ) : (
          state.sets.map((s) => {
            const scores = runningScores(s.rallies);
            return (
              <details key={s.set.number} className={styles.history} open={state.sets.length === 1}>
                <summary>
                  Set {s.set.number}: {s.score.us} x {s.score.them} ({s.rallies.length} pontos)
                </summary>
                {s.rallies.length === 0 ? (
                  <p className={styles.muted}>Sem pontos neste set.</p>
                ) : (
                  <ol className={styles.points}>
                    {s.rallies.map((r) => (
                      <li key={r.id}>
                        <span className="tabular">{scores.get(r.id)}</span>
                        <span>{rallyDescription(r, playersById)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </details>
            );
          })
        )}
        <p className={styles.muted}>
          Pontos desfeitos ficam guardados no histórico interno, mas não entram no placar nem nas estatísticas.
        </p>
      </Card>
    </>
  );
}

