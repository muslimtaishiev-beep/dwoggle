"""Dwoggle's voice, through ElevenLabs: his answers read aloud (text to speech) and spoken questions heard
(speech to text). The API key stays here, on the server; the app only ever talks to /api/voice/*.

Every spoken answer costs ElevenLabs characters, so the same text in the same voice is synthesised once and then
served from memory (Dwoggle's answers repeat a lot: the same report, the same ready questions).
"""

from __future__ import annotations

import hashlib
import threading
from collections import OrderedDict

import httpx

from .config import Settings

API = "https://api.elevenlabs.io/v1"
MAX_TEXT = 600            # characters per answer read aloud
MAX_AUDIO = 1_000_000     # bytes of a spoken question (about 30 s of compressed speech)
CACHE_ITEMS = 200         # spoken answers kept in memory, about 40 KB each


class VoiceError(Exception):
    """ElevenLabs refused or could not be reached; `status` is what our API answers."""

    def __init__(self, status: int, code: str):
        super().__init__(code)
        self.status = status
        self.code = code


class Voice:
    def __init__(self, s: Settings, client: httpx.Client | None = None):
        self.key = s.elevenlabs_api_key
        self.voice_id = s.elevenlabs_voice_id
        self.tts_model = s.elevenlabs_tts_model
        self.stt_model = s.elevenlabs_stt_model
        self.client = client or httpx.Client(timeout=30)
        self._audio: OrderedDict[str, bytes] = OrderedDict()
        self._lock = threading.Lock()

    def _call(self, request) -> httpx.Response:
        try:
            r = request()
        except httpx.HTTPError as e:
            raise VoiceError(502, "voice_unreachable") from e
        if r.status_code == 401:
            raise VoiceError(503, "voice_disabled")
        if r.status_code == 429:
            raise VoiceError(429, "voice_busy")
        if r.status_code >= 400:
            raise VoiceError(502, "voice_failed")
        return r

    def speak(self, text: str, lang: str) -> bytes:
        """MP3 of the text read aloud in Dwoggle's voice."""
        text = " ".join(text.split())[:MAX_TEXT]
        key = hashlib.sha256(f"{self.voice_id}|{self.tts_model}|{lang}|{text}".encode()).hexdigest()
        with self._lock:
            if key in self._audio:
                self._audio.move_to_end(key)
                return self._audio[key]
        r = self._call(lambda: self.client.post(
            f"{API}/text-to-speech/{self.voice_id}",
            params={"output_format": "mp3_44100_64"},
            headers={"xi-api-key": self.key, "accept": "audio/mpeg"},
            json={"text": text, "model_id": self.tts_model},
        ))
        with self._lock:
            self._audio[key] = r.content
            while len(self._audio) > CACHE_ITEMS:
                self._audio.popitem(last=False)
        return r.content

    def listen(self, audio: bytes, content_type: str, lang: str) -> str:
        """What was said in the recording, in the given language."""
        if not audio:
            raise VoiceError(422, "audio_empty")
        if len(audio) > MAX_AUDIO:
            raise VoiceError(413, "audio_too_long")
        r = self._call(lambda: self.client.post(
            f"{API}/speech-to-text",
            headers={"xi-api-key": self.key},
            data={"model_id": self.stt_model, "language_code": lang},
            files={"file": ("question", audio, content_type or "application/octet-stream")},
        ))
        return str(r.json().get("text", "")).strip()


def make_voice(s: Settings) -> Voice | None:
    return Voice(s) if s.elevenlabs_api_key else None
