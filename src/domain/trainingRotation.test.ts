import { afterRegistration, clampSeries, interpretShortcut, stepParticipantId } from './trainingRotation';

describe('stepParticipantId', () => {
  const ids = ['a', 'b', 'c'];

  it('avança e volta de forma circular', () => {
    expect(stepParticipantId(ids, 'a', 1)).toBe('b');
    expect(stepParticipantId(ids, 'c', 1)).toBe('a');
    expect(stepParticipantId(ids, 'a', -1)).toBe('c');
    expect(stepParticipantId(ids, 'c', -1)).toBe('b');
  });

  it('sem atleta escolhido, avançar escolhe o primeiro e voltar escolhe o último', () => {
    expect(stepParticipantId(ids, null, 1)).toBe('a');
    expect(stepParticipantId(ids, null, -1)).toBe('c');
  });

  it('atleta que saiu da lista (removido do treino) recomeça pelo primeiro ou último, sem quebrar', () => {
    expect(stepParticipantId(ids, 'fora', 1)).toBe('a');
    expect(stepParticipantId(ids, 'fora', -1)).toBe('c');
  });

  it('um só participante continua nele; lista vazia devolve null', () => {
    expect(stepParticipantId(['solo'], 'solo', 1)).toBe('solo');
    expect(stepParticipantId(['solo'], 'solo', -1)).toBe('solo');
    expect(stepParticipantId([], 'a', 1)).toBeNull();
    expect(stepParticipantId([], null, -1)).toBeNull();
  });
});

describe('clampSeries', () => {
  it('limita a 1..20 e arredonda para o inteiro mais próximo', () => {
    expect(clampSeries(0)).toBe(1);
    expect(clampSeries(-5)).toBe(1);
    expect(clampSeries(1000)).toBe(20);
    expect(clampSeries(2.7)).toBe(3);
    expect(clampSeries(5)).toBe(5);
  });

  it('valor que não é número (campo vazio) vira 1', () => {
    expect(clampSeries(Number.NaN)).toBe(1);
    expect(clampSeries(Number('abc'))).toBe(1);
  });
});

describe('afterRegistration', () => {
  it('desligado nunca avança e zera a contagem', () => {
    expect(afterRegistration({ enabled: false, every: 1 }, 4)).toEqual({ advance: false, doneInSeries: 0 });
  });

  it('a cada registro (N = 1) avança sempre', () => {
    expect(afterRegistration({ enabled: true, every: 1 }, 0)).toEqual({ advance: true, doneInSeries: 0 });
  });

  it('a cada 3 tentativas avança só na terceira e recomeça a contagem', () => {
    let done = 0;
    const steps: boolean[] = [];
    for (let i = 0; i < 6; i += 1) {
      const next = afterRegistration({ enabled: true, every: 3 }, done);
      steps.push(next.advance);
      done = next.doneInSeries;
    }
    expect(steps).toEqual([false, false, true, false, false, true]);
    expect(done).toBe(0);
  });

  it('N inválido é tratado como o valor válido mais próximo', () => {
    expect(afterRegistration({ enabled: true, every: 0 }, 0).advance).toBe(true); // 0 vira 1
    expect(afterRegistration({ enabled: true, every: 1000 }, 18).advance).toBe(false); // 1000 vira 20: 19 de 20
    expect(afterRegistration({ enabled: true, every: 1000 }, 19).advance).toBe(true);
  });
});

describe('interpretShortcut', () => {
  it('teclas 1 a 9 escolhem o resultado correspondente, se ele existir', () => {
    expect(interpretShortcut('1', 3)).toEqual({ kind: 'outcome', index: 0 });
    expect(interpretShortcut('3', 3)).toEqual({ kind: 'outcome', index: 2 });
    expect(interpretShortcut('4', 3)).toBeNull();
    expect(interpretShortcut('0', 3)).toBeNull();
  });

  it('setas trocam de atleta', () => {
    expect(interpretShortcut('ArrowRight', 3)).toEqual({ kind: 'player', step: 1 });
    expect(interpretShortcut('ArrowLeft', 3)).toEqual({ kind: 'player', step: -1 });
  });

  it('qualquer outra tecla é ignorada', () => {
    for (const key of ['a', 'Enter', ' ', 'ArrowUp', 'Tab', '10', '']) expect(interpretShortcut(key, 4)).toBeNull();
  });
});
