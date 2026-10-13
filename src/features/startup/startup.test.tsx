import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { createBackup } from '@/data/backup';
import { createEmptyWorkspace } from '@/data/demo';
import { CORRUPT_BACKUP_KEY, SEEN_KEY, SNAPSHOT_KEY, STORAGE_KEY } from '@/data/localStorageGateway';
import type { Workspace } from '@/data/types';
import { createUniformAttributes } from '@/domain/attributes';
import { makeEvaluation, makePlayer } from '@/test/factories';
import { createMemoryStorage, renderApp, seedStorage, demoWorkspace } from '@/test/renderApp';

type Storage = ReturnType<typeof createMemoryStorage>;

/* ───────── captura de downloads (jsdom não baixa arquivos) ───────── */
interface Download {
  filename: string;
  text: () => Promise<string>;
}
let downloads: Download[] = [];
let lastBlob: Blob | null = null;
beforeEach(() => {
  downloads = [];
  lastBlob = null;
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = vi.fn((blob: Blob) => {
    lastBlob = blob;
    return 'blob:alpha7-teste';
  });
  (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    const blob = lastBlob as Blob;
    downloads.push({ filename: this.download, text: () => blob.text() });
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

/* ───────── auxiliares ───────── */
/** Workspace pequeno de uma equipe real (nada de demonstração). */
function teamWorkspace(): Workspace {
  const ws = createEmptyWorkspace();
  ws.players = [makePlayer({ id: 'a', name: 'Ana Alves', jerseyNumber: 3 }), makePlayer({ id: 'b', name: 'Bia Borges', jerseyNumber: 4 })];
  ws.evaluations = [makeEvaluation('a', '2026-09-01', createUniformAttributes(70))];
  return ws;
}
const backupText = (ws: Workspace = teamWorkspace()) => {
  const result = createBackup(ws, { appVersion: 'teste', now: new Date('2026-10-12T10:00:00Z') });
  if (!result.ok) throw new Error(result.errors.join(' | '));
  return result.json;
};
const fileOf = (text: string, name = 'alpha7-backup.json') => new File([text], name, { type: 'application/json' });
const chooseFile = (ctx: ReturnType<typeof renderApp>, text: string) =>
  ctx.user.upload(screen.getByLabelText('Arquivo de backup (.json)'), fileOf(text));

/** Cópia exata do que o armazenamento guarda, para provar que nada mudou. */
const snapshotOf = (storage: Storage) => new Map(storage.map);
const sameAs = (storage: Storage, before: Map<string, string>) => expect(new Map(storage.map)).toEqual(before);
const workspaceIn = (storage: Storage) => JSON.parse(storage.map.get(STORAGE_KEY) ?? 'null') as (Workspace & { version: number }) | null;

const dashboard = () => screen.findByRole('heading', { level: 1, name: 'Alpha7 Performance' });
const firstUse = () => screen.findByRole('heading', { level: 1, name: 'Como você quer começar?' });
const recovery = () => screen.findByRole('heading', { level: 1, name: 'Recuperar os dados da equipe' });

/** O que uma sessão anterior deixa para trás, além do próprio workspace. */
function storageWithTeamHistory(): Storage {
  const storage = createMemoryStorage();
  seedStorage(storage, teamWorkspace());
  return storage;
}

describe('Primeira utilização: escolha explícita', () => {
  it('sem nenhum dado prévio mostra a escolha e NÃO cria nada no armazenamento', async () => {
    const storage = createMemoryStorage();
    renderApp({ path: '/', storage, seed: false });
    await firstUse();

    expect(screen.getByRole('button', { name: 'Começar com workspace vazio' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Começar com dados de demonstração' })).toBeEnabled();
    expect(screen.getByLabelText('Arquivo de backup (.json)')).toBeInTheDocument();
    expect(storage.map.size).toBe(0); // nenhuma gravação antes da escolha
    expect(screen.queryByText('Dados de demonstração')).not.toBeInTheDocument();
    expect(screen.queryByText(/Gabriel Silva/)).not.toBeInTheDocument();
  });

  it('as rotas internas mostram a mesma escolha (não há como abrir o app sem decidir)', async () => {
    const storage = createMemoryStorage();
    renderApp({ path: '/elenco', storage, seed: false });
    await firstUse();
    expect(storage.map.size).toBe(0);
  });

  it('"workspace vazio" cria só o necessário e não mistura demonstração', async () => {
    const storage = createMemoryStorage();
    const ctx = renderApp({ path: '/', storage, seed: false });
    await firstUse();
    await ctx.user.click(screen.getByRole('button', { name: 'Começar com workspace vazio' }));
    await dashboard();

    const saved = workspaceIn(storage);
    expect(saved).toMatchObject({ version: 1, players: [], evaluations: [], trainings: [], trainingEvents: [], lineups: [] });
    expect(saved?.activity).toBeNull();
    expect(storage.map.has(SEEN_KEY)).toBe(true);
    expect(screen.queryByText('Dados de demonstração')).not.toBeInTheDocument();
  });

  it('depois de escolher, o foco do teclado vai para o conteúdo principal (o botão clicado desaparece)', async () => {
    const ctx = renderApp({ path: '/', storage: createMemoryStorage(), seed: false });
    await firstUse();
    await ctx.user.click(screen.getByRole('button', { name: 'Começar com workspace vazio' }));
    await dashboard();
    await waitFor(() => expect(document.getElementById('conteudo')).toHaveFocus());
  });

  it('"demonstração" cria a base fictícia, identificada na tela', async () => {
    const storage = createMemoryStorage();
    const ctx = renderApp({ path: '/', storage, seed: false });
    await firstUse();
    await ctx.user.click(screen.getByRole('button', { name: 'Começar com dados de demonstração' }));
    await dashboard();

    const saved = workspaceIn(storage);
    expect(saved?.players).toHaveLength(18);
    expect(saved?.players.every((p) => p.demo)).toBe(true);
    expect(screen.getByText('Dados de demonstração')).toBeInTheDocument();
  });

  it('a escolha explica que a demonstração é fictícia', async () => {
    renderApp({ path: '/', storage: createMemoryStorage(), seed: false });
    await firstUse();
    expect(screen.getByText(/fictícios/)).toBeInTheDocument();
  });

  it('se o navegador recusar a gravação, avisa, não grava nada e continua na escolha', async () => {
    const storage = createMemoryStorage();
    const realSet = storage.setItem;
    storage.setItem = (key: string, value: string) => {
      if (key === STORAGE_KEY) throw new Error('QuotaExceededError');
      realSet(key, value);
    };
    const ctx = renderApp({ path: '/', storage, seed: false });
    await firstUse();
    await ctx.user.click(screen.getByRole('button', { name: 'Começar com workspace vazio' }));

    expect(await screen.findByText('Não foi possível começar')).toBeInTheDocument();
    expect(screen.getByText(/Nada foi alterado/)).toBeInTheDocument();
    expect(storage.map.has(STORAGE_KEY)).toBe(false);
    expect(screen.getByRole('heading', { level: 1, name: 'Como você quer começar?' })).toBeInTheDocument();
  });

  describe('importar um backup logo na primeira utilização', () => {
    it('mostra a prévia, só grava depois de confirmar e restaura tudo', async () => {
      const storage = createMemoryStorage();
      const ctx = renderApp({ path: '/', storage, seed: false });
      await firstUse();
      await chooseFile(ctx, backupText());

      const preview = await screen.findByRole('region', { name: 'Prévia do backup' });
      expect(within(preview).getByRole('row', { name: /Atletas\s*2/ })).toBeInTheDocument();
      expect(within(preview).queryByRole('columnheader', { name: 'Atual' })).not.toBeInTheDocument(); // não há workspace atual
      expect(storage.map.size).toBe(0); // prévia não grava

      await ctx.user.click(within(preview).getByRole('button', { name: 'Restaurar este backup' }));
      await dashboard();
      const saved = workspaceIn(storage);
      expect(saved?.players.map((p) => p.name)).toEqual(['Ana Alves', 'Bia Borges']);
      expect(saved?.evaluations).toHaveLength(1);
    });

    it('cancelar a prévia não grava nada', async () => {
      const storage = createMemoryStorage();
      const ctx = renderApp({ path: '/', storage, seed: false });
      await firstUse();
      await chooseFile(ctx, backupText());
      const preview = await screen.findByRole('region', { name: 'Prévia do backup' });
      await ctx.user.click(within(preview).getByRole('button', { name: 'Cancelar' }));
      expect(screen.queryByRole('region', { name: 'Prévia do backup' })).not.toBeInTheDocument();
      expect(storage.map.size).toBe(0);
    });

    it('arquivo inválido é recusado e nada é gravado', async () => {
      const storage = createMemoryStorage();
      const ctx = renderApp({ path: '/', storage, seed: false });
      await firstUse();
      await chooseFile(ctx, '{ isto não é um backup');
      expect(await screen.findByText('Arquivo recusado. Nada foi alterado.')).toBeInTheDocument();
      expect(storage.map.size).toBe(0);
    });
  });
});

describe('Workspace existente: carregamento normal', () => {
  it('abre os dados sem mostrar escolha nem recuperação e não regrava o que estava salvo', async () => {
    const storage = storageWithTeamHistory();
    const before = storage.map.get(STORAGE_KEY);
    renderApp({ path: '/elenco', storage, seed: false });
    expect(await screen.findByText('2 jogadores')).toBeInTheDocument();

    expect(screen.queryByRole('heading', { name: 'Como você quer começar?' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Recuperar os dados da equipe' })).not.toBeInTheDocument();
    expect(storage.map.get(STORAGE_KEY)).toBe(before);
  });

  it('dados criados antes da marca de uso existir passam a tê-la, sem alterar o workspace', async () => {
    const storage = createMemoryStorage();
    seedStorage(storage, teamWorkspace());
    storage.removeItem(SEEN_KEY); // como os dados de versões anteriores
    const before = storage.map.get(STORAGE_KEY);
    renderApp({ path: '/elenco', storage, seed: false });
    expect(await screen.findByText('2 jogadores')).toBeInTheDocument();
    expect(storage.map.has(SEEN_KEY)).toBe(true);
    expect(storage.map.get(STORAGE_KEY)).toBe(before);
  });

  it('inconsistência estrutural leve não bloqueia: abre os dados e avisa, sem alterar nada', async () => {
    const ws = teamWorkspace();
    ws.evaluations.push(makeEvaluation('ninguem', '2026-10-01', createUniformAttributes(60)));
    const storage = createMemoryStorage();
    seedStorage(storage, ws);
    const before = snapshotOf(storage);
    renderApp({ path: '/elenco', storage, seed: false });
    expect(await screen.findByText('2 jogadores')).toBeInTheDocument();
    expect(await screen.findByText('Os dados salvos têm inconsistências')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Verificar integridade' })).toBeInTheDocument();
    sameAs(storage, before);
  });

  it('demonstração misturada com dados da equipe é anunciada, não silenciosa', async () => {
    const ws = demoWorkspace();
    ws.players = [...ws.players, makePlayer({ id: 'real', name: 'Real Jogadora', jerseyNumber: 99 })];
    const storage = createMemoryStorage();
    seedStorage(storage, ws);
    renderApp({ path: '/elenco', storage, seed: false });
    expect(await screen.findByText('Demonstração misturada com dados da equipe')).toBeInTheDocument();
  });

  it('só demonstração mostra o aviso simples de demonstração', async () => {
    const storage = createMemoryStorage();
    seedStorage(storage, demoWorkspace());
    renderApp({ path: '/elenco', storage, seed: false });
    expect(await screen.findByText('Dados de demonstração')).toBeInTheDocument();
    expect(screen.queryByText('Demonstração misturada com dados da equipe')).not.toBeInTheDocument();
  });
});

describe('Workspace ausente com sinais de uso anterior', () => {
  /** A chave principal sumiu, mas a marca de uso ficou (limpeza parcial, extensão, edição manual). */
  function lostStorage(): Storage {
    const storage = storageWithTeamHistory();
    storage.removeItem(STORAGE_KEY);
    return storage;
  }

  it('não cria demonstração: abre a recuperação e deixa o armazenamento exatamente como estava', async () => {
    const storage = lostStorage();
    const before = snapshotOf(storage);
    renderApp({ path: '/', storage, seed: false });
    await recovery();

    expect(screen.getByText('Os dados da equipe não foram encontrados')).toBeInTheDocument();
    expect(screen.getByText(/nenhum dado de demonstração foi criado no lugar/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Como você quer começar?' })).not.toBeInTheDocument();
    expect(screen.queryByText('Dados de demonstração')).not.toBeInTheDocument();
    sameAs(storage, before);
    expect(storage.map.has(STORAGE_KEY)).toBe(false);
  });

  it.each([
    ['a marca de uso', SEEN_KEY],
    ['uma cópia de segurança automática', SNAPSHOT_KEY],
    ['uma cópia de dado ilegível', CORRUPT_BACKUP_KEY],
    ['um backup registrado', 'alpha7.lastBackup.v1'],
  ])('basta %s para tratar a falta do workspace como perda', async (_label, key) => {
    const storage = createMemoryStorage();
    storage.setItem(key, key === SNAPSHOT_KEY ? JSON.stringify({ savedAt: '2026-10-01T00:00:00.000Z', reason: 'teste', previousRaw: '{}' }) : 'x');
    renderApp({ path: '/', storage, seed: false });
    await recovery();
    expect(storage.map.has(STORAGE_KEY)).toBe(false);
  });

  it('oferece as quatro saídas: importar, baixar, tentar de novo e começar novo (com confirmação)', async () => {
    renderApp({ path: '/', storage: lostStorage(), seed: false });
    await recovery();
    expect(screen.getByLabelText('Arquivo de backup (.json)')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Baixar os dados brutos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Começar um workspace novo…' })).toBeInTheDocument();
  });

  it('sem nenhum texto guardado, diz que não há dados brutos para baixar', async () => {
    renderApp({ path: '/', storage: lostStorage(), seed: false });
    await recovery();
    expect(await screen.findByText('Não há dados brutos guardados neste navegador para baixar.')).toBeInTheDocument();
  });

  it('tentar novamente com os dados ainda ausentes continua na recuperação e não grava nada', async () => {
    const storage = lostStorage();
    const before = snapshotOf(storage);
    const ctx = renderApp({ path: '/', storage, seed: false });
    await recovery();
    await ctx.user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await recovery();
    sameAs(storage, before);
  });

  it('tentar novamente depois que os dados voltam abre o workspace normalmente', async () => {
    const storage = lostStorage();
    const ctx = renderApp({ path: '/elenco', storage, seed: false });
    await recovery();
    const returned = createMemoryStorage();
    seedStorage(returned, teamWorkspace());
    storage.setItem(STORAGE_KEY, returned.map.get(STORAGE_KEY) ?? '');

    await ctx.user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('2 jogadores')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Recuperar os dados da equipe' })).not.toBeInTheDocument();
  });

  describe('com cópia de segurança automática', () => {
    function lostWithSnapshot(): Storage {
      const storage = createMemoryStorage();
      seedStorage(storage, teamWorkspace());
      const raw = storage.map.get(STORAGE_KEY) ?? '';
      storage.setItem(SNAPSHOT_KEY, JSON.stringify({ savedAt: '2026-10-01T12:00:00.000Z', reason: 'apagar tudo', previousRaw: raw }));
      storage.removeItem(STORAGE_KEY);
      return storage;
    }

    it('mostra o que a cópia contém e permite baixar o texto bruto', async () => {
      const storage = lostWithSnapshot();
      const original = JSON.parse(storage.map.get(SNAPSHOT_KEY) ?? '{}').previousRaw as string;
      const ctx = renderApp({ path: '/', storage, seed: false });
      await recovery();
      expect(screen.getByRole('heading', { name: 'Cópia de segurança automática' })).toBeInTheDocument();
      expect(screen.getByText(/Continha 2 atletas, 1 avaliação/)).toBeInTheDocument();

      await ctx.user.click(await screen.findByRole('button', { name: /Baixar: Cópia de segurança automática/ }));
      await waitFor(() => expect(downloads).toHaveLength(1));
      expect(await downloads[0]!.text()).toBe(original);
      expect(downloads[0]!.filename).toMatch(/^alpha7-dados-brutos-snapshot-\d{4}-\d{2}-\d{2}\.txt$/);
    });

    it('restaurar a cópia devolve o workspace anterior', async () => {
      const storage = lostWithSnapshot();
      const ctx = renderApp({ path: '/elenco', storage, seed: false });
      await recovery();
      await ctx.user.click(screen.getByRole('button', { name: 'Restaurar a cópia de segurança automática' }));
      expect(await screen.findByText('2 jogadores')).toBeInTheDocument();
      expect(workspaceIn(storage)?.players.map((p) => p.name)).toEqual(['Ana Alves', 'Bia Borges']);
    });

    it('cópia ilegível não é restaurada e nada muda', async () => {
      const storage = createMemoryStorage();
      storage.setItem(SNAPSHOT_KEY, JSON.stringify({ savedAt: '2026-10-01T12:00:00.000Z', reason: 'teste', previousRaw: '{quebrado' }));
      const before = snapshotOf(storage);
      const ctx = renderApp({ path: '/', storage, seed: false });
      await recovery();
      await ctx.user.click(screen.getByRole('button', { name: 'Restaurar a cópia de segurança automática' }));
      expect(await screen.findByText(/ilegível e não pode ser restaurada/)).toBeInTheDocument();
      expect(screen.getByText(/Nada foi alterado/)).toBeInTheDocument();
      sameAs(storage, before);
    });
  });

  describe('importar um backup', () => {
    it('restaura o workspace do arquivo depois da confirmação', async () => {
      const storage = lostStorage();
      const ctx = renderApp({ path: '/elenco', storage, seed: false });
      await recovery();
      await chooseFile(ctx, backupText());
      const preview = await screen.findByRole('region', { name: 'Prévia do backup' });
      expect(storage.map.has(STORAGE_KEY)).toBe(false); // prévia ainda não grava
      await ctx.user.click(within(preview).getByRole('button', { name: 'Restaurar este backup' }));
      expect(await screen.findByText('2 jogadores')).toBeInTheDocument();
      expect(workspaceIn(storage)?.evaluations).toHaveLength(1);
    });

    it('arquivo adulterado é recusado e o armazenamento fica exatamente como estava', async () => {
      const storage = lostStorage();
      const before = snapshotOf(storage);
      const ctx = renderApp({ path: '/', storage, seed: false });
      await recovery();
      const tampered = backupText().replace('Ana Alves', 'Ana Adulterada');
      await chooseFile(ctx, tampered);
      expect(await screen.findByText('Arquivo recusado. Nada foi alterado.')).toBeInTheDocument();
      expect(screen.getByText(/verificação de integridade falhou/)).toBeInTheDocument();
      sameAs(storage, before);
      await recovery(); // continua na recuperação
    });

    it('falha de gravação durante a restauração não deixa nada pela metade', async () => {
      const storage = lostStorage();
      const before = snapshotOf(storage);
      const ctx = renderApp({
        path: '/',
        storage,
        seed: false,
        wrapGateway: (gateway) => {
          gateway.replaceWorkspace = () => Promise.reject(new Error('QuotaExceededError'));
          return gateway;
        },
      });
      await recovery();
      await chooseFile(ctx, backupText());
      const preview = await screen.findByRole('region', { name: 'Prévia do backup' });
      await ctx.user.click(within(preview).getByRole('button', { name: 'Restaurar este backup' }));
      expect(await screen.findByText('Restauração não realizada')).toBeInTheDocument();
      expect(screen.getByText(/Nada foi alterado/)).toBeInTheDocument();
      sameAs(storage, before);
      expect(screen.getByRole('heading', { level: 1, name: 'Recuperar os dados da equipe' })).toBeInTheDocument();
    });

    it('cancelar a prévia deixa tudo como estava', async () => {
      const storage = lostStorage();
      const before = snapshotOf(storage);
      const ctx = renderApp({ path: '/', storage, seed: false });
      await recovery();
      await chooseFile(ctx, backupText());
      const preview = await screen.findByRole('region', { name: 'Prévia do backup' });
      await ctx.user.click(within(preview).getByRole('button', { name: 'Cancelar' }));
      sameAs(storage, before);
    });
  });

  describe('começar um workspace novo só depois de confirmar', () => {
    it('abrir a confirmação e cancelar não altera nada', async () => {
      const storage = lostStorage();
      const before = snapshotOf(storage);
      const ctx = renderApp({ path: '/', storage, seed: false });
      await recovery();
      await ctx.user.click(screen.getByRole('button', { name: 'Começar um workspace novo…' }));
      expect(screen.getByText('Começar um workspace novo?')).toBeInTheDocument();
      sameAs(storage, before);
      await ctx.user.click(screen.getByRole('button', { name: 'Cancelar' }));
      expect(screen.getByRole('button', { name: 'Começar um workspace novo…' })).toBeInTheDocument();
      sameAs(storage, before);
    });

    it('confirmar cria o workspace escolhido (vazio ou demonstração)', async () => {
      const storage = lostStorage();
      const ctx = renderApp({ path: '/', storage, seed: false });
      await recovery();
      await ctx.user.click(screen.getByRole('button', { name: 'Começar um workspace novo…' }));
      await ctx.user.click(screen.getByRole('button', { name: 'Confirmar: começar com workspace vazio' }));
      await dashboard();
      expect(workspaceIn(storage)?.players).toEqual([]);
    });

    it('a demonstração só entra por escolha explícita nesta tela', async () => {
      const storage = lostStorage();
      const ctx = renderApp({ path: '/', storage, seed: false });
      await recovery();
      await ctx.user.click(screen.getByRole('button', { name: 'Começar um workspace novo…' }));
      await ctx.user.click(screen.getByRole('button', { name: 'Confirmar: começar com dados de demonstração' }));
      await dashboard();
      expect(workspaceIn(storage)?.players).toHaveLength(18);
      expect(screen.getByText('Dados de demonstração')).toBeInTheDocument();
    });
  });
});

describe('Dados ilegíveis ou inconsistentes', () => {
  const BROKEN = '{conteudo quebrado';
  function corruptStorage(raw = BROKEN): Storage {
    const storage = createMemoryStorage();
    storage.setItem(STORAGE_KEY, raw);
    return storage;
  }

  it('preserva o texto original, explica que nada foi apagado e não oferece a demonstração em silêncio', async () => {
    const storage = corruptStorage();
    renderApp({ path: '/', storage, seed: false });
    await recovery();
    expect(screen.getByText('Os dados salvos estão ilegíveis')).toBeInTheDocument();
    expect(screen.getByText(/Os dados não foram apagados/)).toBeInTheDocument();
    expect(storage.map.get(STORAGE_KEY)).toBe(BROKEN);
    expect(screen.queryByText('Dados de demonstração')).not.toBeInTheDocument();
  });

  it('permite baixar o conteúdo bruto exato', async () => {
    const storage = corruptStorage();
    const ctx = renderApp({ path: '/', storage, seed: false });
    await recovery();
    await ctx.user.click(await screen.findByRole('button', { name: 'Baixar: Dados salvos neste navegador' }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(await downloads[0]!.text()).toBe(BROKEN);
  });

  it('começar novo exige confirmação e guarda o conteúdo antigo como cópia de segurança', async () => {
    const storage = corruptStorage();
    const ctx = renderApp({ path: '/', storage, seed: false });
    await recovery();
    await ctx.user.click(screen.getByRole('button', { name: 'Começar um workspace novo…' }));
    expect(storage.map.get(STORAGE_KEY)).toBe(BROKEN); // ainda nada mudou
    expect(screen.getByText(/conteúdo ilegível continua guardado/)).toBeInTheDocument();
    await ctx.user.click(screen.getByRole('button', { name: 'Confirmar: começar com workspace vazio' }));
    await dashboard();
    expect(workspaceIn(storage)?.players).toEqual([]);
    const snapshot = JSON.parse(storage.map.get(SNAPSHOT_KEY) ?? '{}') as { previousRaw: string };
    expect(snapshot.previousRaw).toBe(BROKEN);
  });

  it('cancelar a confirmação preserva o texto original', async () => {
    const storage = corruptStorage();
    const ctx = renderApp({ path: '/', storage, seed: false });
    await recovery();
    await ctx.user.click(screen.getByRole('button', { name: 'Começar um workspace novo…' }));
    await ctx.user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(storage.map.get(STORAGE_KEY)).toBe(BROKEN);
  });

  it('importar um backup substitui o ilegível e o guarda como cópia de segurança', async () => {
    const storage = corruptStorage();
    const ctx = renderApp({ path: '/elenco', storage, seed: false });
    await recovery();
    await chooseFile(ctx, backupText());
    const preview = await screen.findByRole('region', { name: 'Prévia do backup' });
    await ctx.user.click(within(preview).getByRole('button', { name: 'Restaurar este backup' }));
    expect(await screen.findByText('2 jogadores')).toBeInTheDocument();
    const snapshot = JSON.parse(storage.map.get(SNAPSHOT_KEY) ?? '{}') as { previousRaw: string };
    expect(snapshot.previousRaw).toBe(BROKEN);
  });

  it('importação que falha mantém o texto ilegível intacto', async () => {
    const storage = corruptStorage();
    const ctx = renderApp({
      path: '/',
      storage,
      seed: false,
      wrapGateway: (gateway) => {
        gateway.replaceWorkspace = () => Promise.reject(new Error('QuotaExceededError'));
        return gateway;
      },
    });
    await recovery();
    await chooseFile(ctx, backupText());
    const preview = await screen.findByRole('region', { name: 'Prévia do backup' });
    await ctx.user.click(within(preview).getByRole('button', { name: 'Restaurar este backup' }));
    expect(await screen.findByText('Restauração não realizada')).toBeInTheDocument();
    expect(storage.map.get(STORAGE_KEY)).toBe(BROKEN);
    expect(storage.map.has(SNAPSHOT_KEY)).toBe(false);
  });

  it('sem espaço para a cópia de segurança, começar novo é abortado e o texto fica intacto', async () => {
    const storage = corruptStorage();
    const realSet = storage.setItem;
    storage.setItem = (key: string, value: string) => {
      if (key === SNAPSHOT_KEY) throw new Error('QuotaExceededError');
      realSet(key, value);
    };
    const ctx = renderApp({ path: '/', storage, seed: false });
    await recovery();
    await ctx.user.click(screen.getByRole('button', { name: 'Começar um workspace novo…' }));
    await ctx.user.click(screen.getByRole('button', { name: 'Confirmar: começar com workspace vazio' }));
    expect(await screen.findByText(/Nada foi alterado/)).toBeInTheDocument();
    expect(storage.map.get(STORAGE_KEY)).toBe(BROKEN);
  });
});

describe('Nenhum workspace anterior é substituído em silêncio pela demonstração', () => {
  const valid = () => {
    const storage = createMemoryStorage();
    seedStorage(storage, teamWorkspace());
    return storage;
  };
  const withEdit = (edit: (data: Record<string, unknown>) => void) => {
    const storage = valid();
    const data = JSON.parse(storage.map.get(STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    edit(data);
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
    return storage;
  };

  const cases: [string, () => Storage][] = [
    ['chave principal removida', () => { const s = valid(); s.removeItem(STORAGE_KEY); return s; }],
    ['JSON truncado', () => { const s = valid(); s.setItem(STORAGE_KEY, (s.map.get(STORAGE_KEY) ?? '').slice(0, 40)); return s; }],
    ['texto que não é JSON', () => { const s = valid(); s.setItem(STORAGE_KEY, 'lixo'); return s; }],
    ['versão de esquema desconhecida', () => withEdit((d) => { d.version = 99; })],
    ['lista de atletas inválida', () => withEdit((d) => { d.players = 'x'; })],
    ['valor nulo', () => { const s = valid(); s.setItem(STORAGE_KEY, 'null'); return s; }],
  ];

  it.each(cases)('%s: abre a recuperação, não cria demonstração e preserva o armazenamento', async (_label, build) => {
    const storage = build();
    const before = snapshotOf(storage);
    renderApp({ path: '/', storage, seed: false });
    await recovery();
    // o texto salvo não muda; a única gravação permitida é a cópia do conteúdo ilegível (preserva, não substitui)
    expect(storage.map.get(STORAGE_KEY) ?? null).toBe(before.get(STORAGE_KEY) ?? null);
    const added = [...storage.map.keys()].filter((key) => !before.has(key));
    expect(added.every((key) => key === CORRUPT_BACKUP_KEY)).toBe(true);
    expect(JSON.stringify([...storage.map.values()])).not.toContain('demo\\":true');
  });
});
