import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Can, useCan } from '@/auth/AccessContext';
import { PATHS } from '@/app/routes';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField, TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { useWorkspace } from '@/data/WorkspaceProvider';
import { formatDateTime } from '@/domain/format';
import { MATCH_STATUSES, MATCH_STATUS_LABEL, outcomeOf, resultText, type Match, type MatchStatus } from '@/domain/match';
import { OUTCOME_LABEL, formatSummary, setScoresText, stateFor } from './matchView';
import styles from './MatchesListPage.module.css';

type StatusFilter = 'todas' | MatchStatus;

const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');

export function MatchesListPage() {
  const { data, actions, backend } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const canWrite = useCan('matches:write');
  const incoming = (location.state as { flash?: string } | null)?.flash;
  // A confirmação fica guardada no componente: se dependesse do estado do histórico, sumiria no render seguinte à limpeza.
  const [flash] = useState(incoming);
  const [status, setStatus] = useState<StatusFilter>('todas');
  const [query, setQuery] = useState('');
  const [competition, setCompetition] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (incoming) navigate(location.pathname, { replace: true, state: null });
  }, [incoming, location.pathname, navigate]);

  const competitions = useMemo(() => [...new Set(data.matches.map((m) => m.competition).filter((c) => c !== ''))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [data.matches]);

  const matches = useMemo(() => {
    const needle = normalize(query.trim());
    return data.matches
      .filter((m) => status === 'todas' || m.status === status)
      .filter((m) => competition === '' || m.competition === competition)
      .filter((m) => needle === '' || normalize(`${m.opponent} ${m.competition} ${m.venue}`).includes(needle))
      .sort((a, b) => (b.scheduledAt || b.createdAt).localeCompare(a.scheduledAt || a.createdAt) || b.createdAt.localeCompare(a.createdAt));
  }, [data.matches, status, competition, query]);

  const remove = async (match: Match) => {
    setBusy(true);
    setFailure(null);
    try {
      await actions.deleteMatch(match.id);
      setConfirming(null);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Não foi possível excluir.');
    } finally {
      setBusy(false);
    }
  };

  const filtering = status !== 'todas' || competition !== '' || query.trim() !== '';
  const clear = () => {
    setStatus('todas');
    setCompetition('');
    setQuery('');
  };

  return (
    <>
      <PageHeader
        title="Partidas"
        subtitle="Agende jogos, acompanhe o placar por set e registre cada ponto"
        actions={
          <Can to="matches:write">
            <ButtonLink to={PATHS.newMatch} variant="primary" icon="plus">
              Nova partida
            </ButtonLink>
          </Can>
        }
      />

      {flash && <Notice tone="success">{flash}</Notice>}
      {failure && (
        <Notice tone="error" title="Não foi possível excluir">
          {failure}
        </Notice>
      )}

      {data.matches.length === 0 ? (
        <EmptyState
          icon="court"
          title="Nenhuma partida cadastrada"
          action={
            <Can to="matches:write">
              <ButtonLink to={PATHS.newMatch} variant="primary" icon="plus">
                Cadastrar a primeira partida
              </ButtonLink>
            </Can>
          }
        >
          Cadastre o adversário, a data e o formato do jogo. Durante a partida, registre os pontos e, se quiser, os fundamentos de cada
          atleta. O resultado e as estatísticas vêm só do que for registrado.
        </EmptyState>
      ) : (
        <>
          <div className={styles.filters}>
            <div className={styles.chips} role="group" aria-label="Filtrar por situação">
              <Chip pressed={status === 'todas'} onClick={() => setStatus('todas')}>
                Todas
              </Chip>
              {MATCH_STATUSES.map((s) => (
                <Chip key={s} pressed={status === s} onClick={() => setStatus(s)}>
                  {MATCH_STATUS_LABEL[s]}
                </Chip>
              ))}
            </div>
            <TextField label="Buscar adversário, campeonato ou local" value={query} autoComplete="off" onChange={(event) => setQuery(event.target.value)} />
            {competitions.length > 0 && (
              <SelectField label="Campeonato" value={competition} onChange={(event) => setCompetition(event.target.value)}>
                <option value="">Todos</option>
                {competitions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </SelectField>
            )}
          </div>

          <p className={styles.count} aria-live="polite">
            {matches.length} {matches.length === 1 ? 'partida' : 'partidas'}
            {filtering && ` de ${data.matches.length}`}
          </p>

          {matches.length === 0 ? (
            <EmptyState
              icon="search"
              title="Nenhuma partida com esses filtros"
              action={
                <Button variant="primary" onClick={clear}>
                  Limpar filtros
                </Button>
              }
            >
              Ajuste a busca ou a situação para ver as outras partidas.
            </EmptyState>
          ) : (
            <ul className={styles.grid}>
              {matches.map((match, index) => {
                const state = stateFor(match, data.matchSets, data.rallies);
                const result = resultText(match);
                const done = match.status === 'concluida';
                const outcome = outcomeOf(match);
                return (
                  <li key={match.id} className="enter" style={{ '--i': Math.min(index, 8) } as React.CSSProperties}>
                    <Card as="article" className={styles.card}>
                      <header className={styles.head}>
                        <h2 className={styles.title}>Alpha7 x {match.opponent}</h2>
                        <span className={`${styles.status} ${done ? styles.done : match.status === 'em_andamento' ? styles.live : styles.planned}`}>
                          {MATCH_STATUS_LABEL[match.status]}
                        </span>
                      </header>
                      <p className={styles.meta}>
                        {[match.scheduledAt ? formatDateTime(match.scheduledAt) : 'Sem data definida', match.competition, match.venue].filter(Boolean).join(' · ')}
                      </p>
                      {result ? (
                        <p className={styles.result}>
                          <strong className="tabular">{result}</strong> em sets
                          {outcome && <span className={`${styles.outcome} ${styles[outcome]}`}>{OUTCOME_LABEL[outcome]}</span>}
                        </p>
                      ) : state.sets.length > 0 ? (
                        <p className={styles.result}>
                          Sets: <strong className="tabular">{state.setsUs} x {state.setsThem}</strong>
                        </p>
                      ) : (
                        <p className={styles.meta}>Nenhum set iniciado.</p>
                      )}
                      {state.sets.length > 0 && <p className={`${styles.meta} tabular`}>{setScoresText(state)}</p>}
                      <p className={styles.format}>{formatSummary(match)}</p>
                      <div className={styles.actions}>
                        {canWrite && !done && (
                          <ButtonLink to={PATHS.liveMatch(match.id)} variant="primary" icon="plus">
                            {match.status === 'agendada' ? 'Iniciar' : 'Acompanhar'}
                          </ButtonLink>
                        )}
                        <ButtonLink to={PATHS.match(match.id)} variant={canWrite && !done ? 'secondary' : 'primary'}>
                          Detalhes
                        </ButtonLink>
                        <Can to="matches:write">
                          <ButtonLink to={PATHS.editMatch(match.id)} variant="ghost" icon="edit" aria-label={`Editar partida contra ${match.opponent}`}>
                            Editar
                          </ButtonLink>
                        </Can>
                        {confirming !== match.id && (
                          <Can to="matches:delete">
                            <Button variant="ghost" icon="trash" aria-label={`Excluir partida contra ${match.opponent}`} onClick={() => setConfirming(match.id)}>
                              Excluir
                            </Button>
                          </Can>
                        )}
                      </div>
                      {confirming === match.id && (
                        <div className={styles.confirm}>
                          <Notice tone="warning" title={`Excluir a partida contra ${match.opponent}?`}>
                            Serão apagados {state.sets.length} {state.sets.length === 1 ? 'set' : 'sets'},{' '}
                            {data.rallies.filter((r) => r.matchId === match.id && r.voidedAt === null).length} pontos e{' '}
                            {data.rallyActions.filter((a) => a.matchId === match.id && a.voidedAt === null).length} ações técnicas desta partida. Isso não
                            pode ser desfeito
                            {backend === 'local' ? ' pelo aplicativo, mas a cópia de segurança automática guarda o estado anterior.' : '.'}
                          </Notice>
                          <div className={styles.actions}>
                            <Button variant="danger" icon="trash" disabled={busy} onClick={() => void remove(match)}>
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
        </>
      )}

      <p className={styles.footnote}>
        {backend === 'remote'
          ? 'As partidas ficam salvas no servidor da equipe (nuvem).'
          : 'As partidas ficam salvas só neste navegador (armazenamento local), sem sincronização com a nuvem.'}
      </p>
    </>
  );
}
