/**
 * Axios API client — points to Hold-On backend
 */
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  timeout: 30_000,
});

// Attach JWT token from localStorage if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("mock_on_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const WS_BASE = API_BASE.replace(/^http/, "ws");

// ── Typed API helpers ────────────────────────────────────────────────────

import type { Case, Call, Promise as HPromise, PromiseEvent, User } from "../types";

export interface SwitchboardPendingItem {
  call: Call;
  case: Case;
}

export const authApi = {
  register: (data: { email: string; password: string; full_name?: string; phone_number?: string; role?: "consumer" | "admin" }) =>
    api.post<{ access_token: string; token_type: string; user: User }>("/auth/register", data).then((r) => r.data),
  login: (data: { email: string; password: string }) =>
    api.post<{ access_token: string; token_type: string; user: User }>("/auth/login", data).then((r) => r.data),
  getMe: () =>
    api.get<User>("/auth/me").then((r) => r.data),
  logout: () =>
    api.post("/auth/logout").then((r) => r.data),
};

export const casesApi = {
  list: () => api.get<Case[]>("/cases").then((r) => r.data),
  create: (data: Parameters<typeof api.post>[1]) =>
    api.post<Case>("/cases", data).then((r) => r.data),
  get: (id: string) => api.get<Case>(`/cases/${id}`).then((r) => r.data),
  update: (id: string, data: unknown) =>
    api.patch<Case>(`/cases/${id}`, data).then((r) => r.data),
  shareFamily: (id: string) =>
    api.post<{ family_token: string; case_id: string; family_url: string }>(`/cases/${id}/share-family`).then((r) => r.data),
  revokeFamilyToken: (id: string) =>
    api.post<{ ok: boolean; family_token: null; status: string }>(`/cases/${id}/family-token/revoke`).then((r) => r.data),
  regenerateFamilyToken: (id: string) =>
    api.post<{ ok: boolean; family_token: string; status: string }>(`/cases/${id}/family-token/regenerate`).then((r) => r.data),
  resendSummary: (id: string) =>
    api.post<{ ok: boolean; email: string }>(`/cases/${id}/resend-summary`).then((r) => r.data),
  getEvidencePdfUrl: (id: string) => `${API_BASE}/cases/${id}/evidence.pdf`,
  getTranscriptTxtUrl: (id: string) => `${API_BASE}/cases/${id}/transcript.txt`,
  getAudioWavUrl: (id: string) => `${API_BASE}/cases/${id}/audio.wav`,
};

export const callsApi = {
  start: (data: { case_id: string; scenario_id?: string }) =>
    api.post<Call>("/calls", data).then((r) => r.data),
  get: (id: string) => api.get<Call>(`/calls/${id}`).then((r) => r.data),
  end: (id: string, payload?: { reason?: string }) =>
    api
      .post<{ status: string; call_id: string; has_conclusion: boolean; reason?: string }>(
        `/calls/${id}/end`,
        payload || {}
      )
      .then((r) => r.data),
  getSwitchboardPending: () =>
    api.get<SwitchboardPendingItem[]>("/calls/switchboard/pending").then((r) => r.data),
  clearSwitchboardQueue: () =>
    api.post<{ ok: boolean; cleared_count: number }>("/calls/switchboard/clear").then((r) => r.data),
  acceptCall: (callId: string, operatorName?: string) =>
    api
      .post<{ ok: boolean; call_id: string; status: string }>(`/calls/${callId}/accept`, {
        operator_name: operatorName,
      })
      .then((r) => r.data),
  sendCallMessage: (
    callId: string,
    data: { speaker: "agent" | "user"; text: string; auto_advocate_reply?: boolean }
  ) =>
    api
      .post<{ ok: boolean; utterance_id: string; promise_detected: boolean }>(
        `/calls/${callId}/send_message`,
        data
      )
      .then((r) => r.data),
};

export const promisesApi = {
  listForCase: (caseId: string) =>
    api.get<HPromise[]>(`/promises/case/${caseId}`).then((r) => r.data),
  get: (id: string) => api.get<HPromise>(`/promises/${id}`).then((r) => r.data),
  confirm: (
    id: string,
    data: {
      confirmed: boolean;
      corrected_amount?: number;
      corrected_due_at?: string;
      corrected_summary?: string;
      enable_follow_up?: boolean;
    }
  ) => api.post<HPromise>(`/promises/${id}/confirm`, data).then((r) => r.data),
  getEvents: (id: string) =>
    api.get<PromiseEvent[]>(`/promises/${id}/events`).then((r) => r.data),
};

export const demoApi = {
  advanceClock: (days = 1) =>
    api.post<{ advanced_days: number; simulated_now: string }>("/demo/clock", null, {
      params: { days },
    }).then((r) => r.data),
  getClock: () =>
    api.get<{ simulated_now: string }>("/demo/clock").then((r) => r.data),
  getStatus: () =>
    api.get<{ sarvam_available: boolean; simulated_now: string }>("/demo/status").then((r) => r.data),
};

export const familyApi = {
  get: (token: string) =>
    api.get(`/family/${token}`).then((r) => r.data),
};

export interface TwilioStatus {
  configured: boolean;
  account_sid_masked: string;
  phone_number: string;
  public_url: string;
}

export interface TwilioConfigInput {
  account_sid: string;
  auth_token: string;
  phone_number: string;
  public_url?: string;
}

export const twilioApi = {
  getStatus: () => api.get<TwilioStatus>("/twilio/status").then((r) => r.data),
  saveConfig: (data: TwilioConfigInput) =>
    api.post<{ ok: boolean; configured: boolean }>("/twilio/config", data).then((r) => r.data),
  startCall: (data: { to_phone: string; case_id: string; public_url?: string }) =>
    api
      .post<{
        ok: boolean;
        call_id: string;
        case_id: string;
        call_sid: string;
        status: string;
        to: string;
        stream_url: string;
      }>("/twilio/call", data)
      .then((r) => r.data),
};
