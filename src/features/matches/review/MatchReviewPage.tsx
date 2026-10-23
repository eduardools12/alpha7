import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useParams } from 'react-router-dom';
import { PATHS } from '@/app/routes';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { useWorkspace } from '@/data/WorkspaceProvider';
import { boxesAt, compareWithVideo, formatMs, isWithinAnalysis, parseVideoAnalysis, type VideoAnalysis, type VideoFacts } from '@/domain/videoReview';
import { drawBoxes } from './reviewCanvas';
import styles from './MatchReviewPage.module.css';

const SPEEDS = [0.25, 0.5, 1, 2] as const;
const speedLabel = (speed: number) => `${String(speed).replace('.', ',')}x`;
/** Lista de trilhas: mostra no máximo isto (uma análise longa pode ter milhares). */
const MAX_TRACKS_SHOWN = 300;
const DEFAULT_FPS = 30;

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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analysisRequest = useRef(0);

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
      if (!analysis) return;
      const nowMs = video.currentTime * 1000;
      const out = !isWithinAnalysis(analysis, nowMs);
      setOutside((previous) => (previous === out ? previous : out)); // só re-renderiza quando muda
      if (!showBoxes) return;
      drawBoxes(ctx, boxesAt(analysis, nowMs), width / analysis.source.width);
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
  }, [analysis, showBoxes, videoUrl]);

  const warnings = useMemo(() => (analysis && videoFacts ? compareWithVideo(analysis.source, videoFacts) : []), [analysis, videoFacts]);
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
            <div className={styles.stage}>
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
          <aside className={styles.side}>
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
                    <li key={track.trackId}>
                      <Button disabled={!videoUrl} onClick={() => seek(track.firstMs)}>
                        {`T${track.trackId} · ${formatMs(track.firstMs)} a ${formatMs(track.lastMs)} · ${track.detections} ${track.detections === 1 ? 'detecção' : 'detecções'}`}
                      </Button>
                    </li>
                  ))}
                </ul>
                {tracks.length > MAX_TRACKS_SHOWN && <p className={styles.muted}>{`Mostrando ${MAX_TRACKS_SHOWN} de ${tracks.length} trilhas.`}</p>}
                {!videoUrl && <p className={styles.muted}>Abra o vídeo do jogo para ir ao início de cada trilha.</p>}
              </Card>
            </section>
          </aside>
        )}
      </div>
    </>
  );
}
