import {
  FUNDAMENTALS,
  OUTCOME_INFO,
  OUTCOME_VALUES,
  isFundamental,
  isOutcomeOf,
  outcomeInfo,
  outcomeLabel,
  toFundamentalResult,
} from './fundamentals';

describe('fundamentos e resultados', () => {
  it('são os seis fundamentos pedidos', () => {
    expect(FUNDAMENTALS).toEqual(['saque', 'recepcao', 'levantamento', 'ataque', 'bloqueio', 'defesa']);
  });

  it.each([
    ['saque', ['ace', 'valido', 'erro']],
    ['recepcao', ['A', 'B', 'C', 'erro']],
    ['levantamento', ['excelente', 'atacavel', 'quebrado', 'erro']],
    ['ataque', ['ponto', 'erro', 'bloqueado', 'outra']],
    ['bloqueio', ['ponto', 'sem_ponto', 'erro']],
    ['defesa', ['positiva', 'recuperada', 'erro']],
  ] as const)('%s aceita exatamente os resultados definidos', (fundamental, outcomes) => {
    expect([...OUTCOME_VALUES[fundamental]]).toEqual([...outcomes]);
    for (const outcome of outcomes) expect(isOutcomeOf(fundamental, outcome)).toBe(true);
  });

  it('resultado de um fundamento não vale em outro', () => {
    expect(isOutcomeOf('recepcao', 'ace')).toBe(false);
    expect(isOutcomeOf('saque', 'A')).toBe(false);
    expect(isOutcomeOf('ataque', 'positiva')).toBe(false);
    expect(isOutcomeOf('saque', undefined)).toBe(false);
    expect(isOutcomeOf('saque', 3)).toBe(false);
  });

  it('toFundamentalResult valida o par e recusa o incoerente', () => {
    expect(toFundamentalResult('recepcao', 'B')).toEqual({ fundamental: 'recepcao', outcome: 'B' });
    expect(toFundamentalResult('recepcao', 'ace')).toBeNull();
    expect(toFundamentalResult('voleibol', 'A')).toBeNull();
    expect(toFundamentalResult('saque', null)).toBeNull();
  });

  it('isFundamental recusa valores desconhecidos', () => {
    expect(isFundamental('saque')).toBe(true);
    expect(isFundamental('cortada')).toBe(false);
    expect(isFundamental(1)).toBe(false);
  });

  it('todo resultado tem rótulo, critério e tom (a tela mostra o critério)', () => {
    for (const fundamental of FUNDAMENTALS) {
      for (const outcome of OUTCOME_VALUES[fundamental]) {
        const result = toFundamentalResult(fundamental, outcome);
        expect(result).not.toBeNull();
        const info = outcomeInfo(result!);
        expect(info.label).not.toBe('');
        expect(info.criterion.length).toBeGreaterThan(20);
        expect(['good', 'ok', 'warn', 'bad', 'neutral']).toContain(info.tone);
      }
    }
  });

  it('usa as definições pedidas para recepção e levantamento', () => {
    expect(OUTCOME_INFO.recepcao.A.criterion).toBe('Recepção que permite manter praticamente todas as opções ofensivas treinadas.');
    expect(OUTCOME_INFO.recepcao.erro.criterion).toBe('Recepção que concede o ponto diretamente ao adversário.');
    expect(OUTCOME_INFO.levantamento.excelente.criterion).toBe('Oferece ao atacante as opções ofensivas planejadas.');
    expect(OUTCOME_INFO.levantamento.erro.criterion).toBe('Segundo toque que resulta em erro direto.');
  });

  it('outcomeLabel cai para o próprio valor se desconhecido', () => {
    expect(outcomeLabel('saque', 'ace')).toBe('Ace');
    expect(outcomeLabel('saque', 'xyz')).toBe('xyz');
  });
});
