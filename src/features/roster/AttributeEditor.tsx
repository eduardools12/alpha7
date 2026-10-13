import {
  ATTRIBUTE_GROUP_LABEL,
  ATTRIBUTE_MAX,
  ATTRIBUTE_META,
  ATTRIBUTE_MIN,
  attributeKeysByGroup,
  parseAttributeInput,
  validateAttributes,
  type AttributeGroup,
  type AttributeKey,
  type Attributes,
} from '@/domain/attributes';
import styles from './AttributeEditor.module.css';

/** Notas como texto (campos de formulário): permitem apagar e digitar sem forçar um valor. */
export type AttributeInputs = Record<AttributeKey, string>;
export type AttributeInputErrors = Partial<Record<AttributeKey, string>>;

const GROUPS: AttributeGroup[] = ['tecnico', 'fisico-mental'];

export function attributesToInputs(attributes: Attributes | null, fallback = 70): AttributeInputs {
  const entries = (Object.keys(ATTRIBUTE_META) as AttributeKey[]).map((key) => [
    key,
    String(attributes ? attributes[key] : fallback),
  ]);
  return Object.fromEntries(entries) as AttributeInputs;
}

export function parseAttributeInputs(inputs: AttributeInputs) {
  const parsed: Partial<Record<AttributeKey, number | null>> = {};
  for (const key of Object.keys(inputs) as AttributeKey[]) parsed[key] = parseAttributeInput(inputs[key]);
  return validateAttributes(parsed as Partial<Record<AttributeKey, unknown>>);
}

interface AttributeEditorProps {
  values: AttributeInputs;
  errors?: AttributeInputErrors;
  onChange: (key: AttributeKey, value: string) => void;
}

export function AttributeEditor({ values, errors = {}, onChange }: AttributeEditorProps) {
  return (
    <div className={styles.groups}>
      {GROUPS.map((group) => (
        <fieldset key={group} className={styles.group}>
          <legend className={styles.legend}>{ATTRIBUTE_GROUP_LABEL[group]}</legend>
          {attributeKeysByGroup(group).map((key) => {
            const { label } = ATTRIBUTE_META[key];
            const parsed = parseAttributeInput(values[key]);
            const error = errors[key];
            return (
              <div key={key} className={styles.row}>
                <label htmlFor={`attr-${key}`} className={styles.label}>
                  {label} <abbr title={label}>{key}</abbr>
                </label>
                <input
                  id={`attr-${key}`}
                  className={styles.number}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={values[key]}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `attr-${key}-error` : undefined}
                  onChange={(event) => onChange(key, event.target.value)}
                />
                <input
                  className={styles.range}
                  type="range"
                  min={ATTRIBUTE_MIN}
                  max={ATTRIBUTE_MAX}
                  value={parsed ?? ATTRIBUTE_MIN}
                  aria-label={`${label}, controle deslizante`}
                  onChange={(event) => onChange(key, event.target.value)}
                />
                {error && (
                  <p id={`attr-${key}-error`} className={styles.error} role="alert">
                    {error}
                  </p>
                )}
              </div>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}
