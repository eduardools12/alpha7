import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PATHS } from '@/app/routes';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { useWorkspace } from '@/data/WorkspaceProvider';
import type { Attributes } from '@/domain/attributes';
import { calculateOverall } from '@/domain/overall';
import { todayIso } from '@/domain/id';
import {
  NOTES_MAX,
  PLAYER_STATUSES,
  PLAYER_STATUS_LABEL,
  UNIFORM_COLORS,
  UNIFORM_LABEL,
  playerToFormValues,
  validateEvaluationMeta,
  validatePlayerForm,
  type EvaluationFieldErrors,
  type EvaluationFormValues,
  type PlayerFieldErrors,
  type PlayerFormValues,
} from '@/domain/player';
import { isPosition, POSITION_LABEL, POSITIONS } from '@/domain/positions';
import { AttributeEditor, attributesToInputs, parseAttributeInputs, type AttributeInputErrors } from './AttributeEditor';
import { EvaluationFields } from './EvaluationFields';
import { OverallPreview } from './OverallPreview';
import styles from './PlayerFormPage.module.css';

export function PlayerFormPage() {
  const { playerId } = useParams();
  const editing = playerId !== undefined;
  const { data, actions } = useWorkspace();
  const navigate = useNavigate();
  const player = editing ? data.players.find((p) => p.id === playerId) : undefined;
  const today = todayIso();

  const [values, setValues] = useState<PlayerFormValues>(() => playerToFormValues(player));
  const [rateNow, setRateNow] = useState(false);
  const [attributeInputs, setAttributeInputs] = useState(() => attributesToInputs(null));
  const [meta, setMeta] = useState<EvaluationFormValues>({ evaluatedAt: today, evaluator: '', note: '' });
  const [errors, setErrors] = useState<PlayerFieldErrors>({});
  const [attrErrors, setAttrErrors] = useState<AttributeInputErrors>({});
  const [metaErrors, setMetaErrors] = useState<EvaluationFieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  // Depois de uma tentativa inválida, leva o foco ao primeiro campo com erro.
  useEffect(() => {
    if (attempt === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [attempt]);

  const previewOverall = useMemo(() => {
    if (!rateNow || !isPosition(values.primaryPosition)) return null;
    const parsed = parseAttributeInputs(attributeInputs);
    return parsed.ok ? calculateOverall(parsed.value, values.primaryPosition, data.settings.weights) : null;
  }, [rateNow, values.primaryPosition, attributeInputs, data.settings.weights]);

  if (editing && !player) {
    return (
      <>
        <PageHeader title="Editar jogador" back={{ to: PATHS.roster, label: 'Elenco' }} />
        <EmptyState
          icon="user"
          title="Atleta não encontrado"
          action={<ButtonLink to={PATHS.roster}>Voltar ao elenco</ButtonLink>}
        >
          Este atleta não está no elenco. Ele pode ter sido removido ou o endereço está incorreto.
        </EmptyState>
      </>
    );
  }

  const setField = (field: keyof PlayerFormValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);

    const result = validatePlayerForm(values, data.players, playerId);
    const nextErrors = result.ok ? {} : result.errors;
    setErrors(nextErrors);

    let evaluation: { attributes: Attributes; meta: EvaluationFormValues } | null = null;
    let hasAttrProblem = false;
    if (!editing && rateNow) {
      const attrs = parseAttributeInputs(attributeInputs);
      const metaResult = validateEvaluationMeta(meta, today);
      setAttrErrors(attrs.ok ? {} : attrs.errors);
      setMetaErrors(metaResult.ok ? {} : metaResult.errors);
      hasAttrProblem = !attrs.ok || !metaResult.ok;
      if (attrs.ok && metaResult.ok) evaluation = { attributes: attrs.value, meta: metaResult.value };
    }

    if (!result.ok || hasAttrProblem) {
      setAttempt((n) => n + 1);
      return;
    }

    setSaving(true);
    try {
      if (editing && player) {
        await actions.updatePlayer(player.id, result.value);
        navigate(PATHS.player(player.id), { state: { flash: 'Perfil atualizado.' } });
      } else {
        const created = await actions.createPlayer(
          result.value,
          evaluation
            ? {
                attributes: evaluation.attributes,
                evaluatedAt: evaluation.meta.evaluatedAt,
                evaluator: evaluation.meta.evaluator,
                note: evaluation.meta.note,
              }
            : undefined,
        );
        navigate(PATHS.player(created.id), { state: { flash: 'Atleta cadastrado.' } });
      }
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Não foi possível salvar.');
      setSaving(false);
    }
  };

  const errorCount =
    Object.values(errors).filter(Boolean).length +
    Object.values(attrErrors).filter(Boolean).length +
    Object.values(metaErrors).filter(Boolean).length;

  return (
    <>
      <PageHeader
        title={editing ? 'Editar jogador' : 'Adicionar jogador'}
        subtitle={editing ? player?.name : 'Cadastre os dados do atleta; as notas técnicas são opcionais agora.'}
        back={{ to: editing && player ? PATHS.player(player.id) : PATHS.roster, label: editing ? 'Perfil' : 'Elenco' }}
      />

      <form ref={formRef} onSubmit={(event) => void onSubmit(event)} noValidate className={styles.form}>
        {errorCount > 0 && (
          <Notice tone="error" title="Revise os campos destacados">
            {errorCount === 1 ? 'Há 1 campo com problema.' : `Há ${errorCount} campos com problema.`}
          </Notice>
        )}
        {failure && (
          <Notice tone="error" title="Não foi possível salvar">
            {failure}
          </Notice>
        )}

        <Card title="Dados do atleta">
          <div className={styles.grid}>
            <TextField
              label="Nome completo"
              value={values.name}
              error={errors.name}
              autoComplete="off"
              onChange={(event) => setField('name', event.target.value)}
            />
            <TextField
              label="Número da camisa"
              inputMode="numeric"
              value={values.jerseyNumber}
              error={errors.jerseyNumber}
              hint="De 1 a 99. Cada número vale para um atleta."
              autoComplete="off"
              onChange={(event) => setField('jerseyNumber', event.target.value)}
            />
            <SelectField
              label="Posição principal"
              value={values.primaryPosition}
              error={errors.primaryPosition}
              onChange={(event) => setField('primaryPosition', event.target.value)}
            >
              <option value="">Selecione…</option>
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {POSITION_LABEL[p]}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Posição secundária"
              value={values.secondaryPosition}
              error={errors.secondaryPosition}
              onChange={(event) => setField('secondaryPosition', event.target.value)}
            >
              <option value="">Nenhuma</option>
              {POSITIONS.filter((p) => p !== values.primaryPosition).map((p) => (
                <option key={p} value={p}>
                  {POSITION_LABEL[p]}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Situação"
              value={values.status}
              error={errors.status}
              onChange={(event) => setField('status', event.target.value)}
            >
              {PLAYER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PLAYER_STATUS_LABEL[s]}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Uniforme na carta"
              value={values.uniform}
              error={errors.uniform}
              onChange={(event) => setField('uniform', event.target.value)}
            >
              {UNIFORM_COLORS.map((u) => (
                <option key={u} value={u}>
                  {UNIFORM_LABEL[u]}
                </option>
              ))}
            </SelectField>
          </div>
          <TextAreaField
            label="Observações do treinador (opcional)"
            value={values.coachNotes}
            error={errors.coachNotes}
            aside={`${values.coachNotes.length}/${NOTES_MAX}`}
            onChange={(event) => setField('coachNotes', event.target.value)}
          />
        </Card>

        {!editing && (
          <Card title="Avaliação técnica">
            <label className={styles.check}>
              <input type="checkbox" checked={rateNow} onChange={(event) => setRateNow(event.target.checked)} />
              <span>
                Registrar a primeira avaliação agora
                <small>Sem avaliação, o Overall do atleta fica indisponível até a primeira nota.</small>
              </span>
            </label>
            {rateNow && (
              <>
                <div className={styles.grid}>
                  <EvaluationFields
                    values={meta}
                    errors={metaErrors}
                    today={today}
                    onChange={(field, value) => {
                      setMeta((prev) => ({ ...prev, [field]: value }));
                      setMetaErrors((prev) => ({ ...prev, [field]: undefined }));
                    }}
                  />
                </div>
                <AttributeEditor
                  values={attributeInputs}
                  errors={attrErrors}
                  onChange={(key, value) => {
                    setAttributeInputs((prev) => ({ ...prev, [key]: value }));
                    setAttrErrors((prev) => ({ ...prev, [key]: undefined }));
                  }}
                />
                <OverallPreview
                  overall={previewOverall}
                  position={isPosition(values.primaryPosition) ? values.primaryPosition : null}
                />
              </>
            )}
          </Card>
        )}

        <div className={styles.actions}>
          <ButtonLink to={editing && player ? PATHS.player(player.id) : PATHS.roster}>Cancelar</ButtonLink>
          <Button type="submit" variant="primary" icon="save" disabled={saving}>
            {saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Cadastrar atleta'}
          </Button>
        </div>
      </form>
    </>
  );
}
