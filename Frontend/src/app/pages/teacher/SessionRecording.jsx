import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { VideoCamera as Video, FolderOpen, PlayCircle, Trash as Trash2, CaretLeft as ChevronLeft, CaretRight as ChevronRight, Clock, HardDrive, DownloadSimple as Download } from "@phosphor-icons/react";
import { Button } from "../../components/ui/button";
import PageShell from "../../components/PageShell";
import { getRecordings, deleteRecording } from "../../utils/recordingsStore";
import { getHandle, deleteHandle } from "../../utils/recordingHandles";

const PAGE_SIZE = 10;

function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatSize(bytes) {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let val = bytes;
  let unitIdx = 0;
  while (val >= 1024 && unitIdx < units.length - 1) {
    val /= 1024;
    unitIdx += 1;
  }
  return `${val.toFixed(unitIdx === 0 ? 0 : 1)} ${units[unitIdx]}`;
}

export function SessionRecording() {
  const [recordings, setRecordings] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [openingId, setOpeningId] = useState(null);
  const isElectron = typeof window !== "undefined" && !!window.electronAPI?.isElectron;

  const refresh = useCallback(() => {
    setRecordings(getRecordings());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const totalPages = Math.max(1, Math.ceil(recordings.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const paginated = recordings.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    setCurrentPage(1);
  }, [recordings.length]);

  const handleDelete = (id, kind) => {
    deleteRecording(id);
    if (kind === "fsa") deleteHandle(id).catch(() => {});
    refresh();
    toast.success("Removed from your recordings list (the saved file itself is untouched)");
  };

  // Electron path: a real filesystem path was captured at save time, so the
  // native shell can actually reveal it — the one case where "find this
  // file" is a real OS action rather than a browser-side approximation.
  const handleShowInFolder = async (rec) => {
    if (!isElectron || !window.electronAPI?.showItemInFolder) return;
    const result = await window.electronAPI.showItemInFolder(rec.filePath);
    if (!result?.ok) {
      toast.error(result?.error || "Couldn't locate that file — it may have been moved or deleted.");
    }
  };

  // Browser (File System Access API) path: no real path is ever exposed to
  // JS, so the closest honest equivalent is re-opening the actual file
  // (after re-confirming permission) rather than "revealing" it anywhere.
  const handleOpenRecording = async (rec) => {
    setOpeningId(rec.id);
    try {
      const handle = await getHandle(rec.id);
      if (!handle) {
        toast.error("This recording's file reference is no longer available in this browser.");
        return;
      }
      const permission = await handle.queryPermission?.({ mode: "read" });
      if (permission !== "granted") {
        const requested = await handle.requestPermission?.({ mode: "read" });
        if (requested !== "granted") {
          toast.error("Permission to open this file was denied.");
          return;
        }
      }
      const file = await handle.getFile();
      const url = URL.createObjectURL(file);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error("[SessionRecording] Failed to open recording:", err);
      toast.error("Couldn't open that file — it may have been moved, renamed, or deleted.");
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <PageShell>
      <div className="border-b border-border pb-4">
        <h1 className="text-[length:var(--text-xl)] font-semibold text-text-primary tracking-tight">
          Session Recordings
        </h1>
      </div>

      {recordings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Video className="w-12 h-12 text-text-muted" strokeWidth={1.75} />
          <p className="text-base font-medium text-text-primary">
            No recordings yet
          </p>
          <p className="text-sm text-text-muted text-center max-w-sm">
            Start a recording from Live Broadcast — once you stop it, it'll show up here with a
            way to find it again.
          </p>
        </div>
      ) : (
        <div className="bg-bg-surface border border-border rounded-[var(--radius-lg)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-bg-elevated">
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Recording
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Saved
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Size
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((rec) => (
                  <tr key={rec.id} className="table-row-hover transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-sm text-text-primary font-medium truncate max-w-xs" title={rec.filename}>
                        {rec.filename}
                      </div>
                      {(rec.lectureName || rec.subject) && (
                        <div className="text-xs text-text-muted mt-0.5 truncate max-w-xs">
                          {rec.lectureName}
                          {rec.lectureName && rec.subject ? " · " : ""}
                          {rec.subject}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary tnum">
                      {new Date(rec.startedAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary tnum">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-text-muted" strokeWidth={1.75} />
                        {formatDuration(rec.durationSeconds)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary tnum">
                      <span className="inline-flex items-center gap-1.5">
                        <HardDrive className="w-3.5 h-3.5 text-text-muted" strokeWidth={1.75} />
                        {formatSize(rec.sizeBytes)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {rec.kind === "electron" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleShowInFolder(rec)}
                            disabled={!isElectron}
                            title={
                              isElectron
                                ? "Reveal this file in your file explorer"
                                : "Only available in the EduSync desktop app"
                            }
                            className="text-xs"
                          >
                            <FolderOpen className="w-3.5 h-3.5" strokeWidth={1.75} />
                            Show in Folder
                          </Button>
                        ) : rec.kind === "fsa" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenRecording(rec)}
                            disabled={openingId === rec.id}
                            title="Re-open the saved file"
                            className="text-xs"
                          >
                            <PlayCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
                            {openingId === rec.id ? "Opening..." : "Open Recording"}
                          </Button>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1.5 text-xs text-text-muted italic"
                            title="Saved via your browser's downloads — no file reference is kept for these"
                          >
                            <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
                            Check Downloads
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(rec.id, rec.kind)}
                          className="p-1.5 text-text-muted hover:text-accent-critical transition-colors rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
                          title="Remove from this list (does not delete the saved file)"
                          aria-label={`Remove ${rec.filename} from list`}
                        >
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination — same footer pattern as AttendanceHistory.jsx, fixed
              at 10 rows per page. */}
          <div className="flex items-center justify-between gap-4 flex-wrap px-4 py-3 border-t border-border">
            <span className="text-xs tnum text-text-secondary">
              {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, recordings.length)} of {recordings.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="p-1.5 rounded-[var(--radius-sm)] border border-border text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.75} />
              </button>
              <span className="text-xs tnum text-text-primary px-2 min-w-[4.5rem] text-center">
                Page {safePage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="p-1.5 rounded-[var(--radius-sm)] border border-border text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
                aria-label="Next page"
              >
                <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.75} />
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
