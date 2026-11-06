// ── Core domain types for Hold-On frontend ─────────────────────────────

export type PromiseStatus =
  | "pending"
  | "due_soon"
  | "overdue"
  | "fulfilled"
  | "unable_to_verify";

export type CommitmentType =
  | "refund"
  | "correction"
  | "callback"
  | "technician_visit"
  | "update"
  | "statement";

export type SpeakerRole = "agent" | "user" | "ivr" | "system";

export type CallStatus =
  | "initialising"
  | "ringing"
  | "active"
  | "on_hold"
  | "ended"
  | "error";

export interface User {
  id: string;
  email: string;
  full_name?: string | null;
  phone_number?: string | null;
  role?: "consumer" | "admin";
  case_count?: number;
}

export interface Case {
  id: string;
  owner_id: string;
  user_id?: string | null;
  user_email?: string | null;
  language: string;
  goal: string;
  approved_info: Record<string, unknown>;
  follow_up_consent: boolean;
  status: string;
  family_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface Call {
  id: string;
  case_id: string;
  scenario_id: string;
  status: CallStatus;
  gnani_request_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface Utterance {
  id: string;
  call_id: string;
  speaker_role: SpeakerRole;
  raw_text: string;
  normalised_text: string;
  stt_latency_ms: number | null;
  sequence_num: number;
  created_at: string;
}

export interface Promise {
  id: string;
  case_id: string;
  commitment_type: CommitmentType;
  summary: string;
  speaker_role: SpeakerRole;
  quoted_text: string;
  amount: number | null;
  currency: string | null;
  raw_date_phrase: string | null;
  due_at: string | null;
  status: PromiseStatus;
  user_confirmed: boolean;
  user_confirmation_timestamp: string | null;
  verification_result: string | null;
  follow_up_allowed: boolean;
  attempt_count: number;
  extraction_confidence: number | null;
  created_at: string;
  updated_at: string;
}

export interface PromiseEvent {
  id: string;
  promise_id: string;
  from_status: string | null;
  to_status: string;
  rule_fired: string | null;
  created_at: string;
}

// ── WebSocket event types ────────────────────────────────────────────────

export type WSEventType =
  | "call_started"
  | "call_accepted"
  | "ringing"
  | "ivr_speaking"
  | "menu_pressed"
  | "hold_started"
  | "hold_ended"
  | "speech_start"
  | "processing"
  | "transcript_final"
  | "utterance"
  | "audio_patch"
  | "promise_proposed"
  | "radar_update"
  | "evasion_radar"
  | "call_ended"
  | "error"
  | "ping"
  | "pong";

export interface EvasionRadarData {
  tactic: string;
  label: string;
  score: number; // 0-100 certainty
  evasion_score: number; // 0-100 evasion
  badge_class: string;
  law_citation: string;
  summary: string;
  counter_action: string;
}

export interface WSEvent {
  type: WSEventType;
  data: Record<string, unknown>;
}

// ── Live call state ──────────────────────────────────────────────────────

export interface LiveUtterance {
  id: string;
  speaker: SpeakerRole;
  text: string;
  thought_process?: string;
  isFinal: boolean;
  latencyMs?: number;
  sequence: number;
}

export interface ProposedPromise {
  promise_data: Partial<Promise>;
  needs_date_confirmation: boolean;
}
