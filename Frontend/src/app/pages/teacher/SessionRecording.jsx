import { Video } from "lucide-react";
import PageShell from "../../components/PageShell";

export function SessionRecording() {
  return (
    <PageShell>
      <div>
        <h1 className="text-2xl font-semibold text-text-primary mb-1">
          Session Recordings
        </h1>
        <p className="text-text-secondary">
          Review recorded broadcast sessions
        </p>
      </div>

      {/* Recordings save directly to your device — there is no server-side
          list to show here, so this state is permanent by design. */}
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Video className="w-12 h-12 text-text-muted" />
        <p className="text-base font-medium text-text-primary">
          Recordings save straight to your device
        </p>
        <p className="text-sm text-text-muted text-center max-w-sm">
          Start a recording from Live Broadcast and stop it to save the file directly to your
          computer — nothing is uploaded, and there's no list to browse here.
        </p>
      </div>
    </PageShell>
  );
}
