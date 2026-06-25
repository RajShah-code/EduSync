import { Video } from "lucide-react";

export function SessionRecording() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary mb-1">
          Session Recordings
        </h1>
        <p className="text-text-secondary">
          Review recorded broadcast sessions
        </p>
      </div>

      {/* Empty state */}
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Video className="w-12 h-12 text-text-muted" />
        <p className="text-base font-medium text-text-primary">
          No recordings yet
        </p>
        <p className="text-sm text-text-muted">
          Recorded sessions will appear here after you stop a broadcast.
        </p>
      </div>
    </div>
  );
}
