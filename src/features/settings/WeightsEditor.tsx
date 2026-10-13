import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Notice } from '@/components/ui/Notice';
import { ATTRIBUTE_KEYS, ATTRIBUTE_META, type AttributeKey } from '@/domain/attributes';
import {
  cloneWeights,
  DEFAULT_OVERALL_WEIGHTS,
  MAX_WEIGHT,
  validatePositionWeights,
  type OverallWeights,
} from '@/domain/overall';
import { POSITION_LABEL, POSITIONS, type Position } from '@/domain/positions';
import styles from './WeightsEditor.module.css';

type Inputs = Record<Position, Record<AttributeKey, string>>;

const toInputs = (weights: OverallWeights): Inputs =>
  Object.fromEntries(
    POSITIONS.map((p) => [p, Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, String(weights[p][k])]))]),
  ) as Inputs;

interface Parsed {
  weights: OverallWeights;
  cellErrors: Partial<Record<`${Position}.${AttributeKey}`, string>>;
  positionErrors: Partial<Record<Position, string>>;
}

function parse(inputs: Inputs): Parsed {
  const weights = cloneWeights(DEFAULT_OVERALL_WEIGHTS);
  const cellErrors: Parsed['cellErrors'] = {};
  const positionErrors: Parsed['positionErrors'] = {};
  for (const position of POSITIONS) {
    for (const key of ATTRIBUTE_KEYS) {
      const text = inputs[position][key].trim().replace(',', '.');
      const value = Number(text);
      if (text === '' || !Number.isFinite(value) || value < 0 || value > MAX_WEIGHT) {
        cellErrors[`${position}.${key}`] = `Use um número de 0 a ${MAX_WEIGHT}.`;
      } else {
        weights[position][key] = value;
      }
    }
    const hasCellError = ATTRIBUTE_KEYS.some((k) => cellErrors[`${position}.${k}`]);
    if (!hasCellError) {
      const problem = validatePositionWeights(weights[position]);
      if (problem) positionErrors[position] = problem;
    }
  }
  return { weights, cellErrors, positionErrors };
}

interface WeightsEditorProps {
  saved: OverallWeights;
  onSave: (weights: OverallWeights) => Promise<void>;
}

export function WeightsEditor({ saved, onSave }: WeightsEditorProps) {
  const [inputs, setInputs] = useState<Inputs>(() => toInputs(saved));
  const [position, setPosition] = useState<Position>('ponteiro');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const parsed = useMemo(() => parse(inputs), [inputs]);
  const hasProblems =
    Object.keys(parsed.cellErrors).length > 0 || Object.keys(parsed.positionErrors).length > 0;
  const dirty = JSON.stringify(inputs) !== JSON.stringify(toInputs(saved));
  const total = ATTRIBUTE_KEYS.reduce((sum, k) => sum + (Number(inputs[position][k].replace(',', '.')) || 0), 0);
  const isDefault = JSON.stringify(parsed.weights) === JSON.stringify(DEFAULT_OVERALL_WEIGHTS);

  const submit = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await onSave(parsed.weights);
      setMessage({ tone: 'success', text: 'Pesos salvos. Os Overalls foram recalculados com eles.' });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Não foi possível salvar.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.editor}>
      <Notice tone="info" title="Pesos provisórios">
        Os pesos são uma escolha de modelagem do Alpha7, não uma classificação científica universal. Só a proporção
        entre eles importa: o Overall é a média das notas ponderada por estes pesos.
      </Notice>

      <div role="group" aria-label="Posição" className={styles.positions}>
        {POSITIONS.map((p) => (
          <Chip key={p} pressed={position === p} onClick={() => setPosition(p)}>
            {POSITION_LABEL[p]}
            {parsed.positionErrors[p] || ATTRIBUTE_KEYS.some((k) => parsed.cellErrors[`${p}.${k}`]) ? ' ⚠' : ''}
          </Chip>
        ))}
      </div>

      <table className={styles.table}>
        <caption className="sr-only">Pesos do Overall para {POSITION_LABEL[position].toLowerCase()}</caption>
        <thead>
          <tr>
            <th scope="col">Atributo</th>
            <th scope="col">Peso</th>
            <th scope="col">Parte do total</th>
          </tr>
        </thead>
        <tbody>
          {ATTRIBUTE_KEYS.map((key) => {
            const error = parsed.cellErrors[`${position}.${key}`];
            const share = total > 0 ? ((Number(inputs[position][key].replace(',', '.')) || 0) / total) * 100 : 0;
            return (
              <tr key={key}>
                <th scope="row">
                  <label htmlFor={`peso-${position}-${key}`}>
                    {ATTRIBUTE_META[key].label} <abbr title={ATTRIBUTE_META[key].label}>{key}</abbr>
                  </label>
                </th>
                <td>
                  <input
                    id={`peso-${position}-${key}`}
                    className={styles.input}
                    inputMode="decimal"
                    autoComplete="off"
                    value={inputs[position][key]}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `peso-${position}-${key}-erro` : undefined}
                    onChange={(event) => {
                      setMessage(null);
                      setInputs((prev) => ({
                        ...prev,
                        [position]: { ...prev[position], [key]: event.target.value },
                      }));
                    }}
                  />
                  {error && (
                    <p id={`peso-${position}-${key}-erro`} className={styles.error} role="alert">
                      {error}
                    </p>
                  )}
                </td>
                <td className="tabular">{share.toFixed(0)}%</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Soma dos pesos</th>
            <td className="tabular">{total}</td>
            <td />
          </tr>
        </tfoot>
      </table>

      {parsed.positionErrors[position] && (
        <p className={styles.error} role="alert">
          {parsed.positionErrors[position]}
        </p>
      )}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <div className={styles.actions}>
        <Button variant="ghost" disabled={isDefault} onClick={() => setInputs(toInputs(DEFAULT_OVERALL_WEIGHTS))}>
          Restaurar pesos padrão
        </Button>
        <Button variant="primary" icon="save" disabled={!dirty || hasProblems || saving} onClick={() => void submit()}>
          {saving ? 'Salvando…' : 'Salvar pesos'}
        </Button>
      </div>
    </div>
  );
}
