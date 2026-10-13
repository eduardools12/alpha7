import { describe, expect, it } from 'vitest';
import { dateBlock } from './format';

describe('dateBlock', () => {
  it('separa dia com dois dígitos e mês abreviado', () => {
    expect(dateBlock('2026-10-07')).toEqual({ day: '07', month: 'out' });
    expect(dateBlock('2026-01-31')).toEqual({ day: '31', month: 'jan' });
  });

  it('sem data válida mostra traço e mês vazio, nunca uma data inventada', () => {
    expect(dateBlock('')).toEqual({ day: '—', month: '' });
    expect(dateBlock('não é data')).toEqual({ day: '—', month: '' });
  });
});
