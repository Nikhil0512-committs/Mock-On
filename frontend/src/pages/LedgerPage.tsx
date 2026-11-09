/**
 * Promise Ledger Page — shows all confirmed promises with status, due dates,
 * amounts, quoted evidence, domain-aware dispute parameters, and statutory escalation guides.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  HelpCircle,
  FileText,
  RefreshCw,
  ShieldAlert,
  ExternalLink,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Scale,
  Users,
  Mail,
  Shield,
  FileDown,
  Volume2,
  Phone,
  CreditCard,
  ShoppingCart,
  Plane,
  Zap,
  Building2,
  Plus,
  FolderArchive,
  ArrowRight,
} from "lucide-react";
import { format } from "date-fns";
import { promisesApi, casesApi } from "../lib/api";
import { useStore } from "../store";
import { useI18n } from "../lib/i18n";
import type { Promise as HPromise, PromiseStatus, Case } from "../types";
import ShareFamilyModal from "../components/ShareFamilyModal";
import LegalNoticeModal from "../components/LegalNoticeModal";

const STATUS_CONFIG: Record<
  PromiseStatus,
  { icon: React.ComponentType<{ className?: string }>; label: string; badgeClass: string }
> = {
  pending: { icon: Clock, label: "Pending", badgeClass: "badge-pending" },
  due_soon: { icon: AlertCircle, label: "Due Soon", badgeClass: "badge-due_soon" },
  overdue: { icon: XCircle, label: "Overdue", badgeClass: "badge-overdue" },
  fulfilled: { icon: CheckCircle2, label: "Fulfilled", badgeClass: "badge-fulfilled" },
  unable_to_verify: { icon: HelpCircle, label: "Unable to Verify", badgeClass: "badge-unable_to_verify" },
};

const COMMITMENT_LABELS: Record<string, string> = {
  refund: "Refund",
  correction: "Correction",
  callback: "Callback",
  technician_visit: "Technician Visit",
  update: "Update",
  statement: "Statement",
};

function formatDateSafe(dateVal: any, fmt = "dd MMM yyyy", fallback = "Recent"): string {
  if (!dateVal) return fallback;
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return fallback;
    return format(d, fmt);
  } catch {
    return fallback;
  }
}

const VALID_DOMAIN_KEYS = [
  "telecom",
  "banking",
  "ecommerce",
  "travel",
  "insurance",
  "utilities",
  "edtech",
  "mobility",
  "housing",
];

function getDomainKey(caseData: Case): string {
  const info = (caseData.approved_info as Record<string, unknown>) || {};
  if (info.domain && typeof info.domain === "string") {
    const d = info.domain.toLowerCase();
    if (VALID_DOMAIN_KEYS.includes(d)) return d;
  }
  const text = `${info.service_provider || ""} ${caseData.goal || ""}`.toLowerCase();
  if (
    text.includes("amazon") ||
    text.includes("flipkart") ||
    text.includes("order") ||
    text.includes("delivery") ||
    text.includes("return") ||
    text.includes("ecommerce")
  )
    return "ecommerce";
  if (
    text.includes("bank") ||
    text.includes("hdfc") ||
    text.includes("sbi") ||
    text.includes("upi") ||
    text.includes("card")
  )
    return "banking";
  if (
    text.includes("flight") ||
    text.includes("indigo") ||
    text.includes("airline") ||
    text.includes("pnr") ||
    text.includes("ticket")
  )
    return "travel";
  if (
    text.includes("insurance") ||
    text.includes("policy") ||
    text.includes("claim") ||
    text.includes("health")
  )
    return "insurance";
  if (
    text.includes("airtel") ||
    text.includes("jio") ||
    text.includes("telecom") ||
    text.includes("bill") ||
    text.includes("sim")
  )
    return "telecom";
  return "utilities";
}

const DOMAIN_SECTIONS: Record<
  string,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    badge: string;
    border: string;
  }
> = {
  telecom: {
    label: "Telecom",
    icon: Phone,
    color: "text-rose-400",
    badge: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    border: "border-rose-500/30 hover:border-rose-500/60",
  },
  banking: {
    label: "Banking & UPI",
    icon: CreditCard,
    color: "text-blue-400",
    badge: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    border: "border-blue-500/30 hover:border-blue-500/60",
  },
  ecommerce: {
    label: "E-Commerce",
    icon: ShoppingCart,
    color: "text-amber-400",
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    border: "border-amber-500/30 hover:border-amber-500/60",
  },
  travel: {
    label: "Airlines & Travel",
    icon: Plane,
    color: "text-sky-400",
    badge: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    border: "border-sky-500/30 hover:border-sky-500/60",
  },
  insurance: {
    label: "Insurance",
    icon: Shield,
    color: "text-emerald-400",
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    border: "border-emerald-500/30 hover:border-emerald-500/60",
  },
  utilities: {
    label: "Utilities & Power",
    icon: Zap,
    color: "text-yellow-400",
    badge: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
    border: "border-yellow-500/30 hover:border-yellow-500/60",
  },
};

function getDomainMeta(domainKey: string) {
  return (
    DOMAIN_SECTIONS[domainKey] || {
      label: domainKey.charAt(0).toUpperCase() + domainKey.slice(1),
      icon: Building2,
      color: "text-brand-400",
      badge: "bg-brand-500/15 text-brand-300 border-brand-500/30",
      border: "border-brand-500/30 hover:border-brand-500/60",
    }
  );
}

function PromiseCard({
  promise,
  caseData,
  onSelectCase,
  onGenerateNotice,
}: {
  promise: HPromise;
  caseData?: Case;
  onSelectCase?: (c: Case) => void;
  onGenerateNotice?: (caseId: string) => void;
}) {
  const config = STATUS_CONFIG[promise.status] || STATUS_CONFIG.pending;
  const Icon = config.icon;
  const info = (caseData?.approved_info as Record<string, any>) || {};
  const provider = info.service_provider || "Customer Support";
  const ticket = info.ticket_number || (caseData ? `TKT-${caseData.id.slice(0, 8).toUpperCase()}` : null);
  const identifier = info.identifier_value || info.phone_number;
  const domainKey = caseData ? getDomainKey(caseData) : null;
  const domainMeta = domainKey ? getDomainMeta(domainKey) : null;
  const displayAmount =
    promise.amount != null
      ? promise.amount
      : info.disputed_amount
      ? String(info.disputed_amount).replace(/[^\d.]/g, "")
      : null;

  return (
    <div
      className={`card p-5 space-y-4 animate-slide-up transition-all duration-300 hover:border-brand-500/30 ${
        promise.status === "overdue"
          ? "border-red-500/30"
          : promise.status === "due_soon"
          ? "border-amber-500/30"
          : promise.status === "fulfilled"
          ? "border-green-500/20"
          : ""
      }`}
    >
      {/* Case/Request Header */}
      {caseData && (
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            {domainMeta && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${domainMeta.badge}`}>
                {domainMeta.label}
              </span>
            )}
            <span className="font-bold text-white flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-brand-400" />
              <span>{provider}</span>
            </span>
            {ticket && (
              <span className="text-brand-300/80 font-mono text-[11px]">
                #{ticket}
              </span>
            )}
            {identifier && (
              <span className="text-white/40 text-[11px] font-mono">
                &bull; {identifier}
              </span>
            )}
          </div>
          {onSelectCase && (
            <button
              onClick={() => onSelectCase(caseData)}
              className="text-[11px] font-semibold text-brand-300 hover:text-brand-200 hover:underline flex items-center gap-1"
            >
              <span>View Dossier</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              promise.status === "overdue"
                ? "bg-red-500/20"
                : promise.status === "due_soon"
                ? "bg-amber-500/20"
                : promise.status === "fulfilled"
                ? "bg-green-500/20"
                : "bg-white/10"
            }`}
          >
            <Icon
              className={`w-4 h-4 ${
                promise.status === "overdue"
                  ? "text-red-400"
                  : promise.status === "due_soon"
                  ? "text-amber-400"
                  : promise.status === "fulfilled"
                  ? "text-green-400"
                  : "text-white/60"
              }`}
            />
          </div>
          <div>
            <div className="font-semibold text-white">
              {COMMITMENT_LABELS[promise.commitment_type] || promise.commitment_type}
            </div>
            <div className="text-white/40 text-xs">
              {promise.speaker_role.toUpperCase()} &bull;{" "}
              {formatDateSafe(promise.created_at, "dd MMM yyyy HH:mm", "Recent")}
            </div>
          </div>
        </div>
        <span className={config.badgeClass}>
          <Icon className="w-3 h-3" />
          {config.label}
        </span>
      </div>

      {/* Summary */}
      <p className="text-white/70 text-sm leading-relaxed">{promise.summary}</p>

      {/* Evidence quote */}
      {promise.quoted_text && (
        <blockquote className="text-white/50 text-sm italic border-l-2 border-brand-500/40 pl-3 leading-relaxed">
          &ldquo;{promise.quoted_text}&rdquo;
        </blockquote>
      )}

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        {displayAmount != null && (
          <div className="bg-white/5 rounded-lg px-3 py-2">
            <div className="text-white/40 text-xs mb-0.5">Amount</div>
            <div className="font-bold text-emerald-400">
              {promise.currency ?? "₹"}
              {displayAmount}
            </div>
          </div>
        )}
        {promise.due_at && (
          <div
            className={`rounded-lg px-3 py-2 ${
              promise.status === "overdue"
                ? "bg-red-500/10"
                : promise.status === "due_soon"
                ? "bg-amber-500/10"
                : "bg-white/5"
            }`}
          >
            <div className="text-white/40 text-xs mb-0.5">Due Date</div>
            <div
              className={`font-semibold text-sm ${
                promise.status === "overdue"
                  ? "text-red-300"
                  : promise.status === "due_soon"
                  ? "text-amber-300"
                  : "text-white"
              }`}
            >
              {formatDateSafe(promise.due_at, "dd MMM yyyy", "in 5 business days")}
            </div>
            {promise.raw_date_phrase && (
              <div className="text-white/30 text-xs italic">&ldquo;{promise.raw_date_phrase}&rdquo;</div>
            )}
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="flex items-center justify-between text-xs text-white/30 pt-2 border-t border-white/5 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span>ID: {promise.id.slice(0, 12)}…</span>
          {promise.extraction_confidence != null && (
            <span>Confidence: {Math.round(promise.extraction_confidence * 100)}%</span>
          )}
          {promise.follow_up_allowed && (
            <span className="text-brand-400">Follow-up enabled</span>
          )}
        </div>
        {onGenerateNotice && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onGenerateNotice(promise.case_id);
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-semibold transition-all hover:scale-[1.02]"
            title="Generate formal 1-click NCH / RBI Grievance Dossier for this commitment"
          >
            <Scale className="w-3.5 h-3.5 text-amber-400" />
            <span>NCH / RBI Notice</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default function LedgerPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { activeCase, setActiveCase, promises, setPromises } = useStore();
  const [cases, setCases] = useState<Case[]>([]);
  const [loadingCases, setLoadingCases] = useState(true);
  const [selectedDomain, setSelectedDomain] = useState<string>("all");
  const [familyModalOpen, setFamilyModalOpen] = useState(false);
  const [legalNoticeCaseId, setLegalNoticeCaseId] = useState<string | null>(null);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [sendingCheckinEmail, setSendingCheckinEmail] = useState(false);

  const handleResendEmail = async () => {
    if (!activeCase) return;
    setResendingEmail(true);
    setResendStatus(null);
    try {
      const res = await casesApi.resendSummary(activeCase.id);
      if (res.ok) {
        setResendStatus(`Summary email successfully dispatched to ${res.email}`);
      } else {
        setResendStatus("Failed to send email. Check SMTP settings.");
      }
    } catch {
      setResendStatus("Failed to send email.");
    } finally {
      setResendingEmail(false);
      setTimeout(() => setResendStatus(null), 5000);
    }
  };

  const handleSendCheckinEmail = async () => {
    if (!activeCase) return;
    setSendingCheckinEmail(true);
    setResendStatus(null);
    try {
      const res = await casesApi.sendCheckin(activeCase.id);
      if (res.ok) {
        setResendStatus(`1-Click check-in email dispatched to ${res.emails?.join(", ") || activeCase.user_email || "your registered email"}`);
      } else {
        setResendStatus("Failed to send check-in email.");
      }
    } catch {
      setResendStatus("Failed to send check-in email.");
    } finally {
      setSendingCheckinEmail(false);
      setTimeout(() => setResendStatus(null), 5000);
    }
  };

  const loadCases = async () => {
    setLoadingCases(true);
    try {
      const list = await casesApi.list();
      setCases(list || []);
      if (list && list.length > 0) {
        if (!activeCase || !list.some((c) => c.id === activeCase.id)) {
          setActiveCase(list[0]);
        }
      }
    } catch (e) {
      console.warn("Failed to load cases:", e);
    } finally {
      setLoadingCases(false);
    }
  };

  useEffect(() => {
    loadCases();
  }, []);

  const [allPromises, setAllPromises] = useState<HPromise[]>([]);
  const [viewScope, setViewScope] = useState<"all" | "case">("all");

  const loadPromises = async () => {
    try {
      const [allData, caseData] = await Promise.all([
        promisesApi.listAll().catch(() => []),
        activeCase ? promisesApi.listForCase(activeCase.id).catch(() => []) : Promise.resolve([]),
      ]);
      setAllPromises(allData || []);
      if (activeCase) {
        setPromises(caseData || []);
      }
    } catch (e) {
      console.warn("Failed to load promises:", e);
    }
  };

  useEffect(() => {
    loadPromises();
  }, [activeCase?.id]);

  const handleRefresh = async () => {
    await Promise.all([loadCases(), loadPromises()]);
  };

  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const statuses = ["pending", "due_soon", "overdue", "fulfilled", "unable_to_verify"] as const;

  const activeScopePromises =
    viewScope === "all"
      ? (selectedDomain === "all"
          ? allPromises
          : allPromises.filter((p) => {
              const c = cases.find((cItem) => cItem.id === p.case_id);
              return c && getDomainKey(c) === selectedDomain;
            }))
      : promises;

  const displayedPromises =
    selectedStatus === "all"
      ? activeScopePromises
      : activeScopePromises.filter((p) => p.status === selectedStatus);

  // Distinct domain keys that actually have cases
  const presentDomainKeys = Array.from(new Set(cases.map((c) => getDomainKey(c))));

  // Filtered cases based on domain tab
  const sectionsToRender =
    selectedDomain === "all"
      ? presentDomainKeys
      : presentDomainKeys.filter((d) => d === selectedDomain);

  return (
    <div className="min-h-screen py-5 sm:py-8 px-3 sm:px-6 lg:px-8">
      <main className="max-w-4xl mx-auto space-y-6 sm:space-y-8">
        {/* Clean Page Title Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                {t("ledger.title", "Promise Ledger")}
              </h1>
              <span className="text-[11px] sm:text-xs px-2 py-0.5 rounded-full font-semibold bg-brand-500/15 text-brand-300 border border-brand-500/30">
                {cases.length} disputes
              </span>
              <span className="text-[11px] sm:text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                {allPromises.length > 0 ? allPromises.length : promises.length} commitments
              </span>
            </div>
            <p className="text-xs sm:text-sm text-white/50 mt-1 leading-relaxed">
              {t("ledger.subtitle", "Tamper-evident record of verbal helpline commitments, audio evidence, and statutory deadlines categorized by dispute domain.")}
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={handleRefresh}
              className="btn-ghost text-xs py-1.5 px-3 flex items-center gap-1.5 text-white/70 hover:text-white"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
            <button
              onClick={() => navigate("/intake")}
              className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Dispute</span>
            </button>
          </div>
        </div>

        {/* ── SECTION 1: ALL DISPUTES CATEGORIZED BY THEIR RESPECTIVE DOMAINS ── */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FolderArchive className="w-5 h-5 text-brand-400" />
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                Disputes by Domain Section
              </h2>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-white/[0.08] text-white/70">
                {cases.length} Active
              </span>
            </div>
            <span className="text-xs text-white/40">
              Select any dispute below to view its verbal commitments, evidence pack &amp; statutory appeal.
            </span>
          </div>

          {/* Domain Filter Pills */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-x-auto">
            <button
              onClick={() => setSelectedDomain("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                selectedDomain === "all"
                  ? "bg-white/[0.12] text-white shadow-sm border border-white/[0.08]"
                  : "text-white/50 hover:text-white"
              }`}
            >
              <span>All Sections</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/[0.08] text-white/80 font-mono">
                {cases.length}
              </span>
            </button>

            {presentDomainKeys.map((dKey) => {
              const meta = getDomainMeta(dKey);
              const Icon = meta.icon;
              const count = cases.filter((c) => getDomainKey(c) === dKey).length;
              const isSelected = selectedDomain === dKey;

              return (
                <button
                  key={dKey}
                  onClick={() => setSelectedDomain(dKey)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                    isSelected
                      ? "bg-white/[0.12] text-white shadow-sm border border-white/[0.08]"
                      : "text-white/50 hover:text-white"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                  <span>{meta.label}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/[0.08] text-white/80 font-mono">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Sectional Disputes Grid */}
          {loadingCases ? (
            <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.08] text-center space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-brand-400 mx-auto" />
              <p className="text-xs text-white/50">Loading your dispute dossiers...</p>
            </div>
          ) : cases.length === 0 ? (
            <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.08] text-center space-y-3">
              <FolderArchive className="w-10 h-10 mx-auto text-white/20" />
              <p className="text-sm font-semibold text-white/80">No Disputes Recorded Yet</p>
              <p className="text-xs text-white/50 max-w-sm mx-auto">
                File a grievance for Telecom, Banking, E-Commerce, or Travel to start an autonomous advocacy call.
              </p>
              <button
                onClick={() => navigate("/intake")}
                className="btn-primary text-xs py-2 px-4 inline-flex items-center gap-1.5 mt-2"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Launch New Dispute Call</span>
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {sectionsToRender.map((dKey) => {
                const meta = getDomainMeta(dKey);
                const Icon = meta.icon;
                const sectionCases = cases.filter((c) => getDomainKey(c) === dKey);
                if (sectionCases.length === 0) return null;

                return (
                  <div key={dKey} className="space-y-3">
                    <div className="flex items-center gap-2 px-1">
                      <Icon className={`w-4 h-4 ${meta.color}`} />
                      <h3 className="text-xs font-bold text-white/80 uppercase tracking-wider">
                        {meta.label} Section ({sectionCases.length})
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {sectionCases.map((c) => {
                        const info = (c.approved_info as Record<string, any>) || {};
                        const provider = info.service_provider || "Customer Support";
                        const amt = info.disputed_amount || "0";
                        const ticket = info.ticket_number || `TKT-${c.id.slice(0, 8).toUpperCase()}`;
                        const identifier = info.identifier_value || info.phone_number || "Reference";
                        const isSelected = activeCase?.id === c.id;

                        return (
                          <div
                            key={c.id}
                            onClick={() => setActiveCase(c)}
                            className={`p-4 rounded-2xl cursor-pointer transition-all duration-200 border relative overflow-hidden flex flex-col justify-between gap-3 ${
                              isSelected
                                ? "bg-[#11192e] border-brand-500 shadow-lg shadow-brand-500/10 ring-1 ring-brand-500/50"
                                : "bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.05] hover:border-white/[0.15]"
                            }`}
                          >
                            <div className="space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.badge}`}>
                                  {meta.label}
                                </span>
                                <span className="text-xs font-mono font-bold text-emerald-400">
                                  ₹{amt}
                                </span>
                              </div>

                              <div>
                                <h4 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                                  <span>{provider}</span>
                                </h4>
                                <div className="text-[11px] font-mono text-white/40 mt-0.5">
                                  #{ticket} &bull; {identifier}
                                </div>
                              </div>

                              <p className="text-xs text-white/60 line-clamp-2 italic leading-relaxed">
                                "{c.goal}"
                              </p>
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] text-[11px]">
                              <span className="text-white/40">
                                {formatDateSafe(c.created_at, "dd MMM yyyy", "Recent")}
                              </span>

                              {isSelected ? (
                                <span className="text-xs font-bold text-brand-300 flex items-center gap-1">
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Active Dossier</span>
                                </span>
                              ) : (
                                <span className="text-white/50 hover:text-white flex items-center gap-1">
                                  <span>Select</span>
                                  <ArrowRight className="w-3 h-3" />
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── SECTION 2: ACTIVE DISPUTE DOSSIER DETAILS & EVIDENCE ── */}

        {/* Synced Executive Call & Dispute Summary */}
        {activeCase && (() => {
          const info = (activeCase.approved_info as Record<string, unknown>) || {};
          const provider = (info.service_provider as string) || "Company Support";
          const identifierType = (info.identifier_type as string) || "Reference / ID";
          const identifierVal =
            (info.identifier_value as string) || (info.phone_number as string) || "Not specified";
          const amt = (info.disputed_amount as string) || "Disputed Sum";
          const ticket = (info.ticket_number as string) || `TKT-${activeCase.id.slice(0, 8).toUpperCase()}`;
          const email = activeCase.user_email || "your email";
          const domainName = (info.domain_label as string) || (info.domain as string)?.toUpperCase() || "CONSUMER";

          return (
            <div className="card p-6 space-y-5 border border-white/[0.1] bg-[#0c1424]/90 backdrop-blur-xl shadow-2xl relative overflow-hidden">
              {/* Header: Title + Unified Actions Toolbar (Only place on the page!) */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-500/15 border border-brand-500/30 text-brand-300 flex items-center justify-center font-bold shadow-md shadow-brand-500/10">
                    <Shield className="w-5 h-5 text-brand-400" />
                  </div>
                  <div>
                    <div className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                      <span>{provider} Dispute</span>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-300 border border-brand-500/30">
                        {domainName}
                      </span>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        {activeCase.status}
                      </span>
                    </div>
                    <div className="text-white/40 text-xs font-mono mt-0.5">Case #{activeCase.id.slice(0, 8)}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <a
                    id="evidence-pdf-btn"
                    href={casesApi.getEvidencePdfUrl(activeCase.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary text-xs py-1.5 px-3.5 shadow-sm"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Evidence Pack</span>
                  </a>
                  <a
                    id="ledger-audio-wav-btn"
                    href={casesApi.getAudioWavUrl(activeCase.id)}
                    download
                    className="btn-ghost text-xs py-1.5 px-3 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/10"
                    title="Download Audio Evidence (.WAV)"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Audio (.WAV)</span>
                  </a>
                  <a
                    id="ledger-transcript-txt-btn"
                    href={casesApi.getTranscriptTxtUrl(activeCase.id)}
                    download
                    className="btn-ghost text-xs py-1.5 px-3 text-blue-300 border border-blue-500/30 hover:bg-blue-500/10"
                    title="Download Verbatim Transcript (.TXT)"
                  >
                    <FileDown className="w-3.5 h-3.5 text-blue-400" />
                    <span>Transcript</span>
                  </a>
                  <button
                    id="ledger-legal-notice-btn"
                    onClick={() => setLegalNoticeCaseId(activeCase.id)}
                    className="btn-ghost text-xs py-1.5 px-3 text-red-300 border border-red-500/30 hover:bg-red-500/10 flex items-center gap-1.5 shadow-sm"
                    title="Generate Formal NCH/RBI Statutory Grievance Notice"
                  >
                    <Scale className="w-3.5 h-3.5 text-red-400" />
                    <span>Legal Notice</span>
                  </button>
                  <button
                    onClick={() => setFamilyModalOpen(true)}
                    className="btn-ghost text-xs py-1.5 px-3 text-white/70 hover:text-white"
                    title="Share case with family"
                  >
                    <Users className="w-3.5 h-3.5 text-violet-400" />
                    <span>Family</span>
                  </button>
                </div>
              </div>

              {/* Clean Key Attributes Strip (No nested heavy gray boxes!) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-1">
                <div>
                  <div className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">Service Provider</div>
                  <div className="text-sm font-semibold text-white mt-1">{provider}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">{identifierType}</div>
                  <div className="text-sm font-mono text-white/90 mt-1">{identifierVal}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">Disputed Sum</div>
                  <div className="text-sm font-extrabold text-emerald-400 mt-1">₹{amt}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">Complaint Reference</div>
                  <div className="text-sm font-mono text-brand-300 font-bold mt-1">#{ticket}</div>
                </div>
              </div>

              {/* Grievance Statement */}
              <div className="text-xs text-white/70 leading-relaxed bg-white/[0.02] border border-white/[0.05] rounded-xl p-3.5">
                <span className="font-semibold text-white/90">Grievance Synopsis: </span>
                {activeCase.goal}
              </div>

              {/* Email sync status */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-white/50 pt-1">
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                  <span>
                    Summary email synced to <strong className="text-white/80 font-mono">{email}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSendCheckinEmail}
                    disabled={sendingCheckinEmail}
                    className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1.5"
                    title="Send 1-Click Yes/No refund check-in email now"
                  >
                    <Mail className={`w-3 h-3 ${sendingCheckinEmail ? "animate-spin" : ""}`} />
                    <span>{sendingCheckinEmail ? "Sending Check-in..." : "Send Check-in Email"}</span>
                  </button>
                  <button
                    onClick={handleResendEmail}
                    disabled={resendingEmail}
                    className="text-xs text-brand-400 hover:text-brand-300 transition-colors flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3 h-3 ${resendingEmail ? "animate-spin" : ""}`} />
                    <span>{resendingEmail ? "Sending..." : "Resend Email"}</span>
                  </button>
                </div>
              </div>

              {resendStatus && (
                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs animate-fade-in flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{resendStatus}</span>
                </div>
              )}
            </div>
          );
        })()}

        {/* Scope Switcher: All Requests vs Selected Dossier */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2 p-1 rounded-xl bg-white/[0.03] border border-white/[0.08] self-start sm:self-auto">
            <button
              onClick={() => setViewScope("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewScope === "all"
                  ? "bg-brand-500 text-white shadow-md shadow-brand-500/20"
                  : "text-white/60 hover:text-white"
              }`}
            >
              <FolderArchive className="w-3.5 h-3.5" />
              <span>All Requests ({allPromises.length})</span>
            </button>
            <button
              onClick={() => setViewScope("case")}
              disabled={!activeCase}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewScope === "case"
                  ? "bg-brand-500 text-white shadow-md shadow-brand-500/20"
                  : "text-white/60 hover:text-white"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>
                {activeCase
                  ? `${(activeCase.approved_info as any)?.service_provider || "Selected"} (${promises.length})`
                  : "No Dossier Selected"}
              </span>
            </button>
          </div>

          <span className="text-xs text-white/40">
            {viewScope === "all"
              ? `Showing all commitments across all ${cases.length} consumer requests.`
              : `Filtered to ${(activeCase?.approved_info as any)?.service_provider || "active"} dispute dossier.`}
          </span>
        </div>

        {/* Sleek Segmented Status Filter Bar (Replaces the 5 huge clunky boxes!) */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-x-auto">
          <button
            onClick={() => setSelectedStatus("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
              selectedStatus === "all"
                ? "bg-white/[0.12] text-white shadow-sm border border-white/[0.08]"
                : "text-white/50 hover:text-white"
            }`}
          >
            <span>All Commitments</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/[0.08] text-white/80 font-mono">
              {activeScopePromises.length}
            </span>
          </button>

          {statuses.map((s) => {
            const count = activeScopePromises.filter((p) => p.status === s).length;
            const config = STATUS_CONFIG[s];
            const Icon = config.icon;
            const isSelected = selectedStatus === s;

            return (
              <button
                key={s}
                onClick={() => setSelectedStatus(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                  isSelected
                    ? "bg-white/[0.12] text-white shadow-sm border border-white/[0.08]"
                    : "text-white/50 hover:text-white"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{config.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    count > 0 ? "bg-white/[0.1] text-white" : "bg-white/[0.04] text-white/40"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Promises Listing */}
        {viewScope === "case" && !activeCase ? (
          <div className="text-center py-16 text-white/40 rounded-2xl border border-white/[0.06] bg-white/[0.01]">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-25 text-brand-400" />
            <p className="text-sm">
              No active dispute selected.{" "}
              <button onClick={() => setViewScope("all")} className="text-brand-400 underline font-medium">
                View all commitments
              </button>
            </p>
          </div>
        ) : displayedPromises.length === 0 ? (
          <div className="text-center py-16 text-white/40 rounded-2xl border border-white/[0.06] bg-white/[0.01]">
            <Clock className="w-10 h-10 mx-auto mb-3 opacity-25 text-brand-400" />
            <p className="text-sm font-medium">
              {selectedStatus === "all"
                ? "No commitments recorded yet. Promises appear here once verified on a call."
                : `No commitments found with status "${STATUS_CONFIG[selectedStatus as PromiseStatus]?.label || selectedStatus}".`}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-4">
              {displayedPromises.map((p) => {
                const caseData = cases.find((c) => c.id === p.case_id);
                return (
                  <PromiseCard
                    key={p.id}
                    promise={p}
                    caseData={caseData}
                    onSelectCase={(c) => {
                      setActiveCase(c);
                      setViewScope("case");
                    }}
                    onGenerateNotice={(caseId) => setLegalNoticeCaseId(caseId)}
                  />
                );
              })}
            </div>

            {/* Source-Backed Statutory Escalation Guide */}
            {activeCase && <EscalationGuide promises={promises} activeCase={activeCase} />}
          </div>
        )}
      </main>

      {activeCase && (
        <ShareFamilyModal
          isOpen={familyModalOpen}
          onClose={() => setFamilyModalOpen(false)}
          caseId={activeCase.id}
        />
      )}

      {/* 1-Click Formal NCH / RBI Grievance Notice Modal */}
      <LegalNoticeModal
        isOpen={Boolean(legalNoticeCaseId)}
        onClose={() => setLegalNoticeCaseId(null)}
        caseId={legalNoticeCaseId}
      />
    </div>
  );
}

const ESCALATION_DATA: Record<
  string,
  {
    badge: string;
    actTitle: string;
    stage1: {
      title: string;
      badge: string;
      desc: (provider: string, ticket: string) => string;
      linkText: string;
      url: string;
    };
    stage2: {
      title: string;
      badge: string;
      desc: (provider: string) => string;
      timeLimit: string;
    };
    stage3: {
      title: string;
      badge: string;
      desc: string;
      linkText: string;
      url: string;
    };
    draftBody: (
      provider: string,
      ticketId: string,
      idVal: string,
      amount: number,
      quote: string,
      caseId: string
    ) => string;
    note: string;
  }
> = {
  ecommerce: {
    badge: "Consumer Protection (E-Commerce) Rules 2020",
    actTitle: "Rule 5(3)(a) Consumer Protection (E-Commerce) Rules 2020 & Section 2(47) CPA 2019",
    stage1: {
      title: "Stage 1 · Grievance Officer",
      badge: "Lodged",
      desc: (p, t) => `Logged with ${p}. Ticket #${t} recorded under Consumer Protection (E-Commerce) Rules 2020.`,
      linkText: "E-Commerce Rules",
      url: "https://consumeraffairs.nic.in",
    },
    stage2: {
      title: "Stage 2 · National Consumer Helpline (NCH)",
      badge: "Action Ready",
      desc: (p) =>
        `If ${p} fails to disburse refund within 14 days, register formal pre-litigation grievance with Dept. of Consumer Affairs via 1915.`,
      timeLimit: "Within 30 days of SLA breach",
    },
    stage3: {
      title: "Stage 3 · E-Daakhil Consumer Commission",
      badge: "Consumer Court",
      desc: "Lodge statutory consumer complaint online on E-Daakhil portal for deficiency of service and unfair trade practice.",
      linkText: "E-Daakhil Portal",
      url: "https://edaakhil.nic.in",
    },
    draftBody: (p, t, idVal, amt, q, cId) => `To,
The Grievance Redressal Officer,
${p} (E-Commerce Operations)

Subject: Formal Grievance under Rule 5(3)(a) of Consumer Protection (E-Commerce) Rules 2020 — Docket #${t}

Respected Sir/Madam,

I am writing to register an urgent grievance regarding the non-disbursement of a verified refund for Order / Item ${idVal}.

Dispute Particulars:
- Reference / Order ID: ${idVal}
- Docket Number: ${t}
- Platform / Merchant: ${p}
- Amount Due: ₹${amt}.00
- Official Commitment Recorded on Call:
  "${q}"
- Resolution SLA Promised: 5 working days

Statutory Grounding:
Under Rule 5(3)(a) of the Consumer Protection (E-Commerce) Rules, 2020, every e-commerce entity is legally required to effect refunds within a reasonable timeframe (max 14 days). Withholding funds following return delivery constitutes an Unfair Trade Practice under Section 2(47) of the Consumer Protection Act, 2019.

Relief Sought:
Immediate release and credit of ₹${amt}.00 to the original payment source and written docket closure confirmation.

Evidence Attached:
Mock-On Certified Audio & Transcript Evidence Pack (Case Ref: ${cId.slice(0, 8)}).

Sincerely,
Aggrieved Consumer`,
    note: "E-commerce entities are mandated under Rule 5 to process refunds within 14 days of return receipt.",
  },
  banking: {
    badge: "RBI Integrated Ombudsman Scheme 2021",
    actTitle: "RBI Harmonisation of Turn Around Time (TAT) & Integrated Ombudsman 2021",
    stage1: {
      title: "Stage 1 · Bank Grievance Redressal",
      badge: "Lodged",
      desc: (p, t) => `Dispute recorded with ${p}. Ticket #${t} logged with RBI-mandated T+5 turnaround SLA.`,
      linkText: "RBI Customer Protection",
      url: "https://rbi.org.in",
    },
    stage2: {
      title: "Stage 2 · Principal Nodal Officer (PNO)",
      badge: "Action Ready",
      desc: (p) =>
        `If ${p} fails to reverse failed transaction within T+5 days, escalate to Principal Nodal Officer with compensation claim of ₹100/day.`,
      timeLimit: "Within 30 days of transaction",
    },
    stage3: {
      title: "Stage 3 · RBI Integrated Ombudsman (CMS)",
      badge: "RBI Central Desk",
      desc: "Lodge statutory representation on RBI Complaint Management System (cms.rbi.org.in) for non-reversal of failed electronic debit.",
      linkText: "RBI CMS Portal",
      url: "https://cms.rbi.org.in",
    },
    draftBody: (p, t, idVal, amt, q, cId) => `To,
The Principal Nodal Officer,
${p} (Customer Grievance Redressal Cell)

Subject: Representation for Failed Transaction Reversal & Delay Compensation — Docket #${t}

Respected Sir/Madam,

I am writing to formally appeal regarding an unreversed debit on account/UTR reference ${idVal} under the RBI Integrated Ombudsman Scheme, 2021.

Dispute Particulars:
- Reference / UTR Number: ${idVal}
- Grievance Docket Number: ${t}
- Bank / Financial Entity: ${p}
- Amount Withheld: ₹${amt}.00
- Representative Commitment on Record:
  "${q}"
- SLA Promised: 5 working days

Regulatory Grounding:
Under RBI Circular DPSS.CO.PD No.629/02.01.014/2019-20 (Harmonisation of Turn Around Time), failed electronic/UPI transactions must be reversed within T+5 working days. Any delay beyond T+5 entitles the customer to auto-compensation of ₹100 per day of delay.

Relief Sought:
Immediate reversal of ₹${amt}.00 along with applicable daily delay compensation credited to the registered account.

Evidence Attached:
Mock-On Certified Audio & Transcript Evidence Pack (Case Ref: ${cId.slice(0, 8)}).

Sincerely,
Account Holder`,
    note: "Under RBI circulars, banks are liable to pay ₹100 per day penalty if failed electronic transactions are not reversed within T+5 days.",
  },
  travel: {
    badge: "DGCA Civil Aviation Requirements (CAR)",
    actTitle: "DGCA CAR Section 3, Series M, Part IV & Passenger Charter",
    stage1: {
      title: "Stage 1 · Airline Customer Care",
      badge: "Lodged",
      desc: (p, t) => `Logged with ${p}. PNR/Reference #${t} recorded under DGCA Passenger Charter.`,
      linkText: "DGCA Regulations",
      url: "https://dgca.gov.in",
    },
    stage2: {
      title: "Stage 2 · Airline Nodal / Appellate Officer",
      badge: "Action Ready",
      desc: (p) =>
        `If ${p} delays refund beyond the statutory 7-day DGCA CAR limit, appeal directly to the airline's Nodal Officer.`,
      timeLimit: "Within 30 days of cancellation",
    },
    stage3: {
      title: "Stage 3 · Ministry of Civil Aviation AirSewa",
      badge: "Govt AirSewa",
      desc: "Lodge grievance on MoCA AirSewa portal (airsewa.gov.in) with booking PNR, cancellation receipt, and audio recording.",
      linkText: "AirSewa Portal",
      url: "https://airsewa.gov.in",
    },
    draftBody: (p, t, idVal, amt, q, cId) => `To,
The Nodal Officer / Appellate Authority,
${p} (Customer Relations Division)

Subject: Formal Grievance for Withheld Ticket Cancellation Refund — PNR/Docket #${t}

Respected Sir/Madam,

I am writing to formally appeal regarding an unpaid cancellation refund under the DGCA Civil Aviation Requirements (CAR).

Dispute Particulars:
- PNR / Booking ID: ${idVal}
- Grievance Docket Number: ${t}
- Airline / Operator: ${p}
- Disputed Refund Amount: ₹${amt}.00
- Official Airline Commitment:
  "${q}"
- Promised Resolution Time: 5 working days

Regulatory Grounding:
Under DGCA CAR Section 3, Series M, Part IV (Clause 3.3) and the Ministry of Civil Aviation Passenger Charter, refunds for cancelled tickets paid via credit card or digital banking must be completed within 7 working days.

Relief Sought:
Immediate release and credit of ₹${amt}.00 to the original payment source without arbitrary deductions.

Evidence Attached:
Mock-On Certified Audio & Transcript Evidence Pack (Case Ref: ${cId.slice(0, 8)}).

Sincerely,
Aggrieved Passenger`,
    note: "DGCA mandates that airline ticket cancellations must be refunded within 7 working days.",
  },
  insurance: {
    badge: "IRDAI Protection of Policyholders 2017",
    actTitle: "Regulation 15, IRDAI (Protection of Policyholders' Interests) Regulations, 2017",
    stage1: {
      title: "Stage 1 · Insurer Grievance Redressal (GRO)",
      badge: "Lodged",
      desc: (p, t) => `Grievance logged with ${p}. Docket #${t} recorded with 15-day SLA.`,
      linkText: "IRDAI Portal",
      url: "https://irdai.gov.in",
    },
    stage2: {
      title: "Stage 2 · IRDAI Bima Bharosa Portal",
      badge: "Action Ready",
      desc: (p) =>
        `Register complaint on IRDAI Bima Bharosa portal (bimabharosa.irdai.gov.in) if ${p} fails to resolve within 15 days.`,
      timeLimit: "Within 30 days of grievance",
    },
    stage3: {
      title: "Stage 3 · Insurance Ombudsman",
      badge: "Quasi-Judicial",
      desc: "Submit formal representation to the territorial Insurance Ombudsman under Insurance Ombudsman Rules 2017.",
      linkText: "Bima Bharosa Portal",
      url: "https://bimabharosa.irdai.gov.in",
    },
    draftBody: (p, t, idVal, amt, q, cId) => `To,
The Grievance Redressal Officer,
${p} (Claims & Grievance Department)

Subject: Formal Grievance for Withheld Claim Settlement / Reimbursement — Claim #${t}

Respected Sir/Madam,

I am writing to formally appeal regarding an unpaid insurance claim under the IRDAI Policyholders' Protection Regulations.

Dispute Particulars:
- Policy / Claim Reference: ${idVal}
- Grievance Docket Number: ${t}
- Insurer: ${p}
- Amount Claimed / Withheld: ₹${amt}.00
- Representative Commitment on Record:
  "${q}"
- Promised Resolution Time: 5 working days

Regulatory Grounding:
Under Regulation 15 of the IRDAI (Protection of Policyholders' Interests) Regulations, 2017, the insurer is legally mandated to settle or reject a claim within 30 days of receipt of all papers. Delayed settlement incurs penal interest at bank rate + 2%.

Relief Sought:
Immediate disbursement of ₹${amt}.00 along with applicable interest to the insured bank account.

Evidence Attached:
Mock-On Certified Audio & Transcript Evidence Pack (Case Ref: ${cId.slice(0, 8)}).

Sincerely,
Policyholder / Claimant`,
    note: "IRDAI rules mandate bank rate + 2% penal interest if an insurer delays valid claim settlement beyond 30 days.",
  },
  telecom: {
    badge: "TRAI 2-Tier Route (TCPR 2012)",
    actTitle: "TRAI Telecom Consumers Protection Regulations (TCPR 2012)",
    stage1: {
      title: "Stage 1 · Complaint Centre",
      badge: "Lodged",
      desc: (p, t) => `Logged with ${p}. Docket #${t} issued with 5-day SLA under TRAI regulations.`,
      linkText: "TRAI Redressal Rules",
      url: "https://www.trai.gov.in/consumer-info/telecom/grievance-redressal-mechanism",
    },
    stage2: {
      title: "Stage 2 · Appellate Authority",
      badge: "Action Ready",
      desc: (p) =>
        `If unresolved or deadline breached, appeal directly to ${p}'s Appellate Authority with call evidence pack.`,
      timeLimit: "Within 30 days of SLA breach",
    },
    stage3: {
      title: "Stage 3 · National Consumer Helpline",
      badge: "Govt NCH 1915",
      desc: "Department of Consumer Affairs pre-litigation assistance route. Dial 1915 or submit through online portal.",
      linkText: "NCH Portal",
      url: "https://consumerhelpline.gov.in",
    },
    draftBody: (p, t, idVal, amt, q, cId) => `To,
The Appellate Authority,
${p}

Subject: Formal Appeal against Unresolved Billing Complaint — Docket #${t}

Respected Sir/Madam,

I am writing to formally appeal regarding an unresolved telecom billing grievance under the TRAI Telecom Consumers Protection and Redressal of Grievances Regulations.

Case Summary:
- Customer Service Docket Number: ${t}
- Service Connection: ${idVal}
- Service Provider: ${p}
- Disputed Charge: ₹${amt}.00
- Customer Care Commitment on Record:
  "${q}"
- SLA Promised: 5 working days

Status of Breach:
The promised resolution timeframe has elapsed without credit of the promised refund amount. The issue remains unresolved at the Complaint Centre tier.

Relief Sought:
Immediate reversal/credit of ₹${amt}.00 to the registered account along with written confirmation of docket closure.

Evidence Attached:
Mock-On Certified Audio & Transcript Evidence Pack (Case Ref: ${cId.slice(0, 8)}).

Sincerely,
Aggrieved Consumer`,
    note: "CPGRAMS does not accept private telecom complaints; the TRAI 2-tier Appellate route applies.",
  },
  utilities: {
    badge: "Consumer Protection Act 2019",
    actTitle: "Consumer Protection Act, 2019 (Deficiency in Service)",
    stage1: {
      title: "Stage 1 · Customer Service Desk",
      badge: "Lodged",
      desc: (p, t) => `Logged with ${p}. Reference #${t} recorded with 5-day SLA.`,
      linkText: "Consumer Affairs",
      url: "https://consumerhelpline.gov.in",
    },
    stage2: {
      title: "Stage 2 · National Consumer Helpline (NCH)",
      badge: "Action Ready",
      desc: (p) =>
        `Register dispute with National Consumer Helpline (Call 1915 or online portal) for mediation with ${p}.`,
      timeLimit: "Within 30 days",
    },
    stage3: {
      title: "Stage 3 · E-Daakhil Consumer Commission",
      badge: "Consumer Court",
      desc: "File formal claim on E-Daakhil online consumer commission for deficiency in utility/commercial service.",
      linkText: "E-Daakhil Portal",
      url: "https://edaakhil.nic.in",
    },
    draftBody: (p, t, idVal, amt, q, cId) => `To,
Customer Grievance Redressal Cell,
${p}

Subject: Formal Grievance Notice & Request for Refund — Docket #${t}

Respected Sir/Madam,

I am writing to formally register a dispute regarding service deficiency and incorrect billing on Consumer Reference ${idVal} under the Consumer Protection Act, 2019.

Dispute Particulars:
- Consumer Account / Service ID: ${idVal}
- Grievance Docket Number: ${t}
- Service Provider: ${p}
- Disputed Amount: ₹${amt}.00
- Representative Commitment on Record:
  "${q}"
- Promised Resolution Time: 5 working days

Grounding:
Under Section 2(11) of the Consumer Protection Act, 2019, failure to rectify erroneous billing or refund unrendered service fees constitutes actionable deficiency of service.

Relief Sought:
Immediate billing adjustment or refund of ₹${amt}.00 to the registered account.

Evidence Attached:
Mock-On Certified Audio & Transcript Evidence Pack (Case Ref: ${cId.slice(0, 8)}).

Sincerely,
Consumer`,
    note: "Consumers are protected under Section 2(11) of CPA 2019 against deficiencies in commercial and utility services.",
  },
  edtech: {
    badge: "UGC Online Learning & CPA 2019",
    actTitle: "UGC Online Education Guidelines & Section 2(47) CPA 2019 Unfair Trade Practice",
    stage1: {
      title: "Stage 1 · Institute Grievance Desk",
      badge: "Lodged",
      desc: (p, t) => `Enrollment cancellation registered with ${p}. Ticket #${t} logged under mandatory cooling-off provisions.`,
      linkText: "UGC Portal",
      url: "https://ugc.ac.in",
    },
    stage2: {
      title: "Stage 2 · National Consumer Helpline (NCH)",
      badge: "Action Ready",
      desc: (p) =>
        `If ${p} refuses course fee refund or continues NBFC loan auto-debit, escalate via NCH toll-free 1915 with evidence pack.`,
      timeLimit: "Within 15 days of cancellation",
    },
    stage3: {
      title: "Stage 3 · E-Daakhil Consumer Commission",
      badge: "Consumer Court",
      desc: "Lodge statutory consumer complaint on E-Daakhil for misleading advertisement, false job guarantee, and unreturned tuition deposit.",
      linkText: "E-Daakhil Portal",
      url: "https://edaakhil.nic.in",
    },
    draftBody: (p, t, idVal, amt, q, cId) => `To,
The Grievance Redressal Committee,
${p} (Online Education & Learning Division)

Subject: Formal Notice for Refund of Course Fees & Cancellation of Loan Mandate — Docket #${t}

Respected Committee,

I hereby lodge a formal statutory grievance regarding the non-refund of course fees for Enrollment / Student Reference ${idVal}.

Dispute Particulars:
- Student / Enrollment Reference: ${idVal}
- Grievance Docket Number: ${t}
- Educational Entity: ${p}
- Disputed Sum: ₹${amt}.00
- Representative Commitment on Record:
  "${q}"
- Stated Resolution Window: 5 working days

Statutory Grounding:
Under UGC Guidelines and Section 2(47) of the Consumer Protection Act, 2019, withholding tuition fees following cancellation within the cooling-off window or promising unverified job guarantees constitutes an Unfair Trade Practice. Furthermore, continuing auto-debits via NBFC partners without student consent is actionable under RBI digital lending directives.

Relief Sought:
Immediate disbursement of ₹${amt}.00 to the original source and written cancellation of the third-party loan agreement.

Evidence Attached:
Mock-On Certified Audio & Transcript Evidence Pack (Case Ref: ${cId.slice(0, 8)}).

Sincerely,
Aggrieved Student / Consumer`,
    note: "EdTech platforms are legally bound under CPA 2019 against unfair contract terms and false job guarantee assertions.",
  },
  mobility: {
    badge: "Motor Vehicle Aggregator Guidelines 2020",
    actTitle: "Ministry of Road Transport & Highways Aggregator Guidelines 2020 & CPA 2019",
    stage1: {
      title: "Stage 1 · Aggregator Redressal Cell",
      badge: "Lodged",
      desc: (p, t) => `Fare dispute logged with ${p}. Ticket #${t} recorded under Aggregator Service Rules.`,
      linkText: "MoRTH Guidelines",
      url: "https://morth.nic.in",
    },
    stage2: {
      title: "Stage 2 · Regional Transport Authority (RTA) / NCH",
      badge: "Action Ready",
      desc: (p) =>
        `If ${p} refuses to reverse unfair driver cancellation charges or toll route inflation, file grievance with RTA & NCH.`,
      timeLimit: "Within 14 days of trip",
    },
    stage3: {
      title: "Stage 3 · E-Daakhil Consumer Commission",
      badge: "Consumer Court",
      desc: "File formal claim for deficiency of service and algorithmic fare manipulation.",
      linkText: "E-Daakhil Portal",
      url: "https://edaakhil.nic.in",
    },
    draftBody: (p, t, idVal, amt, q, cId) => `To,
Customer Support Nodal Desk,
${p} (Mobility & Ride Operations)

Subject: Dispute Concerning Unfair Trip Charges & Cancellation Levy — Booking #${t}

Respected Sir/Madam,

I am writing to dispute erroneous charges levied on Ride / Vehicle Reference ${idVal}.

Dispute Particulars:
- Booking / Vehicle Reference: ${idVal}
- Docket Number: ${t}
- Aggregator / Platform: ${p}
- Disputed Amount: ₹${amt}.00
- Representative Commitment on Record:
  "${q}"

Statutory Grounding:
Under the Motor Vehicle Aggregator Guidelines 2020, aggregators cannot levy driver cancellation penalties when the driver refuses service or fails to arrive at the designated pickup point within the stipulated window.

Relief Sought:
Immediate credit reversal of ₹${amt}.00 to the original payment instrument.

Evidence Attached:
Mock-On Certified Audio & Transcript Evidence Pack (Case Ref: ${cId.slice(0, 8)}).

Sincerely,
Aggrieved Passenger`,
    note: "MoRTH Aggregator Guidelines explicitly cap cancellation fees and mandate clear grievance mechanisms.",
  },
  housing: {
    badge: "Model Tenancy Act 2021 & RERA",
    actTitle: "Model Tenancy Act 2021 & Section 18 Real Estate (Regulation and Development) Act 2016",
    stage1: {
      title: "Stage 1 · Landlord / Platform Redressal",
      badge: "Lodged",
      desc: (p, t) => `Deposit refund claim filed with ${p}. Docket #${t} logged under statutory tenancy guidelines.`,
      linkText: "Model Tenancy Act",
      url: "https://mohua.gov.in",
    },
    stage2: {
      title: "Stage 2 · Rent Authority / Rent Court",
      badge: "Action Ready",
      desc: (p) =>
        `Under Model Tenancy Act, if ${p} fails to return security deposit within 30 days of handover, claim statutory interest.`,
      timeLimit: "Within 30 days of handover",
    },
    stage3: {
      title: "Stage 3 · RERA / Consumer Commission",
      badge: "Ombudsman / Tribunal",
      desc: "Lodge formal petition before the Rent Tribunal or Consumer Commission for unlawful retention of funds.",
      linkText: "E-Daakhil Portal",
      url: "https://edaakhil.nic.in",
    },
    draftBody: (p, t, idVal, amt, q, cId) => `To,
${p} (Property & Tenancy Management Desk)

Subject: Statutory Demand Notice for Return of Security Deposit — Reference #${t}

Respected Sir/Madam,

I am formally demanding the immediate refund of my security deposit pertaining to Rental Agreement ${idVal}.

Dispute Particulars:
- Tenancy / Agreement Reference: ${idVal}
- Grievance Docket Number: ${t}
- Property / Platform Authority: ${p}
- Unreturned Deposit Sum: ₹${amt}.00
- Recorded Commitment on Call:
  "${q}"

Legal Grounding:
Under the Model Tenancy Act, 2021, the security deposit must be refunded to the tenant within one month of vacating the premises after due deduction of legitimate liabilities. Unreasonable retention beyond 30 days incurs interest liabilities and actionable deficiency of service under Section 2(11) of the Consumer Protection Act, 2019.

Relief Sought:
Immediate transfer of ₹${amt}.00 to the designated bank account.

Evidence Attached:
Mock-On Certified Audio & Transcript Evidence Pack (Case Ref: ${cId.slice(0, 8)}).

Sincerely,
Tenant / Complainant`,
    note: "Tenants are protected against arbitrary deposit deductions under the Model Tenancy Act 2021.",
  },
};

function EscalationGuide({
  promises,
  activeCase,
}: {
  promises: HPromise[];
  activeCase: Case;
}) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const overduePromise = promises.find((p) => p.status === "overdue");
  const info = (activeCase.approved_info as Record<string, unknown>) || {};
  const provider = (info.service_provider as string) || "Service Provider";
  const identifierVal =
    (info.identifier_value as string) || (info.phone_number as string) || "Registered Reference";
  const ticketId = (info.ticket_number as string) || `TKT-${activeCase.id.slice(0, 8).toUpperCase()}`;
  const refundAmount = overduePromise?.amount ?? (Number(info.disputed_amount) || 0);
  const quote =
    overduePromise?.quoted_text ??
    `Yeh ₹${refundAmount} ka refund aapko paanch kaam karne wale dinon mein aapke account mein credit kar diya jaega.`;

  const domainKey = getDomainKey(activeCase);
  const escalation = ESCALATION_DATA[domainKey] || ESCALATION_DATA.telecom;

  const draftComplaint = escalation.draftBody(
    provider,
    ticketId,
    identifierVal,
    refundAmount,
    quote,
    activeCase.id
  );

  const copyDraft = () => {
    navigator.clipboard.writeText(draftComplaint);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="card p-6 border-brand-500/30 bg-surface-card/60 backdrop-blur-md space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-600 flex items-center justify-center">
            <Scale className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-bold text-white text-base flex items-center gap-2">
              Source-Backed Escalation Guide
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30">
                {escalation.badge}
              </span>
            </h2>
            <p className="text-white/50 text-xs">
              Every promise has an exact transcript source. Every deadline has an authorised statutory next step.
            </p>
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="btn-ghost p-1.5 text-white/50 hover:text-white"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <div className="space-y-4 pt-2 border-t border-white/10">
          {/* Stages timeline */}
          <div className="grid md:grid-cols-3 gap-3 text-xs">
            {/* Stage 1 */}
            <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-400">{escalation.stage1.title}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">
                  {escalation.stage1.badge}
                </span>
              </div>
              <p className="text-white/60">{escalation.stage1.desc(provider, ticketId)}</p>
              <a
                href={escalation.stage1.url}
                target="_blank"
                rel="noreferrer"
                className="text-brand-400 hover:underline inline-flex items-center gap-1 text-[11px] pt-1"
              >
                {escalation.stage1.linkText} <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* Stage 2 */}
            <div
              className={`p-3.5 rounded-xl border space-y-1.5 ${
                overduePromise
                  ? "bg-amber-500/10 border-amber-500/30 ring-1 ring-amber-500/20"
                  : "bg-white/5 border-white/10"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`font-bold ${overduePromise ? "text-amber-300" : "text-white/80"}`}>
                  {escalation.stage2.title}
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                    overduePromise
                      ? "bg-amber-500/20 text-amber-300"
                      : "bg-white/10 text-white/40"
                  }`}
                >
                  {overduePromise ? "Action Ready" : escalation.stage2.badge}
                </span>
              </div>
              <p className="text-white/60">{escalation.stage2.desc(provider)}</p>
              <span className="text-white/40 text-[11px] block">
                Time limit: {escalation.stage2.timeLimit}
              </span>
            </div>

            {/* Stage 3 */}
            <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-indigo-300">{escalation.stage3.title}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-semibold">
                  {escalation.stage3.badge}
                </span>
              </div>
              <p className="text-white/60">{escalation.stage3.desc}</p>
              <a
                href={escalation.stage3.url}
                target="_blank"
                rel="noreferrer"
                className="text-brand-400 hover:underline inline-flex items-center gap-1 text-[11px] pt-1"
              >
                {escalation.stage3.linkText} <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Pre-Drafted Appeal letter */}
          <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-brand-400" />
                <span className="font-semibold text-sm text-white">
                  Pre-Drafted Statutory Appeal Letter
                </span>
              </div>
              <button
                onClick={copyDraft}
                className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 shadow-md"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copied ? "Copied to Clipboard!" : "Copy Draft Complaint"}
              </button>
            </div>
            <pre className="p-3 rounded-lg bg-white/5 text-white/70 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-48 border border-white/5">
              {draftComplaint}
            </pre>
            <div className="flex items-center justify-between text-[11px] text-white/40">
              <span>Grounding: Quoted verbatim from transcript &bull; Docket #{ticketId}</span>
              <span className="text-amber-400/80">&bull; {escalation.note}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
