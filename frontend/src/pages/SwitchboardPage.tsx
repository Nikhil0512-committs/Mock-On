/**
 * Company Support Desk Switchboard — Admin Console.
 * Allows teammates/admins to answer live incoming consumer calls, speak with
 * the AI Advocate, negotiate resolution, and issue real commitments in real time.
 */
import { useEffect, useState, useRef } from "react";
import {
  Headphones,
  PhoneCall,
  PhoneOff,
  PhoneForwarded,
  CheckCircle2,
  Clock,
  Send,
  Building2,
  Sparkles,
  MessageSquare,
  Mic,
  MicOff,
  XCircle,
} from "lucide-react";
import { callsApi, WS_BASE, type SwitchboardPendingItem } from "../lib/api";
import { useStore } from "../store";
import type { LiveUtterance } from "../types";

export function deduplicateConsecutivePhrases(text: string): string {
  if (!text) return "";
  let trimmed = text.trim();

  // 1. Detect if the text repeatedly restarts with its own opening phrase (speech-recognition buffer accumulation)
  const initialWords = trimmed.split(/\s+/);
  if (initialWords.length >= 8) {
    for (let win = Math.min(12, Math.floor(initialWords.length / 2)); win >= 4; win--) {
      const prefix = initialWords.slice(0, win).map((w) => w.toLowerCase()).join(" ");
      const matches: number[] = [];
      for (let i = 0; i <= initialWords.length - win; i++) {
        const sub = initialWords.slice(i, i + win).map((w) => w.toLowerCase()).join(" ");
        if (sub === prefix) {
          matches.push(i);
        }
      }
      if (matches.length > 1) {
        const lastIdx = matches[matches.length - 1];
        trimmed = initialWords.slice(lastIdx).join(" ");
        break;
      }
    }
  }

  // 2. Strip identical repeated chunks of length 8 to 250 characters
  trimmed = trimmed.replace(/\b(.{8,250}?)\s+(?:\1\b\s*)+/gi, "$1 ");

  let words = trimmed.trim().split(/\s+/);
  if (words.length < 2) return trimmed;

  const maxWindow = Math.min(Math.floor(words.length / 2), 60);
  for (let pass = 0; pass < 3; pass++) {
    for (let window = maxWindow; window >= 1; window--) {
      const cleaned: string[] = [];
      let i = 0;
      while (i < words.length) {
        if (i + window * 2 <= words.length) {
          const p1 = words.slice(i, i + window).map((w) => w.toLowerCase()).join(" ");
          const p2 = words.slice(i + window, i + window * 2).map((w) => w.toLowerCase()).join(" ");
          if (p1 === p2) {
            cleaned.push(...words.slice(i, i + window));
            i += window * 2;
            while (
              i + window <= words.length &&
              words.slice(i, i + window).map((w) => w.toLowerCase()).join(" ") === p1
            ) {
              i += window;
            }
            continue;
          }
        }
        cleaned.push(words[i]);
        i++;
      }
      words = cleaned;
    }
  }

  return words.join(" ").trim();
}

class SequentialAudioQueue {
  private queue: string[] = [];
  public isPlaying = false;
  private currentAudio: HTMLAudioElement | null = null;
  private playTimeout: any = null;
  public onStateChange: ((playing: boolean) => void) | null = null;

  enqueue(audioB64: string) {
    this.queue.push(audioB64);
    if (!this.isPlaying) {
      this.playNext();
    }
  }

  clear() {
    if (this.playTimeout) {
      clearTimeout(this.playTimeout);
      this.playTimeout = null;
    }
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.src = "";
      } catch {}
      this.currentAudio = null;
    }
    this.queue = [];
    this.isPlaying = false;
    this.onStateChange?.(false);
  }

  private playNext() {
    if (this.playTimeout) {
      clearTimeout(this.playTimeout);
      this.playTimeout = null;
    }

    if (this.queue.length === 0) {
      this.isPlaying = false;
      this.currentAudio = null;
      this.onStateChange?.(false);
      return;
    }

    const nextB64 = this.queue.shift();
    if (!nextB64) {
      this.playNext();
      return;
    }

    try {
      this.isPlaying = true;
      this.onStateChange?.(true);
      const audio = new Audio("data:audio/wav;base64," + nextB64);
      this.currentAudio = audio;

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (this.playTimeout) {
          clearTimeout(this.playTimeout);
          this.playTimeout = null;
        }
        this.playNext();
      };

      audio.onended = finish;
      audio.onerror = finish;

      // 8-second safety watchdog so queue never freezes playback state
      this.playTimeout = setTimeout(finish, 8000);

      audio.play().catch((err) => {
        console.warn("Audio playback interrupted or blocked:", err);
        finish();
      });
    } catch {
      this.playNext();
    }
  }
}

const switchboardAudioQueue = new SequentialAudioQueue();

export default function SwitchboardPage() {
  const { currentUser } = useStore();
  const [pendingCalls, setPendingCalls] = useState<SwitchboardPendingItem[]>([]);
  const [activeCallItem, setActiveCallItem] = useState<SwitchboardPendingItem | null>(null);
  const operatorName = currentUser?.full_name || "Tata / Airtel Support Specialist";
  const [transcript, setTranscript] = useState<LiveUtterance[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [sending, setSending] = useState(false);
  const [lastPromise, setLastPromise] = useState<any | null>(null);
  const [refusalDetected, setRefusalDetected] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [autoSendVoice, setAutoSendVoice] = useState(true);
  const [speechLang, setSpeechLang] = useState<"hi-IN" | "en-IN">("hi-IN");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isAdvocateSpeaking, setIsAdvocateSpeaking] = useState(false);
  const silenceTimerRef = useRef<any>(null);
  const restartTimeoutRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const accumulatedTurnTextRef = useRef<string>("");
  const lastSentTextRef = useRef<string>("");
  const lastSentTimeRef = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);
  const transcriptBottomRef = useRef<HTMLDivElement>(null);

  // Sync with audio queue state to mute microphone input while AI advocate speaks
  useEffect(() => {
    switchboardAudioQueue.onStateChange = (playing) => {
      setIsAdvocateSpeaking(playing);
      if (playing) {
        // AI advocate audio is outputting through speakers:
        // Teardown speech recognition immediately so the mic does not pick up speaker audio
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
        if (recognitionRef.current) {
          try {
            recognitionRef.current.onresult = null;
            recognitionRef.current.onerror = null;
            recognitionRef.current.onend = null;
            recognitionRef.current.stop();
          } catch (_) {}
          recognitionRef.current = null;
        }
        setIsSpeaking(false);
        accumulatedTurnTextRef.current = "";
      } else {
        // Advocate finished speaking: wait 400ms for room echo to decay, then restart mic if enabled
        if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = setTimeout(() => {
          if (isListeningRef.current && !switchboardAudioQueue.isPlaying) {
            accumulatedTurnTextRef.current = "";
            startRecognition();
          }
        }, 400);
      }
    };
    return () => {
      switchboardAudioQueue.onStateChange = null;
    };
  }, [speechLang]);

  const startRecognition = () => {
    if (switchboardAudioQueue.isPlaying) return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    // Teardown any existing instance first to guarantee only ONE listener is active
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch (_) {}
      recognitionRef.current = null;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = speechLang;

      recognition.onresult = (event: any) => {
        // Echo cancellation: if AI Advocate is speaking through speakers, ignore
        if (switchboardAudioQueue.isPlaying) {
          return;
        }

        let finalTranscript = "";
        let interimTranscript = "";
        for (let i = 0; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) {
            finalTranscript += (finalTranscript ? " " : "") + res[0].transcript.trim();
          } else {
            interimTranscript += res[0].transcript;
          }
        }

        const rawCombined = (finalTranscript + " " + interimTranscript).trim();
        const clean = deduplicateConsecutivePhrases(rawCombined);

        if (clean) {
          setMessageInput(clean);
          setIsSpeaking(true);
        }

        // Auto-send debounce after 950ms of natural silence
        if (autoSendVoice && clean.length >= 2) {
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            setIsSpeaking(false);
            const toSend = clean.trim();
            if (toSend.length >= 2) {
              accumulatedTurnTextRef.current = "";
              setMessageInput("");

              // Teardown recognition briefly so Chrome resets its speech buffer
              if (recognitionRef.current) {
                try {
                  recognitionRef.current.onresult = null;
                  recognitionRef.current.onerror = null;
                  recognitionRef.current.onend = null;
                  recognitionRef.current.stop();
                } catch (_) {}
                recognitionRef.current = null;
              }

              handleSendMessage(toSend);

              // Immediately schedule recognition restart after short buffer flush delay
              if (isListeningRef.current && !switchboardAudioQueue.isPlaying) {
                if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
                restartTimeoutRef.current = setTimeout(() => {
                  if (isListeningRef.current && !switchboardAudioQueue.isPlaying) {
                    startRecognition();
                  }
                }, 350);
              }
            }
          }, 950);
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error === "no-speech" || event.error === "aborted") {
          return;
        }
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          setIsListening(false);
          isListeningRef.current = false;
          setIsSpeaking(false);
          alert("Microphone permission was denied. Please allow microphone access in your browser settings.");
          return;
        }
        if (isListeningRef.current && !switchboardAudioQueue.isPlaying) {
          if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
          restartTimeoutRef.current = setTimeout(() => {
            if (isListeningRef.current && !switchboardAudioQueue.isPlaying) startRecognition();
          }, 300);
        }
      };

      recognition.onend = () => {
        setIsSpeaking(false);
        // On natural end (browser silence timeout), restart cleanly
        if (isListeningRef.current && !switchboardAudioQueue.isPlaying) {
          if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
          restartTimeoutRef.current = setTimeout(() => {
            if (isListeningRef.current && !switchboardAudioQueue.isPlaying) {
              accumulatedTurnTextRef.current = "";
              startRecognition();
            }
          }, 350);
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (e) {
      console.warn("Recognition start failed:", e);
      setIsListening(false);
      isListeningRef.current = false;
      setIsSpeaking(false);
    }
  };

  const toggleMic = () => {
    if (isListening) {
      isListeningRef.current = false;
      setIsListening(false);
      setIsSpeaking(false);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);

      const pending = (messageInput || accumulatedTurnTextRef.current).trim();
      if (pending) {
        handleSendMessage(pending);
      }

      if (recognitionRef.current) {
        try {
          recognitionRef.current.onresult = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.stop();
        } catch (_) {}
        recognitionRef.current = null;
      }
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Microphone voice recognition is supported on Chrome, Edge, and modern Chromium browsers.");
      return;
    }

    isListeningRef.current = true;
    setIsListening(true);
    accumulatedTurnTextRef.current = "";
    startRecognition();
  };

  // Poll for queued/active calls every 3 seconds
  const fetchPending = async () => {
    try {
      const items = await callsApi.getSwitchboardPending();
      setPendingCalls(items);
      // Auto-attach if we are already in an active call and need state sync
      if (activeCallItem) {
        const fresh = items.find((it) => it.call.id === activeCallItem.call.id);
        if (fresh) {
          setActiveCallItem(fresh);
        }
      }
    } catch (e) {
      // ignore network errors during poll
    }
  };

  useEffect(() => {
    fetchPending();
    const interval = setInterval(fetchPending, 3000);
    return () => clearInterval(interval);
  }, [activeCallItem?.call.id]);

  // Connect to the WebSocket when an active call is selected, with auto-reconnect
  useEffect(() => {
    if (!activeCallItem) return;

    const callId = activeCallItem.call.id;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;

    const connect = () => {
      if (destroyed) return;
      ws = new WebSocket(`${WS_BASE}/ws/calls/${callId}`);
      wsRef.current = ws;

      ws.onopen = () => {
        // Connection established — clear any pending reconnect timer
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          // Keepalive: respond to server pings so the 30s timeout doesn't drop us
          if (msg.type === "ping") {
            ws?.send(JSON.stringify({ type: "pong" }));
            return;
          }

          if (msg.type === "utterance") {
            const raw = msg.data || msg;
            const text = (raw.text || "").trim();
            const speaker = raw.speaker || "agent";
            if (!text) return;

            setTranscript((prev) => {
              const last = prev[prev.length - 1];
              // Deduplicate identical consecutive utterance from the SAME speaker
              if (last && last.speaker === speaker && last.text.trim().toLowerCase() === text.toLowerCase()) {
                return prev;
              }
              // Deduplicate by ID
              if (raw.id && prev.some((u) => u.id === raw.id)) {
                return prev;
              }
              // If operator message arrived from server and matches an optimistic temp message, update its ID
              if (speaker === "agent" && last && last.speaker === "agent" && last.id.startsWith("op-") && last.text.trim().toLowerCase() === text.toLowerCase()) {
                const updated = [...prev];
                updated[updated.length - 1] = { ...last, id: raw.id || last.id };
                return updated;
              }

              return [
                ...prev,
                {
                  id: raw.id || `u-${Date.now()}`,
                  speaker,
                  text,
                  thought_process: raw.thought_process,
                  isFinal: true,
                  latencyMs: raw.latencyMs,
                  sequence: Date.now(),
                },
              ];
            });

            // Audio voice output: play Advocate AI speech out loud for the representative!
            // If audio_b64 is present on the utterance event itself, play it directly.
            // If null (text-first fast path), the audio arrives separately via audio_patch — do NOT
            // fall back to browser TTS here or we'll get double audio when the patch arrives.
            if (speaker === "user" && text && raw.audio_b64) {
              switchboardAudioQueue.enqueue(raw.audio_b64 as string);
            }
          } else if (msg.type === "audio_patch") {
            // TTS audio for the advocate utterance arrives here.
            // If Shivani's text utterance was somehow missed or delayed, append it now so text is NEVER missing when audio plays!
            const patchId = msg.utterance_id;
            const patchText = msg.text;
            if (patchText) {
              setTranscript((prev) => {
                if (patchId && prev.some((u) => u.id === patchId)) return prev;
                const last = prev[prev.length - 1];
                if (last && last.speaker === "user" && last.text.trim().toLowerCase() === patchText.trim().toLowerCase()) {
                  return prev;
                }
                return [
                  ...prev,
                  {
                    id: patchId || `u-${Date.now()}`,
                    speaker: "user",
                    text: patchText,
                    thought_process: msg.thought_process,
                    isFinal: true,
                    sequence: Date.now(),
                  },
                ];
              });
            }

            if (msg.audio_b64) {
              switchboardAudioQueue.enqueue(msg.audio_b64 as string);
            }
          } else if (msg.type === "promise_proposed") {
            const prop = msg.proposal?.promise_data || msg.proposal;
            setLastPromise(prop);
          } else if (msg.type === "radar_update") {
            if (msg.data?.status === "refused") {
              setRefusalDetected(msg.data?.detail || "Representative refused settlement");
            }
          } else if (msg.type === "call_ended") {
            switchboardAudioQueue.clear();
            setActiveCallItem(null);
          }
        } catch (err) {
          console.error("WS parse error:", err);
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        // Auto-reconnect after 1.5s if the call is still active and not destroyed
        if (!destroyed && activeCallItem) {
          reconnectTimer = setTimeout(connect, 1500);
        }
      };

      ws.onerror = () => {
        // onerror is always followed by onclose; reconnect handled there
        ws?.close();
      };
    };

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
      wsRef.current = null;
      switchboardAudioQueue.clear();
    };
  }, [activeCallItem?.call.id]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const handleAcceptCall = async (item: SwitchboardPendingItem) => {
    try {
      // Unlock browser audio context on user gesture
      try {
        const dummy = new Audio();
        dummy.play().catch(() => {});
      } catch {}

      switchboardAudioQueue.clear();
      lastSentTextRef.current = "";
      await callsApi.acceptCall(item.call.id, operatorName);
      setActiveCallItem({
        ...item,
        call: { ...item.call, status: "active" },
      });
      try {
        const existing = await callsApi.getUtterances(item.call.id);
        setTranscript(existing || []);
      } catch {
        setTranscript([]);
      }
      setLastPromise(null);
      setRefusalDetected(null);
      fetchPending();
    } catch (err) {
      alert("Could not answer call. It may have already concluded.");
    }
  };

  const handleSendMessage = async (customText?: string) => {
    const raw = (customText || messageInput).trim();
    if (!raw || !activeCallItem) return;

    const textToSend = deduplicateConsecutivePhrases(raw);
    if (!textToSend) return;

    // Production-level deduplication: prevent identical submissions within 1.0 second
    const now = Date.now();
    if (
      textToSend.toLowerCase() === lastSentTextRef.current.toLowerCase() &&
      now - lastSentTimeRef.current < 1000
    ) {
      return;
    }
    lastSentTextRef.current = textToSend;
    lastSentTimeRef.current = now;

    // Reset input state and accumulated buffers IMMEDIATELY to prevent repetition
    setMessageInput("");
    accumulatedTurnTextRef.current = "";
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

    // Optimistically append operator's message with temporary ID so it renders with 0 latency
    const tempOpId = `op-${Date.now()}`;
    setTranscript((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.speaker === "agent" && last.text.trim().toLowerCase() === textToSend.toLowerCase()) {
        return prev;
      }
      return [
        ...prev,
        {
          id: tempOpId,
          speaker: "agent",
          text: textToSend,
          isFinal: true,
          sequence: Date.now(),
        },
      ];
    });

    // Stop current recognition cleanly so Chrome resets its internal buffer for next turn
    if (recognitionRef.current && isListeningRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_) {}
    }

    setSending(true);
    try {
      const res = await callsApi.sendCallMessage(activeCallItem.call.id, {
        speaker: "agent",
        text: textToSend,
        auto_advocate_reply: true,
      });
      if (res.promise_detected) {
        // Will also be received over WS
      }
    } catch (err) {
      console.error("Failed to send message over call:", err);
      alert("Failed to deliver message over call. Please retry.");
    } finally {
      setSending(false);
    }
  };

  const handleEndCall = async () => {
    if (!activeCallItem) return;
    try {
      await callsApi.end(activeCallItem.call.id);
      setActiveCallItem(null);
      fetchPending();
    } catch (err) {
      // ignore
    }
  };

  const ringingCalls = pendingCalls.filter((p) => p.call.status === "ringing");

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5 sm:space-y-6 animate-fade-in">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-3xl bg-[#0e1628]/90 border border-white/[0.1] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 via-amber-500 to-brand-500" />
        <div className="flex items-center gap-3.5">
          <div className="w-11 sm:w-12 h-11 sm:h-12 rounded-2xl bg-gradient-to-br from-rose-600 to-amber-600 p-0.5 shadow-lg shadow-rose-500/20 flex-shrink-0">
            <div className="w-full h-full bg-[#0e1628] rounded-[14px] flex items-center justify-center">
              <Headphones className="w-5 sm:w-6 h-5 sm:h-6 text-rose-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Company Support Desk Switchboard
              </h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                Admin Console
              </span>
            </div>
            <p className="text-xs text-white/50 mt-0.5">
              Answer live consumer disputes, converse with the AI personal assistant, and negotiate resolutions.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="text-[10px] text-white/40 block">Signed in Operator</span>
            <span className="text-xs font-mono font-bold text-emerald-400">
              {currentUser?.email || "admin@mockon.ai (Demo Operator)"}
            </span>
          </div>
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" title="Switchboard Online" />
        </div>
      </div>

      {/* Main Grid: Left = Call Queue, Right = Active Call Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (5 Cols): Incoming / Ringing Queue */}
        <div className="lg:col-span-5 space-y-4 order-2 lg:order-1">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-white/80 flex items-center gap-2">
              <PhoneForwarded className="w-4 h-4 text-rose-400" />
              <span>Incoming Queue ({ringingCalls.length})</span>
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  if (confirm("Clear all stale and pending calls from the queue?")) {
                    await callsApi.clearSwitchboardQueue();
                    fetchPending();
                  }
                }}
                className="text-xs text-white/40 hover:text-rose-400 transition-colors"
                title="Dismiss and clear all calls in queue"
              >
                Clear Queue
              </button>
              <span className="text-white/20">&bull;</span>
              <button
                onClick={fetchPending}
                className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>

          {ringingCalls.length === 0 ? (
            <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.08] text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto text-white/30">
                <Clock className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-white/70">Switchboard Standby</p>
              <p className="text-xs text-white/40 max-w-xs mx-auto leading-relaxed">
                Waiting for incoming consumer disputes. Go to <span className="text-brand-300 font-mono">/intake</span> in another window or tab and dispatch a call using "Live Company Operator".
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {ringingCalls.map((item) => {
                const info = (item.case.approved_info as Record<string, any>) || {};
                const provider = info.service_provider || "Service Provider";
                const amount = info.disputed_amount || "1,000";
                const acc = info.identifier_value || info.phone_number || "Reference";
                const isFollowUp = !!info.is_follow_up || (item.case.goal || "").toUpperCase().includes("OVERDUE");

                return (
                  <div
                    key={item.call.id}
                    className={`p-5 rounded-2xl bg-gradient-to-br from-rose-950/40 via-[#11192e] to-black/60 border-2 ${
                      isFollowUp ? "border-rose-400 shadow-rose-900/60" : "border-rose-500/60 shadow-rose-950/50"
                    } shadow-xl space-y-3 relative overflow-hidden animate-pulse`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                        <span className="text-xs font-extrabold text-rose-300 uppercase tracking-wider">
                          {isFollowUp ? "OVERDUE FOLLOW-UP • RINGING" : "INCOMING CALL • RINGING"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {isFollowUp && (
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-rose-500/25 text-rose-300 border border-rose-500/40">
                            Deadline Passed
                          </span>
                        )}
                        <span className="text-xs font-mono font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30">
                          ₹{amount}
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="text-base font-bold text-white flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-brand-400" />
                        <span>{provider}</span>
                      </div>
                      <div className="text-xs text-white/50 font-mono mt-0.5">
                        Docket Account: #{acc}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-black/40 border border-white/[0.06] text-xs text-white/70 italic line-clamp-2">
                      "{item.case.goal}"
                    </div>

                    <button
                      onClick={() => handleAcceptCall(item)}
                      className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition-all"
                    >
                      <PhoneCall className="w-4 h-4" />
                      Answer &amp; Connect Call
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Quick Demo Help */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-2 text-xs">
            <div className="font-bold text-white/80 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              How Live Teammate Demo Works:
            </div>
            <ol className="list-decimal pl-4 space-y-1 text-white/50 leading-relaxed">
              <li>Open Mock-On in two browser windows or tabs.</li>
              <li>In Window 1, submit an intake grievance and select <b>"Live Company Operator (Switchboard)"</b>.</li>
              <li>In Window 2 (this Switchboard), the incoming call rings immediately.</li>
              <li>Click <b>"Answer &amp; Connect Call"</b> to converse live with AI Personal Assistant and negotiate the refund.</li>
            </ol>
          </div>
        </div>

        {/* Right Column (7 Cols): Live Support Desk Console */}
        <div className="lg:col-span-7 space-y-4 order-1 lg:order-2">
          {activeCallItem ? (
            <div className="rounded-3xl bg-[#0b1222] border border-white/[0.12] shadow-2xl flex flex-col h-[580px] sm:h-[650px] overflow-hidden">
              {/* Active Call Header */}
              <div className="p-3.5 sm:p-4 border-b border-white/[0.08] bg-[#0e1628] flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
                    <div className="absolute inset-0 w-3 h-3 rounded-full bg-emerald-400" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <span>LIVE WITH CONSUMER AI PERSONAL ASSISTANT</span>
                      {((activeCallItem.case.approved_info as any)?.is_follow_up || (activeCallItem.case.goal || "").includes("OVERDUE")) && (
                        <span className="text-[9.5px] px-2 py-0.5 rounded-full bg-rose-500/25 text-rose-300 border border-rose-500/40 font-bold uppercase">
                          Overdue Follow-Up
                        </span>
                      )}
                      <span className="text-[10px] text-emerald-400 font-mono">
                        #{activeCallItem.call.id.slice(0, 8)}
                      </span>
                    </div>
                    <div className="text-[11px] text-white/50 flex items-center gap-1.5 flex-wrap">
                      <span>Dispute: {(activeCallItem.case.approved_info as any)?.service_provider} &bull; ₹{(activeCallItem.case.approved_info as any)?.disputed_amount}</span>
                      {Boolean((activeCallItem.case.approved_info as any)?.helpline_number) && (
                        <>
                          <span className="text-white/20">&bull;</span>
                          <span className="text-amber-300 font-mono text-[10.5px]">Helpline: {(activeCallItem.case.approved_info as any)?.helpline_number}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleEndCall}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold flex items-center gap-1.5 transition-all"
                >
                  <PhoneOff className="w-3.5 h-3.5" />
                  End Call
                </button>
              </div>

              {/* Detected Promise Alert Banner if detected */}
              {lastPromise && (
                <div className="p-3 bg-amber-500/10 border-b border-amber-500/30 flex items-center justify-between px-4 animate-slide-up">
                  <div className="flex items-center gap-2 text-xs text-amber-300 font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>
                      Promise Extracted: {lastPromise.summary || "Full Refund"} (₹{lastPromise.amount})
                    </span>
                  </div>
                  <span className="text-[10px] text-amber-400 font-mono bg-amber-500/20 px-2 py-0.5 rounded-full">
                    Sarvam 105B Verified
                  </span>
                </div>
              )}

              {/* Refusal Detected Banner if representative refused */}
              {refusalDetected && (
                <div className="p-3 bg-rose-500/10 border-b border-rose-500/30 flex items-center justify-between px-4 animate-slide-up">
                  <div className="flex items-center gap-2 text-xs text-rose-300 font-semibold">
                    <XCircle className="w-4 h-4 text-rose-400" />
                    <span>
                      Refusal Recorded: Zero Promises Extracted &bull; AI Personal Assistant Notified for Ombudsman Escalation
                    </span>
                  </div>
                  <span className="text-[10px] text-rose-400 font-mono bg-rose-500/20 px-2 py-0.5 rounded-full">
                    Anti-Hallucination Active
                  </span>
                </div>
              )}

              {/* Live Transcript Stream */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-black/20">
                {transcript.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-white/40 space-y-2">
                    <MessageSquare className="w-8 h-8 opacity-40 text-emerald-400" />
                    <p className="text-xs max-w-sm">
                      Call connected. As the company representative, speak via <b>Voice Mic</b> or click an <b>Opening Greeting</b> below to start the live conversation.
                    </p>
                  </div>
                ) : (
                  transcript.map((u) => {
                    const isOperator = u.speaker === "agent";
                    return (
                      <div
                        key={u.id}
                        className={`flex flex-col ${isOperator ? "items-end" : "items-start"}`}
                      >
                        <div className="flex items-center gap-1.5 mb-1 px-1">
                          <span
                            className={`text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                              isOperator
                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                : "bg-brand-500/20 text-brand-300 border border-brand-500/30"
                            }`}
                          >
                            {isOperator ? "YOU (COMPANY REPRESENTATIVE)" : "MOCK-ON AI PERSONAL ASSISTANT (SHIVANI)"}
                          </span>
                        </div>
                        <div
                          className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                            isOperator
                              ? "bg-rose-600/20 border border-rose-500/30 text-white rounded-tr-none"
                              : "bg-[#141b2c] border border-white/[0.1] text-white/90 rounded-tl-none shadow-md"
                          }`}
                        >
                          {u.text}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={transcriptBottomRef} />
              </div>

              {/* Quick Commitment Actions & Representative Responses */}
              <div className="p-3.5 border-t border-white/[0.08] bg-[#0e1628]/95 space-y-3">
                {/* 1. Opening Greetings (Rep speaks first) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-white/60">
                    <span className="font-semibold flex items-center gap-1.5 text-emerald-400">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      1. Opening Greetings (Rep speaks first):
                    </span>
                    <span className="text-[10px] text-white/40">Starts 2-way call &amp; asks language</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() =>
                        handleSendMessage(
                          `${(activeCallItem.case.approved_info as any)?.service_provider || "Tata Power"} customer support mein aapka swagat hai. Aap kis bhasha mein baat karna chahenge, aur main aapki kya sahayata kar sakta hoon?`
                        )
                      }
                      disabled={sending}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-[11px] text-emerald-300 transition-all font-medium flex items-center gap-1.5"
                    >
                      <span>🙏</span>
                      <span>Hindi / Hinglish Greeting</span>
                    </button>
                    <button
                      onClick={() =>
                        handleSendMessage(
                          `Thank you for calling ${(activeCallItem.case.approved_info as any)?.service_provider || "Tata Power"} customer support. Which language do you prefer to speak in, and how can I help you today?`
                        )
                      }
                      disabled={sending}
                      className="px-3 py-1.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-[11px] text-blue-300 transition-all font-medium flex items-center gap-1.5"
                    >
                      <span>👋</span>
                      <span>English Greeting</span>
                    </button>
                  </div>
                </div>

                {/* 2. Step-by-Step Questions (Rep asks, AI responds without blabbering) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-white/60">
                    <span className="font-semibold flex items-center gap-1.5 text-amber-400">
                      <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                      2. Step-by-Step Dialogue (Ask specific questions):
                    </span>
                    <span className="text-[10px] text-white/40">AI assistant answers specifically as asked</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() =>
                        handleSendMessage(
                          "Kripya apna consumer account ya CA number batayein?"
                        )
                      }
                      disabled={sending}
                      className="px-2.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[11px] text-white/80 transition-all font-medium"
                    >
                      🔢 Ask CA Number
                    </button>
                    <button
                      onClick={() =>
                        handleSendMessage(
                          "Aapke bill mein kya dikkat ya problem aa rahi hai, kripya explain karein?"
                        )
                      }
                      disabled={sending}
                      className="px-2.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[11px] text-white/80 transition-all font-medium"
                    >
                      ❓ Ask Problem Details
                    </button>
                    <button
                      onClick={() =>
                        handleSendMessage(
                          "Have you got the consent from your owner?"
                        )
                      }
                      disabled={sending}
                      className="px-2.5 py-1.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/40 text-[11px] text-purple-200 transition-all font-semibold flex items-center gap-1"
                      title="Tests Shivani's legal authorization & owner biometric consent"
                    >
                      🛡️ Ask: "Have you got consent from your owner?"
                    </button>
                    <button
                      onClick={() =>
                        handleSendMessage(
                          "Disputed bill ka amount kitna hai?"
                        )
                      }
                      disabled={sending}
                      className="px-2.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[11px] text-white/80 transition-all font-medium"
                    >
                      💰 Ask Disputed Amount
                    </button>
                    <button
                      onClick={() =>
                        handleSendMessage(
                          "Ma'am, we are looking into it, please wait."
                        )
                      }
                      disabled={sending}
                      className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-[11px] text-amber-300 transition-all font-semibold shadow-sm flex items-center gap-1.5"
                      title="Triggers Evasion Radar Stall detection"
                    >
                      ⏱️ Stall: "Ma'am, we are looking into it, please wait."
                    </button>
                    <button
                      onClick={() =>
                        handleSendMessage(
                          "Ticket four eight two one. Paanch working days mein ₹four hundred twenty-two refund ho jayega."
                        )
                      }
                      disabled={sending}
                      className="px-2.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-[11px] text-emerald-300 transition-all font-semibold shadow-sm flex items-center gap-1.5"
                      title="Triggers statutory commitment extraction and confirmation"
                    >
                      ✅ Commit: "Ticket 4821, ₹422 in 5 days"
                    </button>
                    <button
                      onClick={() =>
                        handleSendMessage(
                          "Sir/Ma'am, we cannot refund cash to your account. Instead, we can credit a ₹500 discount coupon to your wallet for next month's recharge."
                        )
                      }
                      disabled={sending}
                      className="px-2.5 py-1.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-[11px] text-purple-300 transition-all font-medium"
                    >
                      🎁 Coupon Diversion
                    </button>
                    <button
                      onClick={() =>
                        handleSendMessage(
                          "Under company billing policy, provisional reading adjustments cannot be approved without a paid inspection fee. We cannot refund or adjust this charge."
                        )
                      }
                      disabled={sending}
                      className="px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-[11px] text-rose-300 transition-all font-medium"
                    >
                      ❌ Refuse Refund (Policy Denial)
                    </button>
                  </div>
                </div>

                {/* Live Mic Listening Visual Wave Bar */}
                {isListening && (
                  <div className={`flex items-center justify-between px-3.5 py-2 rounded-2xl border text-[11px] animate-fade-in transition-all ${
                    isAdvocateSpeaking
                      ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300"
                      : isSpeaking
                      ? "bg-rose-500/15 border-rose-500/40 text-rose-200 ring-2 ring-rose-500/20"
                      : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                  }`}>
                    <div className="flex items-center gap-2.5">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isAdvocateSpeaking ? "bg-indigo-400" : "bg-rose-400"}`}></span>
                        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isAdvocateSpeaking ? "bg-indigo-500" : "bg-rose-500"}`}></span>
                      </span>
                      <span className="font-semibold">
                        {isAdvocateSpeaking
                          ? "AI Personal Assistant is speaking... (Mic paused to prevent echo)"
                          : isSpeaking
                          ? "Voice detected — capturing speech cleanly..."
                          : "Continuous Mic Active — Speak naturally as operator"}
                      </span>
                      {!isAdvocateSpeaking && (
                        <div className="flex items-end gap-0.5 h-3.5 ml-1">
                          <span className={`w-0.5 bg-rose-400 rounded-full transition-all duration-150 ${isSpeaking ? "h-3 animate-pulse" : "h-1"}`} />
                          <span className={`w-0.5 bg-rose-400 rounded-full transition-all duration-150 ${isSpeaking ? "h-3.5 animate-bounce" : "h-1.5"}`} />
                          <span className={`w-0.5 bg-rose-400 rounded-full transition-all duration-150 ${isSpeaking ? "h-2 animate-pulse" : "h-1"}`} />
                          <span className={`w-0.5 bg-rose-400 rounded-full transition-all duration-150 ${isSpeaking ? "h-3.5 animate-bounce" : "h-1.5"}`} />
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-white/50 hidden sm:inline">
                      {autoSendVoice ? "Auto-dispatches on 1.2s pause · Or press Enter" : "Press Enter or Send when finished"}
                    </span>
                  </div>
                )}

                {/* Custom Message Input with Voice Mic */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex items-center gap-2 pt-1"
                >
                  <button
                    type="button"
                    onClick={toggleMic}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 ${
                      isListening
                        ? "bg-rose-600 text-white border-rose-500 animate-pulse ring-4 ring-rose-500/30"
                        : "bg-white/[0.04] text-white/70 hover:text-white border-white/[0.1] hover:bg-white/[0.08]"
                    }`}
                    title={isListening ? "Listening... click to stop & send" : "Speak representative response with microphone"}
                  >
                    {isListening ? (
                      <>
                        <MicOff className="w-4 h-4 text-white" />
                        <span className="text-[11px] hidden sm:inline">Listening...</span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-4 h-4 text-rose-400" />
                        <span className="text-[11px] hidden sm:inline">Voice Mic</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setAutoSendVoice(!autoSendVoice)}
                    className={`px-2 py-2 rounded-xl text-[10px] font-bold border transition-all ${
                      autoSendVoice
                        ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                        : "bg-white/[0.04] border-white/[0.08] text-white/40"
                    }`}
                    title="When enabled, your spoken words are automatically sent when you stop speaking"
                  >
                    {autoSendVoice ? "Auto-Send On" : "Manual"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const next = speechLang === "hi-IN" ? "en-IN" : "hi-IN";
                      setSpeechLang(next);
                      if (recognitionRef.current) {
                        try {
                          recognitionRef.current.lang = next;
                        } catch {}
                      }
                    }}
                    className={`px-2 py-2 rounded-xl text-[10px] font-bold border transition-all ${
                      speechLang === "hi-IN"
                        ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                        : "bg-blue-500/15 border-blue-500/30 text-blue-300"
                    }`}
                    title="Toggle voice recognition language for representative speech"
                  >
                    {speechLang === "hi-IN" ? "🇮🇳 हिन्दी / Hinglish" : "🌐 English"}
                  </button>

                  <input
                    type="text"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder={
                      isListening
                        ? "Listening to representative voice... Speak now"
                        : "Type representative response or speak to AI personal assistant..."
                    }
                    disabled={sending}
                    className="flex-1 input py-2.5 text-xs bg-black/40 border-white/[0.1] rounded-xl focus:border-rose-500/60"
                  />
                  <button
                    type="submit"
                    disabled={sending || !messageInput.trim()}
                    className="btn-primary py-2.5 px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 shadow-md shadow-rose-600/30"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="h-[650px] rounded-3xl bg-white/[0.02] border border-white/[0.08] flex flex-col items-center justify-center text-center p-8 space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                <Headphones className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">No Call Selected</h3>
                <p className="text-xs text-white/40 max-w-sm mt-1 leading-relaxed">
                  When a consumer calls from the Intake page, the incoming call will appear on the left queue. Click "Answer &amp; Connect Call" to start the live session.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
