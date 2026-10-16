import type { ArtModel } from '@/domain/arts';

export interface ArtFact {
  label: string;
  value: string;
}

const NOT_SHOWN = 'Não informado (não aparece)';

/** "O que aparece na arte": cada dado, de onde vem e o que NÃO aparece por falta de cadastro. Nada é inventado. */
export function artFacts(model: ArtModel): ArtFact[] {
  switch (model.kind) {
    case 'lineup':
      return [
        { label: 'Jogo', value: `Alpha7 x ${model.opponent}` },
        { label: 'Competição', value: model.competition || NOT_SHOWN },
        { label: 'Data', value: model.dateText },
        { label: 'Local', value: model.venue || NOT_SHOWN },
        { label: 'Titulares', value: model.starters.map((p) => `#${p.number} ${p.name}`).join(', ') },
        { label: 'Reservas', value: model.reserves.length === 0 ? 'Nenhum' : model.reserves.map((p) => `#${p.number} ${p.name}`).join(', ') },
      ];
    case 'matchday':
      return [
        { label: 'Jogo', value: `Alpha7 x ${model.opponent}` },
        { label: 'Competição', value: model.competition || NOT_SHOWN },
        { label: 'Rodada ou fase', value: model.phase || NOT_SHOWN },
        { label: 'Data', value: model.dateText },
        { label: 'Horário', value: model.timeText },
        { label: 'Local', value: model.venue || 'A definir' },
      ];
    case 'result':
      return [
        { label: 'Jogo', value: `Alpha7 x ${model.opponent}` },
        { label: 'Competição', value: model.competition || NOT_SHOWN },
        { label: 'Resultado em sets', value: `${model.setsUs} x ${model.setsThem}` },
        { label: 'Parciais', value: model.sets.length === 0 ? 'Nenhum set com pontos' : model.sets.map((s) => `${s.us}-${s.them}`).join(', ') },
      ];
    case 'athlete':
      return playerFacts(model.player);
    case 'spotlight':
      return [
        ...playerFacts(model.player),
        { label: 'Destaque', value: model.headline || NOT_SHOWN },
        { label: 'Estatísticas', value: model.stats.length === 0 ? 'Nenhuma (não aparecem)' : model.stats.map((s) => `${s.label}: ${s.value}`).join(', ') },
      ];
    case 'card':
      return [
        ...playerFacts(model.player),
        { label: 'Overall', value: model.overall === null ? 'Sem avaliação (aparece “—”)' : String(model.overall) },
        { label: 'Atributos', value: model.attributes.map((a) => `${a.key} ${a.value ?? '—'}`).join(' · ') },
      ];
    case 'highlights':
      return [
        ...playerFacts(model.player),
        { label: 'Título', value: model.title },
        { label: 'Chamada', value: model.caption || NOT_SHOWN },
        { label: 'Temporada ou jogo', value: model.detail || NOT_SHOWN },
      ];
    case 'brand':
    case 'cover':
      return [];
  }
}

function playerFacts(player: { fullName: string; number: number; position: string; photo?: unknown }): ArtFact[] {
  return [
    { label: 'Atleta', value: player.fullName },
    { label: 'Camisa', value: `#${player.number}` },
    { label: 'Posição', value: player.position },
    { label: 'Foto', value: player.photo ? 'Foto do cadastro' : 'Sem foto: a arte mostra a área marcada' },
  ];
}
