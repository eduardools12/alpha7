import { useId } from 'react';
import { PATHS } from '@/app/routes';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField, TextField } from '@/components/ui/Field';
import {
  ART_FORMATS,
  ART_KIND_FORMATS,
  ART_KIND_LABEL,
  ART_KINDS,
  ART_TONE_LABEL,
  BRAND_VARIANTS,
  BRAND_VARIANT_LABEL,
  COVER_VARIANTS,
  COVER_VARIANT_LABEL,
  HEADLINE_MAX,
  HIGHLIGHT_CAPTION_MAX,
  HIGHLIGHT_DETAIL_MAX,
  HIGHLIGHT_TITLE_MAX,
  PHASE_MAX,
  STAT_COUNT,
  STAT_LABEL_MAX,
  STAT_VALUE_MAX,
  type ArtFormatId,
  type ArtFraming,
  type ArtKind,
  type ArtTone,
  type BrandVariant,
  type CoverVariant,
  type SpotlightStat,
} from '@/domain/arts';
import type { Lineup } from '@/domain/lineup';
import type { Match } from '@/domain/match';
import { formatDateTime } from '@/domain/format';
import type { Player } from '@/domain/player';
import styles from './ArtsPage.module.css';

/** Tudo o que a pessoa escolhe e digita na tela. A arte é derivada disto e dos dados do app. */
export interface ArtDraft {
  kind: ArtKind;
  format: ArtFormatId;
  tone: ArtTone;
  matchId: string;
  lineupId: string;
  playerId: string;
  phase: string;
  headline: string;
  stats: SpotlightStat[];
  caption: string;
  title: string;
  detail: string;
  brand: BrandVariant;
  cover: CoverVariant;
  framing: ArtFraming;
}

export const EMPTY_STATS: SpotlightStat[] = Array.from({ length: STAT_COUNT }, () => ({ label: '', value: '' }));

interface ControlsProps {
  draft: ArtDraft;
  patch: (change: Partial<ArtDraft>) => void;
  matches: readonly Match[];
  concluded: readonly Match[];
  lineups: readonly Lineup[];
  players: readonly Player[];
  match: Match | undefined;
  lineupId: string;
  /** O atleta escolhido tem foto cadastrada e ela já carregou. */
  photoReady: boolean;
  /** O atleta escolhido tem foto cadastrada, carregando ou não. */
  hasPhoto: boolean;
}

const PLAYER_KINDS: readonly ArtKind[] = ['athlete', 'card', 'spotlight', 'highlights'];
const FRAMING_KINDS: readonly ArtKind[] = ['athlete', 'card', 'spotlight', 'highlights'];

export const usesPlayer = (kind: ArtKind): boolean => PLAYER_KINDS.includes(kind);
export const usesFraming = (kind: ArtKind): boolean => FRAMING_KINDS.includes(kind);

function RangeField({ label, value, min, max, step, onChange, display }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void; display: string }) {
  const id = useId();
  return (
    <div className={styles.range}>
      <div className={styles.rangeRow}>
        <label htmlFor={id} className={styles.groupLabel}>
          {label}
        </label>
        <output htmlFor={id} className={styles.rangeValue}>
          {display}
        </output>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}

export function ArtControls({ draft, patch, matches, concluded, lineups, players, match, lineupId, photoReady, hasPhoto }: ControlsProps) {
  const { kind } = draft;
  const formats = ART_KIND_FORMATS[kind];
  const player = players.find((p) => p.id === draft.playerId);

  const matchLabel = (m: Match) => `Alpha7 x ${m.opponent}${m.scheduledAt ? ` · ${formatDateTime(m.scheduledAt)}` : ''}`;

  const kinds = (
    <Card title="Tipo de arte">
      <div className={styles.chips} role="group" aria-label="Tipo de arte">
        {ART_KINDS.map((id) => (
          <Chip key={id} pressed={kind === id} onClick={() => patch({ kind: id })}>
            {ART_KIND_LABEL[id]}
          </Chip>
        ))}
      </div>
    </Card>
  );

  const needsMatches = kind === 'lineup' || kind === 'matchday';
  if (needsMatches && matches.length === 0) {
    return (
      <>
        {kinds}
        <EmptyState
          icon="lineup"
          title="Cadastre uma partida para gerar a arte"
          action={
            <ButtonLink to={PATHS.newMatch} variant="primary" icon="plus">
              Cadastrar partida
            </ButtonLink>
          }
        >
          A arte usa o adversário, a data e a escalação salva de uma partida. Nada é inventado: o que não estiver cadastrado não aparece.
        </EmptyState>
      </>
    );
  }
  if (kind === 'result' && concluded.length === 0) {
    return (
      <>
        {kinds}
        <EmptyState
          icon="court"
          title="Nenhuma partida concluída ainda"
          action={
            <ButtonLink to={PATHS.matches} variant="primary">
              Ver partidas
            </ButtonLink>
          }
        >
          A arte de resultado usa o placar real de uma partida encerrada: os sets vêm dos pontos registrados, nunca digitados.
        </EmptyState>
      </>
    );
  }
  if (usesPlayer(kind) && players.length === 0) {
    return (
      <>
        {kinds}
        <EmptyState
          icon="users"
          title="Cadastre um atleta para gerar a arte"
          action={
            <ButtonLink to={PATHS.newPlayer} variant="primary" icon="plus">
              Cadastrar atleta
            </ButtonLink>
          }
        >
          As artes de atleta usam o nome, a camisa, a posição e a foto do cadastro.
        </EmptyState>
      </>
    );
  }

  const playerSelect = (
    <SelectField label="Atleta" value={draft.playerId} onChange={(event) => patch({ playerId: event.target.value })}>
      {players.map((p) => (
        <option key={p.id} value={p.id}>
          #{p.jerseyNumber} {p.name}
        </option>
      ))}
    </SelectField>
  );

  const choices = (() => {
    switch (kind) {
      case 'lineup':
        return (
          <Card title="Escolhas">
            <SelectField label="Partida" value={draft.matchId} onChange={(event) => patch({ matchId: event.target.value })}>
              {matches.map((m) => (
                <option key={m.id} value={m.id}>
                  {matchLabel(m)}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Escalação salva"
              value={lineupId}
              hint={match?.lineupId ? 'Começa pela escalação ligada à partida.' : 'Esta partida não tem escalação ligada: escolha uma.'}
              onChange={(event) => patch({ lineupId: event.target.value })}
            >
              <option value="">Escolher…</option>
              {lineups.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </SelectField>
          </Card>
        );
      case 'matchday':
        return (
          <Card title="Escolhas">
            <SelectField label="Partida" value={draft.matchId} onChange={(event) => patch({ matchId: event.target.value })}>
              {matches.map((m) => (
                <option key={m.id} value={m.id}>
                  {matchLabel(m)}
                </option>
              ))}
            </SelectField>
            <TextField
              label="Rodada ou fase (opcional)"
              value={draft.phase}
              maxLength={PHASE_MAX}
              aside={`${draft.phase.length}/${PHASE_MAX}`}
              hint="Por exemplo: Quartas de final. Sem texto, não aparece."
              onChange={(event) => patch({ phase: event.target.value })}
            />
          </Card>
        );
      case 'result':
        return (
          <Card title="Escolhas">
            <SelectField label="Partida concluída" value={draft.matchId} onChange={(event) => patch({ matchId: event.target.value })}>
              {concluded.map((m) => (
                <option key={m.id} value={m.id}>
                  {matchLabel(m)}
                </option>
              ))}
            </SelectField>
          </Card>
        );
      case 'athlete':
      case 'card':
        return <Card title="Escolhas">{playerSelect}</Card>;
      case 'spotlight':
        return (
          <Card title="Escolhas">
            {playerSelect}
            <TextField
              label="Fundamento ou motivo do destaque (opcional)"
              value={draft.headline}
              maxLength={HEADLINE_MAX}
              aside={`${draft.headline.length}/${HEADLINE_MAX}`}
              onChange={(event) => patch({ headline: event.target.value })}
            />
            <fieldset className={styles.stats}>
              <legend className={styles.groupLabel}>Estatísticas (opcional)</legend>
              <p className={styles.hint}>Digite só números que você confirmou. Nada é preenchido sozinho.</p>
              {draft.stats.map((stat, index) => (
                <div key={index} className={styles.statRow}>
                  <TextField
                    label={`Estatística ${index + 1}: nome`}
                    value={stat.label}
                    maxLength={STAT_LABEL_MAX}
                    onChange={(event) => patch({ stats: draft.stats.map((s, i) => (i === index ? { ...s, label: event.target.value } : s)) })}
                  />
                  <TextField
                    label={`Estatística ${index + 1}: valor`}
                    value={stat.value}
                    maxLength={STAT_VALUE_MAX}
                    onChange={(event) => patch({ stats: draft.stats.map((s, i) => (i === index ? { ...s, value: event.target.value } : s)) })}
                  />
                </div>
              ))}
            </fieldset>
          </Card>
        );
      case 'highlights':
        return (
          <Card title="Escolhas">
            {playerSelect}
            <TextField
              label="Chamada"
              value={draft.caption}
              maxLength={HIGHLIGHT_CAPTION_MAX}
              hint="Linha pequena acima do título. Vazia, não aparece."
              onChange={(event) => patch({ caption: event.target.value })}
            />
            <TextField label="Título" value={draft.title} maxLength={HIGHLIGHT_TITLE_MAX} onChange={(event) => patch({ title: event.target.value })} />
            <TextField
              label="Temporada ou jogo (opcional)"
              value={draft.detail}
              maxLength={HIGHLIGHT_DETAIL_MAX}
              onChange={(event) => patch({ detail: event.target.value })}
            />
          </Card>
        );
      case 'brand':
        return (
          <Card title="Escolhas">
            <div className={styles.group} role="group" aria-label="Peça institucional">
              <span className={styles.groupLabel}>Peça</span>
              <div className={styles.chips}>
                {BRAND_VARIANTS.map((id) => (
                  <Chip key={id} pressed={draft.brand === id} onClick={() => patch({ brand: id })}>
                    {BRAND_VARIANT_LABEL[id]}
                  </Chip>
                ))}
              </div>
            </div>
          </Card>
        );
      case 'cover':
        return (
          <Card title="Escolhas">
            <div className={styles.group} role="group" aria-label="Capa de destaque">
              <span className={styles.groupLabel}>Capa</span>
              <div className={styles.chips}>
                {COVER_VARIANTS.map((id) => (
                  <Chip key={id} pressed={draft.cover === id} onClick={() => patch({ cover: id })}>
                    {COVER_VARIANT_LABEL[id]}
                  </Chip>
                ))}
              </div>
            </div>
          </Card>
        );
    }
  })();

  const appearance =
    kind === 'cover' ? null : (
      <Card title="Aparência">
        <div className={styles.group} role="group" aria-label="Fundo">
          <span className={styles.groupLabel}>Fundo</span>
          <div className={styles.chips}>
            {(['dark', 'light'] as const).map((id) => (
              <Chip key={id} pressed={draft.tone === id} onClick={() => patch({ tone: id })}>
                <span className={`${styles.swatch} ${id === 'light' ? styles.swatchWhite : styles.swatchPurple}`} aria-hidden="true" />
                {ART_TONE_LABEL[id]}
              </Chip>
            ))}
          </div>
        </div>
        <div className={styles.group} role="group" aria-label="Formato">
          <span className={styles.groupLabel}>Formato</span>
          <div className={styles.chips}>
            {formats.map((id) => (
              <Chip key={id} pressed={draft.format === id} onClick={() => patch({ format: id })}>
                <span className={`${styles.shape} ${id === 'story' ? styles.shapeStory : styles.shapePoster}`} aria-hidden="true" />
                {ART_FORMATS[id].label}
              </Chip>
            ))}
          </div>
        </div>
      </Card>
    );

  const framing =
    usesFraming(kind) && photoReady ? (
      <Card title="Enquadramento da foto">
        <RangeField label="Aproximar" value={draft.framing.zoom} min={1} max={2.5} step={0.05} display={`${draft.framing.zoom.toFixed(2)}x`} onChange={(zoom) => patch({ framing: { ...draft.framing, zoom } })} />
        <RangeField label="Posição horizontal" value={draft.framing.x} min={0} max={1} step={0.01} display={`${Math.round(draft.framing.x * 100)}%`} onChange={(x) => patch({ framing: { ...draft.framing, x } })} />
        <RangeField label="Posição vertical" value={draft.framing.y} min={0} max={1} step={0.01} display={`${Math.round(draft.framing.y * 100)}%`} onChange={(y) => patch({ framing: { ...draft.framing, y } })} />
        <p className={styles.hint}>A área da foto é cortada na diagonal: confira se rosto e mãos ficaram dentro.</p>
      </Card>
    ) : null;

  const withoutPhoto =
    usesPlayer(kind) && player && !hasPhoto ? (
      <p className={styles.hint}>
        {player.name} ainda não tem foto cadastrada: a arte mostra a área da foto marcada.{' '}
        <ButtonLink to={PATHS.player(player.id)} size="sm" variant="ghost">
          Abrir o perfil
        </ButtonLink>
      </p>
    ) : null;

  return (
    <>
      {kinds}
      {choices}
      {withoutPhoto}
      {appearance}
      {framing}
    </>
  );
}
