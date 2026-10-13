import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PATHS } from '@/app/routes';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { useWorkspace } from '@/data/WorkspaceProvider';
import { buildPlayerCard } from '@/data/selectors';
import { todayIso } from '@/domain/id';
import { calculateOverall } from '@/domain/overall';
import {
  shortName,
  validateEvaluationMeta,
  type EvaluationFieldErrors,
  type EvaluationFormValues,
} from '@/domain/player';
import { AttributeEditor, attributesToInputs, parseAttributeInputs, type AttributeInputErrors } from './AttributeEditor';
import { EvaluationFields } from './EvaluationFields';
import { OverallPreview } from './OverallPreview';
import styles from './PlayerFormPage.module.css';

export function EvaluationPage() {
  const { playerId } = useParams();
  const { data, actions } = useWorkspace();
  const navigate = useNavigate();
  const player = data.players.find((p) => p.id === playerId);
  const today = todayIso();

  const current = useMemo(
    () => (player ? buildPlayerCard(player, data.evaluations, data.settings.weights) : null),
    [player, data.evaluations, data.settings.weights],
  );

  const [inputs, setInputs] = useState(() => attributesToInputs(current?.attributes ?? null));
  const [meta, setMeta] = useState<EvaluationFormValues>({ evaluatedAt: today, evaluator: '', note: '' });
  const [attrErrors, setAttrErrors] = useState<AttributeInputErrors>({});
  const [metaErrors, setMetaErrors] = useState<EvaluationFieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (!player) return null;
    const parsed = parseAttributeInputs(inputs);
    return parsed.ok ? calculateOverall(parsed.value, player.primaryPosition, data.settings.weights) : null;
  }, [player, inputs, data.settings.weights]);

  if (!player || !current) {
    return (
      <>
        <PageHeader title="Registrar avaliação" back={{ to: PATHS.roster, label: 'Elenco' }} />
        <EmptyState
          icon="user"
          title="Atleta não encontrado"
          action={<ButtonLink to={PATHS.roster}>Voltar ao elenco</ButtonLink>}
        >
          Este atleta não está no elenco.
        </EmptyState>
      </>
    );
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    const attrs = parseAttributeInputs(inputs);
    const metaResult = validateEvaluationMeta(meta, today);
    setAttrErrors(attrs.ok ? {} : attrs.errors);
    setMetaErrors(metaResult.ok ? {} : metaResult.errors);
    if (!attrs.ok || !metaResult.ok) return;

    setSaving(true);
    try {
      await actions.addEvaluation(player.id, { ...metaResult.value, attributes: attrs.value });
      navigate(PATHS.player(player.id), {
        state: { flash: 'Avaliação registrada. As avaliações anteriores continuam no histórico.' },
      });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Não foi possível salvar.');
      setSaving(false);
    }
  };

  const problems = Object.values(attrErrors).filter(Boolean).length + Object.values(metaErrors).filter(Boolean).length;

  return (
    <>
      <PageHeader
        title="Registrar avaliação"
        subtitle={`${shortName(player.name)} · camisa ${player.jerseyNumber}`}
        back={{ to: PATHS.player(player.id), label: 'Perfil' }}
      />
      <form onSubmit={(event) => void onSubmit(event)} noValidate className={styles.form}>
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
        <Notice tone="info" title="Como funciona">
          Cada avaliação é um novo registro datado: as anteriores não são sobrescritas. As notas são julgamento do
          treinador e não mudam sozinhas com resultados de jogos.
        </Notice>

        <Card title="Quando e por quem">
          <div className={styles.grid}>
            <EvaluationFields
              values={meta}
              errors={metaErrors}
              today={today}
              withNote
              onChange={(field, value) => {
                setMeta((prev) => ({ ...prev, [field]: value }));
                setMetaErrors((prev) => ({ ...prev, [field]: undefined }));
              }}
            />
          </div>
        </Card>

        <Card title="Notas de 1 a 99">
          <AttributeEditor
            values={inputs}
            errors={attrErrors}
            onChange={(key, value) => {
              setInputs((prev) => ({ ...prev, [key]: value }));
              setAttrErrors((prev) => ({ ...prev, [key]: undefined }));
            }}
          />
          <OverallPreview overall={preview} position={player.primaryPosition} previous={current.overall} />
        </Card>

        <div className={styles.actions}>
          <ButtonLink to={PATHS.player(player.id)}>Cancelar</ButtonLink>
          <Button type="submit" variant="primary" icon="save" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar avaliação'}
          </Button>
        </div>
      </form>
    </>
  );
}
