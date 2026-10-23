import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyWorkspace } from '@/data/demo';
import type { Workspace } from '@/data/types';
import { makeMatch } from '@/test/factories';
import { renderApp } from '@/test/renderApp';
import { renderRemote } from '@/test/renderRemote';
import { TEAM_A, USERS, newFake, seedTeam, seedWorkspace } from '@/test/remoteFixtures';

/** Análise sintética mínima: 2 quadros a 5 fps, duas trilhas (T1 e T2). */
const analysisJson = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    schema_version: 'alpha7.video-analysis/1',
    source: { filename: 'jogo.mp4', size_bytes: 1000, width: 848, height: 478, fps: 30, duration_s: 10 },
    frames: [
      {
        frame_index: 0,
        timestamp_ms: 0,
        detections: [
          { track_id: 1, bbox_xyxy: [10, 20, 60, 120], confidence: 0.9 },
          { track_id: 2, bbox_xyxy: [300, 40, 350, 160], confidence: 0.8 },
        ],
      },
      { frame_index: 6, timestamp_ms: 200, detections: [{ track_id: 1, bbox_xyxy: [20, 20, 70, 120], confidence: 0.85 }] },
    ],
    tracks: [
      { track_id: 1, first_timestamp_ms: 0, last_timestamp_ms: 200, detections: 2 },
      { track_id: 2, first_timestamp_ms: 0, last_timestamp_ms: 0, detections: 1 },
    ],
    ...overrides,
  });

const jsonFile = (text = analysisJson()) => new File([text], 'jogo.analysis.json', { type: 'application/json' });
const videoFile = (name = 'jogo.mp4', size = 1000) => new File([new Uint8Array(size)], name, { type: 'video/mp4' });

const world = (): Workspace => ({ ...createEmptyWorkspace(), matches: [makeMatch({ id: 'm1', opponent: 'Rivais' })] });

/** O jsdom não toca vídeo nem desenha canvas: estes fatos e o contexto de desenho são simulados. */
const media = { videoWidth: 848, videoHeight: 478, duration: 10, clientWidth: 424 };
const strokes: number[][] = [];
let urlCount = 0;

beforeEach(() => {
  Object.assign(media, { videoWidth: 848, videoHeight: 478, duration: 10, clientWidth: 424 });
  strokes.length = 0;
  urlCount = 0;
  for (const key of ['videoWidth', 'videoHeight', 'duration'] as const) {
    Object.defineProperty(HTMLMediaElement.prototype, key, { configurable: true, get: () => media[key] });
  }
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => media.videoWidth });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => media.videoHeight });
  Object.defineProperty(HTMLVideoElement.prototype, 'clientWidth', { configurable: true, get: () => media.clientWidth });
  Object.defineProperty(HTMLVideoElement.prototype, 'clientHeight', { configurable: true, get: () => Math.round((media.clientWidth * 478) / 848) });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  const ctx = {
    clearRect: vi.fn(),
    strokeRect: vi.fn((x: number, y: number, w: number, h: number) => void strokes.push([x, y, w, h])),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    measureText: () => ({ width: 10 }),
    setLineDash: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:video-${(urlCount += 1)}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});

afterEach(() => vi.restoreAllMocks());

async function open(workspace: Workspace = world()) {
  const ctx = renderApp({ path: '/partidas/m1/revisao', workspace });
  await screen.findByRole('heading', { level: 1, name: 'Revisão com vídeo' });
  return ctx;
}

const videoElement = () => document.querySelector('video') as HTMLVideoElement;

async function loadBoth(ctx: Awaited<ReturnType<typeof open>>, text = analysisJson()) {
  await ctx.user.upload(screen.getByLabelText('Vídeo do jogo'), videoFile());
  await ctx.user.upload(screen.getByLabelText('Análise (.json)'), jsonFile(text));
  await screen.findByText(/quadros analisados/);
  act(() => void fireEvent.loadedMetadata(videoElement()));
}

describe('Revisão com vídeo: entrada e estados', () => {
  it('vazio: explica que nada sobe para a nuvem e pede o vídeo e a análise', async () => {
    await open();
    expect(screen.getByText(/ficam só neste computador/)).toBeInTheDocument();
    expect(screen.getByText(/Abra o vídeo do jogo e a análise/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Trilhas' })).not.toBeInTheDocument();
  });

  it('análise válida: resumo do arquivo e trilhas com tempos, sem prometer identidade', async () => {
    const ctx = await open();
    await ctx.user.upload(screen.getByLabelText('Análise (.json)'), jsonFile());
    expect(await screen.findByText(/jogo\.mp4/)).toBeInTheDocument();
    expect(screen.getByText(/848x478/)).toBeInTheDocument();
    expect(screen.getByText(/2 quadros analisados · 2 trilhas/)).toBeInTheDocument();
    const tracks = within(screen.getByRole('region', { name: 'Trilhas' }));
    expect(tracks.getByRole('button', { name: /^T1 · 0:00 a 0:00 · 2 detecções/ })).toBeInTheDocument();
    expect(tracks.getByRole('button', { name: /^T2 · 0:00 a 0:00 · 1 detecção/ })).toBeInTheDocument();
    expect(screen.getByText(/temporários do rastreador e não identificam atletas/)).toBeInTheDocument();
  });

  it('análise inválida: lista os problemas, "Nada foi carregado" e não mostra trilhas', async () => {
    const ctx = await open();
    await ctx.user.upload(screen.getByLabelText('Análise (.json)'), jsonFile('isto não é json'));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Análise recusada');
    expect(alert).toHaveTextContent('não é um JSON válido');
    expect(alert).toHaveTextContent('Nada foi carregado');
    expect(screen.queryByRole('region', { name: 'Trilhas' })).not.toBeInTheDocument();
    await ctx.user.upload(screen.getByLabelText('Análise (.json)'), jsonFile(analysisJson({ schema_version: 'outra/9' })));
    expect(await screen.findByRole('alert')).toHaveTextContent('alpha7.video-analysis/1');
  });

  it('um arquivo válido depois de um inválido limpa o erro', async () => {
    const ctx = await open();
    await ctx.user.upload(screen.getByLabelText('Análise (.json)'), jsonFile('lixo'));
    await screen.findByRole('alert');
    await ctx.user.upload(screen.getByLabelText('Análise (.json)'), jsonFile());
    await screen.findByText(/quadros analisados/);
    expect(screen.queryByText('Análise recusada')).not.toBeInTheDocument();
  });

  it('análise de outro vídeo: avisa sem bloquear', async () => {
    const ctx = await open();
    media.duration = 600;
    media.videoWidth = 1280;
    media.videoHeight = 720;
    await loadBoth(ctx);
    const warning = await screen.findByText(/A duração do vídeo/);
    expect(warning).toBeInTheDocument();
    expect(screen.getByText(/A resolução do vídeo \(1280x720\)/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Trilhas' })).toBeInTheDocument(); // continua carregado
  });

  it('vídeo que bate com a análise não mostra aviso de divergência', async () => {
    const ctx = await open();
    await loadBoth(ctx);
    expect(screen.queryByText(/A duração do vídeo/)).not.toBeInTheDocument();
    expect(screen.queryByText(/A resolução do vídeo/)).not.toBeInTheDocument();
  });

  it('erro ao tocar o vídeo: mensagem com saída e a análise continua listada', async () => {
    const ctx = await open();
    await loadBoth(ctx);
    act(() => void fireEvent.error(videoElement()));
    expect(await screen.findByText(/não conseguiu tocar este vídeo/)).toBeInTheDocument();
    expect(screen.getByText(/MP4 \(H\.264\)/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Trilhas' })).toBeInTheDocument();
  });

  it('partida inexistente mostra o estado de erro com saída', async () => {
    renderApp({ path: '/partidas/nao-existe/revisao', workspace: world() });
    expect(await screen.findByText('Partida não encontrada')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar às partidas' })).toBeInTheDocument();
  });
});

describe('Revisão com vídeo: controles', () => {
  it('clicar numa trilha leva o vídeo ao início dela', async () => {
    const value = JSON.parse(analysisJson());
    value.tracks[1] = { track_id: 2, first_timestamp_ms: 0, last_timestamp_ms: 0, detections: 1 };
    const ctx = await open();
    await loadBoth(ctx, analysisJson({ frames: [{ frame_index: 0, timestamp_ms: 1500, detections: [{ track_id: 1, bbox_xyxy: [1, 2, 3, 4], confidence: 0.9 }] }, { frame_index: 9, timestamp_ms: 9000, detections: [{ track_id: 2, bbox_xyxy: [1, 2, 3, 4], confidence: 0.9 }] }], tracks: [{ track_id: 1, first_timestamp_ms: 1500, last_timestamp_ms: 1500, detections: 1 }, { track_id: 2, first_timestamp_ms: 9000, last_timestamp_ms: 9000, detections: 1 }] }));
    await ctx.user.click(screen.getByRole('button', { name: /^T2 · 0:09/ }));
    expect(videoElement().currentTime).toBeCloseTo(9, 2);
    await ctx.user.click(screen.getByRole('button', { name: /^T1 · 0:01/ }));
    expect(videoElement().currentTime).toBeCloseTo(1.5, 2);
  });

  it('velocidade altera playbackRate e marca a opção escolhida', async () => {
    const ctx = await open();
    await loadBoth(ctx);
    const group = within(screen.getByRole('group', { name: 'Velocidade' }));
    expect(group.getByRole('button', { name: '1x' })).toHaveAttribute('aria-pressed', 'true');
    await ctx.user.click(group.getByRole('button', { name: '0,5x' }));
    expect(videoElement().playbackRate).toBe(0.5);
    expect(group.getByRole('button', { name: '0,5x' })).toHaveAttribute('aria-pressed', 'true');
    expect(group.getByRole('button', { name: '1x' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('quadro anterior e seguinte andam 1/fps e pausam; não passam do início nem do fim', async () => {
    const ctx = await open();
    await loadBoth(ctx);
    const video = videoElement();
    video.currentTime = 1;
    await ctx.user.click(screen.getByRole('button', { name: 'Próximo quadro' }));
    expect(video.currentTime).toBeCloseTo(1 + 1 / 30, 3);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    await ctx.user.click(screen.getByRole('button', { name: 'Quadro anterior' }));
    expect(video.currentTime).toBeCloseTo(1, 3);
    video.currentTime = 0;
    await ctx.user.click(screen.getByRole('button', { name: 'Quadro anterior' }));
    expect(video.currentTime).toBe(0);
    video.currentTime = 10;
    await ctx.user.click(screen.getByRole('button', { name: 'Próximo quadro' }));
    expect(video.currentTime).toBe(10);
  });

  it('desenha as caixas do instante atual, escaladas pelo tamanho na tela, e "Mostrar caixas" liga e desliga', async () => {
    const ctx = await open();
    await loadBoth(ctx);
    const video = videoElement();
    strokes.length = 0;
    video.currentTime = 0.1; // meio caminho entre os dois quadros: T1 em [15, 20, 65, 120]
    act(() => void fireEvent.seeked(video));
    const t1 = strokes.find((s) => Math.abs((s[0] ?? 0) - 7.5) < 0.01);
    expect(t1).toEqual([7.5, 10, 25, 50]); // escala 424/848 = 0,5
    const toggle = screen.getByRole('checkbox', { name: 'Mostrar caixas' });
    expect(toggle).toBeChecked();
    await ctx.user.click(toggle);
    strokes.length = 0;
    act(() => void fireEvent.seeked(video));
    expect(strokes).toHaveLength(0);
  });

  it('fora do trecho analisado não desenha nada, não dá erro e explica por que não há caixas', async () => {
    const ctx = await open();
    await loadBoth(ctx);
    expect(screen.queryByText(/fora do trecho analisado/)).not.toBeInTheDocument();
    strokes.length = 0;
    videoElement().currentTime = 8;
    act(() => void fireEvent.seeked(videoElement()));
    expect(strokes).toHaveLength(0);
    expect(await screen.findByText(/Este instante está fora do trecho analisado \(0:00 a 0:00\)/)).toBeInTheDocument();
    videoElement().currentTime = 0.1;
    act(() => void fireEvent.seeked(videoElement()));
    await waitFor(() => expect(screen.queryByText(/fora do trecho analisado/)).not.toBeInTheDocument());
  });
});

describe('Revisão com vídeo: arquivos do navegador', () => {
  it('trocar o vídeo revoga a URL antiga e sair da tela revoga a atual', async () => {
    const ctx = await open();
    await ctx.user.upload(screen.getByLabelText('Vídeo do jogo'), videoFile('a.mp4'));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));
    await ctx.user.upload(screen.getByLabelText('Vídeo do jogo'), videoFile('b.mp4'));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(2));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:video-1');
    ctx.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:video-2');
  });

  it('o vídeo nunca é enviado: nenhuma chamada de rede acontece ao abrir os arquivos', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const ctx = await open();
    await loadBoth(ctx);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('Revisão com vídeo: papéis (cliente simulado)', () => {
  const seeded = () => {
    const fake = newFake();
    seedTeam(fake, TEAM_A, 'Equipe A', { coach: 'coach', analyst: 'analyst', viewer: 'viewer' });
    seedWorkspace(fake, TEAM_A, world());
    return fake;
  };

  it.each(['coach', 'analyst'] as const)('%s abre a tela', async (who) => {
    const fake = seeded();
    fake.signInAs(USERS[who].id);
    renderRemote(fake, { path: '/partidas/m1/revisao' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Revisão com vídeo' })).toBeInTheDocument();
  });

  it('leitor é barrado com explicação', async () => {
    const fake = seeded();
    fake.signInAs(USERS.viewer.id);
    renderRemote(fake, { path: '/partidas/m1/revisao' });
    expect(await screen.findByText('Seu papel não permite esta ação')).toBeInTheDocument();
    expect(screen.queryByLabelText('Vídeo do jogo')).not.toBeInTheDocument();
  });
});
