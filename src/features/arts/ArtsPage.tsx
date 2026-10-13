import { useEffect, useMemo, useState } from 'react';
import { PATHS } from '@/app/routes';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { useWorkspace } from '@/data/WorkspaceProvider';
import { ART_FORMATS, ART_FORMAT_IDS, artFilename, buildArtModel, type ArtFormatId } from '@/domain/lineupArt';
import { upcomingMatch } from '@/domain/match';
import { UNIFORM_LABEL, shortName, type UniformColor } from '@/domain/player';
import { formatDateTime } from '@/domain/format';
import { ART_ASSETS } from './artAssets';
import { canSharePng, sharePng } from './sharePng';
import { buildLineupArtSvg, svgToDataUrl, svgToPng } from './artSvg';
import styles from './ArtsPage.module.css';

const UNIFORMS: UniformColor[] = ['purple', 'white'];

/** Gerador da arte da escalação (só comissão técnica). A prévia e o PNG usam o MESMO SVG. */
export function ArtsPage() {
  const { data, actions } = useWorkspace();
  const matches = useMemo(() => [...data.matches].sort((a, b) => (b.scheduledAt || b.createdAt).localeCompare(a.scheduledAt || a.createdAt)), [data.matches]);
  const lineups = useMemo(() => [...data.lineups].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')), [data.lineups]);

  const [matchId, setMatchId] = useState<string>(() => upcomingMatch(data.matches)?.id ?? matches[0]?.id ?? '');
  const [lineupChoice, setLineupChoice] = useState('');
  const [uniform, setUniform] = useState<UniformColor>('purple');
  const [format, setFormat] = useState<ArtFormatId>('cartaz');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const match = matches.find((m) => m.id === matchId);
  const lineupId = lineupChoice !== '' && lineups.some((l) => l.id === lineupChoice) ? lineupChoice : (match?.lineupId ?? '');
  const lineup = lineups.find((l) => l.id === lineupId);

  // Fotos dos atletas da escalação (titulares e líbero): as MESMAS do cadastro, baixadas uma vez como data URL para o desenho.
  const photoPlayers = useMemo(() => {
    if (!lineup) return [];
    const ids = [...lineup.starters.flatMap((s) => (s ? [s.playerId] : [])), ...(lineup.liberoId ? [lineup.liberoId] : [])];
    return data.players.filter((p) => ids.includes(p.id) && p.photo);
  }, [lineup, data.players]);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [photoState, setPhotoState] = useState<{ loading: boolean; failed: string[] }>({ loading: false, failed: [] });
  const photoKey = photoPlayers.map((p) => `${p.id}:${p.photo}`).join('|');

  useEffect(() => {
    let alive = true;
    if (photoPlayers.length === 0) {
      setPhotos({});
      setPhotoState({ loading: false, failed: [] });
      return;
    }
    setPhotoState({ loading: true, failed: [] });
    void Promise.allSettled(photoPlayers.map((p) => actions.photoDataUri(p.photo ?? ''))).then((settled) => {
      if (!alive) return;
      const loaded: Record<string, string> = {};
      const failed: string[] = [];
      settled.forEach((outcome, index) => {
        const p = photoPlayers[index];
        if (!p) return;
        if (outcome.status === 'fulfilled') loaded[p.id] = outcome.value;
        else failed.push(shortName(p.name));
      });
      setPhotos(loaded);
      setPhotoState({ loading: false, failed });
    });
    return () => {
      alive = false;
    };
    // `photoKey` representa o conteúdo de `photoPlayers`; `actions` muda a cada edição e não deve refazer os downloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoKey]);

  const result = useMemo(
    () => (match && lineup ? buildArtModel({ match, lineup, players: data.players, format, uniform, photos }) : null),
    [match, lineup, data.players, format, uniform, photos],
  );
  const svg = useMemo(() => (result?.ok ? buildLineupArtSvg(result.model, ART_ASSETS) : null), [result]);

  // Compartilhar arquivo só existe em alguns navegadores (celulares): o botão só aparece onde funciona.
  const canShare = useMemo(() => canSharePng(), []);

  const share = async () => {
    if (!match || !svg) return;
    setBusy(true);
    setMessage(null);
    try {
      const { width, height } = ART_FORMATS[format];
      const blob = await svgToPng(svg, width, height);
      const outcome = await sharePng(blob, artFilename(match, format), `Alpha7 x ${match.opponent}`);
      if (outcome === 'shared') setMessage({ tone: 'success', text: 'Arte compartilhada.' });
    } catch (error) {
      setMessage({
        tone: 'error',
        text: `${error instanceof Error ? error.message : 'Não foi possível compartilhar.'} Use “Baixar PNG” e envie o arquivo pelo aplicativo que preferir.`,
      });
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!match || !svg) return;
    setBusy(true);
    setMessage(null);
    try {
      const { width, height } = ART_FORMATS[format];
      const blob = await svgToPng(svg, width, height);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = artFilename(match, format);
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setMessage({ tone: 'success', text: `PNG gerado: ${artFilename(match, format)} (${width} x ${height}).` });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Não foi possível gerar o PNG.' });
    } finally {
      setBusy(false);
    }
  };

  const header = <PageHeader title="Gerador de artes" subtitle="Pôster da escalação, pronto para divulgar" />;

  if (matches.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon="lineup"
          title="Cadastre uma partida para gerar a arte"
          action={
            <ButtonLink to={PATHS.newMatch} variant="primary" icon="plus">
              Cadastrar partida
            </ButtonLink>
          }
        >
          A arte usa o adversário, a data e a escalação salva de uma partida. Nada é inventado: o que não estiver cadastrado não aparece.
        </EmptyState>
      </>
    );
  }

  const { width, height } = ART_FORMATS[format];
  return (
    <>
      {header}
      <div className={styles.layout}>
        <div className={styles.controls}>
          <Card title="Escolhas">
            <SelectField label="Partida" value={matchId} onChange={(event) => setMatchId(event.target.value)}>
              {matches.map((m) => (
                <option key={m.id} value={m.id}>
                  Alpha7 x {m.opponent}
                  {m.scheduledAt ? ` · ${formatDateTime(m.scheduledAt)}` : ''}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Escalação salva"
              value={lineupId}
              hint={match?.lineupId ? 'Começa pela escalação ligada à partida.' : 'Esta partida não tem escalação ligada: escolha uma.'}
              onChange={(event) => setLineupChoice(event.target.value)}
            >
              <option value="">Escolher…</option>
              {lineups.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </SelectField>
            <div className={styles.group} role="group" aria-label="Uniforme">
              <span className={styles.groupLabel}>Uniforme</span>
              <div className={styles.chips}>
                {UNIFORMS.map((u) => (
                  <Chip key={u} pressed={uniform === u} onClick={() => setUniform(u)}>
                    <span className={`${styles.swatch} ${u === 'white' ? styles.swatchWhite : styles.swatchPurple}`} aria-hidden="true" />
                    {UNIFORM_LABEL[u]}
                  </Chip>
                ))}
              </div>
            </div>
            <div className={styles.group} role="group" aria-label="Formato">
              <span className={styles.groupLabel}>Formato</span>
              <div className={styles.chips}>
                {ART_FORMAT_IDS.map((id) => (
                  <Chip key={id} pressed={format === id} onClick={() => setFormat(id)}>
                    <span className={`${styles.shape} ${id === 'story' ? styles.shapeStory : styles.shapePoster}`} aria-hidden="true" />
                    {ART_FORMATS[id].label}
                  </Chip>
                ))}
              </div>
            </div>
          </Card>

          {result?.ok && (
            <Card title="O que aparece na arte">
              <dl className={styles.facts}>
                <div>
                  <dt>Jogo</dt>
                  <dd>Alpha7 x {result.model.opponent}</dd>
                </div>
                <div>
                  <dt>Competição</dt>
                  <dd>{result.model.competition || 'Não informada (não aparece)'}</dd>
                </div>
                <div>
                  <dt>Data</dt>
                  <dd>{result.model.dateText}</dd>
                </div>
                <div>
                  <dt>Local</dt>
                  <dd>{result.model.venue || 'Não informado (não aparece)'}</dd>
                </div>
                <div>
                  <dt>Titulares</dt>
                  <dd>{result.model.starters.map((p) => `#${p.number} ${p.name}`).join(', ')}</dd>
                </div>
                <div>
                  <dt>Reservas</dt>
                  <dd>{result.model.reserves.length === 0 ? 'Nenhum' : result.model.reserves.map((p) => `#${p.number} ${p.name}`).join(', ')}</dd>
                </div>
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
          {!lineup && <Notice tone="info">Escolha uma escalação salva para ver a prévia.</Notice>}
          {photoState.failed.length > 0 && (
            <Notice tone="warning" title="Algumas fotos não carregaram">
              Sem a foto de {photoState.failed.join(', ')}: a arte mostra o número da camisa no lugar. Tente de novo mais tarde.
            </Notice>
          )}
          {result && !result.ok && (
            <Notice tone="warning" title="Não dá para gerar a arte ainda">
              {result.reason}{' '}
              <ButtonLink to={lineup ? PATHS.lineup(lineup.id) : PATHS.lineups} size="sm">
                Abrir a escalação
              </ButtonLink>
            </Notice>
          )}
          {svg && (
            <figure className={styles.figure}>
              <img
                className={styles.preview}
                src={svgToDataUrl(svg)}
                alt={`Prévia da arte da escalação contra ${match?.opponent ?? ''}, formato ${ART_FORMATS[format].label}`}
                width={width}
                height={height}
              />
              <figcaption className={styles.caption}>
                Prévia no tamanho {width} x {height} px: o PNG baixado é desenhado a partir desta mesma imagem.
                {result?.ok && result.model.starters.some((p) => p.photo) ? ' As fotos cadastradas dos atletas aparecem no lugar do número.' : ' Atletas sem foto aparecem com o número da camisa.'}
              </figcaption>
            </figure>
          )}
          <div className={styles.exportActions}>
            {canShare && (
              <Button variant="primary" icon="share" disabled={!svg || busy || photoState.loading} onClick={() => void share()}>
                {busy ? 'Gerando…' : photoState.loading ? 'Carregando fotos…' : 'Compartilhar'}
              </Button>
            )}
            <Button variant={canShare ? 'secondary' : 'primary'} icon="save" disabled={!svg || busy || photoState.loading} onClick={() => void download()}>
              {busy ? 'Gerando…' : photoState.loading ? 'Carregando fotos…' : 'Baixar PNG'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
