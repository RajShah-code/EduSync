import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { useNavigate } from "react-router";
import { User, Key, HelpCircle, Calendar } from "lucide-react";

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
      <div className="p-6 space-y-6 max-w-4xl">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-80" />
        </div>
        {[0, 1].map((i) => (
          <div key={i} className="bg-bg-surface border border-border rounded-lg p-6 space-y-4">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-48" />
            </div>
            <div className="space-y-3 pt-2 max-w-md">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
            <Skeleton className="h-9 w-28" />
          </div>
        ))}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-6 max-w-4xl">
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
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Settings</h1>
        <p className="text-sm text-text-secondary mt-1">
          Manage your account profile and password settings.
        </p>
      </div>

      {/* Sections 1 &amp; 2: Profile &amp; Change Password — two genuinely equivalent,
          independent forms, paired side-by-side on wide viewports (matches
          StudentSettings.jsx's identical structural decision). */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <Card className="h-full flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="h-5 w-5 text-accent-500" /> Profile
            </CardTitle>
            <CardDescription>
              View and update your profile information.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
            <form onSubmit={handleUpdateProfile} className="space-y-4 max-w-md flex-1 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
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
                <Button type="submit" disabled={savingProfile}>
                  {savingProfile ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="h-full flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Key className="h-5 w-5 text-accent-500" /> Change Password
            </CardTitle>
            <CardDescription>
              Update your account password.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
            <form onSubmit={handleChangePassword} className="space-y-4 max-w-md flex-1 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password (min 8 characters)"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
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
                <Button type="submit" disabled={savingPassword}>
                  {savingPassword ? "Updating..." : "Update Password"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Section 3: Timetable Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5 text-accent-info" /> Weekly Timetable
          </CardTitle>
          <CardDescription>
            Configure or edit your recurring weekly teaching timetable and email reminder preferences.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-text-secondary mb-4">
            Use the conversational setup wizard to customize your day-by-day class schedule and automated broadcast reminders.
          </p>
          <Button
            type="button"
            onClick={() => navigate("/teacher/timetable")}
            className="flex items-center gap-2 bg-accent-700 hover:bg-accent-700/90 text-white"
          >
            <Calendar className="h-4 w-4" />
            Edit Timetable Wizard
          </Button>
        </CardContent>
      </Card>

      {/* Section 4: App Tour */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <HelpCircle className="h-5 w-5 text-accent-500" /> App Tour
          </CardTitle>
          <CardDescription>
            Replay the guided feature tour for your role.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-text-secondary mb-4">
            Need a refresher on how to navigate EduSync? Launch the interactive spotlight tour anytime.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/teacher", { state: { startTour: true } })}
            className="flex items-center gap-2"
          >
            <HelpCircle className="h-4 w-4 text-accent-info" />
            Restart Tour
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
