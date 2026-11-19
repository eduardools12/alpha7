from helpers import truth_boxes

from video_analysis.tracking import PersonTracker
import numpy as np

from video_analysis.types import BBox, Detection


def detections(frame: int, confidence: float = 0.9, people: int = 2) -> list[Detection]:
    return [Detection(box, confidence) for box in truth_boxes(frame, people)]


def test_ids_so_aparecem_depois_de_min_hits_e_depois_se_mantem() -> None:
    tracker = PersonTracker(min_hits=2)
    first = tracker.update(detections(0))
    assert [t.track_id for t in first] == [None, None]  # ainda provisórias
    ids_per_frame = [[t.track_id for t in tracker.update(detections(i))] for i in range(1, 15)]
    assert all(frame == ids_per_frame[0] for frame in ids_per_frame)  # a mesma pessoa mantém o mesmo número
    assert sorted(ids_per_frame[0]) == [1, 2]


def test_oclusao_curta_nao_troca_o_id() -> None:
    tracker = PersonTracker(min_hits=2, max_age=15)
    for i in range(6):
        tracker.update(detections(i))
    before = [t.track_id for t in tracker.update(detections(6))]
    for i in range(7, 10):  # três quadros sem ninguém detectado
        assert tracker.update([]) == []
    after = [t.track_id for t in tracker.update(detections(10))]
    assert after == before


def test_ausencia_longa_encerra_a_trilha_e_cria_numero_novo() -> None:
    tracker = PersonTracker(min_hits=2, max_age=3)
    for i in range(5):
        tracker.update(detections(i, people=1))
    old = [t.track_id for t in tracker.update(detections(5, people=1))]
    for _ in range(6):
        tracker.update([])
    for i in range(20, 23):
        new = [t.track_id for t in tracker.update(detections(i, people=1))]
    assert new != old and new == [2]


def test_ruido_de_uma_vez_so_nao_ganha_numero() -> None:
    tracker = PersonTracker(min_hits=2)
    noise = [Detection(BBox(5, 5, 25, 60), 0.8)]
    assert tracker.update(noise)[0].track_id is None
    assert tracker.update([])  == []
    # a trilha provisória some; uma detecção no mesmo lugar recomeça do zero (ainda sem número)
    assert tracker.update(noise)[0].track_id is None


def test_deteccao_de_baixa_confianca_continua_trilha_existente_mas_nao_cria_nova() -> None:
    tracker = PersonTracker(min_hits=2, high_confidence=0.5, low_confidence=0.1)
    for i in range(4):
        tracker.update(detections(i, 0.9, people=1))
    weak = tracker.update(detections(4, 0.3, people=1))
    assert weak[0].track_id == 1  # confiança baixa, mas encaixa na trilha que já existia
    stranger = tracker.update([Detection(BBox(250, 20, 290, 100), 0.3)])
    assert stranger[0].track_id is None  # sem trilha para continuar e fraca demais para abrir uma


def test_deteccoes_abaixo_do_minimo_sao_ignoradas_mas_mantem_a_ordem() -> None:
    tracker = PersonTracker()
    out = tracker.update([Detection(BBox(0, 0, 10, 10), 0.05), Detection(BBox(50, 50, 90, 150), 0.9)])
    assert len(out) == 2 and out[0].track_id is None and out[0].confidence == 0.05


def test_sem_deteccoes_nao_quebra() -> None:
    tracker = PersonTracker()
    assert tracker.update([]) == []


# ───────── rastreador melhorado ─────────

def frame_with_colors(colors: dict[int, tuple[int, int, int]], boxes: dict[int, BBox]) -> np.ndarray:
    """Quadro 240x320 em que cada "pessoa" tem uma cor de camisa (BGR) no tronco."""
    image = np.full((240, 320, 3), 90, dtype=np.uint8)
    for key, box in boxes.items():
        image[int(box.y1):int(box.y2), int(box.x1):int(box.x2)] = colors[key]
    return image


def test_melhorado_recupera_a_mesma_trilha_depois_de_ausencia_longa() -> None:
    gap = 12  # o básico curto (max_age=5) já encerrou a trilha; o melhorado (max_age=30) ainda a guarda
    basic = PersonTracker(min_hits=2, max_age=5)
    improved = PersonTracker(min_hits=2, max_age=30, recover=True)
    ids = {}
    for name, tracker in (("basic", basic), ("improved", improved)):
        for i in range(6):
            first = tracker.update(detections(i, people=1))
        before = first[0].track_id
        for _ in range(gap):
            tracker.update([])
        # a pessoa reaparece perto de onde sumiu (andou pouco)
        after = tracker.update(detections(6 + 2, people=1))
        after = tracker.update(detections(6 + 3, people=1))
        ids[name] = (before, after[0].track_id)
    assert ids["basic"][1] != ids["basic"][0]  # a trilha curta já tinha morrido: número novo
    assert ids["improved"][1] == ids["improved"][0]  # a recuperação religou ao mesmo número


def test_recuperacao_nao_liga_a_alguem_longe_demais() -> None:
    tracker = PersonTracker(min_hits=2, max_age=30, recover=True)
    for i in range(6):
        tracker.update(detections(i, people=1))
    old = tracker.update(detections(6, people=1))[0].track_id
    tracker.update([])
    tracker.update([])
    far = Detection(BBox(280, 70, 320, 180), 0.9)  # do outro lado da quadra, logo depois de perder a pessoa
    assert tracker.update([far])[0].track_id != old


def test_na_recuperacao_a_cor_impede_religar_a_pessoa_de_camisa_diferente() -> None:
    """A cor só bloqueia na RECUPERAÇÃO (quem reaparece longe da última posição); com caixas sobrepostas ela só desempata."""
    red, blue = (30, 30, 220), (220, 60, 30)
    box = BBox(100, 60, 140, 170)
    reappears = BBox(170, 60, 210, 170)  # 70 px adiante: sem sobreposição com a caixa antiga, dentro do alcance de recuperação

    def run(shirt_after: tuple[int, int, int]) -> tuple[int | None, int | None]:
        tracker = PersonTracker(min_hits=2, max_age=30, recover=True, use_appearance=True, appearance_min=0.6)
        for _ in range(6):
            out = tracker.update([Detection(box, 0.9)], frame_with_colors({0: red}, {0: box}))
        for _ in range(2):
            tracker.update([], frame_with_colors({}, {}))
        again = tracker.update([Detection(reappears, 0.9)], frame_with_colors({0: shirt_after}, {0: reappears}))
        return out[0].track_id, again[0].track_id

    original, same_shirt = run(red)
    assert same_shirt == original  # camisa igual: religa à mesma trilha
    original, other_shirt = run(blue)
    assert other_shirt != original  # camisa diferente: não religa (vira outra pessoa)


def test_nascimento_exigente_ignora_caixas_pequenas_ou_de_formato_estranho() -> None:
    tracker = PersonTracker(min_hits=1, min_height_ratio=0.2, aspect_range=(1.0, 5.0))
    image = np.full((240, 320, 3), 90, dtype=np.uint8)
    tiny = Detection(BBox(10, 10, 20, 30), 0.9)  # 20 px de altura < 20% de 240
    flat = Detection(BBox(100, 100, 220, 160), 0.9)  # mais larga que alta
    person = Detection(BBox(200, 60, 240, 180), 0.9)
    ids = [t.track_id for t in tracker.update([tiny, flat, person], image)]
    assert ids[0] is None and ids[1] is None and ids[2] is not None


def test_basico_e_melhorado_sao_configuracoes_diferentes() -> None:
    basic, improved = PersonTracker.basic(), PersonTracker.improved()
    assert (basic.min_hits, basic.max_age, basic.recover, basic.use_appearance) == (2, 15, False, False)
    assert (improved.min_hits, improved.max_age, improved.recover, improved.use_appearance) == (3, 30, True, True)
