import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BRAND_VARIANTS,
  COVER_VARIANTS,
  buildAthleteArt,
  buildBrandArt,
  buildCardArt,
  buildCoverArt,
  buildHighlightsArt,
  buildLineupArt,
  buildMatchdayArt,
  buildResultArt,
  buildSpotlightArt,
  type ArtModel,
  type ArtResult,
} from '@/domain/arts';
import { createUniformAttributes } from '@/domain/attributes';
import type { Lineup } from '@/domain/lineup';
import { matchState } from '@/domain/match';
import { makeMatch, makeMatchSet, makePlayer, makeRally } from '@/test/factories';
import { ArtCanvas, LOGO_RATIO, type ArtAssets } from './canvas';
import { FONT_DEFS } from './fonts';
import { ANGLE_DEGREES, SLANT, insetParaPoints, paraPoints } from './geometry';
import { coverPlacement, fitText } from './kit';
import { approximateMeasure } from './measure';
import { COLOR, TONES } from './palette';
import { renderArt } from './render';

const assets: ArtAssets = { logoWhite: 'data:image/png;base64,BBBB', logoPurple: 'data:image/png;base64,CCCC' };
const context = { assets, measure: approximateMeasure };
const NOW = '2026-10-01T10:00:00.000Z';

const names = ['Ana Alves', 'Bia Borges', 'Cris Costa', 'Dani Dias', 'Eva Esteves', 'Fabi Faria', 'Gabi Gomes', 'Hele Hugo', 'Iara Ito'];
const players = names.map((name, i) => makePlayer({ id: `p${i + 1}`, name, jerseyNumber: i + 1, primaryPosition: i === 6 ? 'libero' : 'ponteiro' }));
const roles = ['levantador', 'oposto', 'ponteiro', 'central', 'ponteiro', 'central'] as const;
const lineup: Lineup = {
  id: 'l1',
  title: 'Titular',
  opponent: '',
  competition: '',
  scheduledAt: '',
  venue: '',
  formation: '5-1',
  starters: roles.map((role, i) => ({ playerId: `p${i + 1}`, role })),
  liberoId: 'p7',
  benchIds: ['p8', 'p9'],
  createdAt: NOW,
  updatedAt: NOW,
  demo: false,
};
const match = makeMatch({ id: 'm1', opponent: 'Time <Vizinho> & Cia', competition: 'Copa', scheduledAt: '2026-11-14T19:30', venue: 'Ginásio Municipal', lineupId: 'l1' });
const player = players[1]!;
const photo = { href: 'data:image/jpeg;base64,PHOTO', width: 640, height: 800 };

const ok = <T extends ArtModel>(result: ArtResult<T>): T => {
  if (!result.ok) throw new Error(result.reason);
  return result.model;
};

function allModels(): ArtModel[] {
  const finished = makeMatch({ id: 'mf', opponent: 'Sociedade Esportiva São João', competition: 'Copa', status: 'concluida', finalSetsUs: 3, finalSetsThem: 2 });
  const ids = players.slice(0, 6).map((p) => p.id);
  const scores: [number, number][] = [[25, 20], [20, 25], [25, 22], [22, 25], [15, 12]];
  const sets = scores.map((_, i) => makeMatchSet('mf', i + 1, ids));
  const rallies = scores.flatMap(([us, them], i) =>
    [...Array<'us'>(us).fill('us'), ...Array<'them'>(them).fill('them')].map((winnerSide, seq) => makeRally('mf', i + 1, seq + 1, { winnerSide })),
  );
  const models: ArtModel[] = [];
  for (const format of ['feed', 'story'] as const) {
    for (const tone of ['dark', 'light'] as const) {
      const base = { format, tone };
      models.push(
        ok(buildLineupArt({ match, lineup, players, photos: { p1: photo, p2: photo }, ...base })),
        ok(buildMatchdayArt({ match, phase: 'Quartas de final', ...base })),
        ok(buildResultArt({ match: finished, state: matchState(finished, sets, rallies), ...base })),
        ok(buildAthleteArt({ player, photo: { ...photo }, ...base })),
        ok(buildAthleteArt({ player, ...base })),
        ok(buildSpotlightArt({ player, photo, headline: 'Ataque de meio', stats: [{ label: 'Pontos', value: '18' }, { label: 'Aces', value: '3' }, { label: 'Bloqueios', value: '5' }], ...base })),
        ok(buildCardArt({ player, photo, overall: 81, attributes: createUniformAttributes(70), ...base })),
        ok(buildCardArt({ player, overall: null, attributes: null, ...base })),
        ok(buildHighlightsArt({ player, photo, caption: 'COMPILADO DE', title: 'LANCES', detail: 'Temporada 2026', ...base })),
        ...BRAND_VARIANTS.map((variant) => buildBrandArt(variant, format, tone)),
      );
    }
  }
  models.push(...COVER_VARIANTS.map((variant) => buildCoverArt(variant)));
  return models;
}

describe('cores e geometria', () => {
  it('paleta do time e tons de apoio derivados do roxo', () => {
    expect([COLOR.purple, COLOR.white, COLOR.mist, COLOR.deep]).toEqual(['#270949', '#FFFFFF', '#F0EDF4', '#160623']);
    expect([COLOR.purple2, COLOR.purple3, COLOR.lilac, COLOR.lilac2, COLOR.purple40]).toEqual(['#3D225B', '#573F71', '#A99DB6', '#D4CEDB', '#7D6B92']);
    expect(TONES.dark.bg).toBe('#270949');
    expect(TONES.light.bg).toBe('#FFFFFF');
    expect(TONES.dark.logo).toBe('white');
    expect(TONES.light.logo).toBe('purple');
  });

  const point = (points: readonly (readonly [number, number])[], index: number): readonly [number, number] => {
    const found = points[index];
    if (!found) throw new Error(`ponto ${index} não existe`);
    return found;
  };

  it('o ângulo é o do monograma (26°) e o paralelogramo se inclina para a direita', () => {
    expect(ANGLE_DEGREES).toBe(26);
    expect(SLANT).toBeCloseTo(0.4877, 3);
    const points = paraPoints(100, 500, 200, 300);
    const [topLeft, topRight, bottomRight, bottomLeft] = [0, 1, 2, 3].map((i) => point(points, i));
    expect(bottomLeft).toEqual([100, 500]);
    expect(bottomRight).toEqual([300, 500]);
    expect(topLeft?.[0]).toBeCloseTo(100 + 300 * SLANT, 6);
    expect(topLeft?.[1]).toBe(200);
    expect((topRight?.[0] ?? 0) - (topLeft?.[0] ?? 0)).toBeCloseTo(200, 6);
  });

  it('a linha interna fica dentro do paralelogramo', () => {
    const outer = paraPoints(100, 500, 400, 200);
    const inner = insetParaPoints(100, 500, 400, 200, 12);
    const ys = inner.map(([, y]) => y);
    expect(Math.min(...ys)).toBeGreaterThan(point(outer, 0)[1]);
    expect(Math.max(...ys)).toBeLessThan(500);
    expect(point(inner, 3)[0]).toBeGreaterThan(100);
  });

  it('a proporção da logo é a do arquivo usado (sem distorcer)', () => {
    for (const tone of ['purple', 'white'] as const) {
      const header = readFileSync(resolve(process.cwd(), `public/brand/a7-mark-art-${tone}.png`));
      const width = header.readUInt32BE(16);
      const height = header.readUInt32BE(20);
      expect(height / width).toBeCloseTo(LOGO_RATIO, 4);
    }
  });
});

describe('construtor de SVG', () => {
  const canvas = () => new ArtCanvas({ width: 1080, height: 1350, background: '#270949', title: 'Teste <1>', measure: approximateMeasure, assets });

  it('escapa o que foi digitado e só embute as fontes usadas', () => {
    const c = canvas();
    c.text(72, 300, 'TIME <VIZINHO> & "CIA"', 60, 'display', '#fff');
    const svg = c.svg();
    expect(svg).toContain('TIME &lt;VIZINHO&gt; &amp; &quot;CIA&quot;');
    expect(svg).not.toContain('<VIZINHO>');
    expect(svg).toContain('<title>Teste &lt;1&gt;</title>');
    expect(svg).toContain("font-family:'Alpha7 Display'");
    expect(svg).not.toContain("font-family:'Alpha7 UI'");
    expect(svg).toContain('width="1080" height="1350" viewBox="0 0 1080 1350"');
  });

  it('é determinístico: o mesmo desenho gera sempre o mesmo texto', () => {
    const draw = () => {
      const c = canvas();
      c.band(72, 200, 150, 900, '#fff');
      c.text(100, 300, 'ALPHA 7', 120, 'display', '#270949');
      c.logo(72, 72, 200, 'white');
      return c.svg();
    };
    expect(draw()).toBe(draw());
  });

  it('avisa texto fora da margem, cortado e sobreposto; em ordem, sem avisos', () => {
    const fine = canvas();
    fine.text(72, 300, 'OK', 60, 'display', '#fff');
    expect(fine.warnings()).toEqual([]);

    const wide = canvas();
    wide.text(72, 300, 'UM TEXTO MUITO MAIS LARGO QUE A MARGEM DE SEGURANÇA DA ARTE', 80, 'display', '#fff', { id: 'largo' });
    expect(wide.warnings().join(' ')).toMatch(/largo/);

    const inside = canvas();
    inside.text(72, 300, 'A'.repeat(34), 60, 'display', '#fff', { id: 'margem' }); // termina entre a margem de segurança e a borda
    expect(inside.warnings()).toEqual(['Fora da margem lateral: margem']);

    const cut = canvas();
    cut.text(1000, 300, 'CORTADO PELA BORDA DIREITA', 80, 'display', '#fff', { id: 'borda' });
    expect(cut.warnings()).toContain('Cortado: borda');

    const overlap = canvas();
    overlap.text(72, 300, 'PRIMEIRO', 80, 'display', '#fff', { id: 'um' });
    overlap.text(72, 320, 'SEGUNDO', 80, 'display', '#fff', { id: 'dois' });
    expect(overlap.warnings()).toContain('Sobreposição: um e dois');
  });

  it('a logo sai na proporção original e logo cortada é avisada', () => {
    const c = canvas();
    const height = c.logo(72, 72, 300, 'white');
    expect(height).toBeCloseTo(300 * LOGO_RATIO, 6);
    expect(c.svg()).toContain('href="data:image/png;base64,BBBB"');
    expect(c.warnings()).toEqual([]);
    c.logo(900, 72, 300, 'purple');
    expect(c.warnings()).toContain('Logo cortada');
  });

  it('a composição 4:5 é centralizada no story (e o plano de fundo fica fora do grupo)', () => {
    const c = new ArtCanvas({ width: 1080, height: 1920, background: '#fff', title: 't', measure: approximateMeasure, assets });
    c.centerComposition(1350);
    c.text(72, 300, 'OK', 60, 'display', '#000');
    c.endComposition();
    const svg = c.svg();
    expect(svg).toContain('<g transform="translate(0,285)">');
    expect(svg.indexOf('</g>')).toBeGreaterThan(svg.indexOf('<g transform'));
  });

  it('texto que nunca estoura: reduz o corpo e, no limite, corta com reticências', () => {
    const c = canvas();
    const short = fitText(c, 'ALPHA 7', 'display', 900, 200);
    expect(short).toEqual({ text: 'ALPHA 7', size: 200 });
    const long = fitText(c, 'SOCIEDADE ESPORTIVA E RECREATIVA DOS AMIGOS DO BAIRRO SÃO JOÃO', 'display', 300, 100, { minSize: 40 });
    expect(long.size).toBe(40);
    expect(long.text.endsWith('…')).toBe(true);
    const ink = approximateMeasure(long.text, 'display', long.size, 0);
    expect(ink.right - ink.left).toBeLessThanOrEqual(300);
  });
});

describe('enquadramento da foto', () => {
  const box = { x: 300, y: 160, width: 1120, height: 820 };

  it('a imagem sempre cobre a caixa inteira (nunca sobra vazio), com ou sem aproximação', () => {
    for (const zoom of [1, 1.5, 3, 9]) {
      for (const [x, y] of [[0, 0], [0.5, 0.5], [1, 1]] as const) {
        const place = coverPlacement(box, { width: 640, height: 800 }, { zoom, x, y });
        expect(place.x).toBeLessThanOrEqual(box.x + 1e-6);
        expect(place.y).toBeLessThanOrEqual(box.y + 1e-6);
        expect(place.x + place.width).toBeGreaterThanOrEqual(box.x + box.width - 1e-6);
        expect(place.y + place.height).toBeGreaterThanOrEqual(box.y + box.height - 1e-6);
        expect(place.width / place.height).toBeCloseTo(640 / 800, 6); // sem distorcer
      }
    }
  });

  it('a posição escolhe qual parte da sobra aparece (0 = alto, 1 = base)', () => {
    const top = coverPlacement(box, { width: 640, height: 800 }, { zoom: 1, x: 0.5, y: 0 });
    const bottom = coverPlacement(box, { width: 640, height: 800 }, { zoom: 1, x: 0.5, y: 1 });
    expect(top.y).toBe(box.y);
    expect(bottom.y).toBeLessThan(top.y);
  });
});

describe('todas as artes', () => {
  const models = allModels();

  it.each(models.map((model, index) => [`${model.kind} ${model.format} ${model.tone} #${index}`, model] as const))('%s: tamanho do formato, sem avisos de composição e sem imagem externa', (_label, model) => {
    const art = renderArt(model, context);
    const sizes = { feed: [1080, 1350], story: [1080, 1920], square: [1080, 1080] } as const;
    expect([art.width, art.height]).toEqual(sizes[model.format]);
    expect(art.svg).toContain(`width="${art.width}" height="${art.height}"`);
    expect(art.warnings).toEqual([]);
    // nada de imagem de fora: só data URI e filtros/máscaras internos
    const hrefs = [...art.svg.matchAll(/href="([^"]*)"/g)].map((m) => m[1] ?? '');
    for (const href of hrefs) expect(href.startsWith('data:image/')).toBe(true);
    expect(art.svg.replace('http://www.w3.org/2000/svg', '')).not.toMatch(/https?:/);
    expect(art.svg).not.toContain('<foreignObject');
    expect(art.svg).not.toContain('<script');
  });

  it('o fundo é o do fundo escolhido; a logo certa entra (branca no roxo, roxa no branco)', () => {
    const dark = renderArt(ok(buildMatchdayArt({ match, phase: '', format: 'feed', tone: 'dark' })), context).svg;
    const light = renderArt(ok(buildMatchdayArt({ match, phase: '', format: 'feed', tone: 'light' })), context).svg;
    expect(dark).toContain('fill="#270949"/>');
    expect(dark).toContain('href="data:image/png;base64,BBBB"');
    expect(light).toContain('<rect width="1080" height="1350" fill="#FFFFFF"/>');
    expect(light).toContain('href="data:image/png;base64,CCCC"');
    expect(dark).not.toBe(light);
  });

  it('só usa cores da paleta, dos tons de apoio e as da carta do app (sem preto nem dourado)', () => {
    const allowed = new Set<string>(
      [...Object.values(COLOR), ...Object.values(TONES.dark), ...Object.values(TONES.light), '#E1DDE6', '#E5E1E9', '#DCD8E2', '#9384A4', '#5F4978']
        .filter((c) => c.startsWith('#'))
        .map((c) => c.toUpperCase()),
    );
    // cores da carta do atleta e da camisa do app
    for (const hex of ['#211D29', '#37323F', '#381268', '#B9A6D0', '#E4DCF0', '#F1EFF4', '#B6AEC3', '#A096B0', '#17141D', '#4C2088', '#1D0638', '#2F1058', '#F6F3FA']) allowed.add(hex);
    for (const model of models) {
      const svg = renderArt(model, context).svg;
      for (const found of Array.from(svg.matchAll(/#[0-9a-fA-F]{6}/g), (match) => match[0].toUpperCase())) {
        expect(allowed.has(found), `${model.kind}: cor ${found} fora da paleta`).toBe(true);
      }
      expect(svg).not.toMatch(/#000000|#000\b|#FFD700|#DAA520/i);
    }
  });

  it('o texto de cada arte vem dos dados: escalação, dia de jogo, resultado, atleta, destaque, carta e lances', () => {
    const text = (model: ArtModel) => renderArt(model, context).svg;
    const lineupSvg = text(ok(buildLineupArt({ match, lineup, players, format: 'feed', tone: 'dark' })));
    expect(lineupSvg).toContain('ESCALAÇÃO OFICIAL');
    expect(lineupSvg).toContain('ALPHA 7  ×  TIME &lt;VIZINHO&gt; &amp; CIA');
    for (const name of ['ANA A.', 'BIA B.', 'CRIS C.', 'DANI D.', 'EVA E.', 'FABI F.', 'HELE H.']) expect(lineupSvg).toContain(name);
    expect(lineupSvg).toContain('RESERVAS');
    expect(lineupSvg).toContain('GABI G.'); // líbero

    const day = text(ok(buildMatchdayArt({ match, phase: 'Quartas de final', format: 'feed', tone: 'dark' })));
    for (const part of ['DIA DE', 'JOGO', 'SÁB 14/11', '19H30', 'GINÁSIO', 'MUNICIPAL', 'COPA', 'QUARTAS DE FINAL']) expect(day).toContain(part);

    const spot = text(ok(buildSpotlightArt({ player, headline: 'Ataque de meio', stats: [{ label: 'Pontos', value: '18' }], format: 'feed', tone: 'light' })));
    expect(spot).toContain('ATAQUE DE MEIO');
    expect(spot).toContain('PONTOS');
    expect(spot).toContain('>18<');
    expect(spot).not.toContain('ESTATÍSTICA'); // sem número digitado, nada de marcador

    const card = text(ok(buildCardArt({ player, overall: null, attributes: null, format: 'feed', tone: 'dark' })));
    expect(card).toContain('SEM AVALIAÇÃO');
    expect(card.match(/>—</g)?.length).toBeGreaterThanOrEqual(7); // Overall e seis atributos: traço, nunca zero
  });

  it('resultado: sets vencidos, parciais por set e nome do adversário', () => {
    const finished = makeMatch({ id: 'mx', opponent: 'São João', status: 'concluida', finalSetsUs: 3, finalSetsThem: 0 });
    const ids = players.slice(0, 6).map((p) => p.id);
    const sets = [makeMatchSet('mx', 1, ids)];
    const rallies = [...Array<'us'>(25).fill('us'), ...Array<'them'>(17).fill('them')].map((winnerSide, seq) => makeRally('mx', 1, seq + 1, { winnerSide }));
    const svg = renderArt(ok(buildResultArt({ match: finished, state: matchState(finished, sets, rallies), format: 'feed', tone: 'dark' })), context).svg;
    expect(svg).toContain('RESULTADO FINAL');
    expect(svg).toContain('SÃO JOÃO');
    expect(svg).toContain('>3<');
    expect(svg).toContain('PARCIAIS POR SET');
    expect(svg).toContain('SET 1');
    expect(svg).toContain('>25<');
    expect(svg).toContain('>17<');
    expect(svg).not.toContain('SET 2');
  });

  it('foto: duotone nas artes de marca, natural na carta; sem tamanho conhecido usa o enquadramento automático', () => {
    const duo = renderArt(ok(buildAthleteArt({ player, photo, format: 'feed', tone: 'dark' })), context).svg;
    expect(duo).toContain('<feComponentTransfer>');
    expect(duo).toContain('filter="url(#duotone-');
    expect(duo).toContain('preserveAspectRatio="none"');

    const natural = renderArt(ok(buildCardArt({ player, photo, overall: 80, attributes: createUniformAttributes(70), format: 'feed', tone: 'dark' })), context).svg;
    expect(natural).toContain('href="data:image/jpeg;base64,PHOTO"');
    expect(natural).not.toContain('filter="url(#duotone');

    const unknown = renderArt(ok(buildAthleteArt({ player, photo: { href: 'data:image/jpeg;base64,PHOTO' }, format: 'feed', tone: 'dark' })), context).svg;
    expect(unknown).toContain('preserveAspectRatio="xMidYMin slice"');

    const none = renderArt(ok(buildAthleteArt({ player, format: 'feed', tone: 'dark' })), context).svg;
    expect(none).not.toContain('<image id="foto"');
    expect(none).toContain('SEM FOTO CADASTRADA'); // marcação visível, nunca finge ser uma pessoa
  });

  it('a mudança nos dados muda a arte (a prévia acompanha as escolhas)', () => {
    const a = renderArt(ok(buildMatchdayArt({ match, phase: '', format: 'feed', tone: 'dark' })), context).svg;
    const b = renderArt(ok(buildMatchdayArt({ match: { ...match, opponent: 'Outro Time' }, phase: '', format: 'feed', tone: 'dark' })), context).svg;
    expect(a).not.toBe(b);
  });

  it('fontes embutidas são woff2 em data URI', () => {
    for (const font of Object.values(FONT_DEFS)) expect(font.source.startsWith('data:font/woff2;base64,')).toBe(true);
  });
});

describe('layout da escalação: nada se sobrepõe, com qualquer número de reservas', () => {
  it.each([0, 1, 6, 9, 20])('com %i reservas o conteúdo termina antes do rodapé', (count) => {
    const extras = Array.from({ length: count }, (_, i) => makePlayer({ id: `r${i}`, name: `Reserva ${i}`, jerseyNumber: 30 + i }));
    const model = ok(buildLineupArt({ match, lineup: { ...lineup, benchIds: extras.map((p) => p.id) }, players: [...players, ...extras], format: 'feed', tone: 'dark' }));
    const art = renderArt(model, context);
    expect(art.warnings).toEqual([]);
    if (count > 9) expect(art.svg).toContain(`+${count - 9} RESERVAS`);
  });
});
