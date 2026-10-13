import { TextAreaField, TextField } from '@/components/ui/Field';
import { NOTES_MAX, type EvaluationFieldErrors, type EvaluationFormValues } from '@/domain/player';

interface EvaluationFieldsProps {
  values: EvaluationFormValues;
  errors: EvaluationFieldErrors;
  today: string;
  /** Mostra o campo de observação (a avaliação inicial do cadastro não precisa dele). */
  withNote?: boolean;
  onChange: (field: keyof EvaluationFormValues, value: string) => void;
}

export function EvaluationFields({ values, errors, today, withNote = false, onChange }: EvaluationFieldsProps) {
  return (
    <>
      <TextField
        label="Data da avaliação"
        type="date"
        max={today}
        value={values.evaluatedAt}
        error={errors.evaluatedAt}
        onChange={(event) => onChange('evaluatedAt', event.target.value)}
      />
      <TextField
        label="Quem avaliou"
        value={values.evaluator}
        error={errors.evaluator}
        hint="Fica registrado no histórico de avaliações."
        autoComplete="off"
        onChange={(event) => onChange('evaluator', event.target.value)}
      />
      {withNote && (
        <TextAreaField
          label="Observação da avaliação (opcional)"
          value={values.note}
          error={errors.note}
          maxLength={NOTES_MAX + 50}
          aside={`${values.note.length}/${NOTES_MAX}`}
          onChange={(event) => onChange('note', event.target.value)}
        />
      )}
    </>
  );
}
