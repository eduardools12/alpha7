import { Can } from '@/auth/AccessContext';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PATHS } from '@/app/routes';
import { Jersey } from '@/components/brand/Jersey';
import { PlayerPhoto } from '@/components/brand/PlayerPhoto';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConnectionNotice, useCloudOffline } from '@/components/ui/ConnectionNotice';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { useWorkspace } from '@/data/WorkspaceProvider';
import {
  FUNDAMENTALS,
  FUNDAMENTAL_LABEL,
  OUTCOME_INFO,
  OUTCOME_VALUES,
  outcomeLabel,
  type Fundamental,
  type OutcomeInfo,
} from '@/domain/fundamentals';
import { newId } from '@/domain/id';
import { shortName, type Player } from '@/domain/player';
import { lastValidEvent, recentValidEvents, validEvents, type TrainingEvent } from '@/domain/training';
import { formatClock, playerLabel } from './trainingFormat';
import styles from './TrainingRecordPage.module.css';
import { useWakeLock } from '@/pwa/hooks';

/** Impede toques repetidos acidentais: depois de registrar, os botões ficam bloqueados por um instante. */
const LOCK_MS = 350;
const TOAST_MS = 3500;
const HISTORY_SIZE = 6;

interface Toast {
  text: string;
  kind: 'registered' | 'undone' | 'error';
}

export function TrainingRecordPage() {
  useWakeLock(); // a tela não apaga durante o registro
  const { trainingId } = useParams();
  const { data, actions } = useWorkspace();
  const training = data.trainings.find((t) => t.id === trainingId);
  const exercises = useMemo(
    () => data.exercises.filter((e) => e.trainingId === trainingId).sort((a, b) => a.order - b.order),
    [data.exercises, trainingId],
  );
  const playersById = useMemo(() => new Map(data.players.map((p) => [p.id, p])), [data.players]);
  const participants = useMemo(
    () =>
      (training?.participantIds ?? [])
        .map((id) => playersById.get(id))
        .filter((p): p is Player => p !== undefined)
        .sort((a, b) => a.jerseyNumber - b.jerseyNumber),
    [training?.participantIds, playersById],
  );

  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [fundamental, setFundamental] = useState<Fundamental>('saque');
  const [locked, setLocked] = useState(false);
  const offline = useCloudOffline();
  const [pressed, setPressed] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const timers = useRef<number[]>([]);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((id) => window.clearTimeout(id));
  }, []);

  // Exercício atual: o escolhido, ou o primeiro (e seu foco) enquanto nada foi escolhido.
  const currentExercise = exercises.find((e) => e.id === exerciseId) ?? exercises[0];
  const currentFundamental: Fundamental =
    exerciseId === null && currentExercise?.focus ? currentExercise.focus : fundamental;
  const currentPlayer = participants.find((p) => p.id === playerId) ?? null;

  if (!training) {
    return (
      <>
        <PageHeader title="Registrar treino" back={{ to: PATHS.trainings, label: 'Treinos' }} />
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

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  /** Sucesso some sozinho (um aviso novo reinicia a contagem); ERRO fica até o próximo aviso, para ninguém achar que o registro entrou. */
  const showToast = (next: Toast) => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    setToast(next);
    if (next.kind === 'error') {
      toastTimer.current = null;
      return;
    }
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS);
    timers.current.push(toastTimer.current);
  };

  const header = (
    <PageHeader
      compact
      title="Registrar treino"
      subtitle={training.name}
      back={{ to: PATHS.training(training.id), label: 'Resumo do treino' }}
    />
  );

  if (training.status !== 'aberto') {
    return (
      <>
        {header}
        <Notice
          tone="info"
          title="Este treino está concluído"
          action={
            <Button
              onClick={() => {
                void actions.setTrainingStatus(training.id, 'aberto').catch((error: unknown) =>
                  showToast({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível reabrir.' }),
                );
              }}
            >
              Reabrir para registrar
            </Button>
          }
        >
          Para não alterar um treino já fechado por engano, o registro está bloqueado. Reabra o treino ou veja o resumo.
        </Notice>
        {toast && <Notice tone="error">{toast.text}</Notice>}
        <div>
          <ButtonLink to={PATHS.training(training.id)} variant="primary">
            Ver resumo
          </ButtonLink>
        </div>
      </>
    );
  }

  if (exercises.length === 0 || participants.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon="list"
          title={exercises.length === 0 ? 'Adicione um exercício para registrar' : 'Escolha os participantes para registrar'}
          action={
            <Can to="trainings:write"><ButtonLink to={PATHS.editTraining(training.id)} variant="primary" icon="edit">
              Editar treino
            </ButtonLink></Can>
          }
        >
          {exercises.length === 0
            ? 'Cada registro pertence a um exercício do treino. Crie ao menos um na edição do treino.'
            : 'Só os atletas escolhidos como participantes podem receber registros.'}
        </EmptyState>
      </>
    );
  }

  const events = data.trainingEvents;
  const validOfTraining = validEvents(events.filter((e) => e.trainingId === training.id));
  const attemptsForSelection = currentPlayer
    ? validOfTraining.filter(
        (e) =>
          e.playerId === currentPlayer.id && e.exerciseId === currentExercise?.id && e.fundamental === currentFundamental,
      )
    : [];
  const outcomes = OUTCOME_VALUES[currentFundamental] as readonly string[];
  const infoOf = (outcome: string): OutcomeInfo =>
    (OUTCOME_INFO[currentFundamental] as Record<string, OutcomeInfo>)[outcome] as OutcomeInfo;
  const last = lastValidEvent(events, training.id);
  const recent = recentValidEvents(events, training.id, HISTORY_SIZE);
  const exerciseName = (id: string) => exercises.find((e) => e.id === id)?.name ?? 'Exercício removido';
  const describe = (event: TrainingEvent) =>
    `${playerLabel(playersById.get(event.playerId))} · ${FUNDAMENTAL_LABEL[event.fundamental]} ${outcomeLabel(event.fundamental, event.outcome)}`;

  const lockBriefly = () => {
    setLocked(true);
    later(() => setLocked(false), LOCK_MS);
  };

  const record = async (outcome: string) => {
    if (locked || !currentPlayer || !currentExercise) return;
    if (offline) {
      showToast({ kind: 'error', text: 'Sem conexão com a nuvem: nada foi registrado. Espere a conexão voltar.' });
      return;
    }
    lockBriefly();
    try {
      const event = await actions.recordTrainingEvent({
        trainingId: training.id,
        exerciseId: currentExercise.id,
        playerId: currentPlayer.id,
        fundamental: currentFundamental,
        outcome,
        attemptKey: newId('attempt'), // uma chave por toque: repetir o MESMO envio nunca duplica
      });
      showToast({ kind: 'registered', text: `Registrado: ${describe(event)}` });
      setPressed(outcome);
      later(() => setPressed(null), 700);
      navigator.vibrate?.(12);
    } catch (error) {
      showToast({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível registrar.' });
    }
  };

  const undo = async () => {
    if (locked || !last) return;
    if (offline) {
      showToast({ kind: 'error', text: 'Sem conexão com a nuvem: nada foi desfeito. Espere a conexão voltar.' });
      return;
    }
    lockBriefly();
    try {
      await actions.undoTrainingEvent(last.id); // por id: um toque repetido não desfaz o registro anterior
      showToast({ kind: 'undone', text: `Desfeito: ${describe(last)}` });
    } catch (error) {
      showToast({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível desfazer.' });
    }
  };

  return (
    <>
      {header}

      <ConnectionNotice />

      {/* Feedback de cada registro: fixo no topo da rolagem para ficar visível perto dos botões. */}
      <div className={styles.toast} role="status" aria-live="polite">
        {toast && (
          <p className={`${styles.toastText} ${styles[toast.kind]}`} key={`${toast.kind}-${toast.text}`}>
            {toast.text}
          </p>
        )}
      </div>

      <div className={styles.layout}>
        <div className={styles.controls}>
          <section aria-labelledby="sec-exercicio" className={styles.section}>
            <h2 id="sec-exercicio" className={styles.label}>
              Exercício atual
            </h2>
            <div className={styles.scroller} role="group" aria-labelledby="sec-exercicio">
              {exercises.map((exercise) => (
                <button
                  key={exercise.id}
                  type="button"
                  className={styles.pill}
                  aria-pressed={currentExercise?.id === exercise.id}
                  onClick={() => {
                    setExerciseId(exercise.id);
                    // Exercício com foco troca o fundamento; sem foco, mantém o que já está em uso.
                    setFundamental(exercise.focus ?? currentFundamental);
                  }}
                >
                  {exercise.name}
                  {exercise.focus && <small>{FUNDAMENTAL_LABEL[exercise.focus]}</small>}
                </button>
              ))}
            </div>
          </section>

          <section aria-labelledby="sec-jogador" className={styles.section}>
            <h2 id="sec-jogador" className={styles.label}>
              Jogador
            </h2>
            <div className={styles.scroller} role="group" aria-labelledby="sec-jogador">
              {participants.map((player) => {
                const total = validOfTraining.filter((e) => e.playerId === player.id).length;
                return (
                  <button
                    key={player.id}
                    type="button"
                    className={styles.player}
                    aria-pressed={currentPlayer?.id === player.id}
                    aria-label={`${shortName(player.name)}, camisa ${player.jerseyNumber}, ${total} ${total === 1 ? 'registro' : 'registros'} neste treino`}
                    onClick={() => setPlayerId(player.id)}
                  >
                    <span className={styles.avatar}>
                      <PlayerPhoto player={player} fallback={<Jersey color={player.uniform} number={player.jerseyNumber} />} />
                    </span>
                    <span className={styles.playerName}>{shortName(player.name)}</span>
                    <span className={styles.playerCount} aria-hidden="true">
                      {total}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="sec-fundamento" className={styles.section}>
            <h2 id="sec-fundamento" className={styles.label}>
              Fundamento
            </h2>
            <div className={styles.scroller} role="group" aria-labelledby="sec-fundamento">
              {FUNDAMENTALS.map((f) => (
                <button
                  key={f}
                  type="button"
                  className={styles.pill}
                  aria-pressed={currentFundamental === f}
                  onClick={() => {
                    setFundamental(f);
                    setExerciseId(currentExercise?.id ?? null);
                  }}
                >
                  {FUNDAMENTAL_LABEL[f]}
                </button>
              ))}
            </div>
          </section>

          <section aria-labelledby="sec-resultado" className={`${styles.panel} ${currentPlayer ? styles.armed : ''}`}>
            <h2 id="sec-resultado" className={styles.label}>
              Resultado da tentativa
            </h2>
            <p className={styles.context} aria-live="polite">
              {currentPlayer ? (
                <>
                  Registrando para <strong>{playerLabel(currentPlayer)}</strong> · {FUNDAMENTAL_LABEL[currentFundamental]} ·{' '}
                  {currentExercise?.name}
                </>
              ) : (
                'Escolha um jogador para liberar os botões.'
              )}
            </p>
            <div className={styles.outcomes} data-count={outcomes.length}>
              {outcomes.map((outcome) => {
                const info = infoOf(outcome);
                return (
                  <button
                    key={outcome}
                    type="button"
                    className={`${styles.outcome} ${pressed === outcome ? styles.flash : ''}`}
                    data-tone={info.tone}
                    aria-label={`${info.label}, ${info.short}`}
                    disabled={!currentPlayer || locked || offline}
                    onClick={() => void record(outcome)}
                  >
                    <span className={styles.outcomeLabel}>{info.label}</span>
                    <span className={styles.outcomeShort}>{info.short}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Fora do painel fixo: o painel precisa ser baixo para não cobrir as listas no celular. */}
          <div className={styles.count} aria-live="polite">
            {currentPlayer ? (
              <>
                <p>
                  Tentativas de {FUNDAMENTAL_LABEL[currentFundamental]} neste exercício:{' '}
                  <strong className="tabular">{attemptsForSelection.length}</strong>
                </p>
                <ul className={styles.breakdown}>
                  {outcomes.map((outcome) => (
                    <li key={outcome}>
                      {infoOf(outcome).label} <b className="tabular">{attemptsForSelection.filter((e) => e.outcome === outcome).length}</b>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>Sem jogador selecionado.</p>
            )}
          </div>

          <details className={styles.criteria}>
            <summary>Critérios de {FUNDAMENTAL_LABEL[currentFundamental]}</summary>
            <dl>
              {outcomes.map((outcome) => (
                <div key={outcome}>
                  <dt>{infoOf(outcome).label}</dt>
                  <dd>{infoOf(outcome).criterion}</dd>
                </div>
              ))}
            </dl>
          </details>
        </div>

        <aside className={styles.side}>
          <Card title="Últimos registros" titleAside={<span className={styles.total}>{validOfTraining.length} no treino</span>}>
            {recent.length === 0 ? (
              <p className={styles.muted}>Nenhum registro ainda. Escolha o jogador e toque no resultado.</p>
            ) : (
              <ol className={styles.history}>
                {recent.map((event) => (
                  <li key={event.id}>
                    <span
                      className={styles.dot}
                      data-tone={(OUTCOME_INFO[event.fundamental] as Record<string, OutcomeInfo>)[event.outcome]?.tone}
                      aria-hidden="true"
                    />
                    <span className={styles.historyText}>
                      <strong>{describe(event)}</strong>
                      <small>
                        {exerciseName(event.exerciseId)} · {formatClock(event.recordedAt)}
                      </small>
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <Button variant="danger" icon="rotate" disabled={!last || locked || offline} onClick={() => void undo()}>
              Desfazer último registro
            </Button>
            {last && <p className={styles.muted}>Desfaz: {describe(last)}</p>}
          </Card>

          <div className={styles.footer}>
            <ButtonLink to={PATHS.training(training.id)}>Ver resumo</ButtonLink>
          </div>
        </aside>
      </div>
    </>
  );
}
