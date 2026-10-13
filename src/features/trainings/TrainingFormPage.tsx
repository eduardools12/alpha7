import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PATHS } from '@/app/routes';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { useWorkspace } from '@/data/WorkspaceProvider';
import { FUNDAMENTALS, FUNDAMENTAL_LABEL } from '@/domain/fundamentals';
import { todayIso } from '@/domain/id';
import { PLAYER_STATUS_LABEL } from '@/domain/player';
import { POSITION_LABEL } from '@/domain/positions';
import {
  DESCRIPTION_MAX,
  MAX_EXERCISES,
  TRAINING_NOTES_MAX,
  exerciseEventCount,
  participantEventCount,
  trainingToFormValues,
  validateTrainingForm,
  type ExerciseDraft,
  type TrainingErrors,
  type TrainingFormValues,
} from '@/domain/training';
import { shortName } from '@/domain/player';
import styles from './TrainingFormPage.module.css';

interface Row extends ExerciseDraft {
  /** Chave só de interface, estável enquanto a linha existe. */
  key: string;
}

let rowCounter = 0;
const newRow = (draft: ExerciseDraft): Row => ({ ...draft, key: `row-${(rowCounter += 1)}` });

export function TrainingFormPage() {
  const { trainingId } = useParams();
  const editing = trainingId !== undefined;
  const { data, actions } = useWorkspace();
  const navigate = useNavigate();
  const training = editing ? data.trainings.find((t) => t.id === trainingId) : undefined;
  const today = todayIso();

  const [values, setValues] = useState<TrainingFormValues>(() => {
    const base = trainingToFormValues(training);
    return training ? base : { ...base, date: today };
  });
  const [participants, setParticipants] = useState<Set<string>>(
    () => new Set(training ? training.participantIds : data.players.filter((p) => p.status === 'ativo').map((p) => p.id)),
  );
  const [rows, setRows] = useState<Row[]>(() =>
    training
      ? data.exercises
          .filter((e) => e.trainingId === training.id)
          .sort((a, b) => a.order - b.order)
          .map((e) => newRow({ id: e.id, name: e.name, focus: e.focus ?? '' }))
      : [],
  );
  const [errors, setErrors] = useState<TrainingErrors>({ fields: {}, exercises: {} });
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (attempt === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [attempt]);

  if (editing && !training) {
    return (
      <>
        <PageHeader title="Editar treino" back={{ to: PATHS.trainings, label: 'Treinos' }} />
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

  const players = [...data.players].sort((a, b) => a.jerseyNumber - b.jerseyNumber);
  const setField = (field: keyof TrainingFormValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, fields: { ...prev.fields, [field]: undefined } }));
  };
  const toggleParticipant = (id: string) =>
    setParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const updateRow = (key: string, patch: Partial<ExerciseDraft>, index: number) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setErrors((prev) => {
      const exercises = { ...prev.exercises };
      delete exercises[index];
      return { ...prev, exercises };
    });
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    const result = validateTrainingForm(
      values,
      [...participants],
      rows.map(({ id, name, focus }) => ({ id, name, focus })),
    );
    if (!result.ok) {
      setErrors(result.errors);
      setAttempt((n) => n + 1);
      return;
    }
    setErrors({ fields: {}, exercises: {} });
    setSaving(true);
    try {
      const saved = await actions.saveTraining(training?.id ?? null, result.value);
      navigate(PATHS.training(saved.id), { state: { flash: editing ? 'Treino atualizado. Os registros foram mantidos.' : 'Treino criado.' } });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Não foi possível salvar.');
      setSaving(false);
    }
  };

  const problems = Object.values(errors.fields).filter(Boolean).length + Object.keys(errors.exercises).length;

  return (
    <>
      <PageHeader
        title={editing ? 'Editar treino' : 'Novo treino'}
        subtitle={editing ? training?.name : 'Defina o treino, quem participa e os exercícios. O registro das tentativas vem depois.'}
        back={{ to: editing && training ? PATHS.training(training.id) : PATHS.trainings, label: editing ? 'Resumo do treino' : 'Treinos' }}
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
        {editing && (
          <Notice tone="info">
            Editar nome, descrição ou participantes não apaga registros. Exercícios e participantes que já têm registros não podem ser removidos.
          </Notice>
        )}

        <Card title="Dados do treino">
          <div className={styles.grid}>
            <TextField
              label="Nome do treino"
              value={values.name}
              error={errors.fields.name}
              autoComplete="off"
              onChange={(event) => setField('name', event.target.value)}
            />
            <TextField
              label="Data"
              type="date"
              value={values.date}
              error={errors.fields.date}
              onChange={(event) => setField('date', event.target.value)}
            />
            <TextField
              label="Duração em minutos (opcional)"
              inputMode="numeric"
              value={values.duration}
              error={errors.fields.duration}
              autoComplete="off"
              onChange={(event) => setField('duration', event.target.value)}
            />
            <TextField
              label="Responsável pelo registro (opcional)"
              value={values.responsible}
              error={errors.fields.responsible}
              hint="Quem conduz o registro. Não há login ainda: é só um nome."
              autoComplete="off"
              onChange={(event) => setField('responsible', event.target.value)}
            />
          </div>
          <TextAreaField
            label="Descrição (opcional)"
            value={values.description}
            error={errors.fields.description}
            aside={`${values.description.length}/${DESCRIPTION_MAX}`}
            onChange={(event) => setField('description', event.target.value)}
          />
          <TextAreaField
            label="Observações (opcional)"
            value={values.notes}
            error={errors.fields.notes}
            aside={`${values.notes.length}/${TRAINING_NOTES_MAX}`}
            onChange={(event) => setField('notes', event.target.value)}
          />
        </Card>

        <Card title="Participantes">
          {players.length === 0 ? (
            <p className={styles.muted}>O elenco está vazio. Cadastre atletas para selecioná-los aqui.</p>
          ) : (
            <fieldset className={styles.participants}>
              <legend className="sr-only">Participantes do treino</legend>
              <div className={styles.participantBar}>
                <span aria-live="polite">
                  <strong>{participants.size}</strong> de {players.length} selecionados
                </span>
                <span className={styles.barActions}>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setParticipants(new Set([...participants, ...players.filter((p) => p.status === 'ativo').map((p) => p.id)]))}
                  >
                    Incluir todos os ativos
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setParticipants(
                        new Set(
                          [...participants].filter((id) => training && participantEventCount(data.trainingEvents, training.id, id) > 0),
                        ),
                      )
                    }
                  >
                    Limpar seleção
                  </Button>
                </span>
              </div>
              <ul className={styles.playerList}>
                {players.map((player) => {
                  const locked = training ? participantEventCount(data.trainingEvents, training.id, player.id) : 0;
                  const checked = participants.has(player.id);
                  return (
                    <li key={player.id}>
                      <label className={`${styles.playerOption} ${checked ? styles.checked : ''}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={locked > 0 && checked}
                          onChange={() => toggleParticipant(player.id)}
                        />
                        <span className={styles.playerText}>
                          <strong>
                            {shortName(player.name)} #{player.jerseyNumber}
                          </strong>
                          <small>
                            {POSITION_LABEL[player.primaryPosition]}
                            {player.status !== 'ativo' && ` · ${PLAYER_STATUS_LABEL[player.status]}`}
                            {locked > 0 && checked && ` · ${locked} ${locked === 1 ? 'registro' : 'registros'}, não pode sair`}
                          </small>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          )}
        </Card>

        <Card
          title="Exercícios"
          titleAside={<span className={styles.muted}>{rows.length} de {MAX_EXERCISES}</span>}
        >
          {rows.length === 0 && (
            <p className={styles.muted}>
              Nenhum exercício ainda. Cada registro de desempenho pertence a um exercício, então adicione ao menos um antes de registrar.
            </p>
          )}
          <ol className={styles.exercises}>
            {rows.map((row, index) => {
              const locked = row.id ? exerciseEventCount(data.trainingEvents, row.id) : 0;
              return (
                <li key={row.key} className={styles.exerciseRow}>
                  <TextField
                    label={`Exercício ${index + 1}`}
                    value={row.name}
                    error={errors.exercises[index]}
                    autoComplete="off"
                    onChange={(event) => updateRow(row.key, { name: event.target.value }, index)}
                  />
                  <SelectField
                    label={`Fundamento em foco do exercício ${index + 1}`}
                    value={row.focus}
                    hint="Só informativo: não limita o que pode ser registrado."
                    onChange={(event) => updateRow(row.key, { focus: event.target.value as ExerciseDraft['focus'] }, index)}
                  >
                    <option value="">Geral</option>
                    {FUNDAMENTALS.map((f) => (
                      <option key={f} value={f}>
                        {FUNDAMENTAL_LABEL[f]}
                      </option>
                    ))}
                  </SelectField>
                  <Button
                    variant="danger"
                    size="sm"
                    icon="trash"
                    disabled={locked > 0}
                    title={locked > 0 ? `Tem ${locked} registros: não pode ser removido` : undefined}
                    aria-label={`Remover exercício ${index + 1}${locked > 0 ? ` (tem ${locked} registros)` : ''}`}
                    onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                  >
                    Remover
                  </Button>
                </li>
              );
            })}
          </ol>
          <div>
            <Button
              icon="plus"
              disabled={rows.length >= MAX_EXERCISES}
              onClick={() => setRows((prev) => [...prev, newRow({ id: null, name: '', focus: '' })])}
            >
              Adicionar exercício
            </Button>
          </div>
        </Card>

        <div className={styles.actions}>
          <ButtonLink to={editing && training ? PATHS.training(training.id) : PATHS.trainings}>Cancelar</ButtonLink>
          <Button type="submit" variant="primary" icon="save" disabled={saving}>
            {saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar treino'}
          </Button>
        </div>
      </form>
    </>
  );
}
