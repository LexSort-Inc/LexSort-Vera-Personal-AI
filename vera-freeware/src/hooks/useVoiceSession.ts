/**
 * useVoiceSession — VERA local audio pipeline (Amendment 03)
 *
 * Implements the session-based voice model:
 *   • User clicks mic once → session starts
 *   • Energy-based VAD handles turn-taking within the session
 *   • 1.5 s silence → utterance boundary → sends audio to /v1/audio/transcriptions
 *   • 45 s idle (no speech activity) → session auto-ends
 *   • User can click mic again at any time to stop
 *
 * No cloud, no continuous ambient listening.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

// ─── Config ──────────────────────────────────────────────────────────────────

const VERA_API_BASE   = 'http://localhost:8888';
const SAMPLE_RATE     = 16000;        // whisper.cpp expects 16 kHz
const VAD_SILENCE_MS  = 1500;         // 1.5 s of silence → utterance end
const SESSION_IDLE_MS = 45_000;       // 45 s total idle → auto-end session
const ENERGY_THRESHOLD = 0.012;       // RMS amplitude floor for speech detection
const CHUNK_INTERVAL_MS = 100;        // how often we sample energy (ms)

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VoiceSessionCallbacks {
  onTranscript: (text: string) => void;
  onSessionStart?: () => void;
  onSessionEnd?: () => void;
  onError?: (msg: string) => void;
  onSpeaking?: (speaking: boolean) => void;
}

export interface VoiceSessionState {
  sessionActive: boolean;
  speaking: boolean;
  supported: boolean;
  startSession: () => Promise<void>;
  stopSession: () => void;
  /** Normalised 0–1 energy level for waveform animation */
  energyLevel: number;
  /** Speak a response aloud via /v1/audio/speech */
  speak: (text: string) => Promise<void>;
}

// ─── Helper: encode Float32 PCM to 16-bit WAV bytes ──────────────────────────

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buf);
  const writeStr = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  };
  const dataLen = samples.length * 2;

  writeStr(0,  'RIFF');
  view.setUint32(4,  36 + dataLen, true);
  writeStr(8,  'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);    // PCM
  view.setUint16(22, 1, true);    // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataLen, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return new Blob([buf], { type: 'audio/wav' });
}

// ─── Helper: compute RMS energy ──────────────────────────────────────────────

function computeRms(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / data.length);
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useVoiceSession(callbacks: VoiceSessionCallbacks): VoiceSessionState {
  const { onTranscript, onSessionStart, onSessionEnd, onError, onSpeaking } = callbacks;

  const [sessionActive, setSessionActive] = useState(false);
  const [speaking, setSpeaking]           = useState(false);
  const [energyLevel, setEnergyLevel]     = useState(0);
  const [supported, setSupported]         = useState(false);

  const streamRef          = useRef<MediaStream | null>(null);
  const audioCtxRef        = useRef<AudioContext | null>(null);
  const analyserRef        = useRef<AnalyserNode | null>(null);
  const scriptNodeRef      = useRef<ScriptProcessorNode | null>(null);
  const pcmBufferRef       = useRef<Float32Array[]>([]);
  const isSpeakingRef      = useRef(false);
  const silenceTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const energyIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionActiveRef   = useRef(false);
  const submittingRef      = useRef(false);
  const stopSessionRef     = useRef<() => void>(() => {});

  // Check browser support on mount
  useEffect(() => {
    setSupported(!!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia));
    return () => { stopSessionRef.current(); };
  }, []);

  // ── Submit accumulated PCM to /v1/audio/transcriptions ──────────────────
  const submitUtterance = useCallback(async () => {
    if (submittingRef.current || pcmBufferRef.current.length === 0) return;
    submittingRef.current = true;

    const chunks  = pcmBufferRef.current;
    pcmBufferRef.current = [];
    const totalLen = chunks.reduce((s, c) => s + c.length, 0);
    const merged   = new Float32Array(totalLen);
    let pos = 0;
    for (const chunk of chunks) { merged.set(chunk, pos); pos += chunk.length; }

    const wavBlob = encodeWav(merged, SAMPLE_RATE);
    const fd = new FormData();
    fd.append('file', wavBlob, 'utterance.wav');
    fd.append('model', 'whisper');

    try {
      const res = await fetch(`${VERA_API_BASE}/v1/audio/transcriptions`, {
        method: 'POST',
        body: fd,
        headers: { Authorization: 'Bearer VERA_DEV_BYPASS' },
      });
      if (res.ok) {
        const data = await res.json() as { text?: string };
        if (data.text && data.text.trim()) onTranscript(data.text.trim());
      } else {
        onError?.(`Transcription HTTP ${res.status}`);
      }
    } catch (err) {
      onError?.(`Transcription failed: ${err}`);
    } finally {
      submittingRef.current = false;
    }
  }, [onTranscript, onError]);

  // ── Internal cleanup ─────────────────────────────────────────────────────
  const cleanupSession = useCallback(() => {
    if (energyIntervalRef.current)  clearInterval(energyIntervalRef.current);
    if (silenceTimerRef.current)    clearTimeout(silenceTimerRef.current);
    if (idleTimerRef.current)       clearTimeout(idleTimerRef.current);
    energyIntervalRef.current = null;
    silenceTimerRef.current   = null;
    idleTimerRef.current      = null;
    scriptNodeRef.current?.disconnect();
    analyserRef.current?.disconnect();
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close();
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current     = null;
    audioCtxRef.current   = null;
    analyserRef.current   = null;
    scriptNodeRef.current = null;
    pcmBufferRef.current  = [];
    isSpeakingRef.current    = false;
    sessionActiveRef.current = false;
    setEnergyLevel(0);
    setSpeaking(false);
  }, []);

  // ── Stop session (public) ────────────────────────────────────────────────
  const stopSession = useCallback(() => {
    if (isSpeakingRef.current) submitUtterance();
    cleanupSession();
    setSessionActive(false);
    onSessionEnd?.();
  }, [submitUtterance, cleanupSession, onSessionEnd]);

  // Keep ref in sync so the cleanup effect can call it
  useEffect(() => { stopSessionRef.current = stopSession; }, [stopSession]);

  // ── Silence detection callback ───────────────────────────────────────────
  const onSilenceDetected = useCallback(() => {
    if (!isSpeakingRef.current) return;
    isSpeakingRef.current = false;
    setSpeaking(false);
    onSpeaking?.(false);
    submitUtterance();
    // Reset idle timer after utterance
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      if (sessionActiveRef.current) stopSessionRef.current();
    }, SESSION_IDLE_MS);
  }, [submitUtterance, onSpeaking]);

  // ── Start session ────────────────────────────────────────────────────────
  const startSession = useCallback(async () => {
    if (sessionActiveRef.current) return;
    if (!supported) {
      onError?.('Microphone not supported in this context.');
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: SAMPLE_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch (err) {
      onError?.(`Microphone permission denied: ${err}`);
      return;
    }

    streamRef.current = stream;
    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    audioCtxRef.current = ctx;

    const source   = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyserRef.current = analyser;

    // ScriptProcessor: buffer raw PCM only while speech is active
    const scriptNode = ctx.createScriptProcessor(4096, 1, 1);
    scriptNodeRef.current = scriptNode;
    scriptNode.onaudioprocess = (e) => {
      if (!isSpeakingRef.current) return;
      const data = e.inputBuffer.getChannelData(0);
      pcmBufferRef.current.push(new Float32Array(data));
    };

    source.connect(analyser);
    source.connect(scriptNode);
    scriptNode.connect(ctx.destination);

    sessionActiveRef.current = true;
    setSessionActive(true);
    onSessionStart?.();

    // Arm idle timer
    idleTimerRef.current = setTimeout(() => {
      if (sessionActiveRef.current) stopSessionRef.current();
    }, SESSION_IDLE_MS);

    // Energy polling for VAD
    const buf = new Uint8Array(analyser.frequencyBinCount);
    energyIntervalRef.current = setInterval(() => {
      analyser.getByteTimeDomainData(buf);
      const energy = computeRms(buf);
      setEnergyLevel(Math.min(1, energy / ENERGY_THRESHOLD));

      if (energy > ENERGY_THRESHOLD) {
        if (!isSpeakingRef.current) {
          isSpeakingRef.current = true;
          setSpeaking(true);
          onSpeaking?.(true);
          // Cancel silence timer if speech resumed
          if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
          // Cancel idle timer while speaking
          if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
        }
      } else {
        if (isSpeakingRef.current && !silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(onSilenceDetected, VAD_SILENCE_MS);
        }
      }
    }, CHUNK_INTERVAL_MS);
  }, [supported, onError, onSessionStart, onSpeaking, onSilenceDetected]);

  // ── TTS playback ─────────────────────────────────────────────────────────
  const speak = useCallback(async (text: string) => {
    try {
      const res = await fetch(`${VERA_API_BASE}/v1/audio/speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer VERA_DEV_BYPASS',
        },
        body: JSON.stringify({ input: text }),
      });
      if (!res.ok) return;
      const wavBuf = await res.arrayBuffer();
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(wavBuf);
      const src = ctx.createBufferSource();
      src.buffer = decoded;
      src.connect(ctx.destination);
      src.start(0);
      src.onended = () => ctx.close();
    } catch (err) {
      console.warn('[VoiceSession] TTS playback error:', err);
    }
  }, []);

  return { sessionActive, speaking, supported, startSession, stopSession, energyLevel, speak };
}
