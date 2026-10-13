import { ATTRIBUTE_KEYS, type Attributes, ATTRIBUTE_MAX, ATTRIBUTE_MIN } from '@/domain/attributes';
import { createEmptyLineup, type Lineup } from '@/domain/lineup';
import { cloneWeights, DEFAULT_OVERALL_WEIGHTS } from '@/domain/overall';
import type { Evaluation, Player, PlayerStatus, UniformColor } from '@/domain/player';
import type { Position } from '@/domain/positions';
import type { ActivitySnapshot, Workspace } from './types';

/**
 * DADOS DE DEMONSTRAÇÃO. Nomes, números, notas, treinos e partidas abaixo são fictícios
 * e existem só para exercitar a interface. Todo registro carrega `demo: true`.
 * Nenhum deles representa resultados reais do Alpha7.
 */

type Ratings = [sac: number, rec: number, lev: number, ata: number, blq: number, def: number, vel: number, imp: number, lei: number];

interface DemoPlayerSpec {
  number: number;
  name: string;
  position: Position;
  secondary: Position | null;
  status: PlayerStatus;
  uniform: UniformColor;
  /** Notas na avaliação mais recente, na ordem SAC REC LEV ATA BLQ DEF VEL IMP LEI. */
  ratings: Ratings | null;
  /** Índices (0-5) das rodadas de avaliação em que o atleta foi avaliado. */
  rounds: number[];
  notes?: string;
}

const ALL_ROUNDS = [0, 1, 2, 3, 4, 5];
const EVALUATION_DATES = ['2026-05-20', '2026-06-24', '2026-07-29', '2026-08-26', '2026-09-23', '2026-10-07'];

const SPECS: DemoPlayerSpec[] = [
  { number: 1, name: 'Danilo Ferraz', position: 'libero', secondary: null, status: 'ativo', uniform: 'white', ratings: [40, 86, 58, 35, 30, 88, 80, 60, 82], rounds: ALL_ROUNDS },
  { number: 2, name: 'Matheus Cardoso', position: 'central', secondary: null, status: 'ativo', uniform: 'purple', ratings: [62, 45, 40, 78, 86, 60, 70, 84, 72], rounds: ALL_ROUNDS },
  { number: 3, name: 'André Nunes', position: 'ponteiro', secondary: 'libero', status: 'ativo', uniform: 'white', ratings: [66, 78, 35, 76, 50, 80, 72, 70, 68], rounds: ALL_ROUNDS },
  { number: 4, name: 'Lucas Moreira', position: 'levantador', secondary: null, status: 'ativo', uniform: 'white', ratings: [64, 60, 88, 52, 60, 66, 72, 60, 86], rounds: ALL_ROUNDS },
  { number: 5, name: 'Felipe Barros', position: 'oposto', secondary: 'ponteiro', status: 'ativo', uniform: 'purple', ratings: [74, 45, 38, 89, 70, 58, 68, 86, 66], rounds: ALL_ROUNDS },
  { number: 6, name: 'Caio Prado', position: 'levantador', secondary: null, status: 'ativo', uniform: 'purple', ratings: [58, 55, 80, 45, 52, 62, 70, 58, 76], rounds: [2, 3, 4, 5] },
  { number: 7, name: 'Diego Santos', position: 'libero', secondary: null, status: 'ativo', uniform: 'purple', ratings: [38, 82, 55, 30, 28, 84, 78, 55, 76], rounds: ALL_ROUNDS },
  {
    number: 8,
    name: 'Gabriel Silva',
    position: 'ponteiro',
    secondary: 'oposto',
    status: 'ativo',
    uniform: 'purple',
    ratings: [85, 82, 40, 91, 70, 80, 89, 94, 87],
    rounds: ALL_ROUNDS,
    notes: 'Dado de demonstração. Evolução física constante; foco em calibrar a recepção sob pressão.',
  },
  { number: 9, name: 'Rafael Lopes', position: 'levantador', secondary: null, status: 'ativo', uniform: 'white', ratings: [60, 58, 84, 48, 55, 64, 68, 56, 80], rounds: ALL_ROUNDS },
  { number: 10, name: 'Pedro Almeida', position: 'central', secondary: null, status: 'ativo', uniform: 'white', ratings: [66, 50, 40, 82, 84, 62, 66, 80, 70], rounds: ALL_ROUNDS },
  { number: 11, name: 'Vitor Klein', position: 'central', secondary: null, status: 'lesionado', uniform: 'purple', ratings: [60, 40, 36, 76, 88, 58, 64, 82, 74], rounds: ALL_ROUNDS },
  { number: 12, name: 'Murilo Vaz', position: 'ponteiro', secondary: null, status: 'ativo', uniform: 'white', ratings: [70, 72, 36, 74, 52, 74, 76, 72, 64], rounds: [4, 5] },
  { number: 13, name: 'Henrique Oliveira', position: 'ponteiro', secondary: 'oposto', status: 'ativo', uniform: 'purple', ratings: [76, 70, 38, 78, 58, 72, 74, 74, 68], rounds: ALL_ROUNDS },
  { number: 14, name: 'Samuel Duarte', position: 'oposto', secondary: null, status: 'lesionado', uniform: 'white', ratings: [72, 44, 34, 86, 66, 56, 66, 80, 62], rounds: ALL_ROUNDS },
  { number: 15, name: 'Thiago Ribeiro', position: 'oposto', secondary: null, status: 'ativo', uniform: 'purple', ratings: [78, 46, 36, 84, 72, 60, 70, 82, 66], rounds: ALL_ROUNDS },
  { number: 16, name: 'Bruno Teixeira', position: 'central', secondary: null, status: 'transicao', uniform: 'white', ratings: [54, 38, 34, 70, 74, 52, 62, 72, 60], rounds: [3, 4, 5] },
  { number: 17, name: 'Leandro Gomes', position: 'ponteiro', secondary: null, status: 'ativo', uniform: 'purple', ratings: [68, 76, 34, 72, 48, 78, 72, 68, 66], rounds: [3, 4, 5] },
  // Sem nenhuma avaliação: exercita o caso "dado ausente" (Overall indisponível, nunca 0).
  { number: 18, name: 'Otávio Hernandes', position: 'ponteiro', secondary: null, status: 'transicao', uniform: 'white', ratings: null, rounds: [], notes: 'Recém-chegado, ainda sem avaliação técnica.' },
];

const clamp = (value: number) => Math.min(ATTRIBUTE_MAX, Math.max(ATTRIBUTE_MIN, value));

/** Notas de uma rodada: parte da avaliação mais recente e retrocede de forma determinística. */
function ratingsForRound(latest: Ratings, playerIndex: number, roundsAgo: number): Attributes {
  const values = latest.map((base, k) => {
    if (roundsAgo === 0) return base;
    const growthPerRound = (playerIndex + k) % 3; // 0, 1 ou 2 pontos por rodada
    const wobble = ((playerIndex * 3 + k * 5 + roundsAgo * 7) % 3) - 1;
    return clamp(base - growthPerRound * roundsAgo + wobble);
  });
  return Object.fromEntries(ATTRIBUTE_KEYS.map((key, k) => [key, values[k]])) as Attributes;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function createDemoWorkspace(now: Date = new Date()): Workspace {
  const nowIso = now.toISOString();
  const players: Player[] = [];
  const evaluations: Evaluation[] = [];

  SPECS.forEach((spec, index) => {
    const id = `demo-p-${pad(spec.number)}`;
    players.push({
      id,
      name: spec.name,
      jerseyNumber: spec.number,
      primaryPosition: spec.position,
      secondaryPosition: spec.secondary,
      status: spec.status,
      uniform: spec.uniform,
      coachNotes: spec.notes ?? '',
      createdAt: nowIso,
      updatedAt: nowIso,
      demo: true,
    });

    if (!spec.ratings) return;
    const lastRound = spec.rounds[spec.rounds.length - 1] ?? 5;
    spec.rounds.forEach((round, roundIndex) => {
      const date = EVALUATION_DATES[round] as string;
      evaluations.push({
        id: `demo-e-${pad(spec.number)}-${roundIndex + 1}`,
        playerId: id,
        evaluatedAt: date,
        evaluator: 'Treinador (demo)',
        note: '',
        attributes: ratingsForRound(spec.ratings as Ratings, index, lastRound - round),
        createdAt: `${date}T12:00:00.000Z`,
        demo: true,
      });
    });
  });

  const lineup: Lineup = {
    ...createEmptyLineup('demo-l-01', nowIso),
    title: 'Escalação de exemplo',
    opponent: 'Rivals FC (demo)',
    competition: 'Campeonato (demo)',
    venue: 'Quadra principal (demo)',
    formation: '5-1',
    // P1 levantador, P2 ponteiro, P3 central, P4 oposto, P5 ponteiro, P6 central (diagonais corretas do 5-1)
    starters: [
      { playerId: 'demo-p-04', role: 'levantador' },
      { playerId: 'demo-p-08', role: 'ponteiro' },
      { playerId: 'demo-p-10', role: 'central' },
      { playerId: 'demo-p-05', role: 'oposto' },
      { playerId: 'demo-p-12', role: 'ponteiro' },
      { playerId: 'demo-p-02', role: 'central' },
    ],
    liberoId: 'demo-p-01',
    benchIds: ['demo-p-09', 'demo-p-07', 'demo-p-13', 'demo-p-15'],
    demo: true,
  };

  const day = 24 * 60 * 60 * 1000;
  const nextMatchDate = new Date(now.getTime() + 3 * day);
  nextMatchDate.setHours(19, 30, 0, 0);
  const lastTrainingDate = new Date(now.getTime() - 1 * day);

  const activity: ActivitySnapshot = {
    demo: true,
    trainingsCount: 42,
    matches: { played: 14, wins: 11 },
    nextMatch: {
      opponent: 'Rivals FC',
      competition: 'Campeonato (demo)',
      scheduledAt: `${nextMatchDate.getFullYear()}-${pad(nextMatchDate.getMonth() + 1)}-${pad(nextMatchDate.getDate())}T19:30`,
      venue: 'Quadra principal (demo)',
    },
    lastTraining: {
      date: `${lastTrainingDate.getFullYear()}-${pad(lastTrainingDate.getMonth() + 1)}-${pad(lastTrainingDate.getDate())}`,
      focus: 'Transição e saque',
      attendance: { present: 17, total: 18 },
      intensity: 'alta',
    },
  };

  return {
    players,
    evaluations,
    lineups: [lineup],
    settings: { weights: cloneWeights(DEFAULT_OVERALL_WEIGHTS) },
    activity,
  };
}

export function createEmptyWorkspace(): Workspace {
  return {
    players: [],
    evaluations: [],
    lineups: [],
    settings: { weights: cloneWeights(DEFAULT_OVERALL_WEIGHTS) },
    activity: null,
  };
}
