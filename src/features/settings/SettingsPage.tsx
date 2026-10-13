import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { useWorkspace } from '@/data/WorkspaceProvider';
import { WeightsEditor } from './WeightsEditor';
import styles from './SettingsPage.module.css';

const PALETTE = [
  { name: 'Roxo profundo', hex: '#270949' },
  { name: 'Grafite', hex: '#17141D' },
  { name: 'Lilás secundário', hex: '#8F7AA6' },
  { name: 'Cinza-claro', hex: '#F1EFF4' },
  { name: 'Branco', hex: '#FFFFFF' },
];

type Pending = 'demo' | 'clear' | null;

export function SettingsPage() {
  const { data, persistent, actions } = useWorkspace();
  const [pending, setPending] = useState<Pending>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const demoCount = data.players.filter((p) => p.demo).length;

  const run = async (kind: Exclude<Pending, null>) => {
    setBusy(true);
    setMessage(null);
    try {
      if (kind === 'demo') await actions.restoreDemo();
      else await actions.clearAllData();
      setMessage({
        tone: 'success',
        text: kind === 'demo' ? 'Dados de demonstração restaurados.' : 'Todos os dados foram apagados.',
      });
      setPending(null);
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Não foi possível concluir.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Configurações" subtitle="Identidade, cálculo do Overall e dados" />

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

      <Card title="Dados e armazenamento" id="dados">
        <p className={styles.muted}>
          {persistent
            ? 'Os dados ficam salvos só neste navegador (armazenamento local). Eles não são enviados a nenhum servidor e não existe backup: outro navegador ou aparelho não vê estes dados.'
            : 'O armazenamento do navegador está indisponível: os dados valem só até recarregar a página.'}
        </p>
        <p>
          Atualmente: {data.players.length} atletas ({demoCount} de demonstração), {data.evaluations.length} avaliações e{' '}
          {data.lineups.length} escalações.
        </p>

        {message && <Notice tone={message.tone}>{message.text}</Notice>}

        <div className={styles.actions}>
          {pending === 'demo' ? (
            <>
              <Button variant="danger" disabled={busy} onClick={() => void run('demo')}>
                Confirmar: substituir tudo pela demonstração
              </Button>
              <Button variant="ghost" onClick={() => setPending(null)}>
                Cancelar
              </Button>
            </>
          ) : (
            <Button onClick={() => setPending('demo')}>Restaurar dados de demonstração</Button>
          )}
          {pending === 'clear' ? (
            <>
              <Button variant="danger" disabled={busy} onClick={() => void run('clear')}>
                Confirmar: apagar todos os dados
              </Button>
              <Button variant="ghost" onClick={() => setPending(null)}>
                Cancelar
              </Button>
            </>
          ) : (
            <Button variant="danger" icon="trash" onClick={() => setPending('clear')}>
              Apagar todos os dados
            </Button>
          )}
        </div>
        {pending && (
          <Notice tone="warning" title="Esta ação não pode ser desfeita">
            {pending === 'demo'
              ? 'Atletas, avaliações e escalações atuais (inclusive os que você cadastrou) serão substituídos.'
              : 'Atletas, avaliações e escalações serão apagados deste navegador. Os pesos do Overall são mantidos.'}
          </Notice>
        )}
      </Card>
    </>
  );
}
