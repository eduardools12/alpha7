import { ATTRIBUTE_KEYS, createUniformAttributes, withAttribute, type Attributes } from './attributes';
import {
  calculateOverall,
  cloneWeights,
  DEFAULT_OVERALL_WEIGHTS,
  explainOverall,
  totalWeight,
  validatePositionWeights,
  withWeight,
} from './overall';
import { POSITIONS } from './positions';

const profile: Attributes = { SAC: 80, REC: 60, LEV: 40, ATA: 90, BLQ: 70, DEF: 50, VEL: 75, IMP: 85, LEI: 66 };

describe('pesos padrão do Overall', () => {
  it.each(POSITIONS)('os pesos de %s somam 100', (position) => {
    expect(totalWeight(DEFAULT_OVERALL_WEIGHTS[position])).toBe(100);
  });

  it.each(POSITIONS)('os pesos de %s são válidos', (position) => {
    expect(validatePositionWeights(DEFAULT_OVERALL_WEIGHTS[position])).toBeNull();
  });
});

describe('calculateOverall', () => {
  it('atletas com todos os atributos iguais têm Overall igual a esse valor, em qualquer posição', () => {
    for (const position of POSITIONS) {
      expect(calculateOverall(createUniformAttributes(73), position)).toBe(73);
    }
  });

  it('calcula a média ponderada e arredonda ao inteiro mais próximo', () => {
    // Ponteiro: SAC12 REC22 LEV0 ATA22 BLQ6 DEF16 VEL8 IMP8 LEI6
    // 80*.12 + 60*.22 + 0 + 90*.22 + 70*.06 + 50*.16 + 75*.08 + 85*.08 + 66*.06 = 71.56
    expect(explainOverall(profile, 'ponteiro').rawScore).toBeCloseTo(71.56, 10);
    expect(calculateOverall(profile, 'ponteiro')).toBe(72);
  });

  it('a mesma ficha rende Overalls diferentes conforme a posição', () => {
    const central = calculateOverall(profile, 'central'); // pesa bloqueio e ataque: 76.58
    const libero = calculateOverall(profile, 'libero'); // pesa recepção e defesa: 57.64
    expect(central).toBe(77);
    expect(libero).toBe(58);
  });

  it('um atributo com peso zero não influencia o resultado', () => {
    // Ponteiro tem LEV com peso 0
    const low = calculateOverall(withAttribute(profile, 'LEV', 1), 'ponteiro');
    const high = calculateOverall(withAttribute(profile, 'LEV', 99), 'ponteiro');
    expect(low).toBe(high);
  });

  it('alterar um atributo com peso relevante altera o Overall', () => {
    const before = calculateOverall(profile, 'ponteiro');
    const after = calculateOverall(withAttribute(profile, 'REC', 90), 'ponteiro');
    expect(after).toBeGreaterThan(before);
  });
});

describe('pesos configuráveis por posição', () => {
  it('alterar o peso de uma posição muda o Overall dessa posição e só dela', () => {
    const custom = withWeight(DEFAULT_OVERALL_WEIGHTS, 'ponteiro', 'SAC', 80);
    expect(calculateOverall(profile, 'ponteiro', custom)).not.toBe(calculateOverall(profile, 'ponteiro'));
    expect(calculateOverall(profile, 'central', custom)).toBe(calculateOverall(profile, 'central'));
  });

  it('não altera o objeto original (imutabilidade)', () => {
    const copy = cloneWeights(DEFAULT_OVERALL_WEIGHTS);
    withWeight(copy, 'oposto', 'ATA', 1);
    expect(copy).toEqual(DEFAULT_OVERALL_WEIGHTS);
  });

  it('o resultado é normalizado: dobrar todos os pesos não muda o Overall', () => {
    const doubled = cloneWeights(DEFAULT_OVERALL_WEIGHTS);
    for (const key of ATTRIBUTE_KEYS) doubled.oposto[key] = DEFAULT_OVERALL_WEIGHTS.oposto[key] / 2;
    expect(calculateOverall(profile, 'oposto', doubled)).toBe(calculateOverall(profile, 'oposto'));
  });

  it('rejeita peso negativo, maior que 100 ou não numérico', () => {
    expect(() => withWeight(DEFAULT_OVERALL_WEIGHTS, 'oposto', 'ATA', -1)).toThrow(RangeError);
    expect(() => withWeight(DEFAULT_OVERALL_WEIGHTS, 'oposto', 'ATA', 101)).toThrow(RangeError);
    expect(() => withWeight(DEFAULT_OVERALL_WEIGHTS, 'oposto', 'ATA', Number.NaN)).toThrow(RangeError);
  });

  it('recusa calcular quando todos os pesos da posição são zero', () => {
    const zeroed = cloneWeights(DEFAULT_OVERALL_WEIGHTS);
    for (const key of ATTRIBUTE_KEYS) zeroed.libero[key] = 0;
    expect(validatePositionWeights(zeroed.libero)).toMatch(/maior que zero/);
    expect(() => calculateOverall(profile, 'libero', zeroed)).toThrow(RangeError);
  });
});

describe('explainOverall', () => {
  it('as contribuições somam a nota bruta e os pesos relativos somam 100%', () => {
    const explanation = explainOverall(profile, 'central');
    const points = explanation.contributions.reduce((sum, c) => sum + c.points, 0);
    const percent = explanation.contributions.reduce((sum, c) => sum + c.weightPercent, 0);
    expect(points).toBeCloseTo(explanation.rawScore, 10);
    expect(percent).toBeCloseTo(100, 10);
    expect(Math.round(explanation.rawScore)).toBe(explanation.overall);
  });

  it('lista os nove atributos', () => {
    expect(explainOverall(profile, 'oposto').contributions.map((c) => c.key)).toEqual([...ATTRIBUTE_KEYS]);
  });
});
