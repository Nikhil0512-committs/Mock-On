import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  Search,
  Phone,
  FileText,
  FileDown,
  Volume2,
  ChevronRight,
  PlusCircle,
  RefreshCw,
  FolderOpen,
} from "lucide-react";
import { casesApi } from "../lib/api";
import { useStore } from "../store";
import type { Case } from "../types";
import { format } from "date-fns";

interface MyDisputesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const DOMAIN_FILTERS = [
  { id: "all", label: "All Disputes" },
  { id: "telecom", label: "Telecom" },
  { id: "ecommerce", label: "E-Commerce" },
  { id: "banking", label: "Banking & UPI" },
  { id: "travel", label: "Travel & Flights" },
  { id: "insurance", label: "Insurance" },
  { id: "utilities", label: "Utilities" },
];

export default function MyDisputesDrawer({ isOpen, onClose }: MyDisputesDrawerProps) {
  const navigate = useNavigate();
  const { activeCase, setActiveCase } = useStore();

  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDomain, setSelectedDomain] = useState("all");

  const loadCases = async () => {
    setLoading(true);
    try {
      const data = await casesApi.list();
      setCases(data || []);
    } catch (e) {
      console.error("Failed to load cases:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadCases();
    }
  }, [isOpen]);

  // Filter cases based on domain and search term
  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      const info = (c.approved_info as Record<string, unknown>) || {};
      const provider = String(info.service_provider || "").toLowerCase();
      const ticket = String(info.ticket_number || "").toLowerCase();
      const idVal = String(info.identifier_value || info.phone_number || "").toLowerCase();
      const domain = String(info.domain || "").toLowerCase();
      const goal = String(c.goal || "").toLowerCase();
      const query = searchQuery.trim().toLowerCase();

      // Domain filter match
      if (selectedDomain !== "all") {
        const matchesDomain =
          domain === selectedDomain ||
          goal.includes(selectedDomain) ||
          provider.includes(selectedDomain);
        if (!matchesDomain) return false;
      }

      // Search query match
      if (query) {
        return (
          c.id.toLowerCase().includes(query) ||
          provider.includes(query) ||
          ticket.includes(query) ||
          idVal.includes(query) ||
          domain.includes(query) ||
          goal.includes(query)
        );
      }

      return true;
    });
  }, [cases, selectedDomain, searchQuery]);

  if (!isOpen) return null;

  const handleSelectCase = (c: Case) => {
    setActiveCase(c);
    onClose();
    navigate("/ledger");
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden animate-fade-in">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-xl bg-surface/95 backdrop-blur-2xl border-l border-white/[0.09] shadow-2xl flex flex-col animate-slide-up">
          {/* Header */}
          <div className="p-6 border-b border-white/[0.08] flex items-center justify-between flex-shrink-0 bg-surface-card/60">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-brand-600 via-indigo-600 to-slate-900 border border-white/20 flex items-center justify-center shadow-lg shadow-brand-500/20 flex-shrink-0">
                <FolderOpen className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white tracking-tight">Dispute Ledger History</h2>
                  <span className="badge bg-brand-500/20 text-brand-300 border border-brand-500/30 text-xs">
                    {cases.length} Filed
                  </span>
                </div>
                <p className="text-xs text-white/50">
                  Switch between disputes, audit histories &amp; download evidence packs
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={loadCases}
                disabled={loading}
                title="Refresh disputes"
                className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Search & Domain Filter Bar */}
          <div className="p-4 border-b border-white/[0.08] space-y-3 bg-white/[0.02]">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-3 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by provider, ticket #, phone, or issue..."
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl pl-10 pr-14 py-2.5 text-xs text-white placeholder-white/40 focus:outline-none focus:border-brand-500/60 focus:bg-white/[0.06] transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3.5 top-2.5 text-[11px] font-semibold text-white/40 hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
              {DOMAIN_FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setSelectedDomain(f.id)}
                  className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all text-xs ${
                    selectedDomain === f.id
                      ? "bg-brand-500/20 text-brand-300 border border-brand-500/40 shadow-sm shadow-brand-500/10 font-semibold"
                      : "text-white/60 hover:text-white hover:bg-white/[0.05] border border-transparent"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Disputes List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-3 text-white/50 text-sm">
                <RefreshCw className="w-6 h-6 animate-spin text-brand-400" />
                <span>Loading your dispute history...</span>
              </div>
            ) : filteredCases.length === 0 ? (
              <div className="py-20 text-center text-white/40 space-y-3">
                <FolderOpen className="w-10 h-10 mx-auto text-white/20" />
                <div>
                  <div className="text-white/70 font-semibold text-sm">No disputes found</div>
                  <div className="text-xs text-white/40 mt-1">
                    {searchQuery || selectedDomain !== "all"
                      ? "Try adjusting your filters or search terms."
                      : "You have not registered any consumer disputes yet."}
                  </div>
                </div>
                <button
                  onClick={() => {
                    onClose();
                    navigate("/");
                  }}
                  className="btn-primary text-xs py-2 px-4 inline-flex items-center gap-1.5 shadow-md shadow-brand-500/20 mt-2"
                >
                  <PlusCircle className="w-4 h-4 text-emerald-300" />
                  Start New Dispute Intake
                </button>
              </div>
            ) : (
              filteredCases.map((c) => {
                const info = (c.approved_info as Record<string, unknown>) || {};
                const provider = (info.service_provider as string) || "Customer Service";
                const identifierVal =
                  (info.identifier_value as string) ||
                  (info.phone_number as string) ||
                  "Reference";
                const amount = (info.disputed_amount as string) || "0";
                const ticket = (info.ticket_number as string) || `TKT-${c.id.slice(0, 8).toUpperCase()}`;
                const domainLabel =
                  (info.domain_label as string) || (info.domain as string)?.toUpperCase() || "CONSUMER";
                const isCurrentActive = activeCase?.id === c.id;

                let createdDate = "Recent";
                try {
                  if (c.created_at) {
                    createdDate = format(new Date(c.created_at), "MMM d, yyyy");
                  }
                } catch {
                  // Fallback
                }

                return (
                  <div
                    key={c.id}
                    className={`card p-4 space-y-3 transition-all duration-200 border ${
                      isCurrentActive
                        ? "border-brand-500/50 bg-brand-500/5 shadow-md shadow-brand-500/10"
                        : "border-white/10 hover:border-white/20 bg-surface-card/60"
                    }`}
                  >
                    {/* Top Row: Provider, Domain, Active Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">{provider}</span>
                          <span className="badge bg-brand-500/20 text-brand-300 border-brand-500/30 text-[10px] font-semibold">
                            {domainLabel}
                          </span>
                          {isCurrentActive && (
                            <span className="badge bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px] font-bold">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-white/40 flex items-center gap-2">
                          <span>Case #{c.id.slice(0, 8)}</span>
                          <span>&bull;</span>
                          <span>{createdDate}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-emerald-400 font-bold text-sm">₹{amount}</div>
                        <div className="text-white/40 text-[10px] font-mono">{ticket}</div>
                      </div>
                    </div>

                    {/* Dispute Goal Synopsis */}
                    <p className="text-xs text-white/70 line-clamp-2 leading-relaxed bg-white/5 p-2 rounded-lg">
                      {c.goal}
                    </p>

                    {/* Metadata & Actions */}
                    <div className="pt-2 border-t border-white/5 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5 text-white/50 text-[11px]">
                        <Phone className="w-3 h-3 text-teal-400" />
                        <span className="truncate max-w-[140px]">{identifierVal}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {/* Download buttons */}
                        <a
                          href={casesApi.getTranscriptTxtUrl(c.id)}
                          download
                          title="Download Verbatim Transcript TXT"
                          className="p-1.5 rounded-lg text-blue-300 hover:text-white hover:bg-blue-500/20 border border-blue-500/20 transition-colors"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                        </a>
                        <a
                          href={casesApi.getAudioWavUrl(c.id)}
                          download
                          title="Download Evidence Audio WAV"
                          className="p-1.5 rounded-lg text-emerald-300 hover:text-white hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </a>
                        <a
                          href={casesApi.getEvidencePdfUrl(c.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Download Evidence Pack PDF"
                          className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 border border-white/10 transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </a>

                        {/* Switch button */}
                        <button
                          onClick={() => handleSelectCase(c)}
                          className={`py-1 px-2.5 rounded-lg font-semibold text-xs flex items-center gap-1 transition-all ${
                            isCurrentActive
                              ? "bg-brand-600/30 text-brand-300 border border-brand-500/30"
                              : "btn-primary shadow-sm"
                          }`}
                        >
                          <span>{isCurrentActive ? "Open Ledger" : "Switch Case"}</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Action */}
          <div className="p-4 border-t border-white/10 bg-surface/80 flex items-center justify-between gap-3 flex-shrink-0">
            <span className="text-xs text-white/40">
              Showing {filteredCases.length} of {cases.length} cases
            </span>
            <button
              onClick={() => {
                onClose();
                navigate("/");
              }}
              className="btn-primary text-xs py-2 px-3.5 flex items-center gap-1.5 shadow-md shadow-brand-500/20"
            >
              <PlusCircle className="w-3.5 h-3.5 text-emerald-300" />
              <span>New Dispute Intake</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
