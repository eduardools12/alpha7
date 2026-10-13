/**
 * Fotos dos atletas: edição (local e nuvem simulada), permissões e exibição da MESMA foto em carta e perfil.
 * O recorte em canvas é simulado (o jsdom não desenha imagens): o desenho real é conferido no navegador (e2e/photos.spec.ts).
 * O Storage da nuvem é simulado (fakeSupabase); a política real do bucket é provada em supabase/tests/photos.test.sql.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { STORAGE_KEY } from '@/data/localStorageGateway';
import { createEmptyWorkspace } from '@/data/demo';
import type { Workspace } from '@/data/types';
import { makePlayer } from '@/test/factories';
import { renderApp } from '@/test/renderApp';
import { renderRemote } from '@/test/renderRemote';
import { TEAM_A, USERS, newFake, seedTeam, seedWorkspace } from '@/test/remoteFixtures';

vi.mock('./photoCanvas', () => ({
  canvasProcessor: {
    load: async () => ({ width: 1000, height: 1250, draw: () => undefined, release: () => undefined }),
    preview: () => undefined,
    render: async () => new Blob([new Uint8Array(4000).fill(7)], { type: 'image/jpeg' }),
  },
}));

const ana = makePlayer({ id: 'p1', name: 'Ana Alves', jerseyNumber: 7 });
const world = (): Workspace => ({ ...createEmptyWorkspace(), players: [ana] });
const stored = (storage: { map: Map<string, string> }) => JSON.parse(storage.map.get(STORAGE_KEY) ?? '{}') as Workspace;
const jpeg = () => new File([new Uint8Array(3000)], 'foto.jpg', { type: 'image/jpeg' });
const input = () => screen.getByLabelText('Escolher arquivo da foto');

describe('foto do atleta (modo local)', () => {
  it('sem foto: o perfil mostra a camisa e oferece escolher; a carta usa o avatar padrão', async () => {
    renderApp({ path: '/elenco/p1', workspace: world() });
    expect(await screen.findByText('Sem foto')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Escolher foto' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Foto de Ana A\./ })).not.toBeInTheDocument();
  });

  it('escolher, ver o recorte, salvar: a foto aparece no perfil e na carta do elenco, a mesma gravada', async () => {
    const { user, storage } = renderApp({ path: '/elenco/p1', workspace: world() });
    await screen.findByText('Sem foto');
    await user.upload(input(), jpeg());
    expect(await screen.findByRole('img', { name: /Prévia do recorte da foto/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Zoom')).toBeInTheDocument();
    expect(stored(storage).players[0]?.photo).toBeUndefined(); // nada é gravado antes de confirmar
    await user.click(screen.getByRole('button', { name: 'Salvar foto' }));
    expect(await screen.findByText('Foto salva.')).toBeInTheDocument();
    const photo = stored(storage).players[0]?.photo ?? '';
    expect(photo).toMatch(/^data:image\/jpeg;base64,/);
    // perfil: a foto no cabeçalho
    const heroImages = screen.getAllByRole('img', { name: 'Foto de Ana A.' });
    expect(heroImages.length).toBeGreaterThan(0);
    expect(heroImages[0]).toHaveAttribute('src', photo);
    // carta do elenco: o MESMO src
    await user.click(within(screen.getByRole('navigation', { name: 'Principal' })).getByRole('link', { name: 'Elenco' }));
    const card = await screen.findByRole('link', { name: /Ana A\., camisa 7/ });
    expect(within(card).getByRole('img', { name: 'Foto de Ana A.' })).toHaveAttribute('src', photo);
  });

  it('cancelar o recorte não grava nada; arquivo de formato errado e arquivo grande são recusados com mensagem', async () => {
    const { storage } = renderApp({ path: '/elenco/p1', workspace: world() });
    const user = userEvent.setup({ applyAccept: false });
    await screen.findByText('Sem foto');
    await user.upload(input(), new File(['x'], 'doc.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText(/Formato não aceito/)).toBeInTheDocument();
    const big = new File([new Uint8Array(10)], 'enorme.jpg', { type: 'image/jpeg' });
    Object.defineProperty(big, 'size', { value: 13 * 1024 * 1024 });
    await user.upload(input(), big);
    expect(await screen.findByText(/grande demais/)).toBeInTheDocument();
    await user.upload(input(), jpeg());
    await screen.findByRole('img', { name: /Prévia do recorte/ });
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('img', { name: /Prévia do recorte/ })).not.toBeInTheDocument();
    expect(stored(storage).players[0]?.photo).toBeUndefined();
  });

  it('substituir troca a foto; remover pede confirmação e volta ao avatar padrão sem tocar nas notas', async () => {
    const withPhoto = { ...ana, photo: 'data:image/jpeg;base64,AAAA' };
    const { user, storage } = renderApp({ path: '/elenco/p1', workspace: { ...world(), players: [withPhoto] } });
    expect((await screen.findAllByRole('img', { name: 'Foto de Ana A.' }))[0]).toHaveAttribute('src', 'data:image/jpeg;base64,AAAA');
    await user.upload(input(), jpeg());
    await user.click(await screen.findByRole('button', { name: 'Salvar foto' }));
    expect(await screen.findByText('Foto substituída.')).toBeInTheDocument();
    expect(stored(storage).players[0]?.photo).not.toBe('data:image/jpeg;base64,AAAA');

    await user.click(screen.getByRole('button', { name: 'Remover foto' }));
    expect(screen.getByText(/A foto sai da carta, do perfil, da escalação e das artes/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(stored(storage).players[0]?.photo).toBeDefined(); // cancelar não remove
    await user.click(screen.getByRole('button', { name: 'Remover foto' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar remoção' }));
    expect(await screen.findByText(/Foto removida/)).toBeInTheDocument();
    expect(stored(storage).players[0]?.photo).toBeUndefined();
    expect(stored(storage).players[0]).toMatchObject({ name: 'Ana Alves', jerseyNumber: 7 }); // cadastro intacto
  });

  it('o formulário de edição também oferece a foto', async () => {
    renderApp({ path: '/elenco/p1/editar', workspace: world() });
    expect(await screen.findByRole('button', { name: 'Escolher foto' })).toBeInTheDocument();
  });
});

describe('foto do atleta (nuvem simulada: Storage e papéis)', () => {
  function seeded() {
    const fake = newFake();
    seedTeam(fake, TEAM_A, 'Equipe A', { coach: 'coach', analyst: 'analyst', viewer: 'viewer' });
    seedWorkspace(fake, TEAM_A, world());
    return fake;
  }

  it('o coach envia: arquivo na pasta da equipe, referência no atleta, e a foto exibida vem de URL assinada', async () => {
    const fake = seeded();
    fake.signInAs(USERS.coach.id);
    const { user } = renderRemote(fake, { path: '/elenco/p1' });
    await screen.findByText('Sem foto');
    await user.upload(input(), jpeg());
    await user.click(await screen.findByRole('button', { name: 'Salvar foto' }));
    expect(await screen.findByText('Foto salva.')).toBeInTheDocument();
    const path = String(fake.rows('players', TEAM_A)[0]?.photo_path);
    expect(path).toMatch(new RegExp(`^${TEAM_A}/p1-\\d+\\.jpg$`));
    expect(fake.files.has(path)).toBe(true);
    const img = (await screen.findAllByRole('img', { name: 'Foto de Ana A.' }))[0];
    await waitFor(() => expect(img).toHaveAttribute('src', expect.stringContaining(`https://fake.storage.test/${path}`)));
  });

  it('substituir apaga o arquivo antigo só depois de salvar; remover apaga o arquivo e a referência', async () => {
    const fake = seeded();
    fake.signInAs(USERS.coach.id);
    const { user } = renderRemote(fake, { path: '/elenco/p1' });
    await screen.findByText('Sem foto');
    await user.upload(input(), jpeg());
    await user.click(await screen.findByRole('button', { name: 'Salvar foto' }));
    await screen.findByText('Foto salva.');
    const first = String(fake.rows('players', TEAM_A)[0]?.photo_path);
    await user.upload(input(), jpeg());
    await user.click(await screen.findByRole('button', { name: 'Salvar foto' }));
    await screen.findByText('Foto substituída.');
    const second = String(fake.rows('players', TEAM_A)[0]?.photo_path);
    expect(second).not.toBe(first);
    expect(fake.files.has(first)).toBe(false);
    expect(fake.files.has(second)).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Remover foto' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar remoção' }));
    await screen.findByText(/Foto removida/);
    expect(fake.rows('players', TEAM_A)[0]?.photo_path).toBeNull();
    expect(fake.files.size).toBe(0);
  });

  it('falha no envio: nada muda no atleta e a mensagem explica', async () => {
    const fake = seeded();
    fake.signInAs(USERS.coach.id);
    const { user } = renderRemote(fake, { path: '/elenco/p1' });
    await screen.findByText('Sem foto');
    await user.upload(input(), jpeg());
    fake.storageFailure = { message: 'The object exceeded the maximum allowed size', statusCode: '413' };
    await user.click(await screen.findByRole('button', { name: 'Salvar foto' }));
    expect(await screen.findByText(/grande demais/)).toBeInTheDocument();
    expect(fake.rows('players', TEAM_A)[0]?.photo_path ?? null).toBeNull();
    expect(fake.files.size).toBe(0);
  });

  it('sem conexão: a foto não é enviada e a mensagem diz isso', async () => {
    const fake = seeded();
    fake.signInAs(USERS.coach.id);
    const { user } = renderRemote(fake, { path: '/elenco/p1' });
    await screen.findByText('Sem foto');
    await user.upload(input(), jpeg());
    fake.offline = true;
    await user.click(await screen.findByRole('button', { name: 'Salvar foto' }));
    expect(await screen.findByText(/Sem conexão com o servidor/)).toBeInTheDocument();
    expect(fake.files.size).toBe(0);
  });

  it.each(['analyst', 'viewer'] as const)('%s não vê o editor de foto, mas vê a foto cadastrada', async (who) => {
    const fake = seeded();
    // O coach já cadastrou a foto.
    const path = `${TEAM_A}/p1-1.jpg`;
    fake.files.set(path, { type: 'image/jpeg', size: 4000 });
    const row = fake.rows('players', TEAM_A)[0];
    if (row) row.photo_path = path;
    fake.signInAs(USERS[who].id);
    renderRemote(fake, { path: '/elenco/p1' });
    const img = (await screen.findAllByRole('img', { name: 'Foto de Ana A.' }))[0];
    await waitFor(() => expect(img).toHaveAttribute('src', expect.stringContaining('fake.storage.test')));
    expect(screen.queryByRole('button', { name: 'Substituir foto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remover foto' })).not.toBeInTheDocument();
    expect(screen.queryByText('Foto do atleta')).not.toBeInTheDocument();
  });
});
