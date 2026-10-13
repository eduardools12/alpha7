/**
 * Atributos técnicos do Alpha7: avaliações do treinador numa escala de 1 a 99.
 * Não são estatísticas: nunca são alterados automaticamente por resultados de jogos.
 */
export const ATTRIBUTE_KEYS = ['SAC', 'REC', 'LEV', 'ATA', 'BLQ', 'DEF', 'VEL', 'IMP', 'LEI'] as const;
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];
export type Attributes = Record<AttributeKey, number>;

export const ATTRIBUTE_MIN = 1;
export const ATTRIBUTE_MAX = 99;

export type AttributeGroup = 'tecnico' | 'fisico-mental';

export interface AttributeMeta {
  label: string;
  group: AttributeGroup;
}

export const ATTRIBUTE_META: Record<AttributeKey, AttributeMeta> = {
  SAC: { label: 'Saque', group: 'tecnico' },
  REC: { label: 'Recepção', group: 'tecnico' },
  LEV: { label: 'Levantamento', group: 'tecnico' },
  ATA: { label: 'Ataque', group: 'tecnico' },
  BLQ: { label: 'Bloqueio', group: 'tecnico' },
  DEF: { label: 'Defesa', group: 'tecnico' },
  VEL: { label: 'Velocidade e agilidade', group: 'fisico-mental' },
  IMP: { label: 'Impulsão', group: 'fisico-mental' },
  LEI: { label: 'Leitura de jogo', group: 'fisico-mental' },
};

export const ATTRIBUTE_GROUP_LABEL: Record<AttributeGroup, string> = {
  tecnico: 'Técnicos',
  'fisico-mental': 'Físicos e mentais',
};

export function attributeKeysByGroup(group: AttributeGroup): AttributeKey[] {
  return ATTRIBUTE_KEYS.filter((key) => ATTRIBUTE_META[key].group === group);
}

export function isValidAttributeValue(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= ATTRIBUTE_MIN &&
    value <= ATTRIBUTE_MAX
  );
}

/** Converte o texto de um campo em nota válida, ou null se não for um inteiro de 1 a 99. */
export function parseAttributeInput(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return isValidAttributeValue(value) ? value : null;
}

export function createUniformAttributes(value: number): Attributes {
  if (!isValidAttributeValue(value)) {
    throw new RangeError(`Atributo fora da escala ${ATTRIBUTE_MIN}-${ATTRIBUTE_MAX}: ${value}`);
  }
  return Object.fromEntries(ATTRIBUTE_KEYS.map((key) => [key, value])) as Attributes;
}

/** Devolve uma cópia com um atributo alterado. Valores inválidos são rejeitados, não corrigidos em silêncio. */
export function withAttribute(attributes: Attributes, key: AttributeKey, value: number): Attributes {
  if (!isValidAttributeValue(value)) {
    throw new RangeError(`${key}: use um inteiro de ${ATTRIBUTE_MIN} a ${ATTRIBUTE_MAX}`);
  }
  return { ...attributes, [key]: value };
}

/** Verifica um objeto vindo de formulário ou armazenamento. Retorna os atributos válidos ou os erros por campo. */
export function validateAttributes(
  input: Partial<Record<AttributeKey, unknown>>,
): { ok: true; value: Attributes } | { ok: false; errors: Partial<Record<AttributeKey, string>> } {
  const errors: Partial<Record<AttributeKey, string>> = {};
  for (const key of ATTRIBUTE_KEYS) {
    if (!isValidAttributeValue(input[key])) {
      errors[key] = `${ATTRIBUTE_META[key].label}: use um inteiro de ${ATTRIBUTE_MIN} a ${ATTRIBUTE_MAX}.`;
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { ...(input as Attributes) } };
}

export interface RankedAttribute {
  key: AttributeKey;
  value: number;
}

/** Ordena do maior para o menor. Empates mantêm a ordem canônica dos atributos. */
export function rankAttributes(attributes: Attributes): RankedAttribute[] {
  return ATTRIBUTE_KEYS.map((key, index) => ({ key, value: attributes[key], index }))
    .sort((a, b) => b.value - a.value || a.index - b.index)
    .map(({ key, value }) => ({ key, value }));
}
