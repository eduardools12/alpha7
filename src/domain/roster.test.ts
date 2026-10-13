import { filterRoster, matchesQuery, type RosterFilter } from './roster';
import { PLAYER_STATUSES } from './player';
import { makePlayer } from '@/test/factories';

const gabriel = makePlayer({ name: 'Gabriel Silva', jerseyNumber: 8, primaryPosition: 'ponteiro' });
const lucas = makePlayer({ name: 'Lucas Moreira', jerseyNumber: 4, primaryPosition: 'levantador' });
const vitor = makePlayer({ name: 'Vitor Klein', jerseyNumber: 11, primaryPosition: 'central', status: 'lesionado' });
const otavio = makePlayer({ name: 'Otávio Hernandes', jerseyNumber: 1, primaryPosition: 'ponteiro', status: 'transicao' });
const danilo = makePlayer({ name: 'Danilo Ferraz', jerseyNumber: 18, primaryPosition: 'libero' });
const roster = [gabriel, lucas, vitor, otavio, danilo];

const all: RosterFilter = { query: '', position: null, statuses: new Set(PLAYER_STATUSES) };
const names = (list: { name: string }[]) => list.map((p) => p.name);

describe('busca no elenco', () => {
  it('sem filtros, devolve todos ordenados pelo número da camisa', () => {
    expect(filterRoster(roster, all).map((p) => p.jerseyNumber)).toEqual([1, 4, 8, 11, 18]);
  });

  it('busca por trecho do nome sem diferenciar maiúsculas', () => {
    expect(names(filterRoster(roster, { ...all, query: 'gabr' }))).toEqual(['Gabriel Silva']);
    expect(names(filterRoster(roster, { ...all, query: 'LUCAS' }))).toEqual(['Lucas Moreira']);
  });

  it('ignora acentos nos dois sentidos', () => {
    expect(names(filterRoster(roster, { ...all, query: 'otavio' }))).toEqual(['Otávio Hernandes']);
    expect(names(filterRoster(roster, { ...all, query: 'Otávio' }))).toEqual(['Otávio Hernandes']);
  });

  it('busca por número exato, com ou sem "#"', () => {
    expect(names(filterRoster(roster, { ...all, query: '8' }))).toEqual(['Gabriel Silva']);
    expect(names(filterRoster(roster, { ...all, query: '#11' }))).toEqual(['Vitor Klein']);
  });

  it('o número é exato: "1" encontra a camisa 1, não a 11 nem a 18', () => {
    expect(names(filterRoster(roster, { ...all, query: '1' }))).toEqual(['Otávio Hernandes']);
  });

  it('busca sem resultado devolve lista vazia', () => {
    expect(filterRoster(roster, { ...all, query: 'zzz' })).toEqual([]);
  });

  it('ignora espaços nas pontas da busca', () => {
    expect(matchesQuery(gabriel, '   ')).toBe(true);
    expect(matchesQuery(gabriel, '  gabriel ')).toBe(true);
  });
});

describe('filtros do elenco', () => {
  it('filtra pela posição principal', () => {
    expect(names(filterRoster(roster, { ...all, position: 'ponteiro' }))).toEqual(['Otávio Hernandes', 'Gabriel Silva']);
    expect(names(filterRoster(roster, { ...all, position: 'libero' }))).toEqual(['Danilo Ferraz']);
  });

  it('a posição secundária não entra no filtro', () => {
    const versatile = makePlayer({ primaryPosition: 'oposto', secondaryPosition: 'ponteiro', jerseyNumber: 50 });
    expect(filterRoster([versatile], { ...all, position: 'ponteiro' })).toEqual([]);
  });

  it('filtra por situação', () => {
    expect(names(filterRoster(roster, { ...all, statuses: new Set(['lesionado']) }))).toEqual(['Vitor Klein']);
    expect(filterRoster(roster, { ...all, statuses: new Set(['ativo', 'transicao']) })).toHaveLength(4);
  });

  it('nenhuma situação marcada não mostra ninguém', () => {
    expect(filterRoster(roster, { ...all, statuses: new Set() })).toEqual([]);
  });

  it('combina busca, posição e situação', () => {
    const filter: RosterFilter = { query: 'o', position: 'ponteiro', statuses: new Set(['transicao']) };
    expect(names(filterRoster(roster, filter))).toEqual(['Otávio Hernandes']);
  });

  it('não altera a lista original', () => {
    const copy = [...roster];
    filterRoster(roster, all);
    expect(roster).toEqual(copy);
  });
});
