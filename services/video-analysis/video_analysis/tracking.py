"""Rastreador de pessoas por IoU com predição de movimento (ideia do ByteTrack, implementação própria e enxuta).

LIMITES (documentados no README e no JSON):
  - O `track_id` é TEMPORÁRIO. Não identifica o atleta. Quando duas pessoas se cruzam, ficam ocultas (rede, bloqueio,
    outro atleta na frente) ou saem do quadro, o rastreador pode trocar os números.
  - A aparência (histograma de cor do tronco) só ajuda a desempatar; nunca é usada como identidade.
  - Uma trilha só ganha número depois de `min_hits` detecções; antes disso a detecção sai com `track_id = None`.

Duas configurações: `PersonTracker.basic()` (a original da fase 1) e `PersonTracker.improved()`, que acrescenta nascimento
mais exigente, memória maior com recuperação de trilhas perdidas (distância + aparência) e aparência na associação.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy.optimize import linear_sum_assignment

from .appearance import blend, similarity, torso_histogram
from .types import BBox, Detection, TrackedDetection

_INFEASIBLE = 1e6


def iou_matrix(a: list[BBox], b: list[BBox]) -> np.ndarray:
    matrix = np.zeros((len(a), len(b)), dtype=np.float64)
    for i, box_a in enumerate(a):
        for j, box_b in enumerate(b):
            matrix[i, j] = box_a.iou(box_b)
    return matrix


def _assign(affinity: np.ndarray, min_value: float) -> tuple[list[tuple[int, int]], list[int], list[int]]:
    """Atribuição húngara que maximiza a afinidade total, descartando pares com afinidade abaixo de `min_value`."""
    rows, cols = affinity.shape
    if rows == 0 or cols == 0:
        return [], list(range(rows)), list(range(cols))
    row_idx, col_idx = linear_sum_assignment(1.0 - affinity)
    pairs = [(int(r), int(c)) for r, c in zip(row_idx, col_idx) if affinity[r, c] >= min_value]
    matched_rows = {r for r, _ in pairs}
    matched_cols = {c for _, c in pairs}
    return pairs, [r for r in range(rows) if r not in matched_rows], [c for c in range(cols) if c not in matched_cols]


@dataclass
class _Track:
    bbox: BBox
    confidence: float
    velocity: tuple[float, float] = (0.0, 0.0)  # deslocamento do centro por quadro processado
    hits: int = 1
    time_since_update: int = 0
    track_id: int | None = None
    histogram: np.ndarray | None = None

    def predicted(self) -> BBox:
        steps = min(self.time_since_update + 1, 5)
        return self.bbox.shifted(self.velocity[0] * steps, self.velocity[1] * steps)

    def update(self, detection: Detection, histogram: np.ndarray | None = None) -> None:
        old_cx, old_cy = self.bbox.center
        new_cx, new_cy = detection.bbox.center
        steps = self.time_since_update + 1
        observed = ((new_cx - old_cx) / steps, (new_cy - old_cy) / steps)
        self.velocity = (0.6 * self.velocity[0] + 0.4 * observed[0], 0.6 * self.velocity[1] + 0.4 * observed[1])
        self.bbox = detection.bbox
        self.confidence = detection.confidence
        self.hits += 1
        self.time_since_update = 0
        if detection.confidence >= 0.5:
            self.histogram = blend(self.histogram, histogram)


@dataclass
class PersonTracker:
    """Associa detecções entre quadros PROCESSADOS (já considerando o salto de quadros do pipeline)."""

    high_confidence: float = 0.5  # detecções acima disso podem iniciar trilhas
    low_confidence: float = 0.1  # abaixo disso a detecção é ignorada
    match_iou: float = 0.3
    low_match_iou: float = 0.5
    max_age: int = 15  # quadros processados sem ver a pessoa antes de encerrar a trilha
    min_hits: int = 2
    tentative_max_misses: int = 0  # quadros perdidos que uma trilha provisória tolera antes de sumir
    min_height_ratio: float = 0.0  # altura mínima da caixa (fração da altura do quadro) para ABRIR uma trilha
    aspect_range: tuple[float, float] | None = None  # altura/largura aceitável para ABRIR uma trilha
    recover: bool = False  # etapa extra: religar trilhas perdidas por distância (+ aparência)
    recover_base_gate: float = 0.5  # distância permitida, em alturas de caixa, logo após perder a pessoa
    recover_speed: float = 0.6  # e quanto isso cresce por quadro processado perdido (alturas de caixa)
    recover_max_gate: float = 4.0
    use_appearance: bool = False
    appearance_weight: float = 0.3  # peso da cor na afinidade da etapa principal
    appearance_min: float = 0.5  # similaridade mínima de cor para religar uma trilha perdida
    _tracks: list[_Track] = field(default_factory=list, init=False)
    _next_id: int = field(default=1, init=False)

    @classmethod
    def basic(cls) -> "PersonTracker":
        """A configuração da fase 1 (sem cor, sem recuperação)."""
        return cls()

    @classmethod
    def improved(cls) -> "PersonTracker":
        return cls(
            min_hits=3,
            max_age=30,
            tentative_max_misses=1,
            min_height_ratio=0.08,
            aspect_range=(1.0, 5.0),
            recover=True,
            use_appearance=True,
        )

    def _can_start(self, detection: Detection, frame_height: int | None) -> bool:
        box = detection.bbox
        if frame_height and self.min_height_ratio > 0 and box.height < self.min_height_ratio * frame_height:
            return False
        if self.aspect_range is not None and box.width > 0:
            ratio = box.height / box.width
            if not self.aspect_range[0] <= ratio <= self.aspect_range[1]:
                return False
        return True

    def _recover_gate(self, track: _Track) -> float:
        return min(self.recover_max_gate, self.recover_base_gate + self.recover_speed * track.time_since_update)

    def update(self, detections: list[Detection], image_bgr: np.ndarray | None = None) -> list[TrackedDetection]:
        """Devolve uma `TrackedDetection` por detecção recebida, na mesma ordem. `image_bgr` (opcional) habilita a aparência."""
        frame_height = int(image_bgr.shape[0]) if image_bgr is not None else None
        usable = [(i, d) for i, d in enumerate(detections) if d.confidence >= self.low_confidence]
        high = [(i, d) for i, d in usable if d.confidence >= self.high_confidence]
        low = [(i, d) for i, d in usable if d.confidence < self.high_confidence]
        assigned: dict[int, _Track | None] = {i: None for i, _ in usable}
        use_color = self.use_appearance and image_bgr is not None
        histograms = {i: torso_histogram(image_bgr, d.bbox) for i, d in usable} if use_color and image_bgr is not None else {}

        # Etapa 1: detecções confiáveis contra todas as trilhas (posição prevista; cor ajuda a desempatar).
        predicted = [t.predicted() for t in self._tracks]
        iou = iou_matrix(predicted, [d.bbox for _, d in high])
        affinity = iou
        if use_color and len(self._tracks) and len(high):
            sims = np.array([[similarity(t.histogram, histograms.get(orig)) for orig, _ in high] for t in self._tracks])
            affinity = np.where(iou >= self.match_iou, (1.0 - self.appearance_weight) * iou + self.appearance_weight * sims, 0.0)
        pairs, unmatched_tracks, unmatched_high = _assign(affinity, 1e-9 if use_color else self.match_iou)
        # A cor reordena, mas o gate de IoU continua valendo.
        pairs = [(t, d) for t, d in pairs if iou[t, d] >= self.match_iou]
        matched_pairs_tracks = {t for t, _ in pairs}
        unmatched_tracks = [t for t in range(len(self._tracks)) if t not in matched_pairs_tracks]
        unmatched_high = [d for d in range(len(high)) if d not in {d for _, d in pairs}]
        for t_idx, d_idx in pairs:
            track, (orig, det) = self._tracks[t_idx], high[d_idx]
            track.update(det, histograms.get(orig))
            assigned[orig] = track

        # Etapa 2: detecções fracas só reaproveitam trilhas que estavam visíveis no quadro anterior (evita fantasmas).
        recent = [t_idx for t_idx in unmatched_tracks if self._tracks[t_idx].time_since_update == 0]
        pairs2, _, _ = _assign(iou_matrix([predicted[t] for t in recent], [d.bbox for _, d in low]), self.low_match_iou)
        matched_now: set[int] = set()
        for r_idx, d_idx in pairs2:
            track, (orig, det) = self._tracks[recent[r_idx]], low[d_idx]
            track.update(det, histograms.get(orig))
            assigned[orig] = track
            matched_now.add(recent[r_idx])
        unmatched_tracks = [t for t in unmatched_tracks if t not in matched_now]

        # Etapa 3 (recuperação): trilhas confirmadas perdidas há ao menos 1 quadro × detecções confiáveis ainda sem dono.
        if self.recover and unmatched_tracks and unmatched_high:
            lost = [t for t in unmatched_tracks if self._tracks[t].track_id is not None and self._tracks[t].time_since_update >= 1]
            cost = np.full((len(lost), len(unmatched_high)), _INFEASIBLE)
            for r, t_idx in enumerate(lost):
                track = self._tracks[t_idx]
                gate = self._recover_gate(track)
                px, py = predicted[t_idx].center
                for c, d_idx in enumerate(unmatched_high):
                    orig, det = high[d_idx]
                    cx, cy = det.bbox.center
                    scale = max(track.bbox.height, det.bbox.height, 1.0)
                    distance = ((cx - px) ** 2 + (cy - py) ** 2) ** 0.5 / scale
                    if distance > gate:
                        continue
                    sim = similarity(track.histogram, histograms.get(orig)) if use_color else 0.5
                    if use_color and sim < self.appearance_min:
                        continue
                    cost[r, c] = distance / gate + (1.0 - sim if use_color else 0.0)
            if cost.size:
                rows, cols = linear_sum_assignment(cost)
                recovered = set()
                for r, c in zip(rows, cols):
                    if cost[r, c] >= _INFEASIBLE:
                        continue
                    track, (orig, det) = self._tracks[lost[r]], high[unmatched_high[c]]
                    track.update(det, histograms.get(orig))
                    assigned[orig] = track
                    matched_now.add(lost[r])
                    recovered.add(unmatched_high[c])
                unmatched_high = [d for d in unmatched_high if d not in recovered]

        matched_idx = matched_pairs_tracks | matched_now
        for t_idx, track in enumerate(self._tracks):
            if t_idx not in matched_idx:
                track.time_since_update += 1

        # Trilhas novas: só a partir de detecções confiáveis, sem dono e com tamanho/forma plausíveis de pessoa.
        for d_idx in unmatched_high:
            orig, det = high[d_idx]
            if not self._can_start(det, frame_height):
                continue
            track = _Track(bbox=det.bbox, confidence=det.confidence, histogram=histograms.get(orig))
            self._tracks.append(track)
            assigned[orig] = track

        for track in self._tracks:
            if track.track_id is None and track.hits >= self.min_hits:
                track.track_id = self._next_id
                self._next_id += 1

        # Provisórias que falharam logo no início e trilhas velhas demais saem de cena.
        self._tracks = [
            t
            for t in self._tracks
            if t.time_since_update <= self.max_age and not (t.track_id is None and t.time_since_update > self.tentative_max_misses)
        ]

        result: list[TrackedDetection] = []
        for i, det in enumerate(detections):
            track = assigned.get(i)
            result.append(TrackedDetection(track.track_id if track else None, det.bbox, det.confidence, det.label))
        return result
