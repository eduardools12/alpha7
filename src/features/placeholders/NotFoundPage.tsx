import { PATHS } from '@/app/routes';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Página não encontrada" />
      <EmptyState
        icon="search"
        title="Não há nada neste endereço"
        action={<ButtonLink to={PATHS.dashboard}>Ir ao dashboard</ButtonLink>}
      >
        O endereço pode ter sido digitado errado ou a página mudou de lugar. Use o menu para navegar.
      </EmptyState>
    </>
  );
}
