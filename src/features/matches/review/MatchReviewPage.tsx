import { useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from 'react';
import { useParams } from 'react-router-dom';
import { PATHS } from '@/app/routes';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { downloadTextFile } from '@/data/download';
import { useWorkspace } from '@/data/WorkspaceProvider';
import { runningScores } from '../rallyText';
import { shortName } from '@/domain/player';
import { boxesAt, compareWithVideo, formatMs, isWithinAnalysis, parseVideoAnalysis, type VideoAnalysis, type VideoFacts } from '@/domain/videoReview';
import { assignTrack, clearSync, duplicatedAthletes, parseReviewFile, reviewFilename, seekTarget, serializeReview, setSync, suggestedAthletes } from '@/domain/videoReviewData';
import { drawBoxes } from './reviewCanvas';
import { ReviewDetail } from './ReviewDetail';
import { ReviewPoints } from './ReviewPoints';
import { stateFor } from '../matchView';
import { useReviewData } from './useReviewData';
import styles from './MatchReviewPage.module.css';

const SPEEDS = [0.25, 0.5, 1, 2] as const;
const speedLabel = (speed: number) => `${String(speed).replace('.', ',')}x`;
/** Lista de trilhas: mostra no máximo isto (uma análise longa pode ter milhares). */
const MAX_TRACKS_SHOWN = 300;
const DEFAULT_FPS = 30;
/** Faixa de baixo do vídeo onde ficam os controles nativos: clique ali não escolhe trilha. */
const CONTROLS_STRIP_PX = 48;

/**
 * Revisão com vídeo (somente leitura): toca o vídeo do jogo, que fica no computador (nada é enviado), e desenha por cima as
 * caixas e os números de trilha da análise. Os números T<n> são temporários do rastreador e NÃO identificam atletas.
 */
export function MatchReviewPage() {
  const { matchId } = useParams();
  const { data } = useWorkspace();
  const match = data.matches.find((m) => m.id === matchId);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFacts, setVideoFacts] = useState<VideoFacts | null>(null);
  const [videoError, setVideoError] = useState(false);
  const [analysis, setAnalysis] = useState<VideoAnalysis | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [showBoxes, setShowBoxes] = useState(true);
  const [speed, setSpeed] = useState<number>(1);
  const [outside, setOutside] = useState(false);
  /** Trilhas com caixa no quadro atual, como texto "1,2" (estado simples: só re-renderiza quando muda). */
  const [visibleKey, setVisibleKey] = useState('');
  const [detailRallyId, setDetailRallyId] = useState<string | null>(null);
  /** Resultado da última importação de associações: pontos e itens ignorados, ou o motivo da recusa. */
  const [importResult, setImportResult] = useState<{ ok: true; lines: string[] } | { ok: false; problems: string[] } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analysisRequest = useRef(0);
  const sideRef = useRef<HTMLElement | null>(null);
  const reviewState = useReviewData(matchId, videoFile, analysis);
  const { review, ready } = reviewState;

  const roster = useMemo(() => [...data.players].sort((a, b) => a.jerseyNumber - b.jerseyNumber || a.name.localeCompare(b.name, 'pt-BR')), [data.players]);
  const playerLabels = useMemo(() => new Map(roster.map((p) => [p.id, `${shortName(p.name)} #${p.jerseyNumber}`])), [roster]);
  /** Trilha → texto do atleta associado (some se o atleta saiu do elenco: a trilha volta a "Sem atleta"). */
  const trackLabels = useMemo(() => {
    const labels = new Map<number, string>();
    if (review) {
      for (const [track, playerId] of Object.entries(review.assignments)) {
        const label = playerLabels.get(playerId);
        if (label) labels.set(Number(track), label);
      }
    }
    return labels;
  }, [review, playerLabels]);

  // URL do vídeo: criada ao escolher o arquivo e SEMPRE revogada ao trocar ou sair (nada fica retido na memória).
  useEffect(() => {
    if (!videoFile) {
      setVideoUrl(null);
      return;
    }
    const url = URL.createObjectURL(videoFile);
    setVideoUrl(url);
    setVideoError(false);
    setVideoFacts(null);
    return () => URL.revokeObjectURL(url);
  }, [videoFile]);

  // Desenho das caixas sobre o vídeo: a cada quadro apresentado (ou por animação enquanto toca), ao buscar, ao redimensionar.
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    let stopped = false;
    let handle = 0;
    const draw = () => {
      const ctx = canvas.getContext('2d');
      const width = video.clientWidth;
      const height = video.clientHeight;
      if (!ctx || width === 0 || height === 0) return;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.clearRect(0, 0, width, height);
      if (!analysis) {
        setVisibleKey('');
        return;
      }
      const nowMs = video.currentTime * 1000;
      const out = !isWithinAnalysis(analysis, nowMs);
      setOutside((previous) => (previous === out ? previous : out)); // só re-renderiza quando muda
      const boxes = boxesAt(analysis, nowMs);
      const visible = boxes.flatMap((box) => (box.trackId === null ? [] : [box.trackId])).sort((a, b) => a - b).join(',');
      setVisibleKey((previous) => (previous === visible ? previous : visible));
      if (!showBoxes) return;
      drawBoxes(ctx, boxes, width / analysis.source.width, (trackId) => trackLabels.get(trackId));
    };
    const frameCallback = typeof video.requestVideoFrameCallback === 'function'; // Chrome e Safari; no Firefox cai para requestAnimationFrame
    const loop = () => {
      draw();
      if (stopped) return;
      handle = frameCallback ? video.requestVideoFrameCallback(loop) : video.paused ? 0 : requestAnimationFrame(loop);
    };
    const onPlay = () => {
      if (!frameCallback && !handle) handle = requestAnimationFrame(loop);
    };
    const events = ['seeked', 'timeupdate', 'loadedmetadata', 'pause', 'ratechange'] as const;
    for (const name of events) video.addEventListener(name, draw);
    video.addEventListener('play', onPlay);
    const observer = new ResizeObserver(draw);
    observer.observe(video);
    draw();
    if (frameCallback) handle = video.requestVideoFrameCallback(loop);
    return () => {
      stopped = true;
      for (const name of events) video.removeEventListener(name, draw);
      video.removeEventListener('play', onPlay);
      observer.disconnect();
      if (handle) {
        if (frameCallback) video.cancelVideoFrameCallback(handle);
        else cancelAnimationFrame(handle);
      }
    };
  }, [analysis, showBoxes, videoUrl, trackLabels]);

  const warnings = useMemo(() => (analysis && videoFacts ? compareWithVideo(analysis.source, videoFacts) : []), [analysis, videoFacts]);
  const repeated = useMemo(() => {
    if (!review) return [];
    const visibleIds = visibleKey === '' ? [] : visibleKey.split(',').map(Number);
    return duplicatedAthletes(review, visibleIds).flatMap((id) => {
      const label = playerLabels.get(id);
      return label ? [label] : [];
    });
  }, [review, visibleKey, playerLabels]);
  const matchState = useMemo(() => (match ? stateFor(match, data.matchSets, data.rallies) : null), [match, data.matchSets, data.rallies]);
  const playersById = useMemo(() => new Map(data.players.map((p) => [p.id, p])), [data.players]);
  const actionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of data.rallyActions) if (a.voidedAt === null) counts.set(a.rallyId, (counts.get(a.rallyId) ?? 0) + 1);
    return counts;
  }, [data.rallyActions]);
  /** Ponto aberto para detalhar: some se foi desfeito ou a partida mudou. */
  const detail = useMemo(() => {
    for (const s of matchState?.sets ?? []) {
      const rally = s.rallies.find((r) => r.id === detailRallyId);
      if (rally) return { rally, score: runningScores(s.rallies).get(rally.id) ?? '' };
    }
    return null;
  }, [matchState, detailRallyId]);
  const suggested = useMemo(() => {
    if (!review) return [];
    const visibleIds = visibleKey === '' ? [] : visibleKey.split(',').map(Number);
    return suggestedAthletes(review, visibleIds, new Set(playerLabels.keys()));
  }, [review, visibleKey, playerLabels]);
  const tracks = useMemo(() => (analysis ? [...analysis.tracks].sort((a, b) => a.firstMs - b.firstMs || a.trackId - b.trackId) : []), [analysis]);

  if (!match) {
    return (
      <>
        <PageHeader title="Revisão com vídeo" back={{ to: PATHS.matches, label: 'Partidas' }} />
        <EmptyState icon="court" title="Partida não encontrada" action={<ButtonLink to={PATHS.matches}>Voltar às partidas</ButtonLink>}>
          Esta partida não existe mais ou o endereço está incorreto.
        </EmptyState>
      </>
    );
  }

  const onVideo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) setVideoFile(file);
    event.target.value = '';
  };

  const onAnalysis = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const request = (analysisRequest.current += 1);
    const text = await file.text();
    if (request !== analysisRequest.current) return; // um arquivo mais novo já foi escolhido
    const result = parseVideoAnalysis(text);
    if (result.ok) {
      setAnalysis(result.value);
      setProblems([]);
    } else {
      setAnalysis(null);
      setProblems(result.problems);
    }
  };

  const onClearSync = (setNumber: number) => reviewState.update((current) => clearSync(current, setNumber));

  const onAthlete = (trackId: number, playerId: string) => reviewState.update((current) => assignTrack(current, trackId, playerId === '' ? null : playerId));

  const onExport = () => {
    if (!review) return;
    const now = new Date();
    downloadTextFile(reviewFilename(match.opponent, now), serializeReview(review, now));
  };

  const onImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !analysis) return;
    const text = await file.text();
    const result = parseReviewFile(text, {
      matchId: match.id,
      analysisId: analysis.id,
      trackIds: new Set(analysis.tracks.map((t) => t.trackId)),
      playerIds: new Set(data.players.map((p) => p.id)),
      rallyIds: new Set(data.rallies.filter((r) => r.matchId === match.id).map((r) => r.id)),
    });
    if (!result.ok) {
      setImportResult({ ok: false, problems: result.problems });
      return;
    }
    const added = Object.keys(result.value.assignments).length;
    const references = Object.keys(result.value.syncs).length;
    reviewState.update((current) => ({ ...current, assignments: result.value.assignments, syncs: result.value.syncs }));
    const lines = [`${added} ${added === 1 ? 'associação importada' : 'associações importadas'}.`];
    if (references > 0) lines.push(`${references} ${references === 1 ? 'referência de ponto importada' : 'referências de ponto importadas'}.`);
    if (result.ignored > 0) lines.push(`${result.ignored} ${result.ignored === 1 ? 'item ignorado' : 'itens ignorados'}: a trilha, o atleta ou o ponto não existe mais.`);
    setImportResult({ ok: true, lines });
  };

  const onMark = (setNumber: number, rallyId: string) => {
    const video = videoRef.current;
    if (!video) return;
    const videoMs = Math.round(video.currentTime * 1000);
    reviewState.update((current) => setSync(current, setNumber, { rallyId, videoMs }));
  };

  /** Clicar numa caixa pausa o vídeo e leva o foco ao seletor de atleta daquela trilha (a caixa de cima vence). */
  const onStageClick = (event: MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !analysis || !showBoxes) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (y > rect.height - CONTROLS_STRIP_PX) return;
    const scale = rect.width / analysis.source.width;
    const hit = [...boxesAt(analysis, video.currentTime * 1000)].reverse().find((box) => {
      const [x1, y1, x2, y2] = box.bbox;
      return box.trackId !== null && x >= x1 * scale && x <= x2 * scale && y >= y1 * scale && y <= y2 * scale;
    });
    if (!hit || hit.trackId === null) return;
    video.pause();
    sideRef.current?.querySelector<HTMLSelectElement>(`select[data-track="${hit.trackId}"]`)?.focus();
  };

  const seek = (ms: number) => {
    const video = videoRef.current;
    if (video) video.currentTime = ms / 1000;
  };

  const step = (direction: 1 | -1) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    const fps = analysis?.source.fps ?? DEFAULT_FPS;
    const end = Number.isFinite(video.duration) ? video.duration : Infinity;
    video.currentTime = Math.min(end, Math.max(0, video.currentTime + direction / fps));
  };

  const chooseSpeed = (value: number) => {
    setSpeed(value);
    if (videoRef.current) videoRef.current.playbackRate = value;
  };

  const onLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video || !videoFile) return;
    video.playbackRate = speed;
    setVideoFacts({
      name: videoFile.name,
      sizeBytes: videoFile.size,
      durationS: Number.isFinite(video.duration) ? video.duration : null,
      width: video.videoWidth,
      height: video.videoHeight,
    });
  };

  return (
    <>
      <PageHeader title="Revisão com vídeo" subtitle={`Alpha7 x ${match.opponent}`} back={{ to: PATHS.match(match.id), label: 'Detalhes da partida' }} />

      <Card title="Arquivos do jogo">
        <div className={styles.pickers}>
          <label className={styles.picker}>
            Vídeo do jogo
            <input type="file" accept="video/*" onChange={onVideo} />
          </label>
          <label className={styles.picker}>
            Análise (.json)
            <input type="file" accept=".json,application/json" onChange={(event) => void onAnalysis(event)} />
          </label>
        </div>
        <p className={styles.muted}>
          O vídeo e a análise ficam só neste computador: nada é enviado para a nuvem e nada é gravado no Alpha7. A análise é o arquivo{' '}
          <code>.analysis.json</code> gerado pelo serviço de análise de vídeo.
        </p>
      </Card>

      {problems.length > 0 && (
        <Notice tone="error" title="Análise recusada">
          <ul className={styles.problems}>
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
          Nada foi carregado. Escolha o arquivo gerado pelo serviço de análise de vídeo.
        </Notice>
      )}

      {warnings.length > 0 && (
        <Notice tone="warning" title="Confira se é o mesmo vídeo">
          <ul className={styles.problems}>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Notice>
      )}

      {review && reviewState.loadFailed && (
        <Notice tone="warning" title="Associações guardadas não foram lidas">
          Não foi possível ler as associações guardadas neste navegador. Você pode continuar: o que associar agora volta a ser guardado.
        </Notice>
      )}

      {review && reviewState.saveFailed && (
        <Notice tone="warning" title="Associações não guardadas">
          Não foi possível guardar as associações neste navegador. Elas continuam na tela; use Exportar associações para não perder o trabalho.
        </Notice>
      )}

      {review && !reviewState.persistent && (
        <Notice tone="warning" title="Associações só em memória">
          Neste navegador as associações não ficam guardadas quando a aba é fechada. Use Exportar associações para guardar em arquivo.
        </Notice>
      )}

      {repeated.length > 0 && (
        <Notice tone="warning" title="Confira as associações">
          <ul className={styles.problems}>
            {repeated.map((label) => (
              <li key={label}>{`${label} está em duas caixas ao mesmo tempo. Uma delas provavelmente é outra pessoa: confira as trilhas.`}</li>
            ))}
          </ul>
        </Notice>
      )}

      {importResult && !importResult.ok && (
        <Notice tone="error" title="Arquivo de revisão recusado">
          <ul className={styles.problems}>
            {importResult.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
          Nada foi alterado. Escolha um arquivo exportado por esta tela, para esta partida e esta análise.
        </Notice>
      )}

      {importResult?.ok && (
        <Notice tone="success" title="Arquivo de revisão importado">
          <ul className={styles.problems}>
            {importResult.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Notice>
      )}

      {videoError && (
        <Notice tone="error" title="Não foi possível tocar o vídeo">
          Este navegador não conseguiu tocar este vídeo. Converta para MP4 (H.264) ou escolha outro arquivo; a análise continua carregada.
        </Notice>
      )}

      {!videoUrl && !analysis && problems.length === 0 && (
        <EmptyState icon="court" title="Abra o vídeo e a análise para começar">
          Abra o vídeo do jogo e a análise gerada para ele. As caixas aparecem sobre o vídeo, no instante certo.
        </EmptyState>
      )}

      <div className={styles.layout}>
        {videoUrl && (
          <div className={styles.main}>
            <div className={styles.stage} onClick={onStageClick}>
              <video ref={videoRef} src={videoUrl} controls playsInline preload="metadata" onLoadedMetadata={onLoadedMetadata} onError={() => setVideoError(true)} />
              <canvas ref={canvasRef} className={styles.overlay} aria-hidden="true" />
            </div>
            <div className={styles.controls}>
              <div className={styles.group} role="group" aria-label="Velocidade">
                {SPEEDS.map((value) => (
                  <Button key={value} variant={speed === value ? 'primary' : 'secondary'} aria-pressed={speed === value} onClick={() => chooseSpeed(value)}>
                    {speedLabel(value)}
                  </Button>
                ))}
              </div>
              <div className={styles.group}>
                <Button icon="back" onClick={() => step(-1)}>
                  Quadro anterior
                </Button>
                <Button onClick={() => step(1)}>Próximo quadro</Button>
              </div>
              {analysis && outside && (
                <p className={styles.muted}>{`Este instante está fora do trecho analisado (${formatMs(analysis.analyzedFromMs)} a ${formatMs(analysis.analyzedToMs)}): sem caixas.`}</p>
              )}
              <label className={styles.check}>
                <input type="checkbox" checked={showBoxes} onChange={(event) => setShowBoxes(event.target.checked)} />
                Mostrar caixas
              </label>
            </div>
          </div>
        )}

        {analysis && (
          <aside className={styles.side} ref={sideRef}>
            <Card title="Análise carregada">
              <p>{`${analysis.source.filename} · ${analysis.source.width}x${analysis.source.height} · ${analysis.source.fps.toFixed(1).replace('.', ',')} fps`}</p>
              <p className={styles.muted}>{`Trecho analisado: ${formatMs(analysis.analyzedFromMs)} a ${formatMs(analysis.analyzedToMs)}`}</p>
              <p className={styles.muted}>{`${analysis.frames.length} quadros analisados · ${analysis.tracks.length} trilhas`}</p>
            </Card>
            <section aria-label="Trilhas">
              <Card title="Trilhas">
                <p className={styles.muted}>Os números T&lt;n&gt; são temporários do rastreador e não identificam atletas: podem trocar quando as pessoas se cruzam ou ficam ocultas.</p>
                <ul className={styles.tracks}>
                  {tracks.slice(0, MAX_TRACKS_SHOWN).map((track) => (
                    <li key={track.trackId} className={styles.trackRow}>
                      <Button disabled={!videoUrl} onClick={() => seek(track.firstMs)}>
                        {`T${track.trackId}${trackLabels.has(track.trackId) ? ` · ${trackLabels.get(track.trackId)}` : ''} · ${formatMs(track.firstMs)} a ${formatMs(track.lastMs)} · ${track.detections} ${track.detections === 1 ? 'detecção' : 'detecções'}`}
                      </Button>
                      <select
                        className={styles.athlete}
                        aria-label={`Atleta da trilha T${track.trackId}`}
                        data-track={track.trackId}
                        disabled={!ready}
                        value={trackLabels.has(track.trackId) ? (review?.assignments[track.trackId] ?? '') : ''}
                        onChange={(event) => onAthlete(track.trackId, event.target.value)}
                      >
                        <option value="">Sem atleta</option>
                        {roster.map((player) => (
                          <option key={player.id} value={player.id}>
                            {playerLabels.get(player.id)}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
                {tracks.length > MAX_TRACKS_SHOWN && <p className={styles.muted}>{`Mostrando ${MAX_TRACKS_SHOWN} de ${tracks.length} trilhas.`}</p>}
                {!videoUrl && <p className={styles.muted}>Abra o vídeo do jogo para associar atletas e ir ao início de cada trilha.</p>}
                <div className={styles.group}>
                  <Button disabled={!ready} onClick={onExport}>
                    Exportar associações
                  </Button>
                </div>
                {ready && (
                  <label className={styles.picker}>
                    Importar associações (.json)
                    <input type="file" accept=".json,application/json" onChange={(event) => void onImport(event)} />
                  </label>
                )}
                {ready && <p className={styles.muted}>Importar substitui as associações e as referências de ponto desta tela.</p>}
              </Card>
            </section>
            {detail && (
              <ReviewDetail
                match={match}
                rally={detail.rally}
                score={detail.score}
                roster={roster}
                playerLabels={playerLabels}
                playersById={playersById}
                suggested={suggested}
                onClose={() => setDetailRallyId(null)}
              />
            )}
            {matchState && (
              <ReviewPoints
                sets={matchState.sets}
                review={review}
                enabled={ready && videoUrl !== null}
                videoOpen={videoUrl !== null}
                playersById={playersById}
                onMark={onMark}
                onClear={onClearSync}
                onSeek={(videoMs) => seek(seekTarget(videoMs))}
                actionCounts={actionCounts}
                onDetail={setDetailRallyId}
              />
            )}
          </aside>
        )}
      </div>
    </>
  );
}
