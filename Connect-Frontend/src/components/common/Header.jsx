import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, MessagesSquare, Sparkles, Bell, BellOff, Loader2 } from "lucide-react";
import { getClassMonogram } from "@/lib/utils";
import {
  isPushSupported,
  getCurrentSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/pushNotifications";

export function Header({ role = "teacher", title = "Classrooms" }) {
  const { user, logout } = useAuth();
  const roleLabel = role === "teacher" ? "Faculty" : "Student";
  const userInitials = getClassMonogram(user?.name || (role === "teacher" ? "Prof" : "Student"));

  // Notifications toggle — reflects whether THIS browser/device already has
  // an active push subscription, not just a stored preference, since the
  // browser/OS is the actual source of truth for permission state.
  const [pushSupported] = useState(isPushSupported());
  const [subscribed, setSubscribed] = useState(false);
  const [checkingPush, setCheckingPush] = useState(true);
  const [togglingPush, setTogglingPush] = useState(false);

  useEffect(() => {
    if (!pushSupported) {
      setCheckingPush(false);
      return;
    }
    getCurrentSubscription()
      .then((sub) => setSubscribed(!!sub))
      .finally(() => setCheckingPush(false));
  }, [pushSupported]);

  const handleTogglePush = async () => {
    if (togglingPush) return;
    setTogglingPush(true);
    try {
      if (subscribed) {
        await unsubscribeFromPush();
        setSubscribed(false);
      } else {
        await subscribeToPush();
        setSubscribed(true);
      }
    } catch (err) {
      console.error("[Push] toggle failed:", err.message);
    } finally {
      setTogglingPush(false);
    }
  };

  return (
    <header className="h-16 border-b border-border bg-bg-surface px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Brand & Context */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-[var(--radius-md)] bg-accent-500/15 border border-accent-500/30 flex items-center justify-center text-accent-500">
            <MessagesSquare className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm tracking-tight text-text-primary">
                EduSync <span className="text-accent-500 font-normal">Connect</span>
              </span>
              <Badge variant="outline" className="text-[10px] py-0 px-2 h-4 border-border">
                {roleLabel}
              </Badge>
            </div>
          </div>
        </div>

        <div className="h-4 w-[1px] bg-border mx-1 hidden sm:block" />

        <div className="hidden sm:block">
          <span className="text-xs text-text-muted">Companion App</span>
        </div>
      </div>

      {/* User Info & Actions */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5 pl-3 border-l border-border">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs text-text-primary bg-bg-surface-3 border border-border">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          <div className="hidden md:flex flex-col text-left">
            <span className="text-xs font-medium text-text-primary leading-tight">
              {user?.name || (role === "teacher" ? "Faculty Member" : "Student User")}
            </span>
            <span className="text-[11px] text-text-muted leading-tight">
              {user?.email || (role === "teacher" ? "teacher@edusync.internal" : "student@edusync.internal")}
            </span>
          </div>
        </div>

        {pushSupported && !checkingPush && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleTogglePush}
            disabled={togglingPush}
            className={`h-8 px-2.5 ${subscribed ? "text-accent-500 hover:text-accent-500/80" : "text-text-muted hover:text-text-primary"}`}
            title={subscribed ? "Turn off notifications" : "Turn on notifications"}
          >
            {togglingPush ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : subscribed ? (
              <Bell className="w-4 h-4" />
            ) : (
              <BellOff className="w-4 h-4" />
            )}
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          className="text-text-muted hover:text-accent-critical h-8 px-2.5 ml-1"
          title="Sign out of EduSync Connect"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline ml-1 text-xs">Sign out</span>
        </Button>
      </div>
    </header>
  );
}
