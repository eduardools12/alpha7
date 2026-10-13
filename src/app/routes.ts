import type { Capability } from '@/auth/permissions';
import type { IconName } from '@/components/ui/Icon';

export const PATHS = {
  dashboard: '/',
  roster: '/elenco',
  newPlayer: '/elenco/novo',
  player: (id: string) => `/elenco/${id}`,
  editPlayer: (id: string) => `/elenco/${id}/editar`,
  evaluatePlayer: (id: string) => `/elenco/${id}/avaliar`,
  lineups: '/escalacoes',
  newLineup: '/escalacoes/nova',
  lineup: (id: string) => `/escalacoes/${id}`,
  trainings: '/treinos',
  newTraining: '/treinos/novo',
  training: (id: string) => `/treinos/${id}`,
  editTraining: (id: string) => `/treinos/${id}/editar`,
  recordTraining: (id: string) => `/treinos/${id}/registrar`,
  matches: '/partidas',
  newMatch: '/partidas/nova',
  match: (id: string) => `/partidas/${id}`,
  editMatch: (id: string) => `/partidas/${id}/editar`,
  liveMatch: (id: string) => `/partidas/${id}/acompanhar`,
  stats: '/estatisticas',
  arts: '/artes',
  settings: '/configuracoes',
} as const;

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** Rotas cujo início casa com este item (ex.: /elenco/8 acende "Elenco"). */
  end?: boolean;
  /** Em telas pequenas, vai para o menu "Mais" em vez da barra inferior. */
  secondary?: boolean;
  /** Só aparece no menu para quem tem esta permissão (a rota também é protegida). */
  capability?: Capability;
}

export const NAV_ITEMS: NavItem[] = [
  { to: PATHS.dashboard, label: 'Dashboard', icon: 'dashboard', end: true },
  { to: PATHS.roster, label: 'Elenco', icon: 'users' },
  { to: PATHS.lineups, label: 'Escalações', icon: 'lineup' },
  { to: PATHS.trainings, label: 'Treinos', icon: 'list' },
  { to: PATHS.matches, label: 'Partidas', icon: 'court', secondary: true },
  { to: PATHS.stats, label: 'Estatísticas', icon: 'chart', secondary: true },
  { to: PATHS.arts, label: 'Gerador de artes', icon: 'lineup', secondary: true, capability: 'arts:generate' },
  { to: PATHS.settings, label: 'Configurações', icon: 'settings', secondary: true },
];
