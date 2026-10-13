import type { UniformColor } from '@/domain/player';

const COLORS: Record<UniformColor, { body: string; trim: string; number: string; mark: string }> = {
  purple: { body: '#2f1058', trim: '#ffffff', number: '#ffffff', mark: 'white' },
  white: { body: '#f6f3fa', trim: '#270949', number: '#270949', mark: 'purple' },
};

/**
 * Camisa ilustrativa nas duas cores oficiais do uniforme. É um desenho vetorial simples:
 * não substitui as imagens oficiais dos uniformes (veja Configurações > Identidade).
 */
export function Jersey({ color, number }: { color: UniformColor; number: number | null }) {
  const c = COLORS[color];
  return (
    <svg viewBox="0 0 120 110" role="img" aria-label={`Camisa ${color === 'white' ? 'branca' : 'roxa'}`} width="100%" height="100%">
      <path
        d="M38 6 20 14 4 36l18 10 8-8v66h60V38l8 8 18-10-16-22-18-8c-8 12-36 12-44 0Z"
        fill={c.body}
        stroke={c.trim}
        strokeWidth="1"
        strokeOpacity="0.35"
      />
      <path d="M30 38v66M90 38v66" stroke={c.trim} strokeWidth="4" strokeLinecap="round" />
      <path d="M4 36l18 10M116 36l-18 10" stroke={c.trim} strokeWidth="4" strokeLinecap="round" />
      <path d="M38 6c8 12 36 12 44 0" fill="none" stroke={c.trim} strokeWidth="4" strokeLinecap="round" />
      <image href={`/brand/a7-mark-${c.mark}.png`} x="64" y="34" width="20" height="14.3" />
      {number !== null && (
        <text
          x="60"
          y="84"
          textAnchor="middle"
          fill={c.number}
          fontFamily="'Barlow Condensed', sans-serif"
          fontWeight="700"
          fontSize="40"
        >
          {number}
        </text>
      )}
    </svg>
  );
}
