import { PHOTO_MAX_INPUT_BYTES, PHOTO_RATIO, cropRect, isDataUrl, photoPath, validatePhotoFile } from './photo';

describe('validação do arquivo da foto', () => {
  it('aceita JPEG, PNG e WebP dentro do limite', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) expect(validatePhotoFile({ type, size: 200_000 })).toBeNull();
  });

  it('recusa formato desconhecido, arquivo vazio e arquivo grande demais, com mensagem', () => {
    expect(validatePhotoFile({ type: 'image/gif', size: 100 })).toMatch(/Formato não aceito/);
    expect(validatePhotoFile({ type: 'application/pdf', size: 100 })).toMatch(/Formato não aceito/);
    expect(validatePhotoFile({ type: 'image/jpeg', size: 0 })).toMatch(/vazio/);
    expect(validatePhotoFile({ type: 'image/jpeg', size: PHOTO_MAX_INPUT_BYTES + 1 })).toMatch(/grande demais/);
    expect(validatePhotoFile({ type: 'image/jpeg', size: PHOTO_MAX_INPUT_BYTES })).toBeNull();
  });
});

describe('recorte 4:5', () => {
  it('imagem larga: usa a altura toda e fica centralizada com foco 0,5', () => {
    const r = cropRect(2000, 1000, 1, 0.5, 0.5);
    expect(r.sh).toBe(1000);
    expect(r.sw).toBeCloseTo(800, 6);
    expect(r.sx).toBeCloseTo(600, 6);
    expect(r.sy).toBe(0);
    expect(r.sw / r.sh).toBeCloseTo(PHOTO_RATIO, 10);
  });

  it('imagem alta: usa a largura toda; o foco desloca a moldura para cima ou para baixo', () => {
    const top = cropRect(800, 2000, 1, 0.5, 0);
    const bottom = cropRect(800, 2000, 1, 0.5, 1);
    expect(top.sw).toBe(800);
    expect(top.sh).toBeCloseTo(1000, 6);
    expect(top.sy).toBe(0);
    expect(bottom.sy).toBeCloseTo(1000, 6);
  });

  it('o zoom aproxima mantendo a proporção, e a moldura nunca sai da imagem', () => {
    const r = cropRect(1000, 1000, 2, 1, 1);
    expect(r.sw).toBeCloseTo(400, 6);
    expect(r.sh).toBeCloseTo(500, 6);
    expect(r.sx + r.sw).toBeLessThanOrEqual(1000 + 1e-9);
    expect(r.sy + r.sh).toBeLessThanOrEqual(1000 + 1e-9);
    const far = cropRect(1000, 1000, 99, -5, 7); // valores absurdos são limitados
    expect(far.sx).toBeGreaterThanOrEqual(0);
    expect(far.sy + far.sh).toBeLessThanOrEqual(1000 + 1e-9);
    expect(far.sw).toBeCloseTo(cropRect(1000, 1000, 3, 0, 1).sw, 6); // zoom limitado a 3
  });

  it('imagem quadrada com zoom 1 corta as laterais', () => {
    const r = cropRect(1000, 1000, 1, 0.5, 0.5);
    expect(r.sw).toBeCloseTo(800, 6);
    expect(r.sh).toBe(1000);
  });
});

describe('caminho e referência', () => {
  it('o caminho começa pela equipe, troca caracteres perigosos e muda a cada versão', () => {
    expect(photoPath('t-1', 'player_abc', 3)).toBe('t-1/player_abc-3.jpg');
    expect(photoPath('t-1', '../x/y z', 1)).toBe('t-1/___x_y_z-1.jpg');
    expect(photoPath('t-1', 'p', 1)).not.toBe(photoPath('t-1', 'p', 2));
  });

  it('reconhece data URL de imagem', () => {
    expect(isDataUrl('data:image/jpeg;base64,AAAA')).toBe(true);
    expect(isDataUrl('team/p1-1.jpg')).toBe(false);
    expect(isDataUrl('data:text/html;base64,AAAA')).toBe(false);
  });
});
