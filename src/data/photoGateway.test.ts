import { createBackup, parseBackup, validateWorkspace } from './backup';
import { createEmptyWorkspace } from './demo';
import { IntegrityError, PermissionDeniedError, RemoteUnavailableError, SessionExpiredError, StorageCorruptedError } from './gateway';
import { LocalStorageGateway, MAX_PHOTO_CHARS, STORAGE_KEY } from './localStorageGateway';
import { mapStorageError } from './supabase/SupabaseGateway';
import { playerFromRow, playerToRow } from './supabase/mappers';
import { makePlayer } from '@/test/factories';
import { createMemoryStorage } from '@/test/renderApp';
import { TEAM_A, gatewayFor, newFake, seedTeam, seedWorkspace } from '@/test/remoteFixtures';

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const blob = (size = 2000, type = 'image/jpeg') => new Blob([new Uint8Array(size)], { type });
const ana = makePlayer({ id: 'p1', name: 'Ana Alves', jerseyNumber: 1 });

describe('fotos na nuvem (Storage simulado: não prova a política real do bucket)', () => {
  function world() {
    const fake = newFake();
    seedTeam(fake, TEAM_A, 'Equipe A', { coach: 'coach', analyst: 'analyst', viewer: 'viewer' });
    seedWorkspace(fake, TEAM_A, { players: [ana] });
    return fake;
  }

  it('o coach envia para a pasta da equipe e cada envio tem um caminho novo (a URL nunca fica velha)', async () => {
    const fake = world();
    const gateway = gatewayFor(fake, 'coach');
    const first = await gateway.uploadPlayerPhoto('p1', blob());
    await new Promise((resolve) => setTimeout(resolve, 3));
    const second = await gateway.uploadPlayerPhoto('p1', blob());
    expect(first).toMatch(new RegExp(`^${TEAM_A}/p1-\\d+\\.jpg$`));
    expect(second).not.toBe(first);
    expect([...fake.files.keys()].sort()).toEqual([first, second].sort());
  });

  it('analyst e viewer não enviam (PermissionDeniedError) e não removem; os dois leem pela URL assinada', async () => {
    const fake = world();
    const coach = gatewayFor(fake, 'coach');
    const path = await coach.uploadPlayerPhoto('p1', blob());
    for (const who of ['analyst', 'viewer'] as const) {
      const gateway = gatewayFor(fake, who);
      await expect(gateway.uploadPlayerPhoto('p1', blob())).rejects.toBeInstanceOf(PermissionDeniedError);
      await gateway.removePlayerPhoto(path);
      expect(fake.files.has(path)).toBe(true); // a exclusão foi escondida pela política: nada some
      await expect(gateway.photoUrl(path)).resolves.toContain(path);
    }
    await gatewayFor(fake, 'coach').removePlayerPhoto(path);
    expect(fake.files.has(path)).toBe(false);
  });

  it('quem não é da equipe não lê a foto de outra equipe', async () => {
    const fake = world();
    const path = await gatewayFor(fake, 'coach').uploadPlayerPhoto('p1', blob());
    const stranger = gatewayFor(fake, 'outsider');
    await expect(stranger.photoUrl(path)).rejects.toBeDefined();
  });

  it('formato e tamanho fora do aceito são recusados com mensagem', async () => {
    const gateway = gatewayFor(world(), 'coach');
    await expect(gateway.uploadPlayerPhoto('p1', blob(100, 'image/gif'))).rejects.toBeInstanceOf(IntegrityError);
    await expect(gateway.uploadPlayerPhoto('p1', blob(1_100_000))).rejects.toBeInstanceOf(IntegrityError);
  });

  it('traduz os erros do Storage: permissão, sessão, tamanho, formato e rede', () => {
    expect(mapStorageError({ message: 'new row violates row-level security policy', statusCode: '403' })).toBeInstanceOf(PermissionDeniedError);
    expect(mapStorageError({ message: 'jwt expired', statusCode: '401' })).toBeInstanceOf(SessionExpiredError);
    expect(mapStorageError({ message: 'The object exceeded the maximum allowed size', statusCode: '413' })).toBeInstanceOf(IntegrityError);
    expect(mapStorageError({ message: 'mime type image/gif is not supported' })).toBeInstanceOf(IntegrityError);
    expect(mapStorageError({ message: 'Failed to fetch' })).toBeInstanceOf(RemoteUnavailableError);
  });

  it('o atleta guarda só o caminho (photo_path) e a leitura devolve a mesma referência', () => {
    const row = playerToRow(TEAM_A, { ...ana, photo: `${TEAM_A}/p1-5.jpg` });
    expect(row.photo_path).toBe(`${TEAM_A}/p1-5.jpg`);
    expect(playerFromRow(row).photo).toBe(`${TEAM_A}/p1-5.jpg`);
    expect(playerFromRow(playerToRow(TEAM_A, ana)).photo).toBeUndefined(); // sem foto: sem o campo
    expect(playerToRow(TEAM_A, ana).photo_path).toBeNull();
  });
});

describe('fotos no modo local e no backup', () => {
  it('guarda a imagem como data URL no atleta, recusa imagem enorme e dado que não é imagem', async () => {
    const gateway = new LocalStorageGateway(createMemoryStorage());
    await expect(gateway.uploadPlayerPhoto('p1', blob(2000))).resolves.toMatch(/^data:image\/jpeg;base64,/);
    await expect(gateway.uploadPlayerPhoto('p1', new Blob([new Uint8Array(Math.ceil(MAX_PHOTO_CHARS)).fill(1)], { type: 'image/jpeg' }))).rejects.toBeInstanceOf(IntegrityError);
    await expect(gateway.uploadPlayerPhoto('p1', blob(100, 'text/html'))).rejects.toBeInstanceOf(IntegrityError);
    await expect(gateway.photoUrl('http://evil.test/x.png')).rejects.toBeInstanceOf(IntegrityError);
  });

  it('dado salvo com foto que não é imagem é tratado como ilegível', async () => {
    const storage = createMemoryStorage();
    const gateway = new LocalStorageGateway(storage);
    await gateway.replaceWorkspace({ ...createEmptyWorkspace(), players: [{ ...ana, photo: PHOTO }] }, 'teste');
    expect((await gateway.load()).players[0]?.photo).toBe(PHOTO);
    const saved = JSON.parse(storage.map.get(STORAGE_KEY) ?? '{}') as { players: { photo?: string }[] };
    saved.players[0]!.photo = 'javascript:alert(1)';
    storage.map.set(STORAGE_KEY, JSON.stringify(saved));
    await expect(gateway.load()).rejects.toBeInstanceOf(StorageCorruptedError);
  });

  it('backup: a foto vai e volta; sem foto o corpo não ganha a chave (checksums anteriores seguem iguais)', () => {
    const withPhoto = { ...createEmptyWorkspace(), players: [{ ...ana, photo: PHOTO }] };
    const made = createBackup(withPhoto, { appVersion: '0.6.0' });
    if (!made.ok) throw new Error(made.errors.join('; '));
    const parsed = parseBackup(made.json);
    expect(parsed.ok && parsed.workspace.players[0]?.photo).toBe(PHOTO);
    const without = createBackup({ ...createEmptyWorkspace(), players: [ana] }, { appVersion: '0.6.0' });
    if (!without.ok) throw new Error('backup recusado');
    expect(without.json).not.toContain('"photo"');
  });

  it('backup recusa foto que não é imagem nem caminho da equipe', () => {
    for (const bad of ['javascript:alert(1)', 'http://x.test/a.jpg', 'data:text/html;base64,AAAA', 42, '../outra/foto.jpg']) {
      const checked = validateWorkspace(JSON.parse(JSON.stringify({ ...createEmptyWorkspace(), players: [{ ...ana, photo: bad }] })));
      expect(checked.ok, String(bad)).toBe(false);
    }
    const remotePath = validateWorkspace(JSON.parse(JSON.stringify({ ...createEmptyWorkspace(), players: [{ ...ana, photo: '123e4567-e89b-12d3-a456-426614174000/p1-1.jpg' }] })));
    expect(remotePath.ok).toBe(true);
  });
});
