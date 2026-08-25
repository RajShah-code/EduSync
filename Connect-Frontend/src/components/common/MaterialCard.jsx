import React, { useState } from "react";
import {
  fetchMaterialDownloadLink,
  deleteClassroomMaterial,
  ApiError,
} from "@/data/mockClassrooms";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  FileArchive,
  FileCode,
  Image,
  Video,
  FileSpreadsheet,
  File,
  Download,
  Trash2,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  HardDrive,
  User,
  Calendar,
} from "lucide-react";

/**
 * Format raw bytes into human readable KB / MB
 */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Returns icon and styling based on MIME type or file extension
 */
function getFileTypeMeta(fileType = "") {
  const type = fileType.toLowerCase();

  if (type.includes("pdf")) {
    return {
      icon: FileText,
      color: "text-red-400 bg-red-500/10 border-red-500/20",
      label: "PDF Document",
    };
  }
  if (type.includes("zip") || type.includes("rar") || type.includes("tar") || type.includes("7z") || type.includes("archive")) {
    return {
      icon: FileArchive,
      color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
      label: "Compressed Archive",
    };
  }
  if (type.includes("image") || type.includes("png") || type.includes("jpg") || type.includes("jpeg") || type.includes("webp") || type.includes("svg")) {
    return {
      icon: Image,
      color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      label: "Image / Diagram",
    };
  }
  if (type.includes("video") || type.includes("mp4") || type.includes("webm") || type.includes("mov")) {
    return {
      icon: Video,
      color: "text-purple-400 bg-purple-500/10 border-purple-500/20",
      label: "Video Recording",
    };
  }
  if (type.includes("sheet") || type.includes("excel") || type.includes("csv")) {
    return {
      icon: FileSpreadsheet,
      color: "text-green-400 bg-green-500/10 border-green-500/20",
      label: "Spreadsheet",
    };
  }
  if (type.includes("javascript") || type.includes("json") || type.includes("python") || type.includes("cpp") || type.includes("code")) {
    return {
      icon: FileCode,
      color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
      label: "Code / Script",
    };
  }
  return {
    icon: File,
    color: "text-accent-500 bg-accent-500/10 border-accent-500/20",
    label: "Course Material",
  };
}

export function MaterialCard({
  material,
  role = "student",
  onDeleteSuccess,
}) {
  const { id, title, uploader_name, file_type, file_size_bytes, created_at } = material;
  const isTeacher = role === "teacher";

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);

  // Confirm-before-delete state
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const meta = getFileTypeMeta(file_type);
  const IconComponent = meta.icon;

  const formattedDate = created_at
    ? new Date(created_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

  // On-demand presigned download link fetch
  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    setDownloadError(null);

    try {
      const data = await fetchMaterialDownloadLink(id);
      if (data?.download_url) {
        // Open download in a new tab or trigger direct download
        window.open(data.download_url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setDownloadError(err.message || "Failed to generate download link.");
    } finally {
      setDownloading(false);
    }
  };

  // Delete Material
  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);

    try {
      await deleteClassroomMaterial(id);
      if (onDeleteSuccess) {
        onDeleteSuccess(id);
      }
    } catch (err) {
      setDeleteError(err.message || "Failed to delete file from storage.");
      setDeleting(false);
      setShowConfirmDelete(false);
    }
  };

  return (
    <div className="p-4 sm:p-5 rounded-[var(--radius-lg)] border border-border bg-bg-surface text-text-primary card-hover transition-colors flex flex-col justify-between gap-3 relative overflow-hidden">
      {/* Top Accent Strip */}
      <div className="h-[2px] w-full absolute top-0 left-0 bg-accent-500" />

      {/* Main Content */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3.5 flex-1 min-w-0">
          {/* File Type Icon Badge */}
          <div
            className={`w-10 h-10 rounded-[var(--radius-md)] border flex items-center justify-center shrink-0 ${meta.color}`}
          >
            <IconComponent className="w-5 h-5" />
          </div>

          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 text-text-secondary border-border bg-bg-base">
                {meta.label}
              </Badge>
              {file_size_bytes > 0 && (
                <span className="text-[11px] text-text-muted tnum flex items-center gap-1">
                  <HardDrive className="w-3 h-3" />
                  {formatBytes(file_size_bytes)}
                </span>
              )}
            </div>

            <h3 className="text-sm sm:text-base font-semibold text-text-primary leading-snug break-words truncate">
              {title}
            </h3>

            <div className="flex items-center gap-3 text-xs text-text-muted mt-0.5">
              {uploader_name && (
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3 text-text-muted" />
                  Uploaded by {uploader_name}
                </span>
              )}
              {formattedDate && (
                <span className="flex items-center gap-1 tnum">
                  <Calendar className="w-3 h-3 text-text-muted" />
                  {formattedDate}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0 pt-0.5">
          <Button
            size="sm"
            onClick={handleDownload}
            disabled={downloading}
            className="h-8 px-3 text-xs font-semibold gap-1.5 btn-press"
            title="Fetch secure download link"
          >
            {downloading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Download</span>
              </>
            )}
          </Button>

          {isTeacher && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowConfirmDelete(true)}
              disabled={deleting}
              className="h-8 w-8 text-text-muted hover:text-accent-critical hover:bg-accent-critical/10"
              title="Delete material from storage"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Download Error Banner */}
      {downloadError && (
        <div className="p-2 px-3 bg-accent-critical/10 border border-accent-critical/20 rounded-[var(--radius-sm)] flex items-center gap-2 text-xs text-accent-critical">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{downloadError}</span>
        </div>
      )}

      {/* Delete Error Banner */}
      {deleteError && (
        <div className="p-2 px-3 bg-accent-critical/10 border border-accent-critical/20 rounded-[var(--radius-sm)] flex items-center gap-2 text-xs text-accent-critical">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{deleteError}</span>
        </div>
      )}

      {/* Inline Confirm-Before-Delete Alert */}
      {showConfirmDelete && (
        <div className="p-3 bg-accent-critical/10 border border-accent-critical/30 rounded-[var(--radius-md)] flex items-center justify-between gap-3 text-xs text-accent-critical animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Permanently delete this file from storage and student access?</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowConfirmDelete(false)}
              disabled={deleting}
              className="h-7 text-xs text-text-secondary"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="h-7 text-xs font-semibold px-2.5 bg-accent-critical hover:bg-accent-critical/90 text-white gap-1"
            >
              {deleting ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <>
                  <Trash2 className="w-3 h-3" />
                  <span>Confirm Delete</span>
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
