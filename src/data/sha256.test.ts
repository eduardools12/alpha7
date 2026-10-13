import { createHash } from 'node:crypto';
import { sha256Hex } from './sha256';

describe('sha256Hex', () => {
  it('bate com os vetores de teste oficiais', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('coincide com a implementação do Node em textos de vários tamanhos, com acentos e emoji', () => {
    for (const length of [1, 55, 56, 57, 63, 64, 65, 119, 120, 1000, 100_000]) {
      const text = 'Alpha7 ação coração 🏐 '.repeat(Math.ceil(length / 20)).slice(0, length);
      expect(sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
    }
  });
});
