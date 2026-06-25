import { useState } from "react";
import { useNavigate } from "react-router";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import { ArrowLeft, AlertCircle, Eye, EyeOff } from "lucide-react";
import { initSocket } from "../../store/socket";

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("http://localhost:3000/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Login failed");
        return;
      }

      // Store auth credentials
      localStorage.setItem("edusync_token", data.token);
      localStorage.setItem("edusync_user", JSON.stringify(data.user));
      
      // Initialize Socket
      initSocket(data.token);

      // Route user depending on role
      const role = data.user.role;
      if (role === "admin") {
        navigate("/admin");
      } else if (role === "teacher") {
        navigate("/teacher");
      } else if (role === "student") {
        navigate("/student");
      } else {
        setError("Invalid user role assigned. Contact system administrator.");
      }
    } catch {
      setError("Unable to connect to server. Please check connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen bg-bg-base flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Back to Home Button */}
        <button
          onClick={() => navigate("/")}
          className="mb-6 flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </button>

        {/* Login Card */}
        <div className="p-8 bg-bg-surface border border-border rounded-lg shadow-xl">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-text-primary mb-1">
              Sign In
            </h1>
            <p className="text-sm text-text-secondary">
              Enter your credentials to access the laboratory portal
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-accent-critical/10 border border-accent-critical/20 rounded flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-accent-critical mt-0.5 flex-shrink-0" />
              <p className="text-sm text-accent-critical">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email" className="text-text-secondary">
                Email / Username
              </Label>
              <Input
                id="email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 bg-bg-base border-border text-text-primary"
                placeholder="Enter email or username"
                required
              />
            </div>

            <div>
              <div className="flex justify-between items-center">
                <Label htmlFor="password" className="text-text-secondary">
                  Password
                </Label>
              </div>
              <div className="relative mt-1">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-bg-base border-border text-text-primary pr-10"
                  placeholder="Enter password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary focus:outline-none"
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
              className="w-full bg-accent-info hover:bg-accent-info/90 text-white font-medium py-2 mt-2"
            >
              {loading ? "Signing in..." : "Access Portal"}
            </Button>
          </form>
        </div>

        {/* Version Footer */}
        <div className="mt-6 text-center text-xs text-text-muted font-mono">
          v2.5.0
        </div>
      </div>
    </div>
  );
}
