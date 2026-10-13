import type { AttributeKey } from '@/domain/attributes';
import type { Fundamental } from '@/domain/fundamentals';
import { toFundamentalResult } from '@/domain/fundamentals';
import type { Evaluation, Player } from '@/domain/player';
import { latestEvaluation } from '@/domain/player';
import type { Position } from '@/domain/positions';
import type { Training, TrainingEvent, TrainingExercise } from '@/domain/training';

/**
 * TREINOS DE DEMONSTRAÇÃO. Registros fictícios, gerados de forma determinística a partir das
 * notas (também fictícias) dos atletas de demonstração, só para exercitar a interface.
 * Todo registro tem `demo: true`. Não representam o desempenho real do Alpha7.
 */

const ATTRIBUTE_OF: Record<Fundamental, AttributeKey> = {
  saque: 'SAC',
  recepcao: 'REC',
  levantamento: 'LEV',
  ataque: 'ATA',
  bloqueio: 'BLQ',
  defesa: 'DEF',
};

/** PRNG determinístico (mulberry32): o mesmo seed gera sempre a mesma sequência. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sorteia um resultado; `r` (0 a 1) é a nota do atleta no atributo do fundamento. */
function sampleOutcome(fundamental: Fundamental, r: number, u: number): string {
  switch (fundamental) {
    case 'saque':
      if (u < 0.03 + 0.12 * r) return 'ace';
      return u > 1 - (0.2 - 0.12 * r) ? 'erro' : 'valido';
    case 'recepcao': {
      const a = 0.15 + 0.45 * r;
      const b = a + 0.3;
      const c = b + 0.2 - 0.1 * r;
      return u < a ? 'A' : u < b ? 'B' : u < c ? 'C' : 'erro';
    }
    case 'levantamento': {
      const e = 0.15 + 0.4 * r;
      const at = e + 0.3;
      const q = at + 0.15;
      return u < e ? 'excelente' : u < at ? 'atacavel' : u < q ? 'quebrado' : 'erro';
    }
    case 'ataque': {
      const p = 0.2 + 0.3 * r;
      return u < p ? 'ponto' : u < p + 0.12 ? 'erro' : u < p + 0.22 ? 'bloqueado' : 'outra';
    }
    case 'bloqueio': {
      const p = 0.05 + 0.2 * r;
      return u < p ? 'ponto' : u < p + 0.08 ? 'erro' : 'sem_ponto';
    }
    case 'defesa': {
      const p = 0.25 + 0.4 * r;
      return u < p ? 'positiva' : u < p + 0.35 ? 'recuperada' : 'erro';
    }
  }
}

interface ExerciseSpec {
  id: string;
  name: string;
  focus: Fundamental | null;
  /** O que registrar neste exercício: fundamento, posições envolvidas e tentativas por atleta. */
  work: { fundamental: Fundamental; positions: readonly Position[]; attempts: number }[];
}

interface TrainingSpec {
  id: string;
  name: string;
  daysAgo: number;
  durationMinutes: number;
  description: string;
  notes: string;
  status: 'aberto' | 'concluido';
  participants: number | 'todos';
  exercises: ExerciseSpec[];
}

const ALL: readonly Position[] = ['levantador', 'oposto', 'ponteiro', 'central', 'libero'];

const SPECS: TrainingSpec[] = [
  {
    id: 'demo-t-01',
    name: 'Transição e saque',
    daysAgo: 1,
    durationMinutes: 100,
    description: 'Saque float em zonas e transição entre defesa e ataque.',
    notes: 'Dado de demonstração. Boa intensidade; saque com mais erros na segunda metade.',
    status: 'concluido',
    participants: 'todos',
    exercises: [
      { id: 'demo-x-01-1', name: 'Saque em zonas', focus: 'saque', work: [{ fundamental: 'saque', positions: ALL, attempts: 10 }] },
      {
        id: 'demo-x-01-2',
        name: 'Recepção e ataque de ponteiro',
        focus: 'recepcao',
        work: [
          { fundamental: 'recepcao', positions: ['ponteiro', 'libero', 'oposto'], attempts: 12 },
          { fundamental: 'levantamento', positions: ['levantador'], attempts: 16 },
          { fundamental: 'ataque', positions: ['ponteiro', 'oposto', 'central'], attempts: 8 },
        ],
      },
      {
        id: 'demo-x-01-3',
        name: 'Transição defesa e ataque',
        focus: 'defesa',
        work: [
          { fundamental: 'defesa', positions: ALL, attempts: 8 },
          { fundamental: 'ataque', positions: ['ponteiro', 'oposto'], attempts: 6 },
          { fundamental: 'bloqueio', positions: ['central'], attempts: 8 },
        ],
      },
    ],
  },
  {
    id: 'demo-t-02',
    name: 'Recepção e levantamento',
    daysAgo: 8,
    durationMinutes: 90,
    description: 'Recepção em 6 contra 6 e levantamento para a saída de rede.',
    notes: 'Dado de demonstração.',
    status: 'concluido',
    participants: 12,
    exercises: [
      { id: 'demo-x-02-1', name: 'Recepção em 6 contra 6', focus: 'recepcao', work: [{ fundamental: 'recepcao', positions: ['ponteiro', 'libero', 'oposto'], attempts: 14 }] },
      { id: 'demo-x-02-2', name: 'Levantamento para saída de rede', focus: 'levantamento', work: [{ fundamental: 'levantamento', positions: ['levantador'], attempts: 20 }] },
    ],
  },
  {
    id: 'demo-t-03',
    name: 'Ataque e bloqueio',
    daysAgo: 15,
    durationMinutes: 80,
    description: 'Ataque de ponta contra bloqueio duplo.',
    notes: 'Dado de demonstração.',
    status: 'concluido',
    participants: 12,
    exercises: [
      { id: 'demo-x-03-1', name: 'Ataque de ponta', focus: 'ataque', work: [{ fundamental: 'ataque', positions: ['ponteiro', 'oposto', 'central'], attempts: 12 }] },
      { id: 'demo-x-03-2', name: 'Bloqueio de dupla', focus: 'bloqueio', work: [{ fundamental: 'bloqueio', positions: ['central', 'oposto', 'ponteiro'], attempts: 10 }] },
    ],
  },
  {
    // Treino aberto e sem registros: permite experimentar o registro rápido logo de início.
    id: 'demo-t-04',
    name: 'Treino de hoje',
    daysAgo: 0,
    durationMinutes: 90,
    description: 'Treino em andamento, sem registros ainda. Experimente o registro rápido.',
    notes: '',
    status: 'aberto',
    participants: 12,
    exercises: [
      { id: 'demo-x-04-1', name: 'Aquecimento com bola', focus: null, work: [] },
      { id: 'demo-x-04-2', name: 'Saque e recepção', focus: 'saque', work: [] },
    ],
  },
];

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function createDemoTrainings(
  players: readonly Player[],
  evaluations: readonly Evaluation[],
  now: Date,
): { trainings: Training[]; exercises: TrainingExercise[]; events: TrainingEvent[] } {
  const trainings: Training[] = [];
  const exercises: TrainingExercise[] = [];
  const events: TrainingEvent[] = [];
  const available = players.filter((p) => p.status === 'ativo');
  const nowIso = now.toISOString();

  SPECS.forEach((spec, specIndex) => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - spec.daysAgo, 19, 0, 0);
    const participants = spec.participants === 'todos' ? available : available.slice(0, spec.participants);
    const participantIds = participants.map((p) => p.id);
    const date = isoDay(day);
    const completedAt = new Date(day.getTime() + spec.durationMinutes * 60_000).toISOString();

    trainings.push({
      id: spec.id,
      name: spec.name,
      date,
      durationMinutes: spec.durationMinutes,
      description: spec.description,
      notes: spec.notes,
      responsible: spec.status === 'concluido' ? 'Treinador (demo)' : '',
      participantIds,
      status: spec.status,
      completedAt: spec.status === 'concluido' ? completedAt : null,
      createdAt: day.toISOString(),
      updatedAt: spec.status === 'concluido' ? completedAt : nowIso,
      demo: true,
    });

    const rng = mulberry32(1000 + specIndex * 97);
    let sequence = 0;
    spec.exercises.forEach((exerciseSpec, order) => {
      exercises.push({
        id: exerciseSpec.id,
        trainingId: spec.id,
        name: exerciseSpec.name,
        focus: exerciseSpec.focus,
        order,
        createdAt: day.toISOString(),
      });

      for (const work of exerciseSpec.work) {
        for (const player of participants) {
          if (!work.positions.includes(player.primaryPosition)) continue;
          const rating = (latestEvaluation(evaluations, player.id)?.attributes[ATTRIBUTE_OF[work.fundamental]] ?? 60) / 100;
          // Variação por atleta (±3) para que as quantidades não sejam todas iguais.
          const attempts = work.attempts + Math.floor(rng() * 7) - 3;
          for (let i = 0; i < attempts; i += 1) {
            sequence += 1;
            const result = toFundamentalResult(work.fundamental, sampleOutcome(work.fundamental, rating, rng()));
            if (!result) continue;
            events.push({
              ...result,
              id: `demo-ev-${spec.id.slice(-2)}-${sequence}`,
              trainingId: spec.id,
              exerciseId: exerciseSpec.id,
              playerId: player.id,
              recordedAt: new Date(day.getTime() + sequence * 20_000).toISOString(),
              attemptKey: `demo-ak-${spec.id.slice(-2)}-${sequence}`,
              voidedAt: null,
              demo: true,
            });
          }
        }
      }
    });
  });

  return { trainings, exercises, events };
}
