"""Tipos simples compartilhados entre os módulos. Sem lógica de visão computacional aqui."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class BBox:
    """Caixa em pixels: canto superior esquerdo (x1, y1) e inferior direito (x2, y2)."""

    x1: float
    y1: float
    x2: float
    y2: float

    @property
    def width(self) -> float:
        return max(0.0, self.x2 - self.x1)

    @property
    def height(self) -> float:
        return max(0.0, self.y2 - self.y1)

    @property
    def area(self) -> float:
        return self.width * self.height

    @property
    def center(self) -> tuple[float, float]:
        return ((self.x1 + self.x2) / 2.0, (self.y1 + self.y2) / 2.0)

    @property
    def anchor(self) -> tuple[float, float]:
        """Ponto "dos pés": centro da borda inferior. Só aproxima o chão se a pessoa estiver em pé (não vale no salto)."""
        return ((self.x1 + self.x2) / 2.0, self.y2)

    def scaled(self, sx: float, sy: float) -> "BBox":
        return BBox(self.x1 * sx, self.y1 * sy, self.x2 * sx, self.y2 * sy)

    def shifted(self, dx: float, dy: float) -> "BBox":
        return BBox(self.x1 + dx, self.y1 + dy, self.x2 + dx, self.y2 + dy)

    def clipped(self, width: float, height: float) -> "BBox":
        return BBox(
            min(max(self.x1, 0.0), width),
            min(max(self.y1, 0.0), height),
            min(max(self.x2, 0.0), width),
            min(max(self.y2, 0.0), height),
        )

    def iou(self, other: "BBox") -> float:
        ix1, iy1 = max(self.x1, other.x1), max(self.y1, other.y1)
        ix2, iy2 = min(self.x2, other.x2), min(self.y2, other.y2)
        inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
        union = self.area + other.area - inter
        return inter / union if union > 0 else 0.0

    def as_list(self) -> list[float]:
        return [round(self.x1, 2), round(self.y1, 2), round(self.x2, 2), round(self.y2, 2)]


@dataclass(frozen=True)
class Detection:
    """Uma pessoa detectada em um quadro (antes do rastreamento)."""

    bbox: BBox
    confidence: float
    label: str = "person"


@dataclass(frozen=True)
class TrackedDetection:
    """Detecção ligada (ou não) a uma trilha.

    `track_id` é um número TEMPORÁRIO do rastreador. Não identifica o atleta e pode trocar quando pessoas se cruzam
    ou ficam ocultas. `None` significa que a detecção ainda não pertence a uma trilha confirmada.
    """

    track_id: int | None
    bbox: BBox
    confidence: float
    label: str = "person"
    #: Dentro da região de interesse (ROI)? None = nenhuma ROI foi definida. Fora da ROI nunca ganha trilha.
    in_roi: bool | None = None
