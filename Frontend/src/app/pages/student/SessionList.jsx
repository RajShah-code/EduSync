import { useState, useEffect } from "react";
import { useOutletContext } from "react-router";
import { IconBroadcast as Radio, IconSearch as Search, IconWifi as Wifi } from "@tabler/icons-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { AppTour } from "../../components/AppTour";
import { sessionsPageTourSteps } from "../../tours/studentTourSteps";
import { hasSeenPageTour, markPageTourSeen } from "../../tours/pageTours";
import PageShell from "../../components/PageShell";

// ─── Relative time helper ─────────────────────────────────────────────────────
function getRelativeTime(isoString) {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);

  if (diffSecs < 60) return "Just started";
  if (diffMins < 60) return `Started ${diffMins} min ago`;
  return `Started ${diffHours}h ${diffMins % 60}m ago`;
}

// ─── Session Card ─────────────────────────────────────────────────────────────
function SessionCard({ session, onJoin, index = 0 }) {
  return (
    <div
      className="bg-bg-surface border border-border rounded-lg p-5 flex flex-col gap-3 transition-colors duration-200 hover:border-accent-500/40"
      style={{ animation: "page-enter 220ms ease-out both", animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      {/* Header: lab room + live dot + relative time */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full bg-accent-success pulse-dot flex-shrink-0"
            aria-label="Live session"
          />
          <span className="text-accent-info text-sm font-medium tracking-wider uppercase">
            {session.lab_room}
          </span>
        </div>
        <span className="text-xs text-text-muted tnum">
          {getRelativeTime(session.started_at)}
        </span>
      </div>

      {/* Lecture name + subject */}
      <div>
        <div className="text-text-primary font-semibold text-base leading-snug">
          {session.lecture_name}
        </div>
        <div className="text-text-secondary text-sm mt-1">{session.subject}</div>
      </div>

      {/* Join button */}
      <div className="flex justify-end pt-1">
        <Button
          onClick={() => onJoin(session)}
          className="bg-accent-700 hover:bg-accent-700/90 text-white text-xs font-semibold h-8 px-4"
        >
          Join Session
        </Button>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ hasQuery }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-16 h-16 rounded-full bg-bg-surface border border-border flex items-center justify-center">
        {hasQuery ? (
          <Search className="w-8 h-8 text-text-muted" strokeWidth={1.75} />
        ) : (
          <Wifi className="w-8 h-8 text-text-muted" strokeWidth={1.75} />
        )}
      </div>
      <div className="text-center">
        <div className="text-sm font-semibold text-text-primary">
          {hasQuery ? "No matching sessions" : "No live sessions right now"}
        </div>
        <div className="text-xs text-text-secondary mt-1 max-w-xs">
          {hasQuery
            ? "Try a different search term."
            : "Check back when your instructor starts a session."}
        </div>
      </div>
    </div>
  );
}

// ─── SessionList Page ─────────────────────────────────────────────────────────
export function SessionList() {
  const { activeSessions, setShowJoinModal, setSelectedSession } =
    useOutletContext();

  const [query, setQuery] = useState("");
  const [runTour, setRunTour] = useState(false);

  useEffect(() => {
    if (!hasSeenPageTour("sessions")) {
      const timer = setTimeout(() => setRunTour(true), 400);
      return () => clearTimeout(timer);
    }
  }, []);

  // activeSessions is owned by StudentLayout and updated there via socket + fetch.
  // We only read it here and filter client-side — no duplicate socket listeners.

  // Client-side filter: by lecture name OR lab room
  const filtered = activeSessions.filter((s) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      s.lecture_name.toLowerCase().includes(q) ||
      s.lab_room.toLowerCase().includes(q)
    );
  });

  const handleJoin = (session) => {
    setSelectedSession(session);
    setShowJoinModal(true);
  };

  return (
    <PageShell>
      {/* Page header */}
      <div className="space-y-1" data-tour="sessions-header">
        <div className="flex items-center gap-3">
          <Radio className="w-[22px] h-[22px] text-accent-info" strokeWidth={1.75} />
          <h1 className="text-xl font-semibold text-text-primary">
            Live Sessions
          </h1>
          {activeSessions.length > 0 && (
            <span className="px-2 py-0.5 text-xs tnum bg-accent-success/15 text-accent-success border border-accent-success/25 rounded-full">
              {activeSessions.length} live
            </span>
          )}
        </div>
        <p className="text-sm text-text-secondary pl-8">
          Select your lab session to join
        </p>
      </div>

      {/* Search input */}
      <div className="relative" data-tour="sessions-search">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-text-muted pointer-events-none" strokeWidth={1.75} />
        <Input
          id="session-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by lecture name or lab room…"
          className="pl-9 bg-bg-base border-border text-text-primary placeholder:text-text-muted"
        />
      </div>

      {/* Session grid — 2 columns on wide, 1 on narrow */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {filtered.length > 0 ? (
          filtered.map((session, i) => (
            <SessionCard
              key={session.id}
              session={session}
              onJoin={handleJoin}
              index={i}
            />
          ))
        ) : (
          <EmptyState hasQuery={query.trim().length > 0} />
        )}
      </div>

      <AppTour
        steps={sessionsPageTourSteps}
        run={runTour}
        isManualReplay={true}
        onFinish={() => {
          setRunTour(false);
          markPageTourSeen("sessions");
        }}
      />
    </PageShell>
  );
}

