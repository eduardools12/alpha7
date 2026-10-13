"""Gera os ícones do aplicativo instalável a partir do símbolo A7 oficial.

O símbolo (public/brand/a7-mark-white.png, derivado do arquivo original só com fundo transparente) é
apenas posicionado sobre o roxo profundo oficial (#270949), com a proporção original: nunca redesenhado
nem distorcido. Rodar na raiz do projeto: python scripts/make-pwa-icons.py
"""
from PIL import Image

PURPLE = (0x27, 0x09, 0x49, 255)
MARK = Image.open('public/brand/a7-mark-white.png').convert('RGBA')


def icon(size: int, mark_fraction: float) -> Image.Image:
    """Quadrado roxo com o símbolo centralizado, ocupando `mark_fraction` da largura."""
    canvas = Image.new('RGBA', (size, size), PURPLE)
    width = round(size * mark_fraction)
    height = round(width * MARK.height / MARK.width)
    mark = MARK.resize((width, height), Image.LANCZOS)
    canvas.alpha_composite(mark, ((size - width) // 2, (size - height) // 2))
    return canvas.convert('RGB')


# "any": o símbolo ocupa boa parte do quadrado. "maskable": o sistema recorta até um círculo de 80% do lado,
# então o símbolo fica dentro da zona segura (cerca de 56% da largura).
for name, size, fraction in [
    ('icon-192.png', 192, 0.70),
    ('icon-512.png', 512, 0.70),
    ('icon-maskable-512.png', 512, 0.54),
    ('apple-touch-icon.png', 180, 0.66),
]:
    icon(size, fraction).save(f'public/{name}', optimize=True)
    print('ok', name)
