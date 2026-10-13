import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SelectField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import type { StartMatchSetInput } from '@/data/WorkspaceProvider';
import type { Lineup } from '@/domain/lineup';
import { SIDE_LABEL, otherSide, type Match, type MatchSet, type SetStarter, type Side } from '@/domain/match';
import { shortName, type Player } from '@/domain/player';
import { POSITION_LABEL, isCourtRole, type CourtRole } from '@/domain/positions';
import styles from './SetStartPanel.module.css';

const COURT_ROLES: CourtRole[] = ['levantador', 'oposto', 'ponteiro', 'central'];
const SLOTS = [0, 1, 2, 3, 4, 5];

interface Slot {
  playerId: string;
  role: CourtRole | '';
}

const emptySlots = (): Slot[] => SLOTS.map(() => ({ playerId: '', role: '' }));

const fromStarters = (starters: readonly { slot: number; playerId: string; role: CourtRole }[]): Slot[] => {
  const slots = emptySlots();
  for (const s of starters) slots[s.slot] = { playerId: s.playerId, role: s.role };
  return slots;
};

const fromLineup = (lineup: Lineup): Slot[] => lineup.starters.map((s) => (s ? { playerId: s.playerId, role: s.role } : { playerId: '', role: '' }));

interface Props {
  match: Match;
  number: number;
  players: readonly Player[];
  lineups: readonly Lineup[];
  previousSet: MatchSet | null;
  onStart(input: StartMatchSetInput): Promise<void>;
}

/** Início de set: formação inicial (P1 a P6), líbero e quem saca primeiro. A formação fica gravada no próprio set. */
export function SetStartPanel({ match, number, players, lineups, previousSet, onStart }: Props) {
  const savedLineup = match.lineupId ? lineups.find((l) => l.id === match.lineupId) : undefined;
  const initial = (): Slot[] => {
    if (previousSet) return fromStarters(previousSet.starters);
    if (savedLineup && savedLineup.starters.every(Boolean)) return fromLineup(savedLineup);
    return emptySlots();
  };
  const [slots, setSlots] = useState<Slot[]>(initial);
  const [liberoId, setLiberoId] = useState<string>(previousSet?.liberoId ?? (savedLineup?.liberoId ?? ''));
  const [firstServer, setFirstServer] = useState<Side>(previousSet ? otherSide(previousSet.firstServer) : 'us');
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const sorted = useMemo(() => [...players].sort((a, b) => a.jerseyNumber - b.jerseyNumber), [players]);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const completeLineups = lineups.filter((l) => l.starters.every(Boolean));
  const chosen = slots.map((s) => s.playerId).filter(Boolean);

  const label = (p: Player) => `${shortName(p.name)} #${p.jerseyNumber}`;
  const setSlot = (index: number, patch: Partial<Slot>) => setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const pickPlayer = (index: number, playerId: string) => {
    const player = byId.get(playerId);
    const suggested = player && isCourtRole(player.primaryPosition) ? player.primaryPosition : '';
    setSlot(index, { playerId, role: slots[index]?.role || suggested });
    if (playerId !== '' && playerId === liberoId) setLiberoId('');
  };

  const submit = async () => {
    setFailure(null);
    if (slots.some((s) => s.playerId === '')) return setFailure('Escolha um atleta para cada posição de P1 a P6.');
    if (slots.some((s) => s.role === '')) return setFailure('Escolha o papel tático de cada titular.');
    if (new Set(chosen).size !== 6) return setFailure('Há atleta repetido na formação.');
    const starters: SetStarter[] = slots.flatMap((s, slot) => (s.role === '' ? [] : [{ slot, playerId: s.playerId, role: s.role }]));
    setSaving(true);
    try {
      await onStart({ firstServer, starters, liberoId: liberoId === '' ? null : liberoId });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Não foi possível iniciar o set.');
      setSaving(false);
    }
  };

  const useLineup = (id: string) => {
    const lineup = lineups.find((l) => l.id === id);
    if (!lineup) return;
    setSlots(fromLineup(lineup));
    setLiberoId(lineup.liberoId ?? '');
  };

  return (
    <Card title={`Iniciar o set ${number}`}>
      <p className={styles.help}>
        Escolha a formação inicial: <strong>P1 é quem saca primeiro</strong>, e a rotação segue P2 → P1 → P6 → P5 → P4 → P3. Cada set tem a sua formação e a
        rotação recomeça nele.
      </p>
      {failure && (
        <Notice tone="error" title="Revise a formação">
          {failure}
        </Notice>
      )}
      <div className={styles.sources}>
        {completeLineups.length > 0 && (
          <SelectField label="Carregar uma escalação salva" value="" onChange={(event) => useLineup(event.target.value)}>
            <option value="">Escolher…</option>
            {completeLineups.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </SelectField>
        )}
        {previousSet && (
          <Button onClick={() => setSlots(fromStarters(previousSet.starters))}>Repetir a formação do set anterior</Button>
        )}
      </div>
      <ul className={styles.slots}>
        {SLOTS.map((index) => {
          const slot = slots[index] ?? { playerId: '', role: '' };
          return (
            <li key={index} className={styles.slot}>
              <SelectField label={`Atleta em P${index + 1}`} value={slot.playerId} onChange={(event) => pickPlayer(index, event.target.value)}>
                <option value="">Escolher…</option>
                {sorted.map((p) => (
                  <option key={p.id} value={p.id} disabled={chosen.includes(p.id) && slot.playerId !== p.id}>
                    {label(p)} · {POSITION_LABEL[p.primaryPosition]}
                    {p.status !== 'ativo' ? ' (indisponível)' : ''}
                  </option>
                ))}
              </SelectField>
              <SelectField label={`Papel de P${index + 1}`} value={slot.role} onChange={(event) => setSlot(index, { role: isCourtRole(event.target.value) ? event.target.value : '' })}>
                <option value="">Escolher…</option>
                {COURT_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {POSITION_LABEL[r]}
                  </option>
                ))}
              </SelectField>
            </li>
          );
        })}
      </ul>
      <div className={styles.row}>
        <SelectField label="Líbero (opcional)" value={liberoId} hint="A entrada automática do líbero ainda não é registrada." onChange={(event) => setLiberoId(event.target.value)}>
          <option value="">Sem líbero</option>
          {sorted
            .filter((p) => !chosen.includes(p.id))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {label(p)}
              </option>
            ))}
        </SelectField>
        <fieldset className={styles.server}>
          <legend>Quem saca primeiro neste set</legend>
          {(['us', 'them'] as const).map((side) => (
            <label key={side} className={`${styles.radio} ${firstServer === side ? styles.on : ''}`}>
              <input type="radio" name={`first-server-${number}`} checked={firstServer === side} onChange={() => setFirstServer(side)} />
              {SIDE_LABEL[side]}
            </label>
          ))}
        </fieldset>
      </div>
      <div>
        <Button variant="primary" icon="check" disabled={saving} onClick={() => void submit()}>
          {saving ? 'Iniciando…' : `Iniciar set ${number}`}
        </Button>
      </div>
    </Card>
  );
}
