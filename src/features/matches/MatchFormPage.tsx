import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PATHS } from '@/app/routes';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField, TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { useWorkspace } from '@/data/WorkspaceProvider';
import { formatDateTime } from '@/domain/format';
import { DEFAULT_FORMAT, MATCH_TEXT_MAX, OPPONENT_MAX, validateMatchDraft, type MatchErrors, type MatchFormat } from '@/domain/match';
import styles from './MatchFormPage.module.css';

interface Values {
  opponent: string;
  competition: string;
  scheduledAt: string;
  venue: string;
  lineupId: string;
  bestOf: string;
  setPoints: string;
  decidingSetPoints: string;
  minLead: string;
}

const toNumber = (text: string): number => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : Number.NaN);

export function MatchFormPage() {
  const { matchId } = useParams();
  const editing = matchId !== undefined;
  const { data, actions } = useWorkspace();
  const navigate = useNavigate();
  const match = editing ? data.matches.find((m) => m.id === matchId) : undefined;
  const hasSets = match ? data.matchSets.some((s) => s.matchId === match.id) : false;

  const [values, setValues] = useState<Values>(() => {
    const f: MatchFormat = match?.format ?? DEFAULT_FORMAT;
    return {
      opponent: match?.opponent ?? '',
      competition: match?.competition ?? '',
      scheduledAt: match?.scheduledAt ?? '',
      venue: match?.venue ?? '',
      lineupId: match?.lineupId ?? '',
      bestOf: String(f.bestOf),
      setPoints: String(f.setPoints),
      decidingSetPoints: String(f.decidingSetPoints),
      minLead: String(f.minLead),
    };
  });
  const [errors, setErrors] = useState<MatchErrors>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (attempt === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [attempt]);

  const back = editing && match ? PATHS.match(match.id) : PATHS.matches;

  if (editing && !match) {
    return (
      <>
        <PageHeader title="Editar partida" back={{ to: PATHS.matches, label: 'Partidas' }} />
        <EmptyState icon="court" title="Partida não encontrada" action={<ButtonLink to={PATHS.matches}>Voltar às partidas</ButtonLink>}>
          Esta partida não existe mais ou o endereço está incorreto.
        </EmptyState>
      </>
    );
  }

  const set = (field: keyof Values, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field === 'bestOf' || field === 'setPoints' || field === 'decidingSetPoints' || field === 'minLead' ? 'format' : field]: undefined }));
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    const bestOf = toNumber(values.bestOf);
    const format: MatchFormat = {
      bestOf: bestOf === 1 || bestOf === 3 ? bestOf : 5,
      setPoints: toNumber(values.setPoints),
      // Em set único não existe set decisivo à parte: o valor fica igual ao do set.
      decidingSetPoints: bestOf === 1 ? toNumber(values.setPoints) : toNumber(values.decidingSetPoints),
      minLead: toNumber(values.minLead),
    };
    const result = validateMatchDraft({
      opponent: values.opponent,
      competition: values.competition,
      scheduledAt: values.scheduledAt,
      venue: values.venue,
      lineupId: values.lineupId === '' ? null : values.lineupId,
      format,
    });
    if (!result.ok) {
      setErrors(result.errors);
      setAttempt((n) => n + 1);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const saved = await actions.saveMatch(match?.id ?? null, result.value);
      navigate(editing ? PATHS.match(saved.id) : PATHS.matches, { state: { flash: editing ? 'Partida atualizada. Os pontos registrados foram mantidos.' : 'Partida cadastrada.' } });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Não foi possível salvar.');
      setSaving(false);
    }
  };

  const problems = Object.values(errors).filter(Boolean).length;
  const lineups = [...data.lineups].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  const single = values.bestOf === '1';

  return (
    <>
      <PageHeader
        title={editing ? 'Editar partida' : 'Nova partida'}
        subtitle={editing ? `Alpha7 x ${match?.opponent ?? ''}` : 'Cadastre o jogo. Os sets e os pontos são registrados durante a partida.'}
        back={{ to: back, label: editing ? 'Detalhes da partida' : 'Partidas' }}
      />

      <form ref={formRef} onSubmit={(event) => void onSubmit(event)} noValidate className={styles.form}>
        {problems > 0 && (
          <Notice tone="error" title="Revise os campos destacados">
            {problems === 1 ? 'Há 1 campo com problema.' : `Há ${problems} campos com problema.`}
          </Notice>
        )}
        {failure && (
          <Notice tone="error" title="Não foi possível salvar">
            {failure}
          </Notice>
        )}
        {editing && match && match.status === 'concluida' && (
          <Notice tone="info">Esta partida está concluída. Você pode corrigir os dados do jogo; o resultado e os pontos não mudam por aqui.</Notice>
        )}

        <Card title="Dados do jogo">
          <div className={styles.grid}>
            <TextField
              label="Adversário"
              value={values.opponent}
              error={errors.opponent}
              maxLength={OPPONENT_MAX + 20}
              autoComplete="off"
              onChange={(event) => set('opponent', event.target.value)}
            />
            <TextField
              label="Campeonato ou amistoso (opcional)"
              value={values.competition}
              error={errors.competition}
              maxLength={MATCH_TEXT_MAX + 20}
              autoComplete="off"
              onChange={(event) => set('competition', event.target.value)}
            />
            <TextField
              label="Data e horário (opcional)"
              type="datetime-local"
              value={values.scheduledAt}
              error={errors.scheduledAt}
              hint={values.scheduledAt ? formatDateTime(values.scheduledAt) : 'Sem data, a partida fica como “Sem data definida”.'}
              onChange={(event) => set('scheduledAt', event.target.value)}
            />
            <TextField
              label="Local (opcional)"
              value={values.venue}
              error={errors.venue}
              maxLength={MATCH_TEXT_MAX + 20}
              autoComplete="off"
              onChange={(event) => set('venue', event.target.value)}
            />
            <SelectField
              label="Escalação salva (opcional)"
              value={values.lineupId}
              hint="Serve de ponto de partida ao iniciar cada set. A formação de cada set é registrada no próprio set."
              onChange={(event) => set('lineupId', event.target.value)}
            >
              <option value="">Nenhuma</option>
              {lineups.map((lineup) => (
                <option key={lineup.id} value={lineup.id}>
                  {lineup.title}
                </option>
              ))}
            </SelectField>
          </div>
        </Card>

        <Card title="Formato da partida">
          {hasSets && (
            <Notice tone="info">O formato fica travado depois que o primeiro set é iniciado, porque mudaria o significado do placar.</Notice>
          )}
          <div className={styles.grid}>
            <SelectField label="Quantidade de sets" value={values.bestOf} disabled={hasSets} onChange={(event) => set('bestOf', event.target.value)}>
              <option value="5">Melhor de 5 sets (vence quem ganhar 3)</option>
              <option value="3">Melhor de 3 sets (vence quem ganhar 2)</option>
              <option value="1">Set único</option>
            </SelectField>
            <TextField
              label="Pontos de cada set"
              inputMode="numeric"
              value={values.setPoints}
              error={errors.format}
              disabled={hasSets}
              autoComplete="off"
              onChange={(event) => set('setPoints', event.target.value)}
            />
            {!single && (
              <TextField
                label="Pontos do set decisivo"
                inputMode="numeric"
                value={values.decidingSetPoints}
                disabled={hasSets}
                hint="O último set do formato (o 5º em melhor de 5)."
                autoComplete="off"
                onChange={(event) => set('decidingSetPoints', event.target.value)}
              />
            )}
            <TextField
              label="Diferença mínima para fechar o set"
              inputMode="numeric"
              value={values.minLead}
              disabled={hasSets}
              hint="Com 2, 25 a 24 continua; fecha em 26 a 24. O set não tem teto de pontos."
              autoComplete="off"
              onChange={(event) => set('minLead', event.target.value)}
            />
          </div>
        </Card>

        <div className={styles.actions}>
          <ButtonLink to={back}>Cancelar</ButtonLink>
          <Button type="submit" variant="primary" icon="save" disabled={saving}>
            {saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Cadastrar partida'}
          </Button>
        </div>
      </form>
    </>
  );
}
