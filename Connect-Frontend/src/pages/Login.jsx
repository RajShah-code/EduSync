import { useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AlertCircle, Eye, EyeOff, MessagesSquare, Lock, Mail } from "lucide-react";

export function Login() {
  const navigate = useNavigate();
  const { login, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const user = await login(email, password);
      if (user.role === "teacher" || user.role === "admin") {
        navigate("/teacher");
      } else if (user.role === "student") {
        navigate("/student");
      } else {
        setError("Invalid user role assigned. Please contact the administrator.");
      }
    } catch (err) {
      setError(err.message || "Failed to sign in. Please verify credentials.");
    }
  };

  return (
    <div className="min-h-screen bg-bg-base flex flex-col items-center justify-center p-6 antialiased">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-[var(--radius-lg)] bg-accent-500/15 border border-accent-500/30 text-accent-500 mb-3">
            <MessagesSquare className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            EduSync <span className="text-accent-500 font-normal">Connect</span>
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            Real-time classroom channels and companion portal
          </p>
        </div>

        {/* Login Card */}
        <div className="p-8 bg-bg-surface border border-border rounded-[var(--radius-lg)]">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-text-primary">
              Sign In
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">
              Use your existing EduSync credentials to continue
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-5 p-3 bg-accent-critical/10 border border-accent-critical/20 rounded-[var(--radius-md)] flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-accent-critical mt-0.5 shrink-0" />
              <p className="text-xs text-accent-critical leading-relaxed">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email address</Label>
              <div className="relative mt-1.5">
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@university.edu"
                  required
                  className="pl-9"
                />
                <Mail className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <div className="relative mt-1.5">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="pl-9 pr-10"
                />
                <Lock className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary focus:outline-none"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full mt-2 font-medium"
            >
              {loading ? "Signing in..." : "Access Connect"}
            </Button>
          </form>
        </div>

        {/* Security & System Note */}
        <div className="mt-6 text-center text-xs text-text-muted space-y-1">
          <p>EduSync Connect Companion • v1.0.0</p>
          <p className="text-[11px] text-text-muted/70">
            Session credentials stored isolated to connect portal
          </p>
        </div>
      </div>
    </div>
  );
}
