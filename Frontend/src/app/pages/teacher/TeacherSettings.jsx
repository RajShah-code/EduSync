import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { useNavigate } from "react-router";
import { IconUser as User, IconKey as Key, IconHelpCircle as HelpCircle } from "@tabler/icons-react";
import PageShell from "../../components/PageShell";

export function TeacherSettings() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const fetchUser = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("edusync_token");
      if (!token) {
        setLoadError(true);
        return;
      }
      const res = await fetch(`${API_BASE_URL}/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setName(data.name || "");
        setEmail(data.email || "");
        setLoadError(false);
      } else {
        toast.error("Failed to load profile settings");
        setLoadError(true);
      }
    } catch (err) {
      toast.error("Network error loading profile settings");
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSavingProfile(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/users/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (res.ok) {
        setName(data.name);
        const existing = JSON.parse(localStorage.getItem("edusync_user") || "{}");
        const merged = { ...existing, name: data.name };
        localStorage.setItem("edusync_user", JSON.stringify(merged));
        window.dispatchEvent(new Event("edusync:user-updated"));
        toast.success("Profile updated successfully");
      } else {
        toast.error(data.message || "Failed to update profile");
      }
    } catch (err) {
      toast.error("Network error updating profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters long");
      return;
    }
    setSavingPassword(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/users/me/password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "Password updated successfully");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setShowPasswords(false);
      } else {
        toast.error(data.message || "Failed to update password");
      }
    } catch (err) {
      toast.error("Network error updating password");
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <PageShell>
        <div className="border-b border-border pb-4 space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-3 w-20" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {[0, 1].map((i) => (
              <div key={i} className="bg-bg-surface border border-border rounded-lg p-6 space-y-4">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <div className="space-y-3 pt-2">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                  {i === 1 && <Skeleton className="h-9 w-full" />}
                </div>
                <Skeleton className="h-9 w-32" />
              </div>
            ))}
          </div>
        </div>
        <Skeleton className="h-16 w-full rounded-lg" />
      </PageShell>
    );
  }

  if (loadError) {
    return (
      <PageShell>
        <h1 className="text-[length:var(--text-xl)] font-semibold text-text-primary tracking-tight border-b border-border pb-4">
          Settings
        </h1>
        <div className="p-8 bg-bg-surface border border-accent-critical/25 rounded-lg flex flex-col items-center justify-center gap-3 py-16">
          <p className="text-sm text-text-secondary">Couldn't load your profile settings.</p>
          <button
            type="button"
            onClick={fetchUser}
            className="px-4 py-2 bg-accent-700 hover:bg-accent-700/90 text-white text-sm font-medium rounded-[var(--radius-md)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
          >
            Try again
          </button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="border-b border-border pb-4">
        <h1 className="text-[length:var(--text-xl)] font-semibold text-text-primary tracking-tight">
          Settings
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Manage your account profile and password.
        </p>
      </div>

      {/* Account — Profile & Change Password are two genuinely equivalent,
          independent forms, paired side-by-side on wide viewports. They size to
          their own content (no forced equal-height stretch, which left the
          two-field Profile card with an empty gap above its button). */}
      <section className="space-y-3">
        <h2 className="text-[length:var(--text-xs)] font-semibold uppercase tracking-[0.08em] text-text-secondary">
          Account
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <Card className="bg-bg-surface border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-text-primary">
                <User className="h-4 w-4 text-accent-500" strokeWidth={1.75} /> Profile
              </CardTitle>
              <CardDescription className="text-xs text-text-secondary">
                Your display name and sign-in email.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdateProfile} className="space-y-4 max-w-md">
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs font-semibold text-text-primary">
                    Name
                  </Label>
                  <Input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-semibold text-text-primary">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    disabled
                    className="opacity-70 cursor-not-allowed text-text-muted"
                  />
                  <p className="text-xs text-text-muted">
                    Your email is managed by your administrator.
                  </p>
                </div>
                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={savingProfile}
                    className="bg-accent-700 hover:bg-accent-700/90 text-white font-medium"
                  >
                    {savingProfile ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="bg-bg-surface border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-text-primary">
                <Key className="h-4 w-4 text-accent-500" strokeWidth={1.75} /> Change Password
              </CardTitle>
              <CardDescription className="text-xs text-text-secondary">
                Use at least 8 characters. You'll stay signed in on this device.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                <div className="space-y-1.5">
                  <Label htmlFor="currentPassword" className="text-xs font-semibold text-text-primary">
                    Current Password
                  </Label>
                  <Input
                    id="currentPassword"
                    type={showPasswords ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="newPassword" className="text-xs font-semibold text-text-primary">
                    New Password
                  </Label>
                  <Input
                    id="newPassword"
                    type={showPasswords ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password (min 8 characters)"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className="text-xs font-semibold text-text-primary">
                    Confirm New Password
                  </Label>
                  <Input
                    id="confirmPassword"
                    type={showPasswords ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    required
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowPasswords((v) => !v)}
                  className="text-xs font-medium text-accent-500 hover:text-accent-300 transition-colors rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
                >
                  {showPasswords ? "Hide passwords" : "Show passwords"}
                </button>
                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={savingPassword}
                    className="bg-accent-700 hover:bg-accent-700/90 text-white font-medium"
                  >
                    {savingPassword ? "Updating..." : "Update Password"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* App Tour — deliberately a lighter, compact row rather than a third
          full Card, so it reads as a secondary utility below the account
          settings instead of competing with them. The Weekly Timetable
          shortcut that used to live here was removed as redundant (Timetable
          has its own sidebar nav entry). */}
      <div className="flex items-center justify-between gap-4 bg-bg-surface border border-border rounded-[var(--radius-lg)] px-5 py-4">
        <div className="flex items-start gap-3">
          <HelpCircle className="h-4 w-4 text-text-muted mt-0.5 shrink-0" strokeWidth={1.75} />
          <div>
            <p className="text-sm font-medium text-text-primary">App tour</p>
            <p className="text-xs text-text-secondary mt-0.5">
              Replay the guided walkthrough of EduSync for your role.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => navigate("/teacher", { state: { startTour: true } })}
          className="text-xs shrink-0"
        >
          <HelpCircle className="h-3.5 w-3.5 text-accent-500" strokeWidth={1.75} />
          Restart tour
        </Button>
      </div>
    </PageShell>
  );
}
