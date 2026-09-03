import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { IconVideo as Video, IconFolderOpen as FolderOpen, IconPlayerPlay as PlayCircle, IconTrash as Trash2, IconChevronLeft as ChevronLeft, IconChevronRight as ChevronRight, IconDownload as Download } from "@tabler/icons-react";
import { Button } from "../../components/ui/button";
import PageShell from "../../components/PageShell";
import { getRecordings, deleteRecording } from "../../utils/recordingsStore";
import { getHandle, deleteHandle } from "../../utils/recordingHandles";
import { formatTimeOfDay } from "../../utils/timeFormat";

const PAGE_SIZE = 10;

function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

// Coarser "1h 20m" form for the running total in the page header — the per-row
// column stays MM:SS.
function formatClock(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
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

// How the file was saved, as a short chip. "electron" kept a real path,
// "fsa" kept a File System Access handle, everything else went through a
// plain browser download with no reference retained.
const KIND_LABEL = { electron: "Desktop", fsa: "Saved file" };
const kindLabel = (kind) => KIND_LABEL[kind] || "Download";

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

  const totalBytes = useMemo(
    () => recordings.reduce((sum, r) => sum + (r.sizeBytes || 0), 0),
    [recordings],
  );
  const totalSeconds = useMemo(
    () => recordings.reduce((sum, r) => sum + (r.durationSeconds || 0), 0),
    [recordings],
  );

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
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[length:var(--text-xl)] font-semibold text-text-primary tracking-tight">
            Session Recordings
          </h1>
          {recordings.length > 0 && (
            <div className="flex items-center gap-x-2.5 text-xs text-text-muted ml-auto">
              <span aria-hidden>|</span>
              <span>
                <span className="tnum font-semibold text-text-secondary">{recordings.length}</span>{" "}
                recording{recordings.length === 1 ? "" : "s"}
              </span>
              <span aria-hidden>|</span>
              <span>
                <span className="tnum font-semibold text-text-secondary">{formatSize(totalBytes)}</span>{" "}
                total
              </span>
              <span aria-hidden>|</span>
              <span>
                <span className="tnum font-semibold text-text-secondary">{formatClock(totalSeconds)}</span>{" "}
                recorded
              </span>
            </div>
          )}
        </div>
      </div>

      {recordings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-14 h-14 rounded-full bg-bg-elevated border border-border flex items-center justify-center">
            <Video className="w-7 h-7 text-text-muted" strokeWidth={1.75} />
          </div>
          <div className="space-y-1.5">
            <p className="text-base font-medium text-text-primary">No recordings yet</p>
            <p className="text-sm text-text-muted max-w-sm mx-auto">
              Start a recording from Live Broadcast. When you stop it, it shows up here with a way to
              reopen it.
            </p>
          </div>
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
                  <th className="px-4 py-3 text-right text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-text-secondary uppercase tracking-wider">
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
                      <div
                        className="text-sm text-text-primary font-medium truncate max-w-xs"
                        title={rec.filename}
                      >
                        {rec.filename}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="inline-flex items-center rounded-[var(--radius-sm)] border border-border bg-bg-elevated px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary shrink-0">
                          {kindLabel(rec.kind)}
                        </span>
                        {(rec.lectureName || rec.subject) && (
                          <span className="text-xs text-text-muted truncate max-w-[16rem]">
                            {rec.lectureName}
                            {rec.lectureName && rec.subject ? " · " : ""}
                            {rec.subject}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary tnum whitespace-nowrap">
                      {new Date(rec.startedAt).toLocaleDateString(undefined, {
                        dateStyle: "medium",
                      })}
                      {", "}
                      {formatTimeOfDay(rec.startedAt)}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary tnum text-right">
                      {formatDuration(rec.durationSeconds)}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary tnum text-right">
                      {formatSize(rec.sizeBytes)}
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
                            <FolderOpen className="w-4 h-4" strokeWidth={1.75} />
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
                            <PlayCircle className="w-4 h-4" strokeWidth={1.75} />
                            {openingId === rec.id ? "Opening..." : "Open Recording"}
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled
                            title="Saved through your browser's downloads — EduSync keeps no file reference for these"
                            className="text-xs text-text-muted"
                          >
                            <Download className="w-4 h-4" strokeWidth={1.75} />
                            In Downloads
                          </Button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(rec.id, rec.kind)}
                          className="p-1.5 text-text-muted hover:text-accent-critical transition-colors rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
                          title="Remove from this list (does not delete the saved file)"
                          aria-label={`Remove ${rec.filename} from list`}
                        >
                          <Trash2 className="w-4 h-4" strokeWidth={1.75} />
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
                <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
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
                <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
