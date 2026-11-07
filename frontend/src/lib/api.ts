/**
 * Axios API client — points to Hold-On backend
 */
import axios from "axios";

function getApiBase(): string {
  let url = (import.meta.env.VITE_API_URL || "").trim();
  if (!url) {
    return "http://localhost:8000";
  }
  // If user passed domain without scheme (e.g. "mock-on-backend.onrender.com"), prepend https://
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }
  // If user passed http:// for a remote domain, auto-upgrade to https://
  if (url.startsWith("http://") && !url.includes("localhost") && !url.includes("127.0.0.1")) {
    url = url.replace("http://", "https://");
  }
  return url.replace(/\/+$/, "");
}

export const API_BASE = getApiBase();

export const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  timeout: 90_000, // 90s to comfortably tolerate Render free-tier cold starts
});

// Attach JWT token from localStorage if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("mock_on_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Automatic retry for transient Render cold-start connection resets
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    if (!config) {
      return Promise.reject(error);
    }

    config.__retryCount = config.__retryCount || 0;
    if (config.__retryCount >= 2) {
      return Promise.reject(error);
    }

    const isNetworkOrReset =
      !error.response ||
      error.code === "ECONNABORTED" ||
      error.code === "ERR_NETWORK" ||
      error.message?.includes("Network Error") ||
      error.message?.includes("timeout");

    const isSafeToRetry =
      !config.method ||
      config.method.toLowerCase() === "get" ||
      config.url?.includes("/auth/") ||
      config.url?.includes("/enhance_grievance") ||
      config.url?.includes("/scrape_helpline");

    if (isNetworkOrReset && isSafeToRetry) {
      config.__retryCount += 1;
      const delayMs = config.__retryCount * 1500;
      console.warn(`[Hold-On API] Server waking up / connection reset on ${config.url}. Auto-retrying (attempt ${config.__retryCount}/2) in ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return api(config);
    }

    return Promise.reject(error);
  }
);

export const WS_BASE = API_BASE.replace(/^http/, "ws");

// ── Typed API helpers ────────────────────────────────────────────────────

import type { Case, Call, Promise as HPromise, PromiseEvent, User, LiveUtterance } from "../types";

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
  list: (limit = 100) => api.get<Case[]>(`/cases?limit=${limit}`).then((r) => r.data),
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
  getLegalNoticePdfUrl: (id: string) => `${API_BASE}/cases/${id}/legal-notice.pdf`,
  getLegalNoticeData: (id: string) =>
    api
      .get<{
        case_id: string;
        portal_name: string;
        portal_url: string;
        alt_portal_name: string;
        alt_portal_url: string;
        ticket_number: string;
        provider: string;
        disputed_amount: string;
        consumer_name: string;
        statutory_act: string;
        complaint_subject: string;
        complaint_body: string;
        pdf_url: string;
      }>(`/cases/${id}/legal-notice`)
      .then((r) => r.data),
  enhanceGrievance: (data: {
    raw_text: string;
    domain?: string;
    provider?: string;
    amount?: string;
    identifier?: string;
  }) =>
    api
      .post<{
        enhanced_text: string;
        statutory_citations: string[];
        legal_basis: string;
      }>("/cases/enhance_grievance", data)
      .then((r) => r.data),
};

export const callsApi = {
  start: (data: { case_id: string; scenario_id?: string }) =>
    api.post<Call>("/calls", data).then((r) => r.data),
  get: (id: string) => api.get<Call>(`/calls/${id}`).then((r) => r.data),
  getLatestForCase: (caseId: string) =>
    api.get<Call | null>(`/calls/case/${caseId}/latest`).then((r) => r.data),
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
  getUtterances: (callId: string) =>
    api.get<LiveUtterance[]>(`/calls/${callId}/utterances`).then((r) => r.data),
};

export const promisesApi = {
  listAll: () => api.get<HPromise[]>("/promises").then((r) => r.data),
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
