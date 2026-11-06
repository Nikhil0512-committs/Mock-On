import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import { 
  PhoneCall, 
  Shield, 
  FileCheck2, 
  FastForward, 
  PlusCircle, 
  Clock, 
  LogOut,
  LogIn,
  FolderOpen,
  Headphones,
} from "lucide-react";
import IntakePage from "./pages/IntakePage";
import CallPage from "./pages/CallPage";
import LedgerPage from "./pages/LedgerPage";
import DemoPage from "./pages/DemoPage";
import FamilyPage from "./pages/FamilyPage";
import SwitchboardPage from "./pages/SwitchboardPage";
import AuthModal from "./components/AuthModal";
import MyDisputesDrawer from "./components/MyDisputesDrawer";
import { authApi } from "./lib/api";
import { useStore } from "./store";

function NavigationBar({
  onOpenAuth,
  onOpenDisputes,
}: {
  onOpenAuth: () => void;
  onOpenDisputes: () => void;
}) {
  const location = useLocation();
  const { activeCall, callStatus, isOnHold, promises, simulatedNow, currentUser, logout } = useStore();

  const isCallActive = activeCall && callStatus !== "ended" && callStatus !== "idle";
  const pendingCount = promises.filter((p) => p.status === "pending" || p.status === "due_soon").length;

  // Don't show header in standalone family view
  if (location.pathname.startsWith("/family/")) {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 backdrop-blur-2xl bg-surface/85 border-b border-white/[0.08] shadow-2xl shadow-black/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand / Logo */}
        <div className="flex items-center gap-4">
          <NavLink to="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-indigo-600 border border-white/20 flex items-center justify-center shadow-md shadow-brand-500/20">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight text-white group-hover:text-brand-200 transition-colors">
                Mock-On
              </span>
              <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-300 border border-brand-500/25">
                AI Personal Assistant
              </span>
            </div>
          </NavLink>
        </div>

        {/* Center Nav tabs */}
        <nav className="flex items-center gap-1 p-1 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                isActive
                  ? "bg-white/[0.1] text-white shadow-sm border border-white/[0.08]"
                  : "text-white/60 hover:text-white hover:bg-white/[0.04]"
              }`
            }
          >
            <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>Intake</span>
          </NavLink>

          <NavLink
            to="/call"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-all relative ${
                isActive
                  ? "bg-brand-500/20 text-brand-200 border border-brand-500/35 shadow-sm shadow-brand-500/20"
                  : "text-white/60 hover:text-white hover:bg-white/[0.04]"
              }`
            }
          >
            <div className="relative">
              <PhoneCall className={`w-3.5 h-3.5 ${isCallActive ? "text-emerald-400 animate-pulse" : ""}`} />
              {isCallActive && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              )}
            </div>
            <span>Live Call</span>
            {isCallActive && (
              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                {isOnHold ? "HOLD" : "LIVE"}
              </span>
            )}
          </NavLink>

          <NavLink
            to="/ledger"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                isActive
                  ? "bg-white/[0.1] text-white shadow-sm border border-white/[0.08]"
                  : "text-white/60 hover:text-white hover:bg-white/[0.04]"
              }`
            }
          >
            <FileCheck2 className="w-3.5 h-3.5 text-brand-400" />
            <span>Ledger</span>
            {pendingCount > 0 && (
              <span className="text-[9.5px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                {pendingCount}
              </span>
            )}
          </NavLink>

          <button
            id="open-disputes-drawer-btn"
            onClick={onOpenDisputes}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-all text-white/60 hover:text-white hover:bg-white/[0.04]"
            title="Browse all your registered disputes"
          >
            <FolderOpen className="w-3.5 h-3.5 text-brand-400" />
            <span>Disputes</span>
          </button>

          <div className="w-px h-3.5 bg-white/10 mx-1" />

          <NavLink
            to="/switchboard"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                isActive
                  ? "bg-rose-500/20 text-rose-200 border border-rose-500/35"
                  : "text-rose-300/70 hover:text-rose-200 hover:bg-rose-500/10"
              }`
            }
            title="Company Operator Switchboard"
          >
            <Headphones className="w-3.5 h-3.5 text-rose-400" />
            <span className="hidden sm:inline">Switchboard</span>
          </NavLink>

          <NavLink
            to="/demo"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                isActive
                  ? "bg-white/[0.1] text-white border border-white/[0.08]"
                  : "text-white/40 hover:text-white hover:bg-white/[0.04]"
              }`
            }
            title="Demo Simulation Lab"
          >
            <FastForward className="w-3.5 h-3.5 text-violet-400" />
            <span className="hidden sm:inline">Demo</span>
          </NavLink>
        </nav>

        {/* Right Status & Auth Area */}
        <div className="flex items-center gap-2 sm:gap-3">
          {simulatedNow && (
            <div className="hidden xl:flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-mono shadow-sm">
              <Clock className="w-3.5 h-3.5" />
              <span>Demo Clock</span>
            </div>
          )}

          {/* User Account / Auth Button */}
          {currentUser ? (
            <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.15] rounded-xl px-2.5 py-1 text-xs transition-all shadow-sm">
              <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-brand-600 to-indigo-500 text-white flex items-center justify-center font-bold text-[10px] ring-1 ring-white/20">
                {currentUser.full_name ? currentUser.full_name[0].toUpperCase() : currentUser.email[0].toUpperCase()}
              </div>
              <span className="max-w-[120px] truncate text-white/90 font-medium hidden sm:inline">
                {currentUser.full_name || currentUser.email}
              </span>
              <button
                onClick={logout}
                title="Sign out"
                className="text-white/40 hover:text-red-400 transition-colors p-1"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-brand-600/40 to-indigo-600/40 hover:from-brand-600/60 hover:to-indigo-600/60 border border-brand-500/40 text-white text-xs font-semibold shadow-sm transition-all"
            >
              <LogIn className="w-3.5 h-3.5 text-brand-300" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function Footer() {
  const location = useLocation();
  if (location.pathname.startsWith("/family/")) {
    return null;
  }

  return (
    <footer className="mt-auto border-t border-white/[0.08] bg-surface/60 backdrop-blur-xl py-6 text-xs text-white/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Architecture chips */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Gnani Prisma 8kHz STT
          </span>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-300 text-[11px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-400" />
            Timbre TTS
          </span>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[11px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
            Sarvam 105B LLM
          </span>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-[11px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            Neon PostgreSQL
          </span>
        </div>

        {/* Links */}
        <div className="flex items-center gap-4 text-xs">
          <NavLink to="/demo" className="text-white/60 hover:text-white transition-colors">
            Simulation Lab
          </NavLink>
          <span className="text-white/20">&bull;</span>
          <NavLink to="/" className="text-white/60 hover:text-white transition-colors">
            Dispute Intake
          </NavLink>
          <span className="text-white/20">&bull;</span>
          <span className="text-white/40 font-mono text-[10px]">v1.0 &bull; Great Indian AI Challenge</span>
        </div>
      </div>
    </footer>
  );
}

export default function App() {
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isDisputesOpen, setIsDisputesOpen] = useState(false);
  const { setCurrentUser } = useStore();

  useEffect(() => {
    // Attempt to restore user profile from token on mount
    const token = localStorage.getItem("mock_on_token");
    if (token) {
      authApi
        .getMe()
        .then((user) => setCurrentUser(user))
        .catch(() => {
          localStorage.removeItem("mock_on_token");
        });
    }
  }, [setCurrentUser]);

  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col bg-surface text-white selection:bg-brand-500/30 selection:text-white">
        <NavigationBar
          onOpenAuth={() => setIsAuthOpen(true)}
          onOpenDisputes={() => setIsDisputesOpen(true)}
        />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<IntakePage />} />
            <Route path="/intake" element={<Navigate to="/" replace />} />
            <Route path="/call" element={<CallPage />} />
            <Route path="/switchboard" element={<SwitchboardPage />} />
            <Route path="/ledger" element={<LedgerPage />} />
            <Route path="/demo" element={<DemoPage />} />
            <Route path="/family/:token" element={<FamilyPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <Footer />
        <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
        <MyDisputesDrawer isOpen={isDisputesOpen} onClose={() => setIsDisputesOpen(false)} />
      </div>
    </BrowserRouter>
  );
}
