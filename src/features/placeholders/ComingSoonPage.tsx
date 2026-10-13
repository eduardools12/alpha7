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
        'Visão consolidada da equipe e dos atletas ao longo de vários treinos, com filtros de período.',
        'Evolução dos indicadores de treino entre sessões.',
        'Sucesso no side-out e demais indicadores que dependem de partidas.',
        'Quando não houver tentativas, a métrica aparecerá como indisponível, nunca como 0%.',
      ]}
      meanwhile={{
        text: 'Cada treino já tem um resumo com estatísticas por fundamento, recepção, eficiência de ataque e resultados individuais.',
        to: PATHS.trainings,
        label: 'Abrir os treinos',
      }}
    />
  );
}
