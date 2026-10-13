import { useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Can, useCan } from '@/auth/AccessContext';
import { PATHS } from '@/app/routes';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConnectionNotice, useCloudOffline } from '@/components/ui/ConnectionNotice';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { useWorkspace } from '@/data/WorkspaceProvider';
import { FUNDAMENTALS, FUNDAMENTAL_LABEL, OUTCOME_VALUES, isFundamental, outcomeLabel, type Fundamental } from '@/domain/fundamentals';
import { newId } from '@/domain/id';
import {
  RALLY_REASONS,
  courtPositions,
  nextContext,
  setterPosition,
  planConclude,
  reasonLabel,
  reasonProblem,
  type RallyReason,
  type Side,
} from '@/domain/match';
import { shortName, type Player } from '@/domain/player';
import { useWakeLock } from '@/pwa/hooks';
import { RotationCourt } from './RotationCourt';
import { SetStartPanel } from './SetStartPanel';
import { rallyDescription, runningScores } from './rallyText';
import { stateFor } from './matchView';
import styles from './MatchLivePage.module.css';

const HISTORY_SIZE = 8;
const TOAST_MS = 3500;

interface Toast {
  kind: 'ok' | 'error';
  text: string;
}

export function MatchLivePage() {
  useWakeLock(); // a tela não apaga durante o jogo
  const { matchId } = useParams();
  const { data, actions } = useWorkspace();
  const canWrite = useCan('matches:write');
  const match = data.matches.find((m) => m.id === matchId);
  const playersById = useMemo(() => new Map(data.players.map((p) => [p.id, p])), [data.players]);

  const [involvedId, setInvolvedId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const offline = useCloudOffline();
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | null>(null);
  const [concluding, setConcluding] = useState(false);
  const [detailPlayer, setDetailPlayer] = useState('');
  const [detailFundamental, setDetailFundamental] = useState<Fundamental>('saque');

  /** Sucesso some sozinho; ERRO fica até o próximo aviso: num ginásio barulhento ninguém pode achar que o ponto entrou. */
  const showToast = (next: Toast) => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = next.kind === 'error' ? null : window.setTimeout(() => setToast(null), TOAST_MS);
  };

  if (!match) {
    return (
      <>
        <PageHeader title="Acompanhar partida" back={{ to: PATHS.matches, label: 'Partidas' }} />
        <EmptyState icon="court" title="Partida não encontrada" action={<ButtonLink to={PATHS.matches}>Voltar às partidas</ButtonLink>}>
          Esta partida não existe mais ou o endereço está incorreto.
        </EmptyState>
      </>
    );
  }

  const state = stateFor(match, data.matchSets, data.rallies);
  const current = state.current;
  const header = (
    <PageHeader compact title={`Alpha7 x ${match.opponent}`} subtitle={match.competition || 'Acompanhamento da partida'} back={{ to: PATHS.match(match.id), label: 'Detalhes da partida' }} />
  );

  /** Um toque por vez: enquanto uma gravação não termina, os outros toques são ignorados (nada duplica). */
  const guarded = async (work: () => Promise<void>, success?: string) => {
    if (inFlight.current) return;
    if (offline) {
      showToast({ kind: 'error', text: 'Sem conexão com a nuvem: nada foi gravado. Espere a conexão voltar.' });
      return;
    }
    inFlight.current = true;
    setPending(true);
    try {
      await work();
      if (success) showToast({ kind: 'ok', text: success });
    } catch (error) {
      showToast({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível concluir.' });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  if (match.status === 'concluida') {
    return (
      <>
        {header}
        <Notice
          tone="info"
          title="Esta partida está concluída"
          action={
            <Can to="matches:reopen">
              <Button disabled={pending} onClick={() => void guarded(async () => void (await actions.reopenMatch(match.id)), 'Partida reaberta.')}>
                Reabrir para corrigir
              </Button>
            </Can>
          }
        >
          O resultado ficou em {match.finalSetsUs} x {match.finalSetsThem} em sets. Para não alterar um jogo encerrado por engano, o registro está bloqueado.
        </Notice>
        {toast && <Notice tone={toast.kind === 'error' ? 'error' : 'success'}>{toast.text}</Notice>}
        <div>
          <ButtonLink to={PATHS.match(match.id)} variant="primary">
            Ver detalhes
          </ButtonLink>
        </div>
      </>
    );
  }

  if (!canWrite) {
    return (
      <>
        {header}
        <Notice tone="warning" title="Seu papel não permite registrar pontos">
          Você pode acompanhar o resultado nos detalhes da partida.
        </Notice>
        <ButtonLink to={PATHS.match(match.id)} variant="primary">
          Ver detalhes
        </ButtonLink>
      </>
    );
  }

  const open = current !== null && !current.closed;
  const context = open && current ? nextContext(current) : null;
  const onCourt = open && current && context ? courtPositions(current.set, context.rotation) : [];
  const liberoPlayer = current?.set.liberoId ? playersById.get(current.set.liberoId) : undefined;
  const involvable: Player[] = [
    ...onCourt.flatMap((s) => {
      const p = playersById.get(s.playerId);
      return p ? [p] : [];
    }),
    ...(liberoPlayer ? [liberoPlayer] : []),
  ];
  const label = (p: Player) => `${shortName(p.name)} #${p.jerseyNumber}`;
  const activeAll = state.sets.flatMap((s) => s.rallies);
  const lastRally = state.lastRally;
  const startedEmpty = current !== null && !data.rallies.some((r) => r.matchId === match.id && r.setNumber === current.set.number);
  const conclusion = planConclude(state);

  const record = (winner: Side, reason: RallyReason | null) => {
    if (!current || !context) return;
    const involved = involvedId;
    void guarded(async () => {
      const rally = await actions.recordRally(match.id, {
        setNumber: current.set.number,
        expectedSeq: context.seq,
        winner,
        reason,
        playerId: involved,
        attemptKey: newId('attempt'), // uma chave por toque: repetir o MESMO envio nunca duplica
        actions: [],
      });
      setInvolvedId(null);
      showToast({ kind: 'ok', text: `Ponto ${rally.seq}: ${rallyDescription(rally, playersById)}` });
      navigator.vibrate?.(12);
    });
  };

  const undo = () =>
    void guarded(async () => {
      await actions.undoLastRally(match.id);
    }, 'Último ponto desfeito.');

  const reasonButtons = (winner: Side) =>
    RALLY_REASONS.filter((reason) => context && reasonProblem(reason, winner, context.servingSide) === null).map((reason) => (
      <button
        key={reason}
        type="button"
        className={`${styles.reason} ${winner === 'us' ? styles.us : styles.them}`}
        disabled={pending || offline}
        onClick={() => record(winner, reason)}
      >
        {reasonLabel(reason, winner)}
      </button>
    ));

  const lastActions = lastRally ? data.rallyActions.filter((a) => a.rallyId === lastRally.id && a.voidedAt === null) : [];

  const addDetail = (outcome: string) => {
    if (!lastRally || detailPlayer === '') return;
    void guarded(async () => {
      await actions.addRallyAction(lastRally.id, { playerId: detailPlayer, fundamental: detailFundamental, outcome, attemptKey: newId('attempt') });
    }, 'Ação técnica registrada.');
  };

  const conclude = () =>
    void guarded(async () => {
      await actions.concludeMatch(match.id);
      setConcluding(false);
    }, 'Partida encerrada.');

  const history = (current?.rallies ?? []).slice(-HISTORY_SIZE).reverse();
  const scores = current ? runningScores(current.rallies) : new Map<string, string>();

  return (
    <>
      {header}

      <ConnectionNotice />

      <div className={styles.toastArea} aria-live="polite">
        {toast && (
          <p className={`${styles.toast} ${toast.kind === 'error' ? styles.toastError : ''}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
            {toast.text}
          </p>
        )}
      </div>

      <section className={styles.board} aria-label="Placar">
        <div className={styles.sets}>
          <span>Sets</span>
          <strong className="tabular">
            {state.setsUs} x {state.setsThem}
          </strong>
          <small>
            {match.format.bestOf === 1 ? 'Set único' : `Melhor de ${match.format.bestOf}`}
          </small>
        </div>
        <div className={styles.scoreRow}>
          <div className={`${styles.team} ${context?.servingSide === 'us' ? styles.serving : ''}`}>
            <span className={styles.teamName}>Alpha7</span>
            <strong className={`${styles.points} tabular`} aria-label={`Alpha7: ${current?.score.us ?? 0} pontos`}>
              {current?.score.us ?? 0}
            </strong>
            {context?.servingSide === 'us' && <span className={styles.ball}>Saque</span>}
          </div>
          <div className={styles.versus}>
            {current ? `Set ${current.set.number}` : 'Sem set'}
            {current && <small>até {current.target}, diferença de {match.format.minLead}</small>}
          </div>
          <div className={`${styles.team} ${context?.servingSide === 'them' ? styles.serving : ''}`}>
            <span className={styles.teamName}>{shortName(match.opponent)}</span>
            <strong className={`${styles.points} tabular`} aria-label={`${match.opponent}: ${current?.score.them ?? 0} pontos`}>
              {current?.score.them ?? 0}
            </strong>
            {context?.servingSide === 'them' && <span className={styles.ball}>Saque</span>}
          </div>
        </div>
        {current && context && open && (
          <p className={styles.rotationLine}>
            <strong>Rotação {(context.rotation % 6) + 1}</strong>
            {context.servingSide === 'us' && context.serverPlayerId && playersById.get(context.serverPlayerId)
              ? ` · saca ${label(playersById.get(context.serverPlayerId) as Player)}`
              : ' · adversário saca'}
            {setterPosition(current.set, context.rotation) !== null && ` · levantador em P${setterPosition(current.set, context.rotation)}`}
          </p>
        )}
      </section>

      {current?.closed && (
        <Notice
          tone="success"
          title={`Set ${current.set.number} encerrado: ${current.score.us} x ${current.score.them}`}
          action={
            <Button icon="back" disabled={pending || !lastRally} onClick={undo}>
              Desfazer último ponto
            </Button>
          }
        >
          {current.winner === 'us' ? 'O Alpha7 venceu o set.' : 'O adversário venceu o set.'}{' '}
          {state.decided ? 'O formato já decidiu a partida: confirme o encerramento.' : 'Inicie o próximo set quando as equipes estiverem prontas.'} Se foi um engano, desfaça o último
          ponto.
        </Notice>
      )}

      {state.nextSetNumber !== null && (
        <SetStartPanel
          key={state.nextSetNumber}
          match={match}
          number={state.nextSetNumber}
          players={data.players}
          lineups={data.lineups}
          previousSet={current?.set ?? null}
          onStart={async (input) => {
            await actions.startMatchSet(match.id, input);
            showToast({ kind: 'ok', text: `Set ${state.nextSetNumber} iniciado.` });
          }}
        />
      )}

      {open && current && context && (
        <div className={styles.layout}>
          <div className={styles.main}>
            <Card title="Quem ganhou o ponto?">
              <p className={styles.help}>
                Um toque registra o ponto. Escolha o motivo se souber; o atleta envolvido é opcional e vale só para o próximo ponto.
              </p>
              <div className={styles.involved} role="group" aria-label="Atleta envolvido no próximo ponto (opcional)">
                <span className={styles.involvedLabel}>Atleta envolvido (opcional)</span>
                <div className={styles.chips}>
                  {involvable.map((p) => (
                    <Chip key={p.id} pressed={involvedId === p.id} onClick={() => setInvolvedId((id) => (id === p.id ? null : p.id))}>
                      {label(p)}
                    </Chip>
                  ))}
                </div>
              </div>

              <div className={styles.sides}>
                <section className={styles.side} aria-label="Ponto do Alpha7">
                  <button type="button" className={`${styles.big} ${styles.us}`} disabled={pending || offline} onClick={() => record('us', null)}>
                    Ponto do Alpha7
                  </button>
                  <div className={styles.reasons}>{reasonButtons('us')}</div>
                </section>
                <section className={styles.side} aria-label="Ponto do adversário">
                  <button type="button" className={`${styles.big} ${styles.them}`} disabled={pending || offline} onClick={() => record('them', null)}>
                    Ponto do adversário
                  </button>
                  <div className={styles.reasons}>{reasonButtons('them')}</div>
                </section>
              </div>

              <div className={styles.controls}>
                <Button icon="back" disabled={pending || !lastRally} onClick={undo}>
                  Desfazer último ponto
                </Button>
                {lastRally && <span className={styles.muted}>{`Ponto ${lastRally.seq}: ${rallyDescription(lastRally, playersById)}`}</span>}
              </div>
            </Card>

            {lastRally && (
              <Card title="Detalhar o último ponto (opcional)">
                <details className={styles.details}>
                  <summary>Registrar fundamentos de um atleta neste ponto</summary>
                  <p className={styles.help}>
                    Uma ação técnica é um fundamento observado (saque, recepção, ataque…). Ela fica separada do motivo do ponto e não é obrigatória: o que
                    não for registrado aparece como “não registrado”, nunca como zero.
                  </p>
                  <div className={styles.detailGrid}>
                    <SelectField label="Atleta" value={detailPlayer} onChange={(event) => setDetailPlayer(event.target.value)}>
                      <option value="">Escolher…</option>
                      {[...data.players]
                        .sort((a, b) => a.jerseyNumber - b.jerseyNumber)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {label(p)}
                          </option>
                        ))}
                    </SelectField>
                    <SelectField
                      label="Fundamento"
                      value={detailFundamental}
                      onChange={(event) => setDetailFundamental(isFundamental(event.target.value) ? event.target.value : 'saque')}
                    >
                      {FUNDAMENTALS.map((f) => (
                        <option key={f} value={f}>
                          {FUNDAMENTAL_LABEL[f]}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                  <div className={styles.outcomes} role="group" aria-label="Resultado do fundamento">
                    {(OUTCOME_VALUES[detailFundamental] as readonly string[]).map((outcome) => (
                      <Button key={outcome} disabled={pending || detailPlayer === ''} onClick={() => addDetail(outcome)}>
                        {outcomeLabel(detailFundamental, outcome)}
                      </Button>
                    ))}
                  </div>
                </details>
                {lastActions.length > 0 && (
                  <ul className={styles.actionList} aria-label="Ações técnicas do último ponto">
                    {lastActions.map((a) => {
                      const p = playersById.get(a.playerId);
                      return (
                        <li key={a.id}>
                          <span>
                            {p ? label(p) : 'Atleta'} · {FUNDAMENTAL_LABEL[a.fundamental]}: {outcomeLabel(a.fundamental, a.outcome)}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Desfazer ação técnica de ${p ? label(p) : 'atleta'}`}
                            disabled={pending}
                            onClick={() => void guarded(async () => actions.undoRallyAction(a.id), 'Ação técnica desfeita.')}
                          >
                            Desfazer
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            )}
          </div>

          <aside className={styles.sideCol}>
            <Card title="Rotação atual">
              <RotationCourt set={current.set} rotation={context.rotation} servingSide={context.servingSide} playersById={playersById} />
              {context.servingSide === 'us' && context.serverPlayerId && playersById.get(context.serverPlayerId) && (
                <p className={styles.muted}>Saca agora: {label(playersById.get(context.serverPlayerId) as Player)}.</p>
              )}
              {context.servingSide === 'them' && <p className={styles.muted}>O adversário saca. Se o Alpha7 ganhar o ponto, conquista o saque e gira.</p>}
            </Card>
            <Card title="Últimos pontos">
              {history.length === 0 ? (
                <p className={styles.muted}>Nenhum ponto neste set ainda.</p>
              ) : (
                <ol className={styles.history}>
                  {history.map((r) => (
                    <li key={r.id}>
                      <span className="tabular">{scores.get(r.id)}</span>
                      <span>{rallyDescription(r, playersById)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </aside>
        </div>
      )}

      <Card title="Encerrar">
        <div className={styles.endRow}>
          {startedEmpty && current && (
            <Button disabled={pending} onClick={() => void guarded(async () => actions.cancelEmptySet(match.id, current.set.number), 'Início do set cancelado.')}>
              Cancelar o início do set {current.set.number}
            </Button>
          )}
          {activeAll.length > 0 || state.sets.length > 0 ? (
            !concluding ? (
              <Button variant={state.decided ? 'primary' : 'secondary'} icon="check" onClick={() => setConcluding(true)}>
                Encerrar partida
              </Button>
            ) : null
          ) : (
            <span className={styles.muted}>Inicie um set para poder encerrar a partida.</span>
          )}
        </div>
        {concluding && conclusion.ok && (
          <div className={styles.confirm}>
            <Notice tone={conclusion.value.unfinishedSet || !conclusion.value.decided ? 'warning' : 'info'} title="Confirmar o encerramento da partida?">
              Resultado em sets: <strong>{conclusion.value.finalSetsUs} x {conclusion.value.finalSetsThem}</strong>.
              {conclusion.value.unfinishedSet &&
                ` O set ${conclusion.value.unfinishedSet.set.number} está em andamento (${conclusion.value.unfinishedSet.score.us} x ${conclusion.value.unfinishedSet.score.them}) e não entra no resultado.`}
              {!conclusion.value.decided && ' O formato ainda não decidiu a partida: ela será encerrada antes da hora.'} Depois de encerrada, só a comissão técnica pode reabrir para
              corrigir.
            </Notice>
            <div className={styles.endRow}>
              <Button variant="primary" icon="check" disabled={pending} onClick={conclude}>
                Confirmar encerramento
              </Button>
              <Button variant="ghost" onClick={() => setConcluding(false)}>
                Voltar
              </Button>
            </div>
          </div>
        )}
        {concluding && !conclusion.ok && <Notice tone="warning">{conclusion.reason}</Notice>}
      </Card>
    </>
  );
}

