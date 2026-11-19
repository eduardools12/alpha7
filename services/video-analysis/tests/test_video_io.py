from pathlib import Path

import pytest
from helpers import FPS, SIZE, write_synthetic_video

from video_analysis.errors import VideoNotFoundError, VideoUnreadableError
from video_analysis.video_io import FrameReader, probe_video


def test_video_inexistente(tmp_path: Path) -> None:
    with pytest.raises(VideoNotFoundError, match="não existe"):
        probe_video(tmp_path / "nao_existe.mp4")


def test_caminho_que_e_pasta(tmp_path: Path) -> None:
    with pytest.raises(VideoNotFoundError, match="não é um arquivo"):
        probe_video(tmp_path)


def test_arquivo_vazio(tmp_path: Path) -> None:
    empty = tmp_path / "vazio.mp4"
    empty.write_bytes(b"")
    with pytest.raises(VideoUnreadableError, match="vazio"):
        probe_video(empty)


def test_arquivo_invalido_que_nao_e_video(tmp_path: Path) -> None:
    fake = tmp_path / "falso.mp4"
    fake.write_text("isto não é um vídeo, só texto", encoding="utf-8")
    with pytest.raises(VideoUnreadableError):
        probe_video(fake)


def test_metadados_do_video(synthetic_video: Path) -> None:
    info = probe_video(synthetic_video)
    assert (info.width, info.height) == SIZE
    assert info.fps == pytest.approx(FPS)
    assert info.frame_count == 40
    assert info.duration_s == pytest.approx(4.0)
    assert info.filename == "clipe_sintetico.avi"  # só o nome, nunca o caminho completo
    assert info.size_bytes > 0


def test_le_todos_os_quadros_com_tempos_do_original(synthetic_video: Path) -> None:
    info = probe_video(synthetic_video)
    with FrameReader(synthetic_video, info) as reader:
        records = list(reader.frames())
    assert [r.index for r in records] == list(range(40))
    for r in records:
        assert r.timestamp_ms == pytest.approx(r.index / FPS * 1000.0, abs=1000.0 / FPS)
        assert r.image.shape == (SIZE[1], SIZE[0], 3)
    assert [r.timestamp_ms for r in records] == sorted(r.timestamp_ms for r in records)
    assert reader.errors == [] and reader.ended_early_at is None


def test_stride_preserva_indices_e_tempos_originais(synthetic_video: Path) -> None:
    info = probe_video(synthetic_video)
    with FrameReader(synthetic_video, info, stride=5) as reader:
        records = list(reader.frames())
    assert [r.index for r in records] == [0, 5, 10, 15, 20, 25, 30, 35]
    for r in records:
        assert r.timestamp_ms == pytest.approx(r.index / FPS * 1000.0, abs=1000.0 / FPS)


def test_inicio_e_duracao_maxima(synthetic_video: Path) -> None:
    info = probe_video(synthetic_video)
    with FrameReader(synthetic_video, info, start_seconds=1.0, max_seconds=1.0) as reader:
        records = list(reader.frames())
    assert [r.index for r in records] == list(range(10, 20))
    assert records[0].timestamp_ms == pytest.approx(1000.0, abs=1000.0 / FPS)


def test_libera_o_arquivo_ao_sair_e_mesmo_com_erro(synthetic_video: Path) -> None:
    info = probe_video(synthetic_video)
    reader = FrameReader(synthetic_video, info)
    with reader:
        next(reader.frames())
        assert reader._capture is not None
    assert reader._capture is None
    with pytest.raises(RuntimeError):
        with FrameReader(synthetic_video, info) as failing:
            raise RuntimeError("falha no meio")
    assert failing._capture is None


def test_frames_fora_do_with_e_recusado(synthetic_video: Path) -> None:
    reader = FrameReader(synthetic_video, probe_video(synthetic_video))
    with pytest.raises(RuntimeError, match="with"):
        next(reader.frames())


def test_parametros_invalidos(synthetic_video: Path) -> None:
    info = probe_video(synthetic_video)
    with pytest.raises(ValueError):
        FrameReader(synthetic_video, info, stride=0)
    with pytest.raises(ValueError):
        FrameReader(synthetic_video, info, start_seconds=-1)


def test_arquivo_truncado_nao_trava_nem_levanta_no_meio(tmp_path: Path) -> None:
    video = write_synthetic_video(tmp_path / "inteiro.avi", n_frames=60)
    data = video.read_bytes()
    cut = tmp_path / "cortado.avi"
    cut.write_bytes(data[: int(len(data) * 0.6)])
    try:
        info = probe_video(cut)
    except VideoUnreadableError:
        return  # recusar um arquivo truncado logo na abertura também é um comportamento aceitável
    with FrameReader(cut, info) as reader:
        records = list(reader.frames())
    assert len(records) < 60  # terminou sem exceção, só com menos quadros
