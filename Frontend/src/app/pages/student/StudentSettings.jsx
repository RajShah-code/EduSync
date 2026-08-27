import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { useNavigate } from "react-router";
import { User, Key, Question as HelpCircle } from "@phosphor-icons/react";
import { AppTour } from "../../components/AppTour";
import { settingsPageTourSteps } from "../../tours/studentTourSteps";
import { hasSeenPageTour, markPageTourSeen } from "../../tours/pageTours";
import PageShell from "../../components/PageShell";

export function StudentSettings() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [runTour, setRunTour] = useState(false);

  useEffect(() => {
    if (!hasSeenPageTour("settings")) {
      const timer = setTimeout(() => setRunTour(true), 400);
      return () => clearTimeout(timer);
    }
  }, []);

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
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[0, 1].map((i) => (
            <div key={i} className="bg-bg-surface border border-border rounded-lg p-6 space-y-4">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-48" />
              </div>
              <div className="space-y-3 pt-2">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
              <Skeleton className="h-9 w-28" />
            </div>
          ))}
        </div>
      </PageShell>
    );
  }

  if (loadError) {
    return (
      <PageShell>
        <h1 className="text-2xl font-semibold text-text-primary mb-4">Settings</h1>
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
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Settings</h1>
        <p className="text-sm text-text-secondary mt-1">
          Manage your account profile and password settings.
        </p>
      </div>

      {/* 2-Column Grid Row for Profile & Change Password Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Section 1: Profile */}
        <Card className="bg-bg-surface border-border h-full flex flex-col justify-between" data-tour="settings-profile">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-text-primary">
              <User className="h-4 w-4 text-accent-500" strokeWidth={1.75} /> Profile
            </CardTitle>
            <CardDescription className="text-xs text-text-secondary">
              View and update your profile information.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
            <form onSubmit={handleUpdateProfile} className="space-y-4 max-w-md flex-1 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs font-semibold text-text-primary">Name</Label>
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
                  <Label htmlFor="email" className="text-xs font-semibold text-text-primary">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    disabled
                    className="opacity-70 cursor-not-allowed text-text-muted"
                  />
                </div>
              </div>
              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={savingProfile}
                  className="bg-accent-700 hover:bg-accent-700/90 text-white font-medium text-xs"
                >
                  {savingProfile ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Section 2: Change Password */}
        <Card className="bg-bg-surface border-border h-full flex flex-col justify-between" data-tour="settings-password">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-text-primary">
              <Key className="h-4 w-4 text-accent-500" strokeWidth={1.75} /> Change Password
            </CardTitle>
            <CardDescription className="text-xs text-text-secondary">
              Update your account password.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
            <form onSubmit={handleChangePassword} className="space-y-4 max-w-md flex-1 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="currentPassword" className="text-xs font-semibold text-text-primary">Current Password</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="newPassword" className="text-xs font-semibold text-text-primary">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password (min 8 characters)"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className="text-xs font-semibold text-text-primary">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    required
                  />
                </div>
              </div>
              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={savingPassword}
                  className="bg-accent-700 hover:bg-accent-700/90 text-white font-medium text-xs"
                >
                  {savingPassword ? "Updating..." : "Update Password"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Section 3: App Tour */}
      <Card className="bg-bg-surface border-border" data-tour="settings-tour-replay">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-text-primary">
            <HelpCircle className="h-4 w-4 text-accent-500" strokeWidth={1.75} /> App Tour
          </CardTitle>
          <CardDescription className="text-xs text-text-secondary">
            Replay the guided feature tour for your role.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-text-secondary">
            Need a refresher on how to navigate EduSync? Launch the interactive spotlight tour anytime.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/student", { state: { startTour: true } })}
            className="flex items-center gap-1.5 text-xs"
          >
            <HelpCircle className="h-3.5 w-3.5 text-accent-500" strokeWidth={1.75} />
            Restart Tour
          </Button>
        </CardContent>
      </Card>

      <AppTour
        steps={settingsPageTourSteps}
        run={runTour}
        isManualReplay={true}
        onFinish={() => {
          setRunTour(false);
          markPageTourSeen("settings");
        }}
      />
    </PageShell>
  );
}
