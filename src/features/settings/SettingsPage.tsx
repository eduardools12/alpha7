import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { useWorkspace } from '@/data/WorkspaceProvider';
import { BackupPanel } from './BackupPanel';
import { DataPanel } from './DataPanel';
import { WeightsEditor } from './WeightsEditor';
import styles from './SettingsPage.module.css';

const PALETTE = [
  { name: 'Roxo profundo', hex: '#270949' },
  { name: 'Grafite', hex: '#17141D' },
  { name: 'Lilás secundário', hex: '#8F7AA6' },
  { name: 'Cinza-claro', hex: '#F1EFF4' },
  { name: 'Branco', hex: '#FFFFFF' },
];

export function SettingsPage() {
  const { data, actions } = useWorkspace();

  return (
    <>
      <PageHeader title="Configurações" subtitle="Backup, dados, cálculo do Overall e identidade" />

      <BackupPanel />

      <DataPanel />

      <Card title="Cálculo do Overall">
        <WeightsEditor saved={data.settings.weights} onSave={actions.saveWeights} />
      </Card>

      <Card title="Identidade da equipe">
        <p className={styles.muted}>
          Arquivos oficiais preservados em <code>public/brand/original</code>. O símbolo nunca é redesenhado.
        </p>
        <div className={styles.identity}>
          <figure className={styles.logoFigure}>
            <img src="/brand/original/a7-logo.jpeg" alt="Logo oficial do Alpha7" width="220" height="220" />
            <figcaption>Logo A7</figcaption>
          </figure>
          <figure className={styles.uniform}>
            <img src="/brand/original/a7-branco.jpeg" alt="Uniforme branco com detalhes roxos: camisa, costas e shorts" />
            <figcaption>Uniforme branco</figcaption>
          </figure>
          <figure className={styles.uniform}>
            <img src="/brand/original/a7-roxo.jpeg" alt="Uniforme roxo com detalhes brancos: camisa, costas e shorts" />
            <figcaption>Uniforme roxo</figcaption>
          </figure>
        </div>
        <ul className={styles.palette} aria-label="Paleta da marca">
          {PALETTE.map((c) => (
            <li key={c.hex}>
              <span className={styles.swatch} style={{ background: c.hex }} aria-hidden="true" />
              <span>
                {c.name} <code>{c.hex}</code>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
