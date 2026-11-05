/**
 * useCallWebSocket — manages the live call WebSocket connection and sequential audio queue.
 * Processes events, plays synthesized audio sequentially, and updates the Zustand store.
 */
import { useEffect, useRef, useCallback } from "react";
import { WS_BASE } from "../lib/api";
import { useStore } from "../store";
import type { WSEvent, LiveUtterance } from "../types";

class SequentialAudioQueue {
  private queue: string[] = [];
  private isPlaying = false;
  private currentAudio: HTMLAudioElement | null = null;
  private isMuted = false;

  setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.clear();
    }
  }

  enqueue(audioB64: string) {
    if (this.isMuted) return;
    this.queue.push(audioB64);
    if (!this.isPlaying) {
      this.playNext();
    }
  }

  clear() {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.src = "";
      } catch {}
      this.currentAudio = null;
    }
    this.queue = [];
    this.isPlaying = false;
  }

  private playNext() {
    if (this.queue.length === 0 || this.isMuted) {
      this.isPlaying = false;
      this.currentAudio = null;
      return;
    }

    const nextB64 = this.queue.shift();
    if (!nextB64) {
      this.playNext();
      return;
    }

    try {
      this.isPlaying = true;
      const audio = new Audio("data:audio/wav;base64," + nextB64);
      this.currentAudio = audio;

      audio.onended = () => {
        this.playNext();
      };

      audio.onerror = () => {
        this.playNext();
      };

      audio.play().catch(() => {
        this.playNext();
      });
    } catch {
      this.playNext();
    }
  }
}

const audioQueue = new SequentialAudioQueue();

export function useCallWebSocket(callId: string | null) {
  const ws = useRef<WebSocket | null>(null);
  const {
    appendUtterance,
    setCallStatus,
    setCallEndInfo,
    setIsOnHold,
    addProposal,
    isAudioMuted,
    setEvasionRadar,
  } = useStore();

  useEffect(() => {
    audioQueue.setMuted(isAudioMuted);
  }, [isAudioMuted]);

  const handleEvent = useCallback(
    (event: WSEvent) => {
      switch (event.type) {
        case "call_started":
          audioQueue.clear();
          setCallStatus("active");
          break;

        case "hold_started":
          setIsOnHold(true);
          break;

        case "hold_ended":
          setIsOnHold(false);
          break;

        case "speech_start":
          break;

        case "ivr_speaking": {
          const text = (event.data.text as string) || "";
          const u: LiveUtterance = {
            id: `ivr-${Date.now()}`,
            speaker: "ivr",
            text,
            isFinal: true,
            sequence: Date.now(),
          };
          appendUtterance(u);
          if (event.data.audio_b64) {
            audioQueue.enqueue(event.data.audio_b64 as string);
          } else if (typeof window !== "undefined" && "speechSynthesis" in window && !isAudioMuted && text) {
            try {
              const utter = new SpeechSynthesisUtterance(text);
              utter.rate = 1.0;
              utter.pitch = 1.1;
              window.speechSynthesis.speak(utter);
            } catch {}
          }
          break;
        }

        case "transcript_final": {
          const text = (event.data.text as string) || "";
          const speaker = (event.data.speaker as LiveUtterance["speaker"]) || "user";
          const u: LiveUtterance = {
            id: (event.data.utterance_id as string) || `u-${Date.now()}`,
            speaker,
            text,
            thought_process: (event.data.thought_process as string) || undefined,
            isFinal: true,
            latencyMs: event.data.latency_ms as number | undefined,
            sequence: (event.data.sequence as number) || Date.now(),
          };
          appendUtterance(u);
          if (event.data.audio_b64) {
            audioQueue.enqueue(event.data.audio_b64 as string);
          } else if (typeof window !== "undefined" && "speechSynthesis" in window && !isAudioMuted && text) {
            try {
              const utter = new SpeechSynthesisUtterance(text);
              utter.rate = 1.05;
              utter.pitch = speaker === "agent" ? 1.05 : 0.95;
              window.speechSynthesis.speak(utter);
            } catch {}
          }
          break;
        }

        case "menu_pressed": {
          const label = event.data.label
            ? `Selected: ${event.data.label} (Key ${event.data.key})`
            : `Pressed key: ${event.data.key}`;
          const u: LiveUtterance = {
            id: `menu-${Date.now()}`,
            speaker: "system",
            text: `[IVR] ${label}`,
            isFinal: true,
            sequence: Date.now(),
          };
          appendUtterance(u);
          break;
        }

        case "ringing":
          setCallStatus("ringing");
          break;

        case "call_accepted":
          setCallStatus("active");
          break;

        case "utterance": {
          const raw = (event.data || event) as Record<string, unknown>;
          const text = (raw.text as string) || "";
          const speaker = (raw.speaker as LiveUtterance["speaker"]) || "agent";
          const u: LiveUtterance = {
            id: (raw.id as string) || `u-${Date.now()}`,
            speaker,
            text,
            thought_process: (raw.thought_process as string) || undefined,
            isFinal: Boolean(raw.is_final ?? true),
            latencyMs: raw.latencyMs as number | undefined,
            sequence: Date.now(),
          };
          appendUtterance(u);

          // Audio playback: use synthesized WAV if provided, otherwise browser speech synthesis fallback
          if (raw.audio_b64) {
            audioQueue.enqueue(raw.audio_b64 as string);
          } else if (typeof window !== "undefined" && "speechSynthesis" in window && !isAudioMuted && text) {
            try {
              const utter = new SpeechSynthesisUtterance(text);
              utter.rate = 1.05;
              utter.pitch = speaker === "user" ? 1.0 : 1.1;
              window.speechSynthesis.speak(utter);
            } catch {}
          }
          break;
        }

        case "promise_proposed": {
          const rawEv = event as Record<string, any>;
          const proposal = rawEv.proposal || rawEv.data?.proposal;
          const promiseData = proposal?.promise_data || proposal;
          if (promiseData) {
            addProposal({
              promise_data: promiseData as never,
              needs_date_confirmation: Boolean(proposal?.needs_date_confirmation),
            });
          }
          break;
        }

        case "evasion_radar": {
          const rawEv = event as Record<string, any>;
          const d = rawEv.data || rawEv;
          if (d) {
            setEvasionRadar(d);
          }
          break;
        }

        case "radar_update": {
          const rawEv = event as Record<string, any>;
          const d = rawEv.data || rawEv;
          const u: LiveUtterance = {
            id: `radar-${Date.now()}`,
            speaker: "system",
            text: `⚠️ [RADAR ALERT] ${d.title || "Refusal Detected"}: ${d.detail || ""}`,
            isFinal: true,
            sequence: Date.now(),
          };
          appendUtterance(u);
          break;
        }

        case "call_ended": {
          const rawEv = (event.data || event) as Record<string, any>;
          setCallStatus("ended");
          setCallEndInfo({
            hasConclusion: Boolean(rawEv.has_conclusion),
            reason: (rawEv.reason as string) || "Call ended without reaching a confirmed resolution.",
          });
          break;
        }

        case "error":
          setCallStatus("error");
          break;

        case "ping":
          ws.current?.send(JSON.stringify({ type: "pong" }));
          break;
      }
    },
    [appendUtterance, setCallStatus, setIsOnHold, addProposal]
  );

  useEffect(() => {
    if (!callId) return;

    const url = `${WS_BASE}/ws/calls/${callId}`;
    const socket = new WebSocket(url);
    ws.current = socket;

    socket.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as WSEvent;
        handleEvent(event);
      } catch {
        // ignore malformed messages
      }
    };

    socket.onclose = () => {
      ws.current = null;
    };

    socket.onerror = (e) => {
      console.error("WebSocket error", e);
    };

    return () => {
      socket.close();
      ws.current = null;
      audioQueue.clear();
    };
  }, [callId, handleEvent]);

  return ws;
}
