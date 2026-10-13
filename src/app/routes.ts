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
  matches: '/partidas',
  stats: '/estatisticas',
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
}

export const NAV_ITEMS: NavItem[] = [
  { to: PATHS.dashboard, label: 'Dashboard', icon: 'dashboard', end: true },
  { to: PATHS.roster, label: 'Elenco', icon: 'users' },
  { to: PATHS.lineups, label: 'Escalações', icon: 'lineup' },
  { to: PATHS.trainings, label: 'Treinos', icon: 'list' },
  { to: PATHS.matches, label: 'Partidas', icon: 'court', secondary: true },
  { to: PATHS.stats, label: 'Estatísticas', icon: 'chart', secondary: true },
  { to: PATHS.settings, label: 'Configurações', icon: 'settings', secondary: true },
];
