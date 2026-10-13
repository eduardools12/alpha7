/**
 * Fundamentos e resultados possíveis de uma tentativa.
 *
 * Esta taxonomia é COMPARTILHADA entre treinos e (no futuro) partidas, mas os eventos de
 * cada contexto ficam em coleções separadas (TrainingEvent aqui; MatchEvent depois), para
 * que dados de treino nunca se misturem com dados competitivos.
 *
 * Os critérios de cada resultado são definições do Alpha7 e precisam de validação da
 * comissão técnica (docs/METRICS.md, seção "Critérios"). Não são padrão oficial universal.
 */
export const FUNDAMENTALS = ['saque', 'recepcao', 'levantamento', 'ataque', 'bloqueio', 'defesa'] as const;
export type Fundamental = (typeof FUNDAMENTALS)[number];

export const FUNDAMENTAL_LABEL: Record<Fundamental, string> = {
  saque: 'Saque',
  recepcao: 'Recepção',
  levantamento: 'Levantamento',
  ataque: 'Ataque',
  bloqueio: 'Bloqueio',
  defesa: 'Defesa',
};

/** Resultados válidos por fundamento. Em cada fundamento são mutuamente exclusivos. */
export const OUTCOME_VALUES = {
  saque: ['ace', 'valido', 'erro'],
  recepcao: ['A', 'B', 'C', 'erro'],
  levantamento: ['excelente', 'atacavel', 'quebrado', 'erro'],
  ataque: ['ponto', 'erro', 'bloqueado', 'outra'],
  bloqueio: ['ponto', 'sem_ponto', 'erro'],
  defesa: ['positiva', 'recuperada', 'erro'],
} as const;

export type OutcomeFor<F extends Fundamental> = (typeof OUTCOME_VALUES)[F][number];

/** Par fundamento + resultado coerente entre si (ex.: recepção só aceita A, B, C ou erro). */
export type FundamentalResult = {
  [F in Fundamental]: { fundamental: F; outcome: OutcomeFor<F> };
}[Fundamental];

export function isFundamental(value: unknown): value is Fundamental {
  return typeof value === 'string' && (FUNDAMENTALS as readonly string[]).includes(value);
}

export function isOutcomeOf<F extends Fundamental>(fundamental: F, value: unknown): value is OutcomeFor<F> {
  return typeof value === 'string' && (OUTCOME_VALUES[fundamental] as readonly string[]).includes(value);
}

/** Monta o par validado em tempo de execução; null se o resultado não pertence ao fundamento. */
export function toFundamentalResult(fundamental: unknown, outcome: unknown): FundamentalResult | null {
  if (!isFundamental(fundamental) || !isOutcomeOf(fundamental, outcome)) return null;
  // O tipo da união não pode ser provado pelo compilador a partir de dois valores soltos;
  // a verificação acima garante a coerência.
  return { fundamental, outcome } as FundamentalResult;
}

export type OutcomeTone = 'good' | 'ok' | 'warn' | 'bad' | 'neutral';

export interface OutcomeInfo {
  label: string;
  /** Subtítulo curto do botão. */
  short: string;
  /** Critério completo, mostrado na tela de registro e no resumo. */
  criterion: string;
  tone: OutcomeTone;
}

export const OUTCOME_INFO: { [F in Fundamental]: Record<OutcomeFor<F>, OutcomeInfo> } = {
  saque: {
    ace: { label: 'Ace', short: 'Ponto direto', criterion: 'Saque que termina em ponto direto, sem que o adversário consiga jogar a bola.', tone: 'good' },
    valido: { label: 'Válido', short: 'Em jogo, sem ace', criterion: 'Saque dentro da quadra que não termina em ace: a bola entra em jogo.', tone: 'neutral' },
    erro: { label: 'Erro', short: 'Erro de saque', criterion: 'Erro de saque: bola na rede, fora da quadra ou falta.', tone: 'bad' },
  },
  recepcao: {
    A: { label: 'A', short: 'Praticamente todas as opções', criterion: 'Recepção que permite manter praticamente todas as opções ofensivas treinadas.', tone: 'good' },
    B: { label: 'B', short: 'Controlada, opções limitadas', criterion: 'Recepção controlada que permite construir o ataque, com algumas opções limitadas.', tone: 'ok' },
    C: { label: 'C', short: 'Quebrada, ataque restrito', criterion: 'Recepção quebrada que restringe o ataque e tende a exigir uma solução de emergência.', tone: 'warn' },
    erro: { label: 'Erro', short: 'Ponto direto do adversário', criterion: 'Recepção que concede o ponto diretamente ao adversário.', tone: 'bad' },
  },
  levantamento: {
    excelente: { label: 'Excelente', short: 'Opções planejadas', criterion: 'Oferece ao atacante as opções ofensivas planejadas.', tone: 'good' },
    atacavel: { label: 'Atacável', short: 'Ataque controlado', criterion: 'Permite construir um ataque controlado, embora com limitações.', tone: 'ok' },
    quebrado: { label: 'Quebrado', short: 'Bola desfavorável', criterion: 'Obriga o atacante a resolver uma bola desfavorável.', tone: 'warn' },
    erro: { label: 'Erro', short: 'Segundo toque com erro', criterion: 'Segundo toque que resulta em erro direto.', tone: 'bad' },
  },
  ataque: {
    ponto: { label: 'Ponto', short: 'Ataque que pontua', criterion: 'Ataque que termina em ponto.', tone: 'good' },
    erro: { label: 'Erro', short: 'Erro direto', criterion: 'Erro direto de ataque: bola fora, na rede ou falta.', tone: 'bad' },
    bloqueado: { label: 'Bloqueado', short: 'Bloqueio pontua', criterion: 'Ataque bloqueado que dá ponto ao adversário.', tone: 'bad' },
    outra: { label: 'Outra tentativa', short: 'Bola continua', criterion: 'Tentativa que não terminou em ponto, erro direto nem bloqueio para ponto: a bola continuou em jogo.', tone: 'neutral' },
  },
  bloqueio: {
    ponto: { label: 'Ponto', short: 'Bloqueio que pontua', criterion: 'Bloqueio que termina em ponto direto.', tone: 'good' },
    sem_ponto: { label: 'Sem ponto', short: 'Tentativa sem ponto', criterion: 'Tentativa de bloqueio que não terminou em ponto nem em erro.', tone: 'neutral' },
    erro: { label: 'Erro', short: 'Erro de bloqueio', criterion: 'Erro de bloqueio: rede, invasão, toque duplo ou bola que concede o ponto.', tone: 'bad' },
  },
  defesa: {
    positiva: { label: 'Positiva', short: 'Permite contra-ataque', criterion: 'Defesa controlada que permite organizar o contra-ataque.', tone: 'good' },
    recuperada: { label: 'Recuperada', short: 'Bola salva', criterion: 'Bola mantida em jogo, mas sem condições de contra-atacar com as opções planejadas.', tone: 'warn' },
    erro: { label: 'Erro', short: 'Bola cai ou erro', criterion: 'Bola que cai no chão ou erro no toque que concede o ponto.', tone: 'bad' },
  },
};

export function outcomeInfo(result: FundamentalResult): OutcomeInfo {
  return (OUTCOME_INFO[result.fundamental] as Record<string, OutcomeInfo>)[result.outcome] as OutcomeInfo;
}

export function outcomeLabel(fundamental: Fundamental, outcome: string): string {
  const table = OUTCOME_INFO[fundamental] as Record<string, OutcomeInfo>;
  return table[outcome]?.label ?? outcome;
}
