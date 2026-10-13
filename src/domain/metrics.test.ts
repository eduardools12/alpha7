import { average, formatPercent, formatRatioContext, ratio, UNAVAILABLE } from './metrics';

describe('ausência de dado não é zero', () => {
  it('sem tentativas, a métrica é indisponível (null), não 0%', () => {
    const r = ratio(0, 0);
    expect(r.value).toBeNull();
    expect(formatPercent(r)).toBe(UNAVAILABLE);
    expect(formatRatioContext(r)).toBe('sem tentativas registradas');
  });

  it('com tentativas e nenhum acerto, o desempenho medido é 0% de verdade', () => {
    const r = ratio(0, 12);
    expect(r.value).toBe(0);
    expect(formatPercent(r)).toBe('0,0%');
    expect(formatRatioContext(r)).toBe('0 de 12');
  });

  it('o percentual vem sempre acompanhado das tentativas', () => {
    const r = ratio(162, 300);
    expect(formatPercent(r)).toBe('54,0%');
    expect(formatRatioContext(r)).toBe('162 de 300');
  });

  it('formata com a quantidade de casas pedida e vírgula decimal', () => {
    expect(formatPercent(ratio(18, 141), 1)).toBe('12,8%');
    expect(formatPercent(ratio(1, 3), 0)).toBe('33%');
  });

  it.each([
    [-1, 5],
    [1, -5],
    [1.5, 5],
    [6, 5],
  ])('rejeita acertos=%s tentativas=%s', (successes, attempts) => {
    expect(() => ratio(successes, attempts)).toThrow(RangeError);
  });
});

describe('average', () => {
  it('lista vazia não tem média (null, não 0)', () => {
    expect(average([])).toBeNull();
  });
  it('calcula a média aritmética', () => {
    expect(average([80, 90, 85])).toBe(85);
  });
});
