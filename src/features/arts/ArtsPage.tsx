import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingBlock } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { buildPlayerCard } from '@/data/selectors';
import { useWorkspace } from '@/data/WorkspaceProvider';
import {
  ART_FORMATS,
  DEFAULT_FRAMING,
  artDescription,
  artFilename,
  buildAthleteArt,
  buildBrandArt,
  buildCardArt,
  buildCoverArt,
  buildHighlightsArt,
  buildLineupArt,
  buildMatchdayArt,
  buildResultArt,
  buildSpotlightArt,
  formatFor,
  type ArtResult,
} from '@/domain/arts';
import { matchState, upcomingMatch } from '@/domain/match';
import type { Player } from '@/domain/player';
import { ArtControls, EMPTY_STATS, usesFraming, usesPlayer, type ArtDraft } from './ArtControls';
import { ART_ASSETS } from './artAssets';
import { artFacts } from './artFacts';
import { downloadBlob, svgToDataUrl, svgToPng } from './exportPng';
import { loadArtFonts } from './engine/fonts';
import { bestMeasure } from './engine/measure';
import { renderArt } from './engine/render';
import { canSharePng, sharePng } from './sharePng';
import { useArtPhotos } from './useArtPhotos';
import styles from './ArtsPage.module.css';

/**
 * Gerador de artes (só comissão técnica). Todas as artes saem do mesmo sistema visual (faixas a 26°, três blocos,
 * paleta do time) e usam apenas dados reais do app e textos digitados aqui. A prévia e o PNG usam o MESMO SVG.
 */
export function ArtsPage() {
  const { data, actions } = useWorkspace();
  const matches = useMemo(() => [...data.matches].sort((a, b) => (b.scheduledAt || b.createdAt).localeCompare(a.scheduledAt || a.createdAt)), [data.matches]);
  const concluded = useMemo(() => matches.filter((m) => m.status === 'concluida' && m.finalSetsUs !== null && m.finalSetsThem !== null), [matches]);
  const lineups = useMemo(() => [...data.lineups].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')), [data.lineups]);
  const players = useMemo(() => [...data.players].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [data.players]);

  const [draft, setDraft] = useState<ArtDraft>(() => ({
    kind: data.matches.length > 0 ? 'lineup' : 'brand',
    format: 'feed',
    tone: 'dark',
    matchId: upcomingMatch(data.matches)?.id ?? matches[0]?.id ?? '',
    lineupId: '',
    playerId: players[0]?.id ?? '',
    phase: '',
    headline: '',
    stats: EMPTY_STATS,
    caption: 'COMPILADO DE',
    title: 'LANCES',
    detail: '',
    brand: 'apresentacao',
    cover: 'equipe',
    framing: DEFAULT_FRAMING,
  }));
  const patch = (change: Partial<ArtDraft>) => setDraft((previous) => ({ ...previous, ...change }));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const { kind } = draft;
  const format = formatFor(kind, draft.format);

  // A lista de partidas do resultado é só das concluídas; se a escolhida não está nela, usa a primeira concluída.
  const matchId = kind === 'result' && !concluded.some((m) => m.id === draft.matchId) ? (concluded[0]?.id ?? '') : draft.matchId;
  const match = matches.find((m) => m.id === matchId);
  const lineupId = draft.lineupId !== '' && lineups.some((l) => l.id === draft.lineupId) ? draft.lineupId : (match?.lineupId ?? '');
  const lineup = lineups.find((l) => l.id === lineupId);
  const player = players.find((p) => p.id === draft.playerId) ?? players[0];

  // Fotos: dos seis titulares (escalação) ou do atleta escolhido. As MESMAS referências do cadastro.
  const photoPlayers = useMemo<Player[]>(() => {
    if (kind === 'lineup') {
      if (!lineup) return [];
      const ids = lineup.starters.flatMap((s) => (s ? [s.playerId] : []));
      return data.players.filter((p) => ids.includes(p.id));
    }
    return usesPlayer(kind) && player ? [player] : [];
  }, [kind, lineup, player, data.players]);
  const { photos, loading, failed } = useArtPhotos(photoPlayers, actions.photoDataUri);

  // As fontes das artes precisam estar carregadas para medir o texto com a mesma fonte do desenho.
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let alive = true;
    loadArtFonts()
      .catch(() => undefined)
      .finally(() => {
        if (alive) setFontsReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  const measure = useMemo(() => bestMeasure(), [fontsReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const result = useMemo<ArtResult | null>(() => {
    const base = { format, tone: draft.tone } as const;
    const photo = player ? photos[player.id] : undefined;
    const framing = draft.framing;
    switch (kind) {
      case 'lineup':
        return match && lineup ? buildLineupArt({ match, lineup, players: data.players, photos, ...base }) : null;
      case 'matchday':
        return match ? buildMatchdayArt({ match, phase: draft.phase, ...base }) : null;
      case 'result':
        return match ? buildResultArt({ match, state: matchState(match, data.matchSets, data.rallies), ...base }) : null;
      case 'athlete':
        return player ? buildAthleteArt({ player, photo, framing, ...base }) : null;
      case 'card': {
        if (!player) return null;
        const card = buildPlayerCard(player, data.evaluations, data.settings.weights);
        return buildCardArt({ player, photo, framing, overall: card.overall, attributes: card.attributes, ...base });
      }
      case 'spotlight':
        return player ? buildSpotlightArt({ player, photo, framing, headline: draft.headline, stats: draft.stats, ...base }) : null;
      case 'highlights':
        return player ? buildHighlightsArt({ player, photo, framing, caption: draft.caption, title: draft.title, detail: draft.detail, ...base }) : null;
      case 'brand':
        return { ok: true, model: buildBrandArt(draft.brand, format, draft.tone) };
      case 'cover':
        return { ok: true, model: buildCoverArt(draft.cover) };
    }
  }, [kind, format, draft, match, lineup, player, photos, data.players, data.matchSets, data.rallies, data.evaluations, data.settings.weights]);

  const rendered = useMemo(() => (fontsReady && result?.ok ? renderArt(result.model, { assets: ART_ASSETS, measure }) : null), [fontsReady, result, measure]);

  // Compartilhar arquivo só existe em alguns navegadores (celulares): o botão só aparece onde funciona.
  const canShare = useMemo(() => canSharePng(), []);

  const model = result?.ok ? result.model : null;
  const filename = model ? artFilename(model) : '';

  const exportPng = async (mode: 'download' | 'share') => {
    if (!rendered || !model) return;
    setBusy(true);
    setMessage(null);
    try {
      const blob = await svgToPng(rendered.svg, rendered.width, rendered.height);
      if (mode === 'share') {
        const outcome = await sharePng(blob, filename, `Alpha7: ${artDescription(model)}`);
        if (outcome === 'shared') setMessage({ tone: 'success', text: 'Arte compartilhada.' });
      } else {
        downloadBlob(blob, filename);
        setMessage({ tone: 'success', text: `PNG gerado: ${filename} (${rendered.width} x ${rendered.height}).` });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : mode === 'share' ? 'Não foi possível compartilhar.' : 'Não foi possível gerar o PNG.';
      setMessage({ tone: 'error', text: mode === 'share' ? `${reason} Use “Baixar PNG” e envie o arquivo pelo aplicativo que preferir.` : reason });
    } finally {
      setBusy(false);
    }
  };

  const facts = model ? artFacts(model) : [];
  const waiting = !fontsReady || loading;
  const hasPhoto = Boolean(player?.photo);
  const photoReady = Boolean(player && photos[player.id]);
  const lineupHasPhotos = kind === 'lineup' && Object.keys(photos).length > 0;

  return (
    <>
      <PageHeader title="Gerador de artes" subtitle="Artes da equipe prontas para publicar" />
      <div className={styles.layout}>
        <div className={styles.controls}>
          <ArtControls
            draft={{ ...draft, format, matchId }}
            patch={patch}
            matches={matches}
            concluded={concluded}
            lineups={lineups}
            players={players}
            match={match}
            lineupId={lineupId}
            photoReady={photoReady}
            hasPhoto={hasPhoto}
          />
          {facts.length > 0 && (
            <Card title="O que aparece na arte">
              <dl className={styles.facts}>
                {facts.map((fact) => (
                  <div key={fact.label}>
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}
        </div>

        <div className={styles.previewCol}>
          {message && (
            <Notice tone={message.tone} title={message.tone === 'success' ? 'Pronto' : 'Não foi possível gerar'}>
              {message.text}
            </Notice>
          )}
          {kind === 'lineup' && match && !lineup && <Notice tone="info">Escolha uma escalação salva para ver a prévia.</Notice>}
          {failed.length > 0 && (
            <Notice tone="warning" title="Algumas fotos não carregaram">
              Sem a foto de {failed.join(', ')}: a arte mostra o número da camisa ou a área marcada no lugar. Tente de novo mais tarde.
            </Notice>
          )}
          {result && !result.ok && (
            <Notice tone="warning" title="Não dá para gerar a arte ainda">
              {result.reason}
            </Notice>
          )}
          {rendered && rendered.warnings.length > 0 && (
            <Notice tone="warning" title="Revise a composição antes de publicar">
              {rendered.warnings.join(' · ')}
            </Notice>
          )}
          {model && !fontsReady && <LoadingBlock label="Carregando as fontes da arte…" />}
          {rendered && model && (
            <figure className={styles.figure}>
              <img
                className={styles.preview}
                src={svgToDataUrl(rendered.svg)}
                alt={`Prévia da arte: ${artDescription(model)}, formato ${ART_FORMATS[format].label}`}
                width={rendered.width}
                height={rendered.height}
              />
              <figcaption className={styles.caption}>
                Prévia no tamanho {rendered.width} x {rendered.height} px: o PNG baixado é desenhado a partir desta mesma imagem.
                {usesFraming(kind) || lineupHasPhotos ? ' As fotos cadastradas aparecem em tons de roxo (duotone), exceto na carta do atleta, que mostra a foto natural.' : ''}
              </figcaption>
            </figure>
          )}
          <div className={styles.exportActions}>
            {canShare && (
              <Button variant="primary" icon="share" disabled={!rendered || busy || waiting} onClick={() => void exportPng('share')}>
                {busy ? 'Gerando…' : waiting ? 'Carregando…' : 'Compartilhar'}
              </Button>
            )}
            <Button variant={canShare ? 'secondary' : 'primary'} icon="save" disabled={!rendered || busy || waiting} onClick={() => void exportPng('download')}>
              {busy ? 'Gerando…' : waiting ? 'Carregando…' : 'Baixar PNG'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
