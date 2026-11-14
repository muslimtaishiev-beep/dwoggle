from __future__ import annotations

from ..config import Settings
from .base import Provider, RawMetrics


def make_provider(settings: Settings) -> Provider:
    if settings.provider == "mock":
        from .mock import MockProvider

        return MockProvider()
    from .earthengine import EarthEngineProvider

    return EarthEngineProvider(settings)


__all__ = ["Provider", "RawMetrics", "make_provider"]
