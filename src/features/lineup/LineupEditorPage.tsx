import { Can, useCan } from '@/auth/AccessContext';
import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { PATHS } from '@/app/routes';
import { Jersey } from '@/components/brand/Jersey';
import { PlayerPhoto } from '@/components/brand/PlayerPhoto';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField, TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/Badge';
import { useWorkspace } from '@/data/WorkspaceProvider';
import { buildPlayerCard } from '@/data/selectors';
import { newId } from '@/domain/id';
import {
  assignStarter,
  clearStarter,
  COURT_SLOTS,
  createEmptyLineup,
  defaultRoleFor,
  FORMATIONS,
  rotateStarters,
  roleInLineup,
  setLibero,
  setStarterRole,
  starterAt,
  starterCount,
  starterSlotOf,
  toggleBench,
  updateLineupMeta,
  validateLineup,
  type Lineup,
  type LineupMetaFields,
} from '@/domain/lineup';
import { shortName, type Player } from '@/domain/player';
import { isCourtRole, POSITION_LABEL } from '@/domain/positions';
import { CourtView, type Selection } from './CourtView';
import styles from './LineupEditorPage.module.css';

type Tab = 'titulares' | 'reservas';
const COURT_ROLES = ['levantador', 'oposto', 'ponteiro', 'central'] as const;

function describeRole(lineup: Lineup, playerId: string): string | null {
  const role = roleInLineup(lineup, playerId);
  if (role === 'titular') return `Titular em P${starterSlotOf(lineup, playerId)}`;
  if (role === 'libero') return 'Líbero';
  if (role === 'reserva') return 'Reserva';
  return null;
}

export function LineupEditorPage() {
  const { lineupId } = useParams();
  return <Editor key={lineupId ?? 'nova'} lineupId={lineupId} />;
}

function Editor({ lineupId }: { lineupId: string | undefined }) {
  const { data, actions } = useWorkspace();
  const canWrite = useCan('lineups:write');
  const navigate = useNavigate();
  const saved = lineupId ? data.lineups.find((l) => l.id === lineupId) : undefined;

  const [draft, setDraft] = useState<Lineup>(() =>
    saved ? structuredClone(saved) : createEmptyLineup(newId('lineup'), new Date().toISOString()),
  );
  const [snapshot, setSnapshot] = useState(() => JSON.stringify(draft));
  const [selection, setSelection] = useState<Selection>(null);
  const [tab, setTab] = useState<Tab>('titulares');
  const [rotation, setRotation] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // Ao salvar uma escalação nova a rota muda e o editor é remontado: a confirmação viaja no estado da navegação.
  const location = useLocation();
  const [justSaved, setJustSaved] = useState(() => (location.state as { saved?: boolean } | null)?.saved === true);

  const playersById = useMemo(() => new Map(data.players.map((p) => [p.id, p])), [data.players]);
  const sortedPlayers = useMemo(() => [...data.players].sort((a, b) => a.jerseyNumber - b.jerseyNumber), [data.players]);
  const report = useMemo(() => validateLineup(draft, data.players), [draft, data.players]);
  const dirty = JSON.stringify(draft) !== snapshot;
  const previewing = rotation !== 0;
  const displayed = useMemo(() => rotateStarters(draft.starters, rotation), [draft.starters, rotation]);
  const libero = draft.liberoId ? (playersById.get(draft.liberoId) ?? null) : null;

  if (lineupId && !saved) {
    return (
      <>
        <PageHeader title="Escalação" back={{ to: PATHS.lineups, label: 'Escalações' }} />
        <EmptyState
          icon="lineup"
          title="Escalação não encontrada"
          action={<ButtonLink to={PATHS.lineups}>Ver escalações salvas</ButtonLink>}
        >
          Esta escalação não existe mais ou o endereço está incorreto.
        </EmptyState>
      </>
    );
  }

  if (data.players.length === 0) {
    return (
      <>
        <PageHeader title="Montar escalação" back={{ to: PATHS.lineups, label: 'Escalações' }} />
        <EmptyState
          icon="users"
          title="Cadastre atletas antes de montar a escalação"
          action={
            <Can to="players:write"><ButtonLink to={PATHS.newPlayer} variant="primary" icon="plus">
              Adicionar jogador
            </ButtonLink></Can>
          }
        >
          A escalação usa os atletas do elenco.
        </EmptyState>
      </>
    );
  }

  const change = (next: Lineup) => {
    setDraft(next);
    setFeedback(null);
    setJustSaved(false);
  };

  const place = (player: Player) => {
    if (selection === null) return;
    if (selection === 'libero') {
      change(setLibero(draft, player.id));
      return;
    }
    const result = assignStarter(draft, selection, player);
    if (!result.ok) {
      setFeedback(result.reason);
      return;
    }
    change(result.lineup);
  };

  const onMeta = <K extends keyof LineupMetaFields>(field: K, value: LineupMetaFields[K]) =>
    change(updateLineupMeta(draft, { [field]: value }));

  const onSave = async () => {
    setSaving(true);
    setFailure(null);
    try {
      const result = await actions.saveLineup(draft);
      setDraft(result);
      setSnapshot(JSON.stringify(result));
      setJustSaved(true);
      if (!lineupId) navigate(PATHS.lineup(result.id), { replace: true, state: { saved: true } });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  const selectedStarter = typeof selection === 'number' ? starterAt(draft, selection) : null;
  const selectedPlayer = selectedStarter ? playersById.get(selectedStarter.playerId) : undefined;
  const hasErrors = report.errors.length > 0;

  return (
    <>
      <PageHeader
        title="Montar escalação"
        subtitle={draft.title || 'Sem nome'}
        back={{ to: PATHS.lineups, label: 'Escalações' }}
        actions={
          <>
            <Button disabled title="O gerador de artes ainda está em desenvolvimento">
              Gerar arte (em breve)
            </Button>
            <Button
              variant="primary"
              icon="save"
              disabled={hasErrors || saving || !dirty || !canWrite}
              {...(canWrite ? {} : { title: 'Seu papel permite ver a escalação, mas não salvar' })}
              onClick={() => void onSave()}
            >
              {saving ? 'Salvando…' : 'Salvar escalação'}
            </Button>
          </>
        }
      />

      {failure && (
        <Notice tone="error" title="Não foi possível salvar">
          {failure}
        </Notice>
      )}
      {justSaved && !dirty && <Notice tone="success">Escalação salva.</Notice>}
      {dirty && <p className={styles.dirty}>Alterações ainda não salvas.</p>}

      <div className={styles.layout}>
        <div className={styles.main}>
          <Card title="Jogo">
            <div className={styles.meta}>
              <TextField
                label="Nome da escalação"
                value={draft.title}
                onChange={(event) => onMeta('title', event.target.value)}
              />
              <TextField label="Adversário" value={draft.opponent} onChange={(event) => onMeta('opponent', event.target.value)} />
              <TextField
                label="Campeonato"
                value={draft.competition}
                onChange={(event) => onMeta('competition', event.target.value)}
              />
              <TextField
                label="Data e hora"
                type="datetime-local"
                value={draft.scheduledAt}
                onChange={(event) => onMeta('scheduledAt', event.target.value)}
              />
              <TextField label="Local" value={draft.venue} onChange={(event) => onMeta('venue', event.target.value)} />
              <SelectField
                label="Formação"
                value={draft.formation}
                onChange={(event) => onMeta('formation', event.target.value as Lineup['formation'])}
              >
                {FORMATIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </SelectField>
            </div>
          </Card>

          <Card title="Quadra" titleAside={<span className={styles.counter}>{starterCount(draft)} de 6 titulares</span>}>
            {previewing && (
              <Notice tone="info" title={`Prévia do rodízio: ${rotation} de 5`}>
                Somente leitura. Mostra onde cada titular estaria depois de {rotation}{' '}
                {rotation === 1 ? 'rodízio' : 'rodízios'}.
              </Notice>
            )}
            <CourtView
              starters={displayed}
              libero={libero}
              playersById={playersById}
              selection={previewing ? null : selection}
              readOnly={previewing}
              onSelect={(next) => {
                setSelection(next);
                setTab('titulares');
                setFeedback(null);
              }}
            />
            <div className={styles.rotation}>
              <Button icon="rotate" onClick={() => setRotation((r) => (r + 1) % 6)} disabled={starterCount(draft) === 0}>
                Prévia do rodízio
              </Button>
              {previewing && (
                <Button variant="ghost" onClick={() => setRotation(0)}>
                  Voltar à formação inicial
                </Button>
              )}
            </div>
          </Card>
        </div>

        <aside className={styles.side}>
          <Card title="Painel de jogadores">
            <div role="tablist" aria-label="Painel de jogadores" className={styles.tabs}>
              {(['titulares', 'reservas'] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  type="button"
                  id={`tab-${t}`}
                  aria-selected={tab === t}
                  aria-controls={`painel-${t}`}
                  className={`${styles.tab} ${tab === t ? styles.tabOn : ''}`}
                  onClick={() => setTab(t)}
                >
                  {t === 'titulares' ? 'Titulares' : `Reservas (${draft.benchIds.length})`}
                </button>
              ))}
            </div>

            {feedback && (
              <Notice tone="warning">{feedback}</Notice>
            )}

            {tab === 'titulares' ? (
              <div role="tabpanel" id="painel-titulares" aria-labelledby="tab-titulares" className={styles.panel}>
                {selection === null ? (
                  <p className={styles.hint}>
                    Toque numa zona da quadra para escolher quem joga ali. Escolher alguém que já está na escalação o move
                    de lugar, sem duplicar.
                  </p>
                ) : (
                  <>
                    <h3 className={styles.panelTitle}>
                      {selection === 'libero' ? 'Escolher o líbero' : `Escolher o titular de P${selection}`}
                    </h3>

                    {selectedStarter && selectedPlayer && typeof selection === 'number' && (
                      <div className={styles.current}>
                        <p>
                          Em P{selection}: <strong>{shortName(selectedPlayer.name)}</strong>
                        </p>
                        <SelectField
                          label="Posição tática nesta escalação"
                          value={selectedStarter.role}
                          hint={`Posição habitual: ${POSITION_LABEL[selectedPlayer.primaryPosition]}.`}
                          onChange={(event) => {
                            if (isCourtRole(event.target.value)) change(setStarterRole(draft, selection, event.target.value));
                          }}
                        >
                          {COURT_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {POSITION_LABEL[r]}
                            </option>
                          ))}
                        </SelectField>
                        <Button variant="danger" size="sm" onClick={() => change(clearStarter(draft, selection))}>
                          Remover de P{selection}
                        </Button>
                      </div>
                    )}
                    {selection === 'libero' && libero && (
                      <div className={styles.current}>
                        <p>
                          Líbero atual: <strong>{shortName(libero.name)}</strong>
                        </p>
                        <Button variant="danger" size="sm" onClick={() => change(setLibero(draft, null))}>
                          Remover líbero
                        </Button>
                      </div>
                    )}

                    <ul className={styles.list}>
                      {sortedPlayers.map((player) => {
                        const card = buildPlayerCard(player, data.evaluations, data.settings.weights);
                        const where = describeRole(draft, player.id);
                        const blocked = selection !== 'libero' && defaultRoleFor(player) === null;
                        const here = selection === 'libero' ? draft.liberoId === player.id : starterSlotOf(draft, player.id) === selection;
                        return (
                          <li key={player.id} className={styles.item}>
                            {player.photo ? (
                              <PlayerPhoto player={player} variant="avatar" />
                            ) : (
                              <span className={styles.itemJersey}>
                                <Jersey color={player.uniform} number={player.jerseyNumber} />
                              </span>
                            )}
                            <span className={styles.itemText}>
                              <strong>
                                {shortName(player.name)} #{player.jerseyNumber}
                              </strong>
                              <span>
                                {POSITION_LABEL[player.primaryPosition]}
                                {card.overall !== null ? ` · Overall ${card.overall}` : ' · sem avaliação'}
                              </span>
                              <span className={styles.itemTags}>
                                {player.status !== 'ativo' && <StatusBadge status={player.status} />}
                                {where && <span className={styles.where}>{where}</span>}
                                {blocked && <span className={styles.where}>Só atua como líbero</span>}
                              </span>
                            </span>
                            <Button
                              size="sm"
                              variant={here ? 'ghost' : 'secondary'}
                              disabled={blocked || here}
                              aria-label={`${here ? 'Já está aqui' : 'Escolher'}: ${shortName(player.name)}`}
                              onClick={() => place(player)}
                            >
                              {here ? 'Aqui' : 'Escolher'}
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}

                <h3 className={styles.panelTitle}>Ordem de saque base</h3>
                <ol className={styles.serving}>
                  {COURT_SLOTS.map((slot) => {
                    const starter = starterAt(draft, slot);
                    const player = starter ? playersById.get(starter.playerId) : undefined;
                    return (
                      <li key={slot}>
                        <span className={styles.order}>{slot}º</span>
                        {player ? (
                          <span>
                            {shortName(player.name)} <small>P{slot} · {POSITION_LABEL[starter?.role ?? player.primaryPosition]}</small>
                          </span>
                        ) : (
                          <span className={styles.vacant}>P{slot} · vazio</span>
                        )}
                      </li>
                    );
                  })}
                </ol>
                <p className={styles.hint}>
                  O jogador de P1 saca primeiro. A cada rodízio, quem está em P2 vai para P1 e passa a sacar.
                </p>
              </div>
            ) : (
              <div role="tabpanel" id="painel-reservas" aria-labelledby="tab-reservas" className={styles.panel}>
                <p className={styles.hint}>Marque quem fica no banco. Titulares e o líbero não entram como reservas.</p>
                <ul className={styles.list}>
                  {sortedPlayers.map((player) => {
                    const onBench = draft.benchIds.includes(player.id);
                    const where = describeRole(draft, player.id);
                    const locked = where !== null && !onBench;
                    return (
                      <li key={player.id} className={styles.item}>
                        {player.photo ? (
                              <PlayerPhoto player={player} variant="avatar" />
                            ) : (
                              <span className={styles.itemJersey}>
                                <Jersey color={player.uniform} number={player.jerseyNumber} />
                              </span>
                            )}
                        <span className={styles.itemText}>
                          <strong>
                            {shortName(player.name)} #{player.jerseyNumber}
                          </strong>
                          <span>{POSITION_LABEL[player.primaryPosition]}</span>
                          <span className={styles.itemTags}>
                            {player.status !== 'ativo' && <StatusBadge status={player.status} />}
                            {locked && <span className={styles.where}>{where}</span>}
                          </span>
                        </span>
                        <Button
                          size="sm"
                          variant={onBench ? 'primary' : 'secondary'}
                          disabled={locked}
                          aria-pressed={onBench}
                          aria-label={`${onBench ? 'Remover dos reservas' : 'Adicionar aos reservas'}: ${shortName(player.name)}`}
                          onClick={() => change(toggleBench(draft, player.id))}
                        >
                          {onBench ? 'Reserva' : 'Adicionar'}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </Card>

          {(report.errors.length > 0 || report.warnings.length > 0) && (
            <Card title="Revisão">
              {report.errors.length > 0 && (
                <Notice tone="warning" title="Para poder salvar">
                  <ul className={styles.report}>
                    {report.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </Notice>
              )}
              {report.warnings.length > 0 && (
                <Notice tone="info" title="Pontos de atenção (não impedem salvar)">
                  <ul className={styles.report}>
                    {report.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </Notice>
              )}
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
