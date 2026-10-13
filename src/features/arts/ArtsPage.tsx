import { useMemo, useState } from 'react';
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
import { UNIFORM_LABEL, type UniformColor } from '@/domain/player';
import { formatDateTime } from '@/domain/format';
import { ART_ASSETS } from './artAssets';
import { buildLineupArtSvg, svgToDataUrl, svgToPng } from './artSvg';
import styles from './ArtsPage.module.css';

const UNIFORMS: UniformColor[] = ['purple', 'white'];

/** Gerador da arte da escalação (só comissão técnica). A prévia e o PNG usam o MESMO SVG. */
export function ArtsPage() {
  const { data } = useWorkspace();
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

  const result = useMemo(
    () => (match && lineup ? buildArtModel({ match, lineup, players: data.players, format, uniform }) : null),
    [match, lineup, data.players, format, uniform],
  );
  const svg = useMemo(() => (result?.ok ? buildLineupArtSvg(result.model, ART_ASSETS) : null), [result]);

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
              </figcaption>
            </figure>
          )}
          <div>
            <Button variant="primary" icon="save" disabled={!svg || busy} onClick={() => void download()}>
              {busy ? 'Gerando…' : 'Baixar PNG'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
