import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PATHS } from '@/app/routes';
import { PlayerCard } from '@/components/brand/PlayerCard';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { useWorkspace } from '@/data/WorkspaceProvider';
import { buildPlayerCard } from '@/data/selectors';
import { PLAYER_STATUS_LABEL, PLAYER_STATUSES, type PlayerStatus } from '@/domain/player';
import { isPosition, POSITION_LABEL, POSITIONS, type Position } from '@/domain/positions';
import { filterRoster } from '@/domain/roster';
import styles from './RosterPage.module.css';

function parseStatuses(raw: string | null): Set<PlayerStatus> {
  if (raw === null) return new Set(PLAYER_STATUSES);
  return new Set(raw.split(',').filter((s): s is PlayerStatus => (PLAYER_STATUSES as readonly string[]).includes(s)));
}

export function RosterPage() {
  const { data } = useWorkspace();
  const [params, setParams] = useSearchParams();

  // Os filtros vivem em estado local (sempre atual, sem corrida entre eventos) e são
  // espelhados na URL: voltar do perfil ou recarregar mantém busca e filtros.
  const [query, setQuery] = useState(() => params.get('q') ?? '');
  const [position, setPosition] = useState<Position | null>(() => {
    const raw = params.get('posicao');
    return isPosition(raw) ? raw : null;
  });
  const [statuses, setStatuses] = useState<Set<PlayerStatus>>(() => parseStatuses(params.get('situacao')));

  useEffect(() => {
    const next = new URLSearchParams();
    if (query !== '') next.set('q', query);
    if (position !== null) next.set('posicao', position);
    if (statuses.size !== PLAYER_STATUSES.length) next.set('situacao', [...statuses].join(',') || 'nenhuma');
    setParams(next, { replace: true });
    // setParams muda de identidade a cada navegação; incluí-lo nas dependências causaria laço.
  }, [query, position, statuses]);

  const toggleStatus = (status: PlayerStatus) =>
    setStatuses((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });

  const clearFilters = () => {
    setQuery('');
    setPosition(null);
    setStatuses(new Set(PLAYER_STATUSES));
  };

  const filtered = useMemo(
    () => filterRoster(data.players, { query, position, statuses }),
    [data.players, query, position, statuses],
  );
  const cards = useMemo(
    () => filtered.map((player) => buildPlayerCard(player, data.evaluations, data.settings.weights)),
    [filtered, data.evaluations, data.settings.weights],
  );

  const total = data.players.length;
  const filtersActive = query !== '' || position !== null || statuses.size !== PLAYER_STATUSES.length;
  const countText =
    filtered.length === total
      ? `${total} ${total === 1 ? 'jogador' : 'jogadores'}`
      : `${filtered.length} de ${total} jogadores`;

  return (
    <>
      <PageHeader
        title="Elenco"
        subtitle="Gestão de atletas e performance"
        actions={
          <ButtonLink to={PATHS.newPlayer} variant="primary" icon="plus">
            Adicionar jogador
          </ButtonLink>
        }
      />

      {total === 0 ? (
        <EmptyState
          icon="users"
          title="O elenco está vazio"
          action={
            <ButtonLink to={PATHS.newPlayer} variant="primary" icon="plus">
              Cadastrar o primeiro atleta
            </ButtonLink>
          }
        >
          Cadastre os atletas para avaliar, escalar e acompanhar a evolução de cada um.
        </EmptyState>
      ) : (
        <>
          <div className={styles.controls}>
            <div className={styles.search}>
              <label htmlFor="busca" className={styles.searchLabel}>
                Buscar por nome ou número
              </label>
              <div className={styles.searchBox}>
                <Icon name="search" size={18} />
                <input
                  id="busca"
                  type="search"
                  value={query}
                  placeholder="Ex.: Gabriel ou 8"
                  autoComplete="off"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </div>

            <div role="group" aria-labelledby="filtro-posicao" className={styles.filterGroup}>
              <span id="filtro-posicao" className={styles.filterLabel}>
                Posição
              </span>
              <div className={styles.chips}>
                <Chip pressed={position === null} onClick={() => setPosition(null)}>
                  Todos
                </Chip>
                {POSITIONS.map((p) => (
                  <Chip key={p} pressed={position === p} onClick={() => setPosition(p)}>
                    {POSITION_LABEL[p]}
                  </Chip>
                ))}
              </div>
            </div>

            <div role="group" aria-labelledby="filtro-situacao" className={styles.filterGroup}>
              <span id="filtro-situacao" className={styles.filterLabel}>
                Situação
              </span>
              <div className={styles.chips}>
                {PLAYER_STATUSES.map((s) => (
                  <Chip key={s} pressed={statuses.has(s)} onClick={() => toggleStatus(s)}>
                    {PLAYER_STATUS_LABEL[s]}
                  </Chip>
                ))}
              </div>
            </div>
          </div>

          <p className={styles.count} aria-live="polite">
            <Icon name="users" size={18} /> {countText}
          </p>

          {cards.length === 0 ? (
            <EmptyState
              icon="search"
              title="Nenhum atleta encontrado"
              action={
                filtersActive ? (
                  <Button onClick={clearFilters}>Limpar filtros</Button>
                ) : undefined
              }
            >
              Nenhum atleta combina com a busca e os filtros atuais. Revise o texto ou as situações marcadas.
            </EmptyState>
          ) : (
            <ul className={styles.grid}>
              {cards.map((card) => (
                <li key={card.player.id}>
                  <PlayerCard card={card} to={PATHS.player(card.player.id)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
