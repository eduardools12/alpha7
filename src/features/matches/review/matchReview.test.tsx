import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyWorkspace } from '@/data/demo';
import type { Workspace } from '@/data/types';
import { createMemoryReviewStore, setReviewStoreForTests, type ReviewStore } from '@/data/reviewStore';
import { parseVideoAnalysis } from '@/domain/videoReview';
import { assignTrack, emptyReview, reviewKey } from '@/domain/videoReviewData';
import { downloadTextFile } from '@/data/download';
import { REVIEW_SCHEMA } from '@/domain/videoReviewData';
import { makeMatch, makeMatchSet, makePlayer, makeRally } from '@/test/factories';
import { renderApp } from '@/test/renderApp';

vi.mock('@/data/download', () => ({ downloadTextFile: vi.fn() }));
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
const LAST_MODIFIED = 1_700_000_000_000;
const videoFile = (name = 'jogo.mp4', size = 1000) => new File([new Uint8Array(size)], name, { type: 'video/mp4', lastModified: LAST_MODIFIED });

const PLAYERS = [makePlayer({ id: 'p1', name: 'Ana Alves', jerseyNumber: 1 }), makePlayer({ id: 'p2', name: 'Bia Borges', jerseyNumber: 2 })];
const RALLIES = [
  makeRally('m1', 1, 1, { id: 'rA', winnerSide: 'us', reason: 'ace', playerId: 'p1', recordedAt: '2026-10-01T10:00:00.000Z' }),
  makeRally('m1', 1, 2, { id: 'rB', winnerSide: 'them', recordedAt: '2026-10-01T10:00:40.000Z' }),
  makeRally('m1', 1, 3, { id: 'rC', winnerSide: 'us', recordedAt: '2026-10-01T10:01:30.000Z' }),
  makeRally('m1', 1, 4, { id: 'rD', winnerSide: 'us', recordedAt: '2026-10-01T10:02:00.000Z', voidedAt: '2026-10-01T10:02:10.000Z' }),
];
const withPoints = (): Workspace => {
  const extra = ['p3', 'p4', 'p5', 'p6'].map((id, i) => makePlayer({ id, name: `Reserva ${id}`, jerseyNumber: 10 + i }));
  return { ...world(), players: [...PLAYERS, ...extra], matchSets: [makeMatchSet('m1', 1, ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'])], rallies: RALLIES };
};
const world = (): Workspace => ({ ...createEmptyWorkspace(), players: PLAYERS, matches: [makeMatch({ id: 'm1', opponent: 'Rivais' }), makeMatch({ id: 'm2', opponent: 'Outros' })] });

/** Armazenamento de teste: se comporta como o IndexedDB (persistente), mas em memória. */
const persistentStore = (): ReviewStore => ({ ...createMemoryReviewStore(), persistent: true });

const analysisId = () => {
  const result = parseVideoAnalysis(analysisJson());
  if (!result.ok) throw new Error('análise de teste inválida');
  return result.value.id;
};
const keyFor = (matchId = 'm1', name = 'jogo.mp4') => reviewKey(emptyReview(matchId, { name, size: 1000, lastModified: LAST_MODIFIED }, analysisId()));

/** O jsdom não toca vídeo nem desenha canvas: estes fatos e o contexto de desenho são simulados. */
const media = { videoWidth: 848, videoHeight: 478, duration: 10, clientWidth: 424 };
const strokes: number[][] = [];
const texts: string[] = [];
let store: ReviewStore = createMemoryReviewStore();
let urlCount = 0;

beforeEach(() => {
  Object.assign(media, { videoWidth: 848, videoHeight: 478, duration: 10, clientWidth: 424 });
  strokes.length = 0;
  texts.length = 0;
  urlCount = 0;
  store = persistentStore();
  setReviewStoreForTests(store);
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
    fillText: vi.fn((text: string) => void texts.push(text)),
    measureText: () => ({ width: 10 }),
    setLineDash: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:video-${(urlCount += 1)}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  setReviewStoreForTests(null);
});

async function open(workspace: Workspace = world(), matchId = 'm1') {
  const ctx = renderApp({ path: `/partidas/${matchId}/revisao`, workspace });
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

describe('Revisão com vídeo: associar trilhas a atletas', () => {
  const trackSelect = (n: number) => screen.getByLabelText(`Atleta da trilha T${n}`) as HTMLSelectElement;

  it('cada trilha ganha um seletor com "Sem atleta" e o elenco por camisa', async () => {
    const ctx = await open();
    await loadBoth(ctx);
    const options = within(trackSelect(1)).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Sem atleta', 'Ana A. #1', 'Bia B. #2']);
    expect(trackSelect(1)).toHaveValue('');
  });

  it('escolher o atleta guarda no armazenamento e mostra o nome na lista de trilhas e na caixa desenhada', async () => {
    const ctx = await open();
    await loadBoth(ctx);
    texts.length = 0;
    await ctx.user.selectOptions(trackSelect(1), 'p1');
    await waitFor(async () => expect((await store.load(keyFor()))?.assignments).toEqual({ 1: 'p1' }));
    expect(screen.getByRole('button', { name: /^T1 · Ana A\. #1 · 0:00 a 0:00/ })).toBeInTheDocument();
    expect(texts).toContain('Ana A. #1');
    expect(texts).toContain('T2'); // quem não tem atleta segue com o número temporário
  });

  it('"Sem atleta" remove a associação', async () => {
    const ctx = await open();
    await loadBoth(ctx);
    await ctx.user.selectOptions(trackSelect(1), 'p1');
    await ctx.user.selectOptions(trackSelect(1), '');
    await waitFor(async () => expect((await store.load(keyFor()))?.assignments).toEqual({}));
    expect(trackSelect(1)).toHaveValue('');
  });

  it('o mesmo atleta em duas caixas ao mesmo tempo gera aviso, que some quando só uma está visível', async () => {
    const ctx = await open();
    await loadBoth(ctx);
    await ctx.user.selectOptions(trackSelect(1), 'p1');
    await ctx.user.selectOptions(trackSelect(2), 'p1');
    videoElement().currentTime = 0;
    act(() => void fireEvent.seeked(videoElement()));
    expect(await screen.findByText(/Ana A\. #1 está em duas caixas ao mesmo tempo/)).toBeInTheDocument();
    videoElement().currentTime = 0.15; // só T1 continua visível
    act(() => void fireEvent.seeked(videoElement()));
    await waitFor(() => expect(screen.queryByText(/está em duas caixas ao mesmo tempo/)).not.toBeInTheDocument());
  });

  it('abrir de novo o mesmo vídeo e a mesma análise restaura as associações', async () => {
    const ctx = await open();
    await loadBoth(ctx);
    await ctx.user.selectOptions(trackSelect(1), 'p2');
    await waitFor(async () => expect(await store.load(keyFor())).not.toBeNull());
    ctx.unmount();
    const again = await open();
    await loadBoth(again);
    await waitFor(() => expect(trackSelect(1)).toHaveValue('p2'));
  });

  it('outro vídeo ou outra análise NÃO recebe as associações salvas', async () => {
    const ctx = await open();
    await loadBoth(ctx);
    await ctx.user.selectOptions(trackSelect(1), 'p1');
    await waitFor(async () => expect(await store.load(keyFor())).not.toBeNull());
    ctx.unmount();

    const otherVideo = await open();
    await otherVideo.user.upload(screen.getByLabelText('Vídeo do jogo'), videoFile('outro.mp4'));
    await otherVideo.user.upload(screen.getByLabelText('Análise (.json)'), jsonFile());
    await screen.findByText(/quadros analisados/);
    expect(trackSelect(1)).toHaveValue('');
    otherVideo.unmount();

    const otherAnalysis = await open();
    await loadBoth(otherAnalysis, analysisJson({ source: { filename: 'jogo.mp4', size_bytes: 1000, width: 848, height: 478, fps: 30, duration_s: 11 } }));
    expect(trackSelect(1)).toHaveValue('');
  });

  it('não vaza para outra partida', async () => {
    const ctx = await open();
    await loadBoth(ctx);
    await ctx.user.selectOptions(trackSelect(1), 'p1');
    await waitFor(async () => expect(await store.load(keyFor('m1'))).not.toBeNull());
    ctx.unmount();
    const other = await open(world(), 'm2');
    await loadBoth(other);
    expect(trackSelect(1)).toHaveValue('');
  });

  it('atleta que saiu do elenco: a trilha volta a "Sem atleta", sem erro', async () => {
    await store.save(keyFor(), assignTrack(emptyReview('m1', { name: 'jogo.mp4', size: 1000, lastModified: LAST_MODIFIED }, analysisId()), 1, 'saiu-do-elenco'));
    const ctx = await open();
    await loadBoth(ctx);
    await waitFor(() => expect(trackSelect(1)).toHaveValue(''));
    expect(screen.getByRole('button', { name: /^T1 · 0:00 a 0:00/ })).toBeInTheDocument();
  });

  it('armazenamento que falha ao salvar: a tela segue, avisa e mantém a associação em memória', async () => {
    store = { persistent: true, load: () => Promise.resolve(null), save: () => Promise.reject(new Error('cheio')) };
    setReviewStoreForTests(store);
    const ctx = await open();
    await loadBoth(ctx);
    await ctx.user.selectOptions(trackSelect(1), 'p1');
    expect(await screen.findByText(/Não foi possível guardar as associações neste navegador/)).toBeInTheDocument();
    expect(trackSelect(1)).toHaveValue('p1');
    expect(screen.getByText(/Exportar associações/, { selector: 'button' })).toBeInTheDocument();
  });

  it('armazenamento que falha ao ler: começa vazio e avisa, sem quebrar', async () => {
    store = { persistent: true, load: () => Promise.reject(new Error('bloqueado')), save: () => Promise.resolve() };
    setReviewStoreForTests(store);
    const ctx = await open();
    await loadBoth(ctx);
    expect(await screen.findByText(/Não foi possível ler as associações guardadas/)).toBeInTheDocument();
    expect(trackSelect(1)).toHaveValue('');
  });

  it('armazenamento sem persistência (navegação privada) avisa que nada fica guardado ao fechar a aba', async () => {
    setReviewStoreForTests(createMemoryReviewStore());
    const ctx = await open();
    await loadBoth(ctx);
    expect(await screen.findByText(/não ficam guardadas quando a aba é fechada/)).toBeInTheDocument();
  });

  it('sem o vídeo aberto, os seletores ficam desabilitados e dizem por quê', async () => {
    const ctx = await open();
    await ctx.user.upload(screen.getByLabelText('Análise (.json)'), jsonFile());
    await screen.findByText(/quadros analisados/);
    expect(trackSelect(1)).toBeDisabled();
    expect(screen.getByText(/Abra o vídeo do jogo para associar atletas/)).toBeInTheDocument();
  });

  it('clicar numa caixa pausa o vídeo e leva o foco ao seletor daquela trilha', async () => {
    const ctx = await open();
    await loadBoth(ctx);
    const stage = videoElement().parentElement as HTMLElement;
    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 424, height: 239, right: 424, bottom: 239, x: 0, y: 0, toJSON: () => ({}) });
    videoElement().currentTime = 0;
    (HTMLMediaElement.prototype.pause as unknown as ReturnType<typeof vi.fn>).mockClear();
    fireEvent.click(stage, { clientX: 15, clientY: 30 }); // dentro da caixa de T1: [5, 10, 30, 60] na tela
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    await waitFor(() => expect(trackSelect(1)).toHaveFocus());
    fireEvent.click(stage, { clientX: 200, clientY: 150 }); // fora de qualquer caixa: nada muda
    expect(trackSelect(1)).toHaveFocus();
  });

  it('clique na faixa dos controles do vídeo não escolhe trilha', async () => {
    const ctx = await open();
    await loadBoth(ctx);
    const stage = videoElement().parentElement as HTMLElement;
    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 424, height: 60, right: 424, bottom: 60, x: 0, y: 0, toJSON: () => ({}) });
    (HTMLMediaElement.prototype.pause as unknown as ReturnType<typeof vi.fn>).mockClear();
    fireEvent.click(stage, { clientX: 15, clientY: 30 });
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
  });
});

describe('Revisão com vídeo: exportar e importar associações', () => {
  const trackSelect = (n: number) => screen.getByLabelText(`Atleta da trilha T${n}`) as HTMLSelectElement;
  const fileOf = (data: unknown) => new File([JSON.stringify(data)], 'revisao.json', { type: 'application/json' });
  const exported = () => {
    const calls = vi.mocked(downloadTextFile).mock.calls;
    const call = calls[calls.length - 1];
    if (!call) throw new Error('nada foi exportado');
    return { filename: call[0], data: JSON.parse(call[1]) as Record<string, unknown> };
  };
  const base = (extra: Record<string, unknown> = {}) => ({
    schema_version: REVIEW_SCHEMA,
    exported_at: '2026-10-23T12:00:00.000Z',
    match_id: 'm1',
    analysis_id: analysisId(),
    video: { name: 'jogo.mp4', size: 1000, last_modified: LAST_MODIFIED },
    assignments: [{ track_id: 1, player_id: 'p1' }],
    syncs: [],
    ...extra,
  });

  beforeEach(() => vi.mocked(downloadTextFile).mockClear());

  it('exporta um arquivo com o nome da partida e o conteúdo das associações', async () => {
    const ctx = await open();
    await loadBoth(ctx);
    await ctx.user.selectOptions(trackSelect(2), 'p2');
    await ctx.user.click(screen.getByRole('button', { name: 'Exportar associações' }));
    const { filename, data } = exported();
    expect(filename).toMatch(/^alpha7-revisao-rivais-\d{4}-\d{2}-\d{2}\.json$/);
    expect(data.schema_version).toBe(REVIEW_SCHEMA);
    expect(data.match_id).toBe('m1');
    expect(data.assignments).toEqual([{ track_id: 2, player_id: 'p2' }]);
  });

  it('importar um arquivo válido substitui as associações e conta o que entrou e o que foi ignorado', async () => {
    const ctx = await open();
    await loadBoth(ctx);
    await ctx.user.selectOptions(trackSelect(2), 'p2');
    const file = fileOf(base({ assignments: [{ track_id: 1, player_id: 'p1' }, { track_id: 99, player_id: 'p1' }] }));
    await ctx.user.upload(screen.getByLabelText('Importar associações (.json)'), file);
    expect(await screen.findByText(/1 associação importada/)).toBeInTheDocument();
    expect(screen.getByText(/1 item ignorado/)).toBeInTheDocument();
    expect(trackSelect(1)).toHaveValue('p1');
    expect(trackSelect(2)).toHaveValue(''); // substituiu, não mesclou
    await waitFor(async () => expect((await store.load(keyFor()))?.assignments).toEqual({ 1: 'p1' }));
  });

  it('arquivo de outra partida, de outra análise ou quebrado: explica o motivo e não altera nada', async () => {
    const ctx = await open();
    await loadBoth(ctx);
    await ctx.user.selectOptions(trackSelect(1), 'p2');
    const input = screen.getByLabelText('Importar associações (.json)');
    await ctx.user.upload(input, fileOf(base({ match_id: 'm9' })));
    expect(await screen.findByText(/Este arquivo é de outra partida/)).toBeInTheDocument();
    await ctx.user.upload(input, fileOf(base({ analysis_id: 'zzz-1' })));
    expect(await screen.findByText(/outra análise de vídeo/)).toBeInTheDocument();
    await ctx.user.upload(input, new File(['{quebrado'], 'x.json', { type: 'application/json' }));
    expect(await screen.findByText(/não é um JSON válido/)).toBeInTheDocument();
    expect(screen.getByText(/Nada foi alterado/)).toBeInTheDocument();
    expect(trackSelect(1)).toHaveValue('p2');
    expect((await store.load(keyFor()))?.assignments).toEqual({ 1: 'p2' });
  });

  it('sem o vídeo e a análise abertos, não há campo de importar', async () => {
    await open();
    expect(screen.queryByLabelText('Importar associações (.json)')).not.toBeInTheDocument();
  });
});

describe('Revisão com vídeo: pontos da partida e o instante do vídeo', () => {
  const trackSelectFor = () => screen.getByRole('region', { name: 'Pontos da partida' });
  const points = () => within(trackSelectFor());

  it('lista os pontos ATIVOS por set, com placar e descrição, sem os anulados', async () => {
    const ctx = await open(withPoints());
    await loadBoth(ctx);
    expect(points().getByText('Set 1')).toBeInTheDocument();
    expect(points().getByText('1 x 0')).toBeInTheDocument();
    expect(points().getByText('1 x 1')).toBeInTheDocument();
    expect(points().getByText('2 x 1')).toBeInTheDocument();
    expect(points().queryByText('3 x 1')).not.toBeInTheDocument(); // rD foi anulado
    expect(points().getByText(/Alpha7 · Ace · Ana A\. #1/)).toBeInTheDocument();
  });

  it('sem pontos na partida, a lista diz isso em vez de ficar vazia', async () => {
    const ctx = await open();
    await loadBoth(ctx);
    expect(points().getByText(/Esta partida ainda não tem pontos registrados/)).toBeInTheDocument();
  });

  it('sem referência, "Ir para o vídeo" fica desabilitado e a lista diz como começar', async () => {
    const ctx = await open(withPoints());
    await loadBoth(ctx);
    for (const button of points().getAllByRole('button', { name: /^Ir para o vídeo/ })) expect(button).toBeDisabled();
    expect(points().getAllByText(/Marque no vídeo o instante de um ponto/).length).toBeGreaterThan(0);
  });

  it('marcar o ponto no instante atual calcula os outros pelo horário do registro; ir ao vídeo volta 5 s antes', async () => {
    const ctx = await open(withPoints());
    await loadBoth(ctx);
    videoElement().currentTime = 100; // o ponto rB (10:00:40) aconteceu em 1:40 do vídeo
    await ctx.user.click(points().getByRole('button', { name: 'Marcar o ponto 1 x 1 no instante atual' }));
    await waitFor(async () => expect((await store.load(keyFor()))?.syncs).toEqual({ 1: { rallyId: 'rB', videoMs: 100_000 } }));
    // rA = 40 s antes; rC = 50 s depois
    expect(points().getByText('Vídeo 1:00')).toBeInTheDocument();
    expect(points().getByText('Vídeo 1:40')).toBeInTheDocument();
    expect(points().getByText('Vídeo 2:30')).toBeInTheDocument();
    await ctx.user.click(points().getByRole('button', { name: 'Ir para o vídeo: ponto 2 x 1' }));
    expect(videoElement().currentTime).toBeCloseTo(145, 2); // 150 s - 5 s
  });

  it('não volta antes do início do vídeo', async () => {
    const ctx = await open(withPoints());
    await loadBoth(ctx);
    videoElement().currentTime = 3;
    await ctx.user.click(points().getByRole('button', { name: 'Marcar o ponto 1 x 0 no instante atual' }));
    await ctx.user.click(points().getByRole('button', { name: 'Ir para o vídeo: ponto 1 x 0' }));
    expect(videoElement().currentTime).toBe(0);
  });

  it('"Limpar referência do set" remove só a referência daquele set', async () => {
    const ctx = await open(withPoints());
    await loadBoth(ctx);
    videoElement().currentTime = 50;
    await ctx.user.click(points().getByRole('button', { name: 'Marcar o ponto 1 x 0 no instante atual' }));
    await waitFor(async () => expect((await store.load(keyFor()))?.syncs[1]).toBeDefined());
    await ctx.user.click(points().getByRole('button', { name: 'Limpar referência do set 1' }));
    await waitFor(async () => expect((await store.load(keyFor()))?.syncs).toEqual({}));
    for (const button of points().getAllByRole('button', { name: /^Ir para o vídeo/ })) expect(button).toBeDisabled();
  });

  it('referência de um ponto que foi anulado depois: some do cálculo e a lista volta a pedir uma nova', async () => {
    await store.save(keyFor(), { ...emptyReview('m1', { name: 'jogo.mp4', size: 1000, lastModified: LAST_MODIFIED }, analysisId()), syncs: { 1: { rallyId: 'rD', videoMs: 90_000 } } });
    const ctx = await open(withPoints());
    await loadBoth(ctx);
    await waitFor(() => expect(points().getAllByText(/Marque no vídeo o instante de um ponto/).length).toBeGreaterThan(0));
    for (const button of points().getAllByRole('button', { name: /^Ir para o vídeo/ })) expect(button).toBeDisabled();
  });

  it('sem o vídeo aberto não dá para marcar nem ir; a lista diz por quê', async () => {
    const ctx = await open(withPoints());
    await ctx.user.upload(screen.getByLabelText('Análise (.json)'), jsonFile());
    await screen.findByText(/quadros analisados/);
    for (const button of points().getAllByRole('button', { name: /no instante atual$/ })) expect(button).toBeDisabled();
    expect(points().getByText(/Abra o vídeo do jogo para ligar os pontos ao vídeo/)).toBeInTheDocument();
  });
});


describe('Revisão com vídeo: detalhar qualquer ponto', () => {
  const trackSelect = (n: number) => screen.getByLabelText(`Atleta da trilha T${n}`) as HTMLSelectElement;
  const points = () => within(screen.getByRole('region', { name: 'Pontos da partida' }));
  const panel = () => within(screen.getByRole('region', { name: 'Detalhar o ponto' }));

  it('"Detalhar" abre o painel do ponto escolhido (não só o último) sem registrar nada', async () => {
    const ctx = await open(withPoints());
    await loadBoth(ctx);
    expect(screen.queryByRole('region', { name: 'Detalhar o ponto' })).not.toBeInTheDocument();
    await ctx.user.click(points().getByRole('button', { name: 'Detalhar o ponto 1 x 0' }));
    expect(panel().getByRole('heading', { name: 'Detalhar o ponto 1 x 0' })).toBeInTheDocument();
    expect(panel().getByText(/Nenhuma ação técnica registrada neste ponto/)).toBeInTheDocument(); // motivo e atleta do ponto não viram ação
    expect(points().queryByText(/ação técnica registrada\b/)).not.toBeInTheDocument();
  });

  it('registra a ação no ponto ANTIGO escolhido, mostra na lista e na contagem, e desfazer anula', async () => {
    const ctx = await open(withPoints());
    await loadBoth(ctx);
    await ctx.user.click(points().getByRole('button', { name: 'Detalhar o ponto 1 x 0' }));
    await ctx.user.selectOptions(panel().getByLabelText('Atleta'), 'p2');
    await ctx.user.selectOptions(panel().getByLabelText('Fundamento'), 'ataque');
    await ctx.user.click(panel().getByRole('button', { name: 'Ponto' }));
    expect(await panel().findByText(/Bia B\. #2 · Ataque: Ponto/)).toBeInTheDocument();
    expect(points().getByText('1 ação técnica')).toBeInTheDocument();
    expect(points().getByText('1 x 0')).toBeInTheDocument(); // o placar não mudou
    await ctx.user.click(panel().getByRole('button', { name: 'Desfazer ação técnica de Bia B. #2' }));
    await waitFor(() => expect(panel().queryByText(/Bia B\. #2 · Ataque/)).not.toBeInTheDocument());
    expect(points().queryByText('1 ação técnica')).not.toBeInTheDocument();
  });

  it('as trilhas associadas visíveis agora no vídeo viram sugestão: tocar na sugestão só escolhe o atleta', async () => {
    const ctx = await open(withPoints());
    await loadBoth(ctx);
    await ctx.user.selectOptions(trackSelect(1), 'p1');
    await ctx.user.selectOptions(trackSelect(2), 'p2');
    videoElement().currentTime = 0;
    act(() => void fireEvent.seeked(videoElement()));
    await ctx.user.click(points().getByRole('button', { name: 'Detalhar o ponto 1 x 1' }));
    const suggestions = panel().getByRole('group', { name: 'Atletas nas caixas deste instante' });
    expect(within(suggestions).getAllByRole('button').map((b) => b.textContent)).toEqual(['Ana A. #1', 'Bia B. #2']);
    await ctx.user.click(within(suggestions).getByRole('button', { name: 'Bia B. #2' }));
    expect(panel().getByLabelText('Atleta')).toHaveValue('p2');
    expect(points().queryByText(/ação técnica$/)).not.toBeInTheDocument(); // nada foi registrado
  });

  it('sem trilha associada visível, explica como ter sugestões', async () => {
    const ctx = await open(withPoints());
    await loadBoth(ctx);
    await ctx.user.click(points().getByRole('button', { name: 'Detalhar o ponto 1 x 0' }));
    expect(panel().getByText(/Associe trilhas a atletas/)).toBeInTheDocument();
  });

  it('os resultados só ficam ativos depois de escolher o atleta', async () => {
    const ctx = await open(withPoints());
    await loadBoth(ctx);
    await ctx.user.click(points().getByRole('button', { name: 'Detalhar o ponto 1 x 0' }));
    for (const button of within(panel().getByRole('group', { name: 'Resultado do fundamento' })).getAllByRole('button')) expect(button).toBeDisabled();
  });

  it('"Fechar" esconde o painel', async () => {
    const ctx = await open(withPoints());
    await loadBoth(ctx);
    await ctx.user.click(points().getByRole('button', { name: 'Detalhar o ponto 1 x 0' }));
    await ctx.user.click(panel().getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('region', { name: 'Detalhar o ponto' })).not.toBeInTheDocument();
  });

  it('partida concluída: explica e não deixa registrar', async () => {
    const workspace = withPoints();
    workspace.matches = workspace.matches.map((m) => (m.id === 'm1' ? { ...m, status: 'concluida' as const } : m));
    const ctx = await open(workspace);
    await loadBoth(ctx);
    await ctx.user.click(points().getByRole('button', { name: 'Detalhar o ponto 1 x 0' }));
    expect(panel().getByText(/Esta partida está concluída/)).toBeInTheDocument();
    expect(panel().getByLabelText('Atleta')).toBeDisabled();
  });
});
