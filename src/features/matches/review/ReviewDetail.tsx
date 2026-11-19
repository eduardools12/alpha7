import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useCloudOffline } from '@/components/ui/ConnectionNotice';
import { SelectField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { useWorkspace } from '@/data/WorkspaceProvider';
import { FUNDAMENTALS, FUNDAMENTAL_LABEL, OUTCOME_VALUES, isFundamental, outcomeLabel, type Fundamental } from '@/domain/fundamentals';
import { newId } from '@/domain/id';
import type { Match, Rally } from '@/domain/match';
import type { Player } from '@/domain/player';
import { rallyDescription } from '../rallyText';
import styles from './MatchReviewPage.module.css';

interface Props {
  match: Match;
  rally: Rally;
  /** Placar depois do ponto ("2 x 1"), só para o título. */
  score: string;
  roster: readonly Player[];
  playerLabels: ReadonlyMap<string, string>;
  playersById: ReadonlyMap<string, Player>;
  /** Atletas das trilhas associadas que aparecem no quadro atual do vídeo: SUGESTÃO, quem confirma é a pessoa. */
  suggested: readonly string[];
  onClose(): void;
}

/**
 * Detalhar um ponto qualquer da partida com as ações técnicas que já existem (atleta, fundamento, resultado) vendo o vídeo. A ação
 * é uma camada separada do motivo do ponto e do atleta do ponto: nada é criado sozinho, nem a partir das trilhas.
 */
export function ReviewDetail({ match, rally, score, roster, playerLabels, playersById, suggested, onClose }: Props) {
  const { data, actions } = useWorkspace();
  const offline = useCloudOffline();
  const [playerId, setPlayerId] = useState('');
  const [fundamental, setFundamental] = useState<Fundamental>('saque');
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const inFlight = useRef(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  const concluded = match.status === 'concluida';
  const locked = concluded || offline;
  // Ao abrir (ou trocar de ponto) o foco vai para o painel: teclado e leitor de tela chegam nele.
  useEffect(() => {
    sectionRef.current?.focus();
    sectionRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [rally.id]);
  const recorded = data.rallyActions.filter((a) => a.rallyId === rally.id && a.voidedAt === null);

  /** Um toque por vez: enquanto uma gravação não termina, os outros são ignorados (nada duplica). */
  const guarded = async (work: () => Promise<void>, success: string) => {
    if (inFlight.current) return;
    if (offline) {
      setFeedback({ kind: 'error', text: 'Sem conexão com a nuvem: nada foi gravado. Espere a conexão voltar.' });
      return;
    }
    inFlight.current = true;
    setPending(true);
    try {
      await work();
      setFeedback({ kind: 'ok', text: success });
    } catch (error) {
      setFeedback({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível concluir.' });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  const add = (outcome: string) => {
    if (playerId === '') return;
    void guarded(async () => void (await actions.addRallyAction(rally.id, { playerId, fundamental, outcome, attemptKey: newId('attempt') })), 'Ação técnica registrada.');
  };

  return (
    <section aria-label="Detalhar o ponto" ref={sectionRef} tabIndex={-1} className={styles.detailPanel}>
      <Card title={`Detalhar o ponto ${score}`}>
        <p className={styles.muted}>{`Set ${rally.setNumber} · ${rallyDescription(rally, playersById)}`}</p>
        <p className={styles.muted}>
          Uma ação técnica é um fundamento observado (saque, recepção, ataque…). Ela fica separada do motivo do ponto e não é obrigatória: o que não for
          registrado aparece como “não registrado”, nunca como zero.
        </p>
        {concluded && (
          <Notice tone="info" title="Esta partida está concluída">
            Reabra a partida nos detalhes dela para registrar ou desfazer ações técnicas.
          </Notice>
        )}
        <div className={styles.detail}>
          <div role="group" aria-label="Atletas nas caixas deste instante" className={styles.group}>
            {suggested.map((id) => (
              <Button key={id} aria-pressed={playerId === id} variant={playerId === id ? 'primary' : 'secondary'} disabled={locked} onClick={() => setPlayerId(id)}>
                {playerLabels.get(id) ?? 'Atleta'}
              </Button>
            ))}
          </div>
          {suggested.length === 0 ? (
            <p className={styles.muted}>Associe trilhas a atletas e pare o vídeo num instante com caixas para ver aqui quem está no quadro.</p>
          ) : (
            <p className={styles.muted}>Sugestão pelas caixas deste instante do vídeo. Confira antes de registrar.</p>
          )}
          <SelectField label="Atleta" value={playerId} disabled={locked} onChange={(event) => setPlayerId(event.target.value)}>
            <option value="">Escolher…</option>
            {roster.map((p) => (
              <option key={p.id} value={p.id}>
                {playerLabels.get(p.id)}
              </option>
            ))}
          </SelectField>
          <SelectField label="Fundamento" value={fundamental} disabled={locked} onChange={(event) => setFundamental(isFundamental(event.target.value) ? event.target.value : 'saque')}>
            {FUNDAMENTALS.map((f) => (
              <option key={f} value={f}>
                {FUNDAMENTAL_LABEL[f]}
              </option>
            ))}
          </SelectField>
          <div className={styles.group} role="group" aria-label="Resultado do fundamento">
            {(OUTCOME_VALUES[fundamental] as readonly string[]).map((outcome) => (
              <Button key={outcome} disabled={locked || pending || playerId === ''} onClick={() => add(outcome)}>
                {outcomeLabel(fundamental, outcome)}
              </Button>
            ))}
          </div>
        </div>
        {feedback && (
          <p role={feedback.kind === 'error' ? 'alert' : 'status'} className={feedback.kind === 'error' ? styles.error : styles.muted}>
            {feedback.text}
          </p>
        )}
        {recorded.length === 0 ? (
          <p className={styles.muted}>Nenhuma ação técnica registrada neste ponto.</p>
        ) : (
          <ul className={styles.actionList} aria-label="Ações técnicas do ponto">
            {recorded.map((a) => {
              const label = playerLabels.get(a.playerId) ?? 'Atleta';
              return (
                <li key={a.id}>
                  <span>{`${label} · ${FUNDAMENTAL_LABEL[a.fundamental]}: ${outcomeLabel(a.fundamental, a.outcome)}`}</span>
                  <Button size="sm" variant="ghost" aria-label={`Desfazer ação técnica de ${label}`} disabled={locked || pending} onClick={() => void guarded(() => actions.undoRallyAction(a.id), 'Ação técnica desfeita.')}>
                    Desfazer
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <div className={styles.group}>
          <Button onClick={onClose}>Fechar</Button>
        </div>
      </Card>
    </section>
  );
}
