import { useState } from "react";
import { X, Lock, Mail, User as UserIcon, Phone, ShieldCheck, AlertCircle, Loader2, Headphones, UserCheck, Sparkles } from "lucide-react";
import { authApi } from "../lib/api";
import { useStore } from "../store";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { setCurrentUser } = useStore();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [role, setRole] = useState<"consumer" | "admin">("consumer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isWakingUp, setIsWakingUp] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const wakeTimer = setTimeout(() => setIsWakingUp(true), 2500);

    try {
      if (mode === "login") {
        const res = await authApi.login({ email, password });
        localStorage.setItem("mock_on_token", res.access_token);
        setCurrentUser(res.user);
        onClose();
      } else {
        const res = await authApi.register({
          email,
          password,
          full_name: fullName || undefined,
          phone_number: phone || undefined,
          role,
        });
        localStorage.setItem("mock_on_token", res.access_token);
        setCurrentUser(res.user);
        onClose();
      }
    } catch (err: any) {
      let msg = err.response?.data?.detail;
      if (!msg) {
        if (err.code === "ECONNABORTED" || err.message?.includes("timeout")) {
          msg = "Backend server is waking up from sleep (Render free tier). Please wait 10 seconds and retry.";
        } else if (err.message?.includes("Network Error") || err.code === "ERR_NETWORK") {
          msg = "Connection was reset while waking up cloud backend. Please retry in a few seconds.";
        } else {
          msg = err.message || "Authentication failed. Please verify your details.";
        }
      }
      setError(msg);
    } finally {
      clearTimeout(wakeTimer);
      setIsWakingUp(false);
      setLoading(false);
    }
  };

  const handleQuickLogin = async (quickEmail: string, quickPass: string) => {
    setError(null);
    setLoading(true);
    const wakeTimer = setTimeout(() => setIsWakingUp(true), 2500);
    try {
      const res = await authApi.login({ email: quickEmail, password: quickPass });
      localStorage.setItem("mock_on_token", res.access_token);
      setCurrentUser(res.user);
      onClose();
    } catch (err: any) {
      let msg = err.response?.data?.detail;
      if (!msg) {
        if (err.code === "ECONNABORTED" || err.message?.includes("timeout")) {
          msg = "Backend server is waking up from sleep. Please wait 10 seconds and retry.";
        } else if (err.message?.includes("Network Error") || err.code === "ERR_NETWORK") {
          msg = "Connection was reset while waking up cloud backend. Please retry in a few seconds.";
        } else {
          msg = err.message || "Quick login failed.";
        }
      }
      setError(msg);
    } finally {
      clearTimeout(wakeTimer);
      setIsWakingUp(false);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-fade-in">
      <div className="relative w-full max-w-md bg-[#0d1527]/95 border border-white/[0.12] rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/80 overflow-hidden">
        {/* Top ambient highlight line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-500 via-indigo-500 to-emerald-400" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/[0.08] transition-colors"
          title="Close Modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3.5 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-600 to-indigo-600 p-0.5 shadow-lg shadow-brand-500/25 flex-shrink-0">
            <div className="w-full h-full bg-[#0d1527] rounded-[14px] flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-brand-400" />
            </div>
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              {mode === "login" ? "Sign In to Mock-On" : "Create Account"}
            </h2>
            <p className="text-xs text-white/50 mt-0.5">
              {mode === "login"
                ? "Access dispute ledgers or operator switchboard"
                : "Choose whether you're a consumer or company support operator"}
            </p>
          </div>
        </div>

        {/* 1-Click Demo Profiles Banner */}
        <div className="mb-5 p-3 rounded-2xl bg-gradient-to-r from-brand-500/10 via-indigo-500/10 to-purple-500/10 border border-white/[0.08] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-white/80 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" /> 1-Click Instant Demo Profiles
            </span>
            <span className="text-[10px] text-white/40">No typing needed</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleQuickLogin("admin@mockon.ai", "admin123")}
              disabled={loading}
              className="px-2.5 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-left transition-all group"
            >
              <div className="flex items-center gap-1 text-[11px] font-bold text-rose-300">
                <Headphones className="w-3 h-3" />
                <span>Admin / Support Rep</span>
              </div>
              <div className="text-[9.5px] text-white/40 font-mono mt-0.5">admin@mockon.ai</div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin("nikhil@mockon.ai", "password123")}
              disabled={loading}
              className="px-2.5 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-left transition-all group"
            >
              <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-300">
                <UserCheck className="w-3 h-3" />
                <span>Consumer Profile</span>
              </div>
              <div className="text-[9.5px] text-white/40 font-mono mt-0.5">nikhil@mockon.ai</div>
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-xl bg-black/40 p-1 mb-5 border border-white/[0.08]">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              mode === "login"
                ? "bg-brand-600 text-white shadow-md shadow-brand-600/30"
                : "text-white/60 hover:text-white"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setError(null);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              mode === "register"
                ? "bg-brand-600 text-white shadow-md shadow-brand-600/30"
                : "text-white/60 hover:text-white"
            }`}
          >
            Create Account
          </button>
        </div>

        {isWakingUp && !error && (
          <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2 animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin flex-shrink-0 text-amber-400" />
            <span>Connecting to cloud backend... Free-tier instances take ~30-50s to spin up if idle.</span>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === "register" && (
            <>
              {/* Role Selection */}
              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1.5">
                  Account Type / Role
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole("consumer")}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      role === "consumer"
                        ? "bg-brand-600/25 border-brand-500 text-white shadow-sm"
                        : "bg-black/30 border-white/[0.08] text-white/60 hover:text-white"
                    }`}
                  >
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-brand-400" />
                      <span>Consumer</span>
                    </div>
                    <div className="text-[10px] text-white/40 mt-0.5">File &amp; resolve disputes</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRole("admin")}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      role === "admin"
                        ? "bg-rose-600/25 border-rose-500 text-white shadow-sm"
                        : "bg-black/30 border-white/[0.08] text-white/60 hover:text-white"
                    }`}
                  >
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      <Headphones className="w-3.5 h-3.5 text-rose-400" />
                      <span>Company Admin</span>
                    </div>
                    <div className="text-[10px] text-white/40 mt-0.5">Support Desk Switchboard</div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1">
                  Full Name / Desk Title
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={role === "admin" ? "Tata Power Support Desk" : "Nikhil Sharma"}
                    className="input pl-10 py-2 text-xs bg-black/40 border-white/[0.08] focus:border-brand-500/60 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 91030 31412"
                    className="input pl-10 py-2 text-xs bg-black/40 border-white/[0.08] focus:border-brand-500/60 rounded-xl"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={mode === "login" ? "admin@mockon.ai or you@example.com" : "you@example.com"}
                className="input pl-10 py-2 text-xs bg-black/40 border-white/[0.08] focus:border-brand-500/60 rounded-xl"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="input pl-10 py-2 text-xs bg-black/40 border-white/[0.08] focus:border-brand-500/60 rounded-xl"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs font-bold shadow-lg shadow-brand-500/25 mt-3"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : mode === "login" ? (
              "Sign In"
            ) : (
              `Create ${role === "admin" ? "Support Admin" : "Consumer"} Account`
            )}
          </button>
        </form>

        <div className="mt-4 text-center text-xs text-white/40">
          {mode === "login" ? (
            <span>
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => setMode("register")}
                className="text-brand-400 hover:text-brand-300 font-semibold"
              >
                Sign up
              </button>
            </span>
          ) : (
            <span>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => setMode("login")}
                className="text-brand-400 hover:text-brand-300 font-semibold"
              >
                Sign in
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
