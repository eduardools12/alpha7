import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { canonicalize, createBackup, parseBackup, summarizeWorkspace } from '@/data/backup';
import { createEmptyWorkspace } from '@/data/demo';
import { SNAPSHOT_KEY, STORAGE_KEY } from '@/data/localStorageGateway';
import { sha256Hex } from '@/data/sha256';
import type { Workspace } from '@/data/types';
import { createUniformAttributes } from '@/domain/attributes';
import { makeEvaluation, makeEvent, makeExercise, makePlayer, makeTraining } from '@/test/factories';
import { createMemoryStorage, demoWorkspace, renderApp } from '@/test/renderApp';

type Ctx = ReturnType<typeof renderApp>;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

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
const stored = (ctx: Pick<Ctx, 'storage'>) => ctx.storage.map.get(STORAGE_KEY) ?? '';
const storedWorkspace = (ctx: Pick<Ctx, 'storage'>) => JSON.parse(stored(ctx)) as Workspace & { version: number };

async function openSettings(options: Parameters<typeof renderApp>[0] = {}) {
  const ctx = renderApp({ path: '/configuracoes', ...options });
  await screen.findByRole('heading', { level: 1, name: 'Configurações' });
  return ctx;
}

/** Workspace pequeno e totalmente diferente da demonstração, com todas as coleções. */
function smallWorkspace(): Workspace {
  const ws = createEmptyWorkspace();
  ws.players = [
    makePlayer({ id: 'a', name: 'Ana Alves', jerseyNumber: 3, primaryPosition: 'levantador' }),
    makePlayer({ id: 'b', name: 'Bia Borges', jerseyNumber: 4 }),
  ];
  ws.evaluations = [
    makeEvaluation('a', '2026-08-01', createUniformAttributes(60)),
    makeEvaluation('a', '2026-09-01', createUniformAttributes(70)),
    makeEvaluation('b', '2026-09-02', createUniformAttributes(65)),
  ];
  ws.trainings = [makeTraining({ id: 't', name: 'Treino real', participantIds: ['a', 'b'], status: 'concluido', completedAt: '2026-10-10T21:00:00.000Z' })];
  ws.exercises = [makeExercise('t', { id: 'x', name: 'Saque', focus: 'saque' })];
  ws.trainingEvents = [
    makeEvent('t', 'x', 'a', 'saque', 'ace', { recordedAt: '2026-10-10T19:00:00.000Z' }),
    makeEvent('t', 'x', 'b', 'saque', 'erro', { recordedAt: '2026-10-10T19:00:20.000Z', voidedAt: '2026-10-10T19:01:00.000Z' }),
  ];
  ws.settings.weights.ponteiro.SAC = 40;
  return ws;
}
const backupOf = (ws: Workspace) => {
  const result = createBackup(ws, { appVersion: 'teste', now: new Date('2026-10-12T10:00:00Z') });
  if (!result.ok) throw new Error(result.errors.join(' | '));
  return result;
};
const fileOf = (text: string, name = 'backup.json') => new File([text], name, { type: 'application/json' });
const chooseFile = (ctx: Ctx, file: File) => ctx.user.upload(screen.getByLabelText('Arquivo de backup (.json)'), file);

/** Forja arquivo com hash correto e conteúdo alterado, para testar validação de vínculos e tipos. */
function forged(mutate: (body: Record<string, any>) => void, ws: Workspace = smallWorkspace()): string {
  const file = clone(backupOf(ws).file) as any;
  mutate(file.workspace);
  file.checksum.value = sha256Hex(canonicalize(file.workspace));
  return JSON.stringify(file);
}

describe('Exportar backup', () => {
  it('só exporta com ação explícita; gera o arquivo com a data no nome e confirma o sucesso', async () => {
    const ctx = await openSettings();
    expect(downloads).toHaveLength(0); // nada é baixado sozinho
    await ctx.user.click(screen.getByRole('button', { name: 'Exportar backup' }));

    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0]!.filename).toMatch(/^alpha7-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
    expect(await screen.findByText(/Backup exportado: alpha7-backup-/)).toBeInTheDocument();
    expect(screen.getByText(/18 atletas, \d+ avaliações, 4 treinos, \d+ registros de treino, 1 escalações/)).toBeInTheDocument();
    expect(screen.getByText(/não é criptografado/)).toBeInTheDocument();
  });

  it('o arquivo contém o workspace INTEIRO do armazenamento e é um backup válido de ponta a ponta', async () => {
    const original = smallWorkspace();
    const ctx = await openSettings({ workspace: original });
    await ctx.user.click(screen.getByRole('button', { name: 'Exportar backup' }));
    await waitFor(() => expect(downloads).toHaveLength(1));

    const parsed = parseBackup(await downloads[0]!.text());
    if (!parsed.ok) throw new Error(parsed.errors.join(' | '));
    expect(parsed.workspace).toEqual(original);
    expect(parsed.meta.formatVersion).toBe(1);
    expect(parsed.summary).toEqual(summarizeWorkspace(original));
  });

  it('lê do armazenamento (não da tela): inclui o que outra aba salvou depois', async () => {
    const ctx = await openSettings({ workspace: smallWorkspace() });
    // simula outra aba gravando um atleta novo; esta aba ainda não sabe
    const raw = storedWorkspace(ctx);
    raw.players.push(makePlayer({ id: 'c', name: 'Cris Costa', jerseyNumber: 9 }));
    ctx.storage.setItem(STORAGE_KEY, JSON.stringify(raw));

    await ctx.user.click(screen.getByRole('button', { name: 'Exportar backup' }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    const parsed = parseBackup(await downloads[0]!.text());
    expect(parsed.ok && parsed.workspace.players.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('com dados inconsistentes, recusa gerar o backup, explica e oferece a cópia bruta', async () => {
    const broken = smallWorkspace();
    broken.trainingEvents.push(makeEvent('treino-fantasma', 'x', 'a', 'saque', 'ace'));
    const ctx = await openSettings({ workspace: broken });
    await ctx.user.click(screen.getByRole('button', { name: 'Exportar backup' }));

    expect(await screen.findByText('Backup não gerado')).toBeInTheDocument();
    expect(screen.getByText(/treino "treino-fantasma" não existe/)).toBeInTheDocument();
    expect(downloads).toHaveLength(0); // nenhum backup falso

    await ctx.user.click(screen.getByRole('button', { name: 'Baixar cópia bruta dos dados' }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0]!.filename).toMatch(/^alpha7-dados-brutos-\d{4}-\d{2}-\d{2}\.txt$/);
    expect(await downloads[0]!.text()).toBe(stored(ctx));
  });

  it('mostra se há alterações desde o último backup', async () => {
    const ctx = await openSettings();
    expect(screen.getAllByText('Nenhum backup foi exportado neste navegador ainda.').length).toBeGreaterThan(0);
    await ctx.user.click(screen.getByRole('button', { name: 'Exportar backup' }));
    expect(await screen.findAllByText(/Nenhuma alteração desde então/)).not.toHaveLength(0);

    // altera um dado (pesos do Overall) e o aviso muda
    const sac = screen.getByLabelText(/Saque SAC/);
    await ctx.user.clear(sac);
    await ctx.user.type(sac, '33');
    await ctx.user.click(screen.getByRole('button', { name: 'Salvar pesos' }));
    expect(await screen.findAllByText(/Houve alterações desde então/)).not.toHaveLength(0);
  });
});

describe('Importar backup: prévia e confirmação', () => {
  it('arquivo válido mostra a prévia (contagens, origem, comparação) e NADA muda até confirmar', async () => {
    const ctx = await openSettings();
    const before = stored(ctx);
    await chooseFile(ctx, fileOf(backupOf(smallWorkspace()).json, 'meu-backup.json'));

    expect(await screen.findByText('Prévia: meu-backup.json')).toBeInTheDocument();
    const preview = within(screen.getByRole('region', { name: 'Prévia do backup' }));
    expect(preview.getByText(/Arquivo íntegro e consistente/)).toBeInTheDocument();
    const table = within(preview.getByRole('table'));
    expect(table.getByRole('row', { name: /Atletas 2 18/ })).toBeInTheDocument();
    expect(table.getByRole('row', { name: /Registros de treino desfeitos 1 0/ })).toBeInTheDocument();
    expect(preview.getByText(/O backup tem 8 registros criados pela equipe e 0 registros de demonstração/)).toBeInTheDocument();
    expect(preview.getByText('Restaurar substitui TODO o workspace atual')).toBeInTheDocument();
    expect(preview.getByRole('button', { name: 'Restaurar este backup' })).toBeDisabled();
    expect(stored(ctx)).toBe(before);
    expect(ctx.storage.map.has(SNAPSHOT_KEY)).toBe(false);
  });

  it('exige marcar a confirmação; só então restaura, substituindo tudo e guardando cópia de segurança', async () => {
    const source = smallWorkspace();
    const ctx = await openSettings();
    const before = stored(ctx);
    await chooseFile(ctx, fileOf(backupOf(source).json));
    const restore = await screen.findByRole('button', { name: 'Restaurar este backup' });
    expect(restore).toBeDisabled();

    await ctx.user.click(screen.getByRole('checkbox', { name: /Entendi que os dados atuais serão substituídos/ }));
    expect(restore).toBeEnabled();
    await ctx.user.click(restore);

    expect(await screen.findByText('Restauração concluída')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Prévia do backup' })).not.toBeInTheDocument();
    const now = storedWorkspace(ctx);
    expect(now.players).toEqual(source.players); // substituiu os 18 de demonstração
    expect(now.evaluations).toEqual(source.evaluations);
    expect(now.trainings).toEqual(source.trainings);
    expect(now.trainingEvents).toEqual(source.trainingEvents);
    expect(now.settings.weights.ponteiro.SAC).toBe(40); // configurações também voltam do arquivo
    // o conteúdo anterior ficou guardado, byte a byte
    const snapshot = JSON.parse(ctx.storage.map.get(SNAPSHOT_KEY) ?? '{}') as { previousRaw: string; reason: string };
    expect(snapshot.previousRaw).toBe(before);
    expect(snapshot.reason).toBe('importação do backup backup.json');
    expect(await screen.findByText(/Cópia de segurança da última substituição/)).toBeInTheDocument();
  });

  it('cancelar a restauração não altera nada', async () => {
    const ctx = await openSettings();
    const before = stored(ctx);
    await chooseFile(ctx, fileOf(backupOf(smallWorkspace()).json));
    await screen.findByRole('region', { name: 'Prévia do backup' });
    await ctx.user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('region', { name: 'Prévia do backup' })).not.toBeInTheDocument();
    expect(stored(ctx)).toBe(before);
    expect(ctx.storage.map.has(SNAPSHOT_KEY)).toBe(false);
  });

  it('a prévia oferece exportar o backup do workspace atual antes de substituir', async () => {
    const ctx = await openSettings();
    await chooseFile(ctx, fileOf(backupOf(smallWorkspace()).json));
    await screen.findByRole('region', { name: 'Prévia do backup' });
    await ctx.user.click(screen.getByRole('button', { name: 'Exportar backup do workspace atual' }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    const exported = parseBackup(await downloads[0]!.text());
    expect(exported.ok && exported.workspace.players).toHaveLength(18); // é o atual, não o do arquivo
    expect(screen.getByRole('region', { name: 'Prévia do backup' })).toBeInTheDocument(); // continua na prévia
  });

  it('ida e volta completa pela interface: exporta de uma instalação e restaura em outra vazia', async () => {
    const original = demoWorkspace();
    const first = await openSettings({ workspace: original });
    await first.user.click(screen.getByRole('button', { name: 'Exportar backup' }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    const text = await downloads[0]!.text();
    first.unmount();

    const second = await openSettings({ workspace: createEmptyWorkspace() });
    await chooseFile(second, fileOf(text, downloads[0]!.filename));
    await second.user.click(await screen.findByRole('checkbox', { name: /Entendi/ }));
    await second.user.click(screen.getByRole('button', { name: 'Restaurar este backup' }));
    await screen.findByText('Restauração concluída');

    const restored = storedWorkspace(second);
    expect(restored.players).toEqual(original.players);
    expect(restored.evaluations).toEqual(original.evaluations); // avaliações e histórico
    expect(restored.trainings).toEqual(original.trainings);
    expect(restored.exercises).toEqual(original.exercises);
    expect(restored.trainingEvents).toEqual(original.trainingEvents); // vínculos treino-exercício-jogador-registro
    expect(restored.lineups).toEqual(original.lineups);
    expect(restored.settings).toEqual(original.settings);
  });

  it('depois de restaurar, o aplicativo mostra os dados restaurados (elenco, avaliações, treino)', async () => {
    const ctx = await openSettings();
    await chooseFile(ctx, fileOf(backupOf(smallWorkspace()).json));
    await ctx.user.click(await screen.findByRole('checkbox', { name: /Entendi/ }));
    await ctx.user.click(screen.getByRole('button', { name: 'Restaurar este backup' }));
    await screen.findByText('Restauração concluída');

    await ctx.user.click(within(screen.getByRole('navigation', { name: 'Principal' })).getByRole('link', { name: 'Elenco' }));
    expect(await screen.findByText('2 jogadores')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ana A., camisa 3, Levantador, Overall 70' })).toBeInTheDocument();
    await ctx.user.click(within(screen.getByRole('navigation', { name: 'Principal' })).getByRole('link', { name: 'Treinos' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Treino real' })).toBeInTheDocument();
  });
});

describe('Importar backup: arquivos inválidos', () => {
  async function rejectedCase(text: string, message: RegExp, name = 'ruim.json') {
    const ctx = await openSettings();
    const before = stored(ctx);
    await chooseFile(ctx, fileOf(text, name));
    expect(await screen.findByText('Arquivo recusado. Nada foi alterado.')).toBeInTheDocument();
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Prévia do backup' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restaurar este backup' })).not.toBeInTheDocument();
    expect(stored(ctx)).toBe(before); // nenhum byte mudou
    expect(ctx.storage.map.has(SNAPSHOT_KEY)).toBe(false);
    return ctx;
  }

  it('texto que não é JSON', async () => {
    await rejectedCase('isto não é um backup', /não é um JSON válido/);
  });

  it('JSON de outro formato', async () => {
    await rejectedCase(JSON.stringify({ players: [] }), /não é um backup do Alpha7/);
  });

  it('backup de versão mais nova do formato', async () => {
    const file = { ...clone(backupOf(smallWorkspace()).file), formatVersion: 7 };
    await rejectedCase(JSON.stringify(file), /formato v7, mais novo/);
  });

  it('arquivo truncado ou adulterado (hash não confere)', async () => {
    const file = clone(backupOf(smallWorkspace()).file) as any;
    file.workspace.players[0].name = 'Nome Trocado';
    await rejectedCase(JSON.stringify(file), /foi alterado ou está incompleto/);
  });

  it('vínculo quebrado, mesmo com hash correto: exercício de outro treino', async () => {
    const text = forged((b) => {
      b.trainings.push({ ...b.trainings[0], id: 't2', participantIds: ['a'] });
      b.exercises.push({ ...b.exercises[0], id: 'x2', trainingId: 't2' });
      b.trainingEvents[0].exerciseId = 'x2'; // evento do treino "t" apontando para exercício de "t2"
    });
    await rejectedCase(text, /pertence a outro treino/);
  });

  it('referência a atleta inexistente numa avaliação', async () => {
    await rejectedCase(forged((b) => { b.evaluations[0].playerId = 'ninguem'; }), /atleta "ninguem" não existe no backup/);
  });

  it('nota fora da escala e tentativa duplicada aparecem juntas na lista de problemas', async () => {
    const text = forged((b) => {
      b.evaluations[0].attributes.ATA = 150;
      b.trainingEvents[1].attemptKey = b.trainingEvents[0].attemptKey;
    });
    await rejectedCase(text, /Ataque: use um inteiro de 1 a 99/);
    expect(screen.getByText(/tentativa duplicada/)).toBeInTheDocument();
    expect(screen.getByText(/\(2 problemas\)/)).toBeInTheDocument();
  });

  it('depois da recusa é possível escolher outro arquivo, válido, e seguir normalmente', async () => {
    const ctx = await openSettings();
    await chooseFile(ctx, fileOf('lixo'));
    await screen.findByText('Arquivo recusado. Nada foi alterado.');
    await ctx.user.click(screen.getByRole('button', { name: 'Escolher outro arquivo' }));
    await chooseFile(ctx, fileOf(backupOf(smallWorkspace()).json));
    expect(await screen.findByRole('region', { name: 'Prévia do backup' })).toBeInTheDocument();
  });

  it('um arquivo recusado depois de uma restauração bem-sucedida não mexe nos dados restaurados', async () => {
    const ctx = await openSettings();
    await chooseFile(ctx, fileOf(backupOf(smallWorkspace()).json));
    await ctx.user.click(await screen.findByRole('checkbox', { name: /Entendi/ }));
    await ctx.user.click(screen.getByRole('button', { name: 'Restaurar este backup' }));
    await screen.findByText('Restauração concluída');
    const afterRestore = stored(ctx);
    await chooseFile(ctx, fileOf('lixo', 'lixo.json'));
    await screen.findByText('Arquivo recusado. Nada foi alterado.');
    expect(stored(ctx)).toBe(afterRestore);
  });
});

describe('Importar backup: falhas durante a restauração não perdem dados', () => {
  it('erro de gravação: avisa que nada foi alterado, mantém os dados e a prévia', async () => {
    const ctx = renderApp({
      path: '/configuracoes',
      wrapGateway: (gw) =>
        new Proxy(gw, {
          get(target, prop, receiver) {
            if (prop === 'replaceWorkspace') return () => Promise.reject(new Error('quota'));
            return Reflect.get(target, prop, receiver) as unknown;
          },
        }),
    });
    await screen.findByRole('heading', { level: 1, name: 'Configurações' });
    const before = stored(ctx);
    await chooseFile(ctx, fileOf(backupOf(smallWorkspace()).json));
    await ctx.user.click(await screen.findByRole('checkbox', { name: /Entendi/ }));
    await ctx.user.click(screen.getByRole('button', { name: 'Restaurar este backup' }));

    expect(await screen.findByText('Restauração não realizada')).toBeInTheDocument();
    expect(screen.getByText(/Não foi possível salvar.*Nada foi alterado/)).toBeInTheDocument();
    expect(stored(ctx)).toBe(before);
    expect(screen.getByRole('region', { name: 'Prévia do backup' })).toBeInTheDocument(); // dá para tentar de novo ou cancelar
  });

  it('sem espaço para a cópia de segurança: a restauração é abortada e tudo continua como estava', async () => {
    const ctx = await openSettings();
    const before = stored(ctx);
    const realSet = ctx.storage.setItem;
    ctx.storage.setItem = (key: string, value: string) => {
      if (key === SNAPSHOT_KEY) throw new Error('QuotaExceededError');
      realSet(key, value);
    };
    await chooseFile(ctx, fileOf(backupOf(smallWorkspace()).json));
    await ctx.user.click(await screen.findByRole('checkbox', { name: /Entendi/ }));
    await ctx.user.click(screen.getByRole('button', { name: 'Restaurar este backup' }));

    expect(await screen.findByText(/Não foi possível criar a cópia de segurança.*Nada foi alterado/)).toBeInTheDocument();
    expect(stored(ctx)).toBe(before);
  });
});

describe('Restaurar demonstração e apagar tudo: confirmação reforçada', () => {
  it('descreve o impacto, mostra o que existe hoje, recomenda backup e só age depois de confirmar', async () => {
    const ctx = await openSettings({ workspace: smallWorkspace() });
    const before = stored(ctx);
    await ctx.user.click(screen.getByRole('button', { name: 'Restaurar dados de demonstração' }));

    const panel = within(screen.getByRole('region', { name: 'Substituir tudo pela demonstração?' }));
    expect(panel.getByText(/serão substituídos pelos dados fictícios de exemplo, inclusive os que a equipe cadastrou/)).toBeInTheDocument();
    expect(panel.getByText(/Os pesos do Overall são mantidos/)).toBeInTheDocument();
    expect(panel.getByText(/Hoje o workspace tem 2 atletas, 3 avaliações, 0 escalações, 1 treino e 1 registro de treino \(8 registros criados pela equipe e 0 registros de demonstração\)/)).toBeInTheDocument();
    expect(panel.getByText(/Recomendado: exporte um backup antes/)).toBeInTheDocument();
    expect(panel.getByText('Nenhum backup foi exportado neste navegador ainda.')).toBeInTheDocument();
    expect(stored(ctx)).toBe(before); // abrir a confirmação não altera nada
  });

  it('com dados da equipe, exige marcar que entendeu; sem marcar o botão fica desativado', async () => {
    const ctx = await openSettings({ workspace: smallWorkspace() });
    await ctx.user.click(screen.getByRole('button', { name: 'Restaurar dados de demonstração' }));
    const confirm = screen.getByRole('button', { name: 'Confirmar: substituir tudo pela demonstração' });
    expect(confirm).toBeDisabled();
    await ctx.user.click(screen.getByRole('checkbox', { name: /Entendi que os dados atuais, inclusive os que a equipe cadastrou/ }));
    expect(confirm).toBeEnabled();
  });

  it('só com demonstração no workspace não pede a caixa de entendimento (nada da equipe a perder)', async () => {
    const ctx = await openSettings();
    await ctx.user.click(screen.getByRole('button', { name: 'Apagar todos os dados' }));
    expect(screen.queryByRole('checkbox', { name: /Entendi/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar: apagar todos os dados' })).toBeEnabled();
  });

  it('cancelar não altera nada', async () => {
    const ctx = await openSettings({ workspace: smallWorkspace() });
    const before = stored(ctx);
    await ctx.user.click(screen.getByRole('button', { name: 'Restaurar dados de demonstração' }));
    await ctx.user.click(within(screen.getByRole('region', { name: 'Substituir tudo pela demonstração?' })).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('region', { name: 'Substituir tudo pela demonstração?' })).not.toBeInTheDocument();
    expect(stored(ctx)).toBe(before);
    expect(ctx.storage.map.has(SNAPSHOT_KEY)).toBe(false);
  });

  it('o botão de exportar dentro da confirmação gera o backup sem fechar a confirmação', async () => {
    const ctx = await openSettings({ workspace: smallWorkspace() });
    await ctx.user.click(screen.getByRole('button', { name: 'Apagar todos os dados' }));
    await ctx.user.click(screen.getByRole('button', { name: 'Exportar backup agora' }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(await screen.findByText(/Backup exportado: alpha7-backup-/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Apagar todos os dados?' })).toBeInTheDocument();
    expect(await screen.findAllByText(/Nenhuma alteração desde então/)).not.toHaveLength(0);
  });

  it('restaurar a demonstração preserva os pesos do Overall configurados', async () => {
    const ctx = await openSettings({ workspace: smallWorkspace() });
    await ctx.user.click(screen.getByRole('button', { name: 'Restaurar dados de demonstração' }));
    await ctx.user.click(screen.getByRole('checkbox', { name: /Entendi/ }));
    await ctx.user.click(screen.getByRole('button', { name: 'Confirmar: substituir tudo pela demonstração' }));
    await screen.findByText('Dados de demonstração restaurados.');
    const now = storedWorkspace(ctx);
    expect(now.players).toHaveLength(18);
    expect(now.settings.weights.ponteiro.SAC).toBe(40);
  });

  it('a substituição guarda cópia de segurança e dá para desfazer, voltando byte a byte', async () => {
    const ctx = await openSettings({ workspace: smallWorkspace() });
    const original = stored(ctx);
    await ctx.user.click(screen.getByRole('button', { name: 'Apagar todos os dados' }));
    await ctx.user.click(screen.getByRole('checkbox', { name: /Entendi/ }));
    await ctx.user.click(screen.getByRole('button', { name: 'Confirmar: apagar todos os dados' }));
    await screen.findByText('Todos os dados foram apagados.');
    expect(storedWorkspace(ctx).players).toEqual([]);
    expect(await screen.findByText(/Continha 2 atletas, 3 avaliações, 0 escalações, 1 treino e 1 registro de treino/)).toBeInTheDocument();

    await ctx.user.click(screen.getByRole('button', { name: 'Desfazer última substituição' }));
    expect(screen.getByText('Voltar ao conteúdo anterior?')).toBeInTheDocument();
    await ctx.user.click(screen.getByRole('button', { name: 'Confirmar: voltar ao conteúdo anterior' }));
    expect(await screen.findByText(/Conteúdo anterior restaurado/)).toBeInTheDocument();
    expect(stored(ctx)).toBe(original);
  });

  it('sem espaço para a cópia de segurança, apagar tudo é abortado e os dados ficam intactos', async () => {
    const ctx = await openSettings({ workspace: smallWorkspace() });
    const before = stored(ctx);
    const realSet = ctx.storage.setItem;
    ctx.storage.setItem = (key: string, value: string) => {
      if (key === SNAPSHOT_KEY) throw new Error('QuotaExceededError');
      realSet(key, value);
    };
    await ctx.user.click(screen.getByRole('button', { name: 'Apagar todos os dados' }));
    await ctx.user.click(screen.getByRole('checkbox', { name: /Entendi/ }));
    await ctx.user.click(screen.getByRole('button', { name: 'Confirmar: apagar todos os dados' }));
    expect(await screen.findByText(/Não foi possível criar a cópia de segurança.*Nada foi alterado/)).toBeInTheDocument();
    expect(stored(ctx)).toBe(before);
  });
});

describe('Verificar integridade', () => {
  it('dados íntegros: informa que não há problemas', async () => {
    const ctx = await openSettings();
    await ctx.user.click(screen.getByRole('button', { name: 'Verificar integridade dos dados' }));
    expect(await screen.findByText(/Nenhum problema encontrado em \d+ registros/)).toBeInTheDocument();
  });

  it('dados com vínculo quebrado: lista os problemas e recomenda a cópia bruta', async () => {
    const broken = smallWorkspace();
    broken.evaluations.push(makeEvaluation('ninguem', '2026-10-01', createUniformAttributes(60)));
    const ctx = await openSettings({ workspace: broken });
    await ctx.user.click(screen.getByRole('button', { name: 'Verificar integridade dos dados' }));
    expect(await screen.findByText(/Foram encontrados 1 problema nos dados salvos/)).toBeInTheDocument();
    expect(screen.getByText(/atleta "ninguem" não existe/)).toBeInTheDocument();
  });
});

describe('Uso do armazenamento', () => {
  it('mostra quanto espaço os dados ocupam, sem alarme quando há folga', async () => {
    await openSettings();
    expect(await screen.findByText(/Espaço usado no navegador:/)).toBeInTheDocument();
    expect(screen.queryByText('O armazenamento está ficando cheio')).not.toBeInTheDocument();
  });

  it('avisa e recomenda backup quando passa de 70% do espaço', async () => {
    const storage = createMemoryStorage();
    // a cópia de segurança também ocupa espaço e entra na conta
    storage.setItem(SNAPSHOT_KEY, JSON.stringify({ savedAt: '2026-10-01T00:00:00.000Z', reason: 'teste', previousRaw: 'x'.repeat(3_700_000) }));
    await openSettings({ storage });
    expect(await screen.findByText('O armazenamento está ficando cheio')).toBeInTheDocument();
    expect(screen.getByText(/Exporte um backup agora/)).toBeInTheDocument();
  });
});

describe('Lembrete de backup', () => {
  it('só com demonstração, não incomoda', async () => {
    renderApp({ path: '/' });
    await screen.findByRole('heading', { level: 1, name: 'Alpha7 Performance' });
    expect(screen.queryByText('Faça um backup dos dados da equipe')).not.toBeInTheDocument();
  });

  it('com dados da equipe e nenhum backup, avisa e leva ao backup', async () => {
    renderApp({ path: '/', workspace: smallWorkspace() });
    expect(await screen.findByText('Faça um backup dos dados da equipe')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Exportar backup' })).toHaveAttribute('href', '/configuracoes#backup');
  });

  it('depois de exportar, o lembrete some', async () => {
    const ctx = await openSettings({ workspace: smallWorkspace() });
    expect(await screen.findByText('Faça um backup dos dados da equipe')).toBeInTheDocument();
    await ctx.user.click(screen.getByRole('button', { name: 'Exportar backup' }));
    await waitFor(() => expect(screen.queryByText('Faça um backup dos dados da equipe')).not.toBeInTheDocument());
  });

  it('backup antigo (7+ dias) com alterações desde então volta a avisar, dizendo há quantos dias', async () => {
    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    window.localStorage.setItem('alpha7.lastBackup.v1', JSON.stringify({ at: old, fingerprint: 'outra-coisa', filename: 'antigo.json' }));
    renderApp({ path: '/', workspace: smallWorkspace() });
    expect(await screen.findByText(/O último backup foi há 10 dias e houve alterações desde então/)).toBeInTheDocument();
  });

  it('backup recente sem alterações: nenhum aviso', async () => {
    const ws = smallWorkspace();
    const fingerprint = backupOf(ws).file.checksum.value;
    window.localStorage.setItem('alpha7.lastBackup.v1', JSON.stringify({ at: new Date().toISOString(), fingerprint, filename: 'novo.json' }));
    renderApp({ path: '/', workspace: ws });
    await screen.findByRole('heading', { level: 1, name: 'Alpha7 Performance' });
    expect(screen.queryByText('Faça um backup dos dados da equipe')).not.toBeInTheDocument();
  });
});

describe('Mudanças feitas em outra aba', () => {
  it('a aba atualiza sozinha quando outra aba salva (evita trabalhar numa cópia velha)', async () => {
    const ctx = renderApp({ path: '/elenco' });
    expect(await screen.findByText('18 jogadores')).toBeInTheDocument();
    const raw = storedWorkspace(ctx);
    raw.players.push(makePlayer({ id: 'outra-aba', name: 'Dani Dias', jerseyNumber: 77 }));
    ctx.storage.setItem(STORAGE_KEY, JSON.stringify(raw));
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    expect(await screen.findByText('19 jogadores')).toBeInTheDocument();
  });
});

describe('Dados ilegíveis: recuperação sem perder o conteúdo', () => {
  async function openCorrupted() {
    const storage = (await import('@/test/renderApp')).createMemoryStorage();
    storage.setItem(STORAGE_KEY, '{conteudo quebrado');
    const ctx = renderApp({ path: '/', storage });
    await screen.findByText('Não foi possível abrir os dados');
    return ctx;
  }

  it('explica que os dados não foram apagados e oferece baixar a cópia', async () => {
    const ctx = await openCorrupted();
    expect(screen.getByText(/Os dados não foram apagados/)).toBeInTheDocument();
    await ctx.user.click(screen.getByRole('button', { name: 'Baixar cópia dos dados ilegíveis' }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(await downloads[0]!.text()).toBe('{conteudo quebrado');
  });

  it('recomeçar exige confirmação e guarda o conteúdo antigo como cópia de segurança', async () => {
    const ctx = await openCorrupted();
    await ctx.user.click(screen.getByRole('button', { name: 'Recomeçar com dados de demonstração' }));
    expect(stored(ctx)).toBe('{conteudo quebrado'); // ainda nada mudou
    expect(screen.getByText('Recomeçar com a demonstração?')).toBeInTheDocument();
    await ctx.user.click(screen.getByRole('button', { name: 'Confirmar: recomeçar com demonstração' }));
    await screen.findByRole('heading', { level: 1, name: 'Alpha7 Performance' });
    expect(storedWorkspace(ctx).players).toHaveLength(18);
    const snapshot = JSON.parse(ctx.storage.map.get(SNAPSHOT_KEY) ?? '{}') as { previousRaw: string };
    expect(snapshot.previousRaw).toBe('{conteudo quebrado');
  });
});
