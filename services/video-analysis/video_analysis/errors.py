"""Erros do módulo. Mensagens em português, dizem o que houve e o que fazer."""


class VideoAnalysisError(Exception):
    """Base de todos os erros esperados do módulo."""


class VideoNotFoundError(VideoAnalysisError):
    """O arquivo de vídeo não existe ou não é um arquivo."""


class VideoUnreadableError(VideoAnalysisError):
    """O arquivo existe, mas não pôde ser aberto ou decodificado como vídeo."""


class DetectorError(VideoAnalysisError):
    """O detector não pôde ser criado ou falhou ao processar um quadro."""


class CalibrationError(VideoAnalysisError):
    """A calibração da quadra é inválida (pontos fora de lugar, degenerados ou formato errado)."""


class OutputError(VideoAnalysisError):
    """Falha ao gravar o vídeo anotado ou o JSON de saída."""
