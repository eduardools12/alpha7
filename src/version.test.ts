import pkg from '../package.json';
import { APP_VERSION } from './version';

describe('versão do aplicativo', () => {
  it('src/version.ts e package.json dizem a mesma coisa', () => {
    expect(APP_VERSION).toBe(pkg.version);
  });
});
