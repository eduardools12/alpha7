import {
  ATTRIBUTE_KEYS,
  createUniformAttributes,
  isValidAttributeValue,
  parseAttributeInput,
  rankAttributes,
  validateAttributes,
  withAttribute,
} from './attributes';

describe('escala de atributos (1 a 99)', () => {
  it.each([1, 50, 99])('aceita %i', (value) => {
    expect(isValidAttributeValue(value)).toBe(true);
  });

  it.each([0, 100, -5, 7.5, Number.NaN, '80', null, undefined])('rejeita %s', (value) => {
    expect(isValidAttributeValue(value)).toBe(false);
  });

  it('são exatamente os nove atributos definidos', () => {
    expect(ATTRIBUTE_KEYS).toEqual(['SAC', 'REC', 'LEV', 'ATA', 'BLQ', 'DEF', 'VEL', 'IMP', 'LEI']);
  });
});

describe('alteração de atributos', () => {
  it('devolve uma cópia com só o atributo alterado', () => {
    const before = createUniformAttributes(60);
    const after = withAttribute(before, 'ATA', 91);
    expect(after.ATA).toBe(91);
    expect(after.SAC).toBe(60);
    expect(before.ATA).toBe(60);
  });

  it('rejeita valores fora da escala em vez de corrigi-los em silêncio', () => {
    const attrs = createUniformAttributes(60);
    expect(() => withAttribute(attrs, 'ATA', 100)).toThrow(RangeError);
    expect(() => withAttribute(attrs, 'ATA', 0)).toThrow(RangeError);
    expect(() => withAttribute(attrs, 'ATA', 80.5)).toThrow(RangeError);
  });
});

describe('parseAttributeInput', () => {
  it('lê inteiros válidos, ignorando espaços', () => {
    expect(parseAttributeInput(' 85 ')).toBe(85);
  });
  it.each(['', 'abc', '0', '100', '8.5', '-3', '1e2'])('retorna null para "%s"', (text) => {
    expect(parseAttributeInput(text)).toBeNull();
  });
});

describe('validateAttributes', () => {
  it('aprova uma ficha completa', () => {
    expect(validateAttributes(createUniformAttributes(70))).toEqual({
      ok: true,
      value: createUniformAttributes(70),
    });
  });

  it('aponta cada campo ausente ou inválido', () => {
    const result = validateAttributes({ ...createUniformAttributes(70), BLQ: 150, DEF: undefined });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['BLQ', 'DEF']);
  });
});

describe('rankAttributes', () => {
  it('ordena do maior para o menor e desempata pela ordem canônica', () => {
    const ranked = rankAttributes({ ...createUniformAttributes(50), ATA: 90, SAC: 90, DEF: 10 });
    expect(ranked.slice(0, 2).map((r) => r.key)).toEqual(['SAC', 'ATA']);
    expect(ranked[ranked.length - 1]?.key).toBe('DEF');
  });
});
