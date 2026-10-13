import { render, screen } from '@testing-library/react';
import { ResultDots, Sparkline, StatTile } from './StatTile';

describe('indicadores visuais', () => {
  it('o indicador mostra rótulo, valor e detalhe com o denominador, e a etiqueta Demo quando for demonstração', () => {
    render(<StatTile label="Partidas disputadas" value="3" detail="1 de 3 vitórias" demo />);
    expect(screen.getByText('Partidas disputadas')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1 de 3 vitórias')).toBeInTheDocument();
    expect(screen.getByText('Demo')).toBeInTheDocument();
  });

  it('a mini linha só existe com 2 ou mais pontos reais (um ponto não é tendência)', () => {
    const { container, rerender } = render(<Sparkline values={[70]} label="Evolução" />);
    expect(container.querySelector('svg')).toBeNull();
    rerender(<Sparkline values={[70, 72, 75]} label="Evolução do Overall" />);
    expect(screen.getByRole('img', { name: 'Evolução do Overall' })).toBeInTheDocument();
  });

  it('valores iguais não quebram a mini linha (linha reta)', () => {
    render(<Sparkline values={[70, 70, 70]} label="Estável" />);
    expect(screen.getByRole('img', { name: 'Estável' }).querySelector('polyline')?.getAttribute('points')).not.toMatch(/NaN/);
  });

  it('os resultados também são descritos em texto, não só em cor', () => {
    render(<ResultDots results={['vitoria', 'derrota', 'empate']} />);
    expect(screen.getByRole('img', { name: 'Últimos resultados, do mais antigo ao mais recente: vitória, derrota, empate' })).toBeInTheDocument();
    expect(screen.getByText('V')).toBeInTheDocument();
    expect(screen.getByText('D')).toBeInTheDocument();
  });

  it('sem resultados não desenha nada', () => {
    const { container } = render(<ResultDots results={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
