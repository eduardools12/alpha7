import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import type { IconName } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { PATHS } from '@/app/routes';
import styles from './ComingSoonPage.module.css';

interface ComingSoonProps {
  title: string;
  subtitle: string;
  icon: IconName;
  /** O que o módulo fará (planejado, não implementado). */
  planned: string[];
  /** O que já existe hoje e se relaciona com o módulo. */
  meanwhile: { text: string; to: string; label: string };
}

export function ComingSoonPage({ title, subtitle, icon, planned, meanwhile }: ComingSoonProps) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <EmptyState icon={icon} title="Este módulo ainda está em desenvolvimento">
        Nada aqui é registrado ou calculado por enquanto. Em vez de mostrar controles que não funcionam, esta página
        lista o que está planejado.
      </EmptyState>
      <div className={styles.grid}>
        <Card title="O que está planejado">
          <ul className={styles.list}>
            {planned.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>
        <Card title="Enquanto isso">
          <p className={styles.text}>{meanwhile.text}</p>
          <ButtonLink to={meanwhile.to}>{meanwhile.label}</ButtonLink>
        </Card>
      </div>
    </>
  );
}

export function TrainingsPage() {
  return (
    <ComingSoonPage
      title="Treinos"
      subtitle="Registro de fundamentos por sessão"
      icon="list"
      planned={[
        'Criar um treino com data, foco e vários exercícios.',
        'Registrar recepção A/B/C, erro direto, saque, ataque, bloqueio e defesa por atleta, com desfazer.',
        'Presença e intensidade da sessão.',
        'Estatísticas calculadas somente a partir de registros válidos, sem contar tentativas em dobro.',
      ]}
      meanwhile={{
        text: 'Os critérios de recepção A/B/C e erro direto já estão documentados para validação.',
        to: PATHS.roster,
        label: 'Ver o elenco',
      }}
    />
  );
}

export function MatchesPage() {
  return (
    <ComingSoonPage
      title="Partidas"
      subtitle="Central de partidas, sets e rallies"
      icon="court"
      planned={[
        'Placar por set, com saque e rotação em quadra.',
        'Registro de cada rally e do motivo do ponto: ace, ataque, bloqueio, erro de saque e outros.',
        'Correção de registros sem apagar o histórico.',
        'Regras de pontuação compatíveis com o formato da competição.',
      ]}
      meanwhile={{
        text: 'Já é possível montar e salvar escalações, com ordem de saque e rotação.',
        to: PATHS.lineups,
        label: 'Montar escalação',
      }}
    />
  );
}

export function StatsPage() {
  return (
    <ComingSoonPage
      title="Estatísticas"
      subtitle="Análise de desempenho da equipe e dos atletas"
      icon="chart"
      planned={[
        'Taxa de ace, eficiência de ataque, sucesso no side-out e eficiência de bloqueio, sempre com acertos e tentativas.',
        'Qualidade da recepção (A, B, C e erro) por treino.',
        'Comparação entre atacantes e evolução dos treinos.',
        'Quando não houver tentativas, a métrica aparecerá como indisponível, nunca como 0%.',
      ]}
      meanwhile={{
        text: 'As notas técnicas e o Overall (avaliações do treinador) já aparecem no perfil de cada atleta.',
        to: PATHS.roster,
        label: 'Abrir o elenco',
      }}
    />
  );
}
