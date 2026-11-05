/**
 * Zustand global store — manages all application state
 */
import { create } from "zustand";
import type { Case, Call, Promise as HPromise, LiveUtterance, ProposedPromise, User, EvasionRadarData } from "../types";

interface HoldOnState {
  // Auth state
  currentUser: User | null;
  setCurrentUser: (u: User | null) => void;
  logout: () => void;

  // Active case
  activeCase: Case | null;
  setActiveCase: (c: Case | null) => void;

  // Active call
  activeCall: Call | null;
  setActiveCall: (c: Call | null) => void;

  // Live transcript
  utterances: LiveUtterance[];
  appendUtterance: (u: LiveUtterance) => void;
  clearUtterances: () => void;

  // Call state
  callStatus: string;
  setCallStatus: (s: string) => void;
  callEndInfo: { hasConclusion: boolean; reason?: string } | null;
  setCallEndInfo: (info: { hasConclusion: boolean; reason?: string } | null) => void;
  isOnHold: boolean;
  setIsOnHold: (v: boolean) => void;

  // Promise ledger
  promises: HPromise[];
  setPromises: (p: HPromise[]) => void;
  upsertPromise: (p: HPromise) => void;

  // Pending proposals (from WebSocket — not yet confirmed)
  pendingProposals: ProposedPromise[];
  addProposal: (p: ProposedPromise) => void;
  removeProposal: (index: number) => void;
  clearProposals: () => void;

  // Demo clock
  simulatedNow: string | null;
  setSimulatedNow: (t: string) => void;

  // Audio playback
  isAudioMuted: boolean;
  setIsAudioMuted: (muted: boolean) => void;

  // Real-time Evasion Radar (Feature 2)
  evasionRadar: EvasionRadarData | null;
  setEvasionRadar: (d: EvasionRadarData | null) => void;

  // UI
  activeTab: "call" | "ledger" | "timeline" | "demo";
  setActiveTab: (t: "call" | "ledger" | "timeline" | "demo") => void;
}

export const useStore = create<HoldOnState>((set) => ({
  currentUser: null,
  setCurrentUser: (u) => set({ currentUser: u }),
  logout: () => {
    localStorage.removeItem("mock_on_token");
    set({ currentUser: null });
  },

  isAudioMuted: false,
  setIsAudioMuted: (muted) => set({ isAudioMuted: muted }),

  activeCase: null,
  setActiveCase: (c) => set({ activeCase: c }),

  activeCall: null,
  setActiveCall: (c) => set({ activeCall: c }),

  utterances: [],
  appendUtterance: (u) =>
    set((s) => {
      const last = s.utterances[s.utterances.length - 1];
      if (
        last &&
        last.speaker === u.speaker &&
        last.text.trim().toLowerCase() === u.text.trim().toLowerCase()
      ) {
        return s; // Deduplicate identical consecutive utterance
      }
      if (u.id && s.utterances.some((it) => it.id === u.id)) {
        return s;
      }
      return {
        utterances: [...s.utterances, u].slice(-200), // Keep last 200
      };
    }),
  clearUtterances: () => set({ utterances: [] }),

  callStatus: "idle",
  setCallStatus: (s) => set({ callStatus: s }),
  callEndInfo: null,
  setCallEndInfo: (info) => set({ callEndInfo: info }),
  isOnHold: false,
  setIsOnHold: (v) => set({ isOnHold: v }),

  promises: [],
  setPromises: (p) => set({ promises: p }),
  upsertPromise: (p) =>
    set((s) => {
      const idx = s.promises.findIndex((x) => x.id === p.id);
      if (idx >= 0) {
        const next = [...s.promises];
        next[idx] = p;
        return { promises: next };
      }
      return { promises: [...s.promises, p] };
    }),

  pendingProposals: [],
  addProposal: (p) =>
    set((s) => {
      const type = (p.promise_data as { commitment_type?: string })?.commitment_type;
      const existingIdx = s.pendingProposals.findIndex(
        (item) => (item.promise_data as { commitment_type?: string })?.commitment_type === type
      );
      if (existingIdx >= 0) {
        const next = [...s.pendingProposals];
        next[existingIdx] = p;
        return { pendingProposals: next };
      }
      return { pendingProposals: [...s.pendingProposals, p] };
    }),
  removeProposal: (i) =>
    set((s) => ({ pendingProposals: s.pendingProposals.filter((_, idx) => idx !== i) })),
  clearProposals: () => set({ pendingProposals: [] }),

  simulatedNow: null,
  setSimulatedNow: (t) => set({ simulatedNow: t }),

  evasionRadar: null,
  setEvasionRadar: (d) => set({ evasionRadar: d }),

  activeTab: "call",
  setActiveTab: (t) => set({ activeTab: t }),
}));
