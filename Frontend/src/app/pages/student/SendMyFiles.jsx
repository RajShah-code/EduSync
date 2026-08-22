import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect, useRef } from "react";
import JSZip from "jszip";
import {
  FolderOpen,
  File,
  Mail,
  Send,
  AlertTriangle,
  CheckCircle2,
  FileArchive,
  Loader2,
  Info,
  X,
  Trash2,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { toast } from "sonner";
import { AppTour } from "../../components/AppTour";
import { sendFilesPageTourSteps } from "../../tours/studentTourSteps";
import { hasSeenPageTour, markPageTourSeen } from "../../tours/pageTours";
import PageShell from "../../components/PageShell";

export function SendMyFiles() {
  const [isSupported, setIsSupported] = useState(true);
  const [dirHandle, setDirHandle] = useState(null);
  const [fileHandles, setFileHandles] = useState([]);
  const [pickerMethod, setPickerMethod] = useState(""); // "folder", "files", or "combined"

  const [folderName, setFolderName] = useState("");
  const [fileCount, setFileCount] = useState(0);
  const [zipBlob, setZipBlob] = useState(null);
  const [zipSizeMB, setZipSizeMB] = useState(0);
  const [zipBase64, setZipBase64] = useState("");

  const [isZipping, setIsZipping] = useState(false);
  const [zipProgressPercent, setZipProgressPercent] = useState(0);

  const [recipientEmail, setRecipientEmail] = useState("");
  const [emailError, setEmailError] = useState("");

  const [isSending, setIsSending] = useState(false);
  const [sendProgressPercent, setSendProgressPercent] = useState(0);
  const [sendSuccess, setSendSuccess] = useState(null);

  const [runTour, setRunTour] = useState(false);

  useEffect(() => {
    if (!("showDirectoryPicker" in window) || !("showOpenFilePicker" in window)) {
      setIsSupported(false);
    }
  }, []);

  useEffect(() => {
    if (!hasSeenPageTour("sendfiles")) {
      const timer = setTimeout(() => setRunTour(true), 400);
      return () => clearTimeout(timer);
    }
  }, []);

  // Helper function to recursively traverse directory handles
  const addDirectoryToZip = async (directoryHandle, currentPath, zipInstance, countRef) => {
    for await (const entry of directoryHandle.values()) {
      if (entry.kind === "file") {
        const file = await entry.getFile();
        const fileData = await file.arrayBuffer();
        const pathInZip = currentPath ? `${currentPath}/${entry.name}` : entry.name;
        zipInstance.file(pathInZip, fileData);
        countRef.count += 1;
      } else if (entry.kind === "directory") {
        const nextPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
        await addDirectoryToZip(entry, nextPath, zipInstance, countRef);
      }
    }
  };

  // Central zipping pipeline with JSZip generateAsync progress callback & duration logging
  const processSelection = async (currentDirHandle, currentFileHandles) => {
    let currentMethod = "";
    if (currentDirHandle && currentFileHandles.length > 0) {
      currentMethod = "combined";
    } else if (currentDirHandle) {
      currentMethod = "folder";
    } else if (currentFileHandles.length > 0) {
      currentMethod = "files";
    } else {
      setZipBlob(null);
      setZipBase64("");
      setZipSizeMB(0);
      setFileCount(0);
      setFolderName("");
      setPickerMethod("");
      setZipProgressPercent(0);
      return;
    }

    setIsZipping(true);
    setZipProgressPercent(0);
    setSendSuccess(null);
    setEmailError("");

    try {
      const zip = new JSZip();
      const countRef = { count: 0 };

      // 1. Process directory handle if present
      if (currentDirHandle) {
        await addDirectoryToZip(currentDirHandle, currentDirHandle.name, zip, countRef);
      }

      // 2. Process individual file handles if present
      if (currentFileHandles.length > 0) {
        for (const fh of currentFileHandles) {
          const file = await fh.getFile();
          const fileData = await file.arrayBuffer();
          zip.file(file.name, fileData);
          countRef.count += 1;
        }
      }

      // 3. Compress with JSZip progress metadata
      const blob = await zip.generateAsync(
        { type: "blob" },
        (metadata) => {
          setZipProgressPercent(Math.round(metadata.percent));
        }
      );

      const sizeMB = blob.size / (1024 * 1024);

      let pkgDisplayName = "";
      if (currentMethod === "combined") {
        pkgDisplayName = `${currentDirHandle.name} + ${currentFileHandles.length} file(s)`;
      } else if (currentMethod === "folder") {
        pkgDisplayName = currentDirHandle.name;
      } else {
        pkgDisplayName = `${currentFileHandles.length} file(s)`;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result;
        setZipBase64(base64String);
        setZipBlob(blob);
        setZipSizeMB(sizeMB);
        setFileCount(countRef.count);
        setFolderName(pkgDisplayName);
        setPickerMethod(currentMethod);
        setIsZipping(false);

        if (sizeMB > 20) {
          toast.error(`Zip size (${sizeMB.toFixed(2)} MB) exceeds maximum 20MB limit.`);
        } else {
          toast.success(
            `Zipped package ready (${sizeMB.toFixed(2)} MB, ${countRef.count} file${countRef.count !== 1 ? "s" : ""}).`
          );
        }
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      setIsZipping(false);
      console.error("Error processing zip selection:", err);
      toast.error(`Failed to process selection: ${err.message}`);
    }
  };

  const handleSelectFolder = async () => {
    try {
      if (!("showDirectoryPicker" in window)) {
        toast.error("Directory picker is not supported on this browser.");
        return;
      }

      const selectedDir = await window.showDirectoryPicker();
      setDirHandle(selectedDir);
      await processSelection(selectedDir, fileHandles);
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Error selecting folder:", err);
        toast.error(`Failed to select folder: ${err.message}`);
      }
    }
  };

  const handleSelectFiles = async () => {
    try {
      if (!("showOpenFilePicker" in window)) {
        toast.error("File picker is not supported on this browser.");
        return;
      }

      const selectedFiles = await window.showOpenFilePicker({ multiple: true });
      const existingNames = new Set(fileHandles.map((fh) => fh.name));
      const newUnique = selectedFiles.filter((fh) => !existingNames.has(fh.name));
      const updatedFiles = [...fileHandles, ...newUnique];

      setFileHandles(updatedFiles);
      await processSelection(dirHandle, updatedFiles);
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Error selecting files:", err);
        toast.error(`Failed to select files: ${err.message}`);
      }
    }
  };

  const handleRemoveFolder = async () => {
    setDirHandle(null);
    await processSelection(null, fileHandles);
    toast.info("Folder removed from selection.");
  };

  const handleRemoveFile = async (indexToRemove) => {
    const fileToRemove = fileHandles[indexToRemove];
    const updatedFiles = fileHandles.filter((_, idx) => idx !== indexToRemove);
    setFileHandles(updatedFiles);
    await processSelection(dirHandle, updatedFiles);
    toast.info(`Removed ${fileToRemove?.name || "file"}`);
  };

  const handleClearAll = () => {
    setDirHandle(null);
    setFileHandles([]);
    setPickerMethod("");
    setFolderName("");
    setFileCount(0);
    setZipBlob(null);
    setZipSizeMB(0);
    setZipBase64("");
    setZipProgressPercent(0);
    setSendProgressPercent(0);
    setSendSuccess(null);
    setEmailError("");
    toast.info("All selected items cleared.");
  };

  // Upload handler via XMLHttpRequest for real-time send progress tracking & JWT Auth header
  const handleSendEmail = (e) => {
    e.preventDefault();
    setEmailError("");

    if (!recipientEmail || !recipientEmail.trim()) {
      setEmailError("Recipient email is required.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipientEmail.trim())) {
      setEmailError("Please enter a valid email address.");
      return;
    }

    if (!zipBase64 || !zipBlob) {
      toast.error("Please select a folder or file(s) first.");
      return;
    }

    if (zipSizeMB > 20) {
      toast.error("Cannot send: Zip file exceeds 20MB limit.");
      return;
    }

    setIsSending(true);
    setSendProgressPercent(0);
    setSendSuccess(null);

    const token = localStorage.getItem("edusync_token");
    const xhr = new XMLHttpRequest();

    xhr.open("POST", `${API_BASE_URL}/files/email-zip`, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    // Ensure Authorization JWT token header is attached
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        setSendProgressPercent(percentComplete);
      }
    };

    xhr.onload = () => {
      setIsSending(false);

      let data;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = { message: xhr.responseText };
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        toast.success("Email sent successfully!");
        setSendSuccess(
          `Email delivered to ${recipientEmail.trim()}!${data.messageId ? ` (Message ID: ${data.messageId})` : ""}`
        );
      } else {
        console.error(`Send failure (${xhr.status}):`, data.message);
        toast.error(data.message || "Failed to send email.");
      }
    };

    xhr.onerror = () => {
      setIsSending(false);
      console.error("Send network failure");
      toast.error("Network error while sending email.");
    };

    xhr.ontimeout = () => {
      setIsSending(false);
      console.error("Send request timed out");
      toast.error("Send request timed out.");
    };

    const payload = JSON.stringify({
      recipientEmail: recipientEmail.trim(),
      zipData: zipBase64,
      folderName: folderName,
    });

    xhr.send(payload);
  };

  const hasSelection = Boolean(dirHandle || fileHandles.length > 0);

  return (
    <PageShell>
      {/* Header */}
      <div className="border-b border-border pb-4">
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Mail className="w-6 h-6 text-accent-500" strokeWidth={1.75} />
          Email My Files / Folder
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Select local folders or files on your computer, zip them client-side, and we'll email you a secure download link.
        </p>
      </div>

      {/* Unsupported Browser Alert */}
      {!isSupported && (
        <div className="p-4 bg-accent-warning/10 border border-accent-warning/30 rounded-[var(--radius-md)] flex items-start gap-3 text-text-primary">
          <AlertTriangle className="w-5 h-5 text-accent-warning flex-shrink-0 mt-0.5" strokeWidth={1.75} />
          <div>
            <h4 className="font-semibold text-accent-warning">Browser Not Supported</h4>
            <p className="text-sm text-text-secondary mt-1">
              File or folder selection via <code className="text-xs bg-bg-base px-1.5 py-0.5 rounded-[var(--radius-sm)] border border-border">showDirectoryPicker</code> / <code className="text-xs bg-bg-base px-1.5 py-0.5 rounded-[var(--radius-sm)] border border-border">showOpenFilePicker</code> is not available on this browser (e.g. Firefox or Safari). Please use Google Chrome, Microsoft Edge, or Opera.
            </p>
          </div>
        </div>
      )}

      {/* Main Card */}
      <div className="bg-bg-surface border border-border rounded-[var(--radius-lg)] p-6 space-y-6">
        {/* Step 1 and everything it produces (queue, progress, summary) sit in
            one tighter rhythm — they're all consequences of the same action,
            not separate steps. The border-t + pt-6 below is the one deliberate
            generous gap, marking the real step-1 → step-2 boundary. */}
        <div className="space-y-4">
        {/* Step 1: Select Items */}
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <label className="text-sm font-semibold text-text-primary block">
              Step 1: Choose Folder or File(s) to Zip
            </label>
            {/* Subtle Limits Info Line */}
            <div className="text-xs text-text-secondary flex items-center gap-1.5 font-medium" data-tour="sendfiles-limits">
              <Info className="w-3.5 h-3.5 text-accent-500 flex-shrink-0" strokeWidth={1.75} />
              <span className="tnum">Max size: 20MB per send &bull; Up to 5 sends per hour</span>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap pt-1" data-tour="sendfiles-select">
            {/* Button 1: Select Folder */}
            <Button
              type="button"
              onClick={handleSelectFolder}
              disabled={!isSupported || isZipping || isSending}
              className="bg-accent-700 hover:bg-accent-700/90 text-white font-medium flex items-center gap-2"
            >
              <FolderOpen className="w-4 h-4" strokeWidth={1.75} />
              Select Folder
            </Button>

            {/* Button 2: Select File(s) */}
            <Button
              type="button"
              onClick={handleSelectFiles}
              disabled={!isSupported || isZipping || isSending}
              variant="outline"
              className="border-border text-text-primary hover:bg-bg-base font-medium flex items-center gap-2"
            >
              <File className="w-4 h-4 text-accent-500" strokeWidth={1.75} />
              Select File(s)
            </Button>

            {/* Clear All Button */}
            {hasSelection && (
              <Button
                type="button"
                onClick={handleClearAll}
                disabled={isZipping || isSending}
                variant="ghost"
                className="text-accent-critical hover:bg-accent-critical/10 text-xs font-semibold flex items-center gap-1.5 h-9"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                Clear All
              </Button>
            )}
          </div>
        </div>

        {/* Queued Items List */}
        {hasSelection && (
          <div className="space-y-2 p-4 bg-bg-base border border-border rounded-[var(--radius-md)] text-sm">
            <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
              Queued Items for Zip Package:
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {/* Queued Folder Entry */}
              {dirHandle && (
                <div className="flex items-center justify-between py-1 px-2.5 bg-bg-surface border border-border rounded-[var(--radius-sm)] text-text-primary">
                  <span className="flex items-center gap-2 truncate font-medium">
                    <FolderOpen className="w-4 h-4 text-accent-500 flex-shrink-0" strokeWidth={1.75} />
                    <span className="truncate">Folder: {dirHandle.name}</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleRemoveFolder}
                    disabled={isZipping || isSending}
                    title="Remove folder"
                    aria-label="Remove folder from selection"
                    className="p-1 text-text-muted hover:text-accent-critical hover:bg-accent-critical/10 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
                  >
                    <X className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                </div>
              )}

              {/* Queued Individual File Entries */}
              {fileHandles.map((fh, idx) => (
                <div
                  key={`${fh.name}-${idx}`}
                  className="flex items-center justify-between py-1 px-2.5 bg-bg-surface border border-border rounded-[var(--radius-sm)] text-text-primary stagger-enter"
                  style={{ animationDelay: `${Math.min(idx, 6) * 40}ms` }}
                >
                  <span className="flex items-center gap-2 truncate font-medium">
                    <File className="w-4 h-4 text-text-muted flex-shrink-0" strokeWidth={1.75} />
                    <span className="truncate">{fh.name}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(idx)}
                    disabled={isZipping || isSending}
                    title="Remove file"
                    aria-label={`Remove ${fh.name} from selection`}
                    className="p-1 text-text-muted hover:text-accent-critical hover:bg-accent-critical/10 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
                  >
                    <X className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Progress Indicator 1: Zip Compression */}
        {isZipping && (
          <div className="p-4 bg-accent-500/10 border border-accent-500/30 rounded-[var(--radius-md)] space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-accent-500">
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />
                Compressing files...
              </span>
              <span className="tnum">{zipProgressPercent}%</span>
            </div>
            <div className="w-full bg-bg-base rounded-full h-2 overflow-hidden border border-border">
              <div
                className="bg-accent-500 h-full transition-all duration-150 ease-out"
                style={{ width: `${zipProgressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Zip Summary & Size Badge */}
        {!isZipping && zipBlob && (
          <div
            className={`p-4 rounded-[var(--radius-md)] border text-sm flex items-center justify-between gap-3 flex-wrap ${
              zipSizeMB > 20
                ? "bg-accent-critical/10 border-accent-critical/30 text-text-primary"
                : "bg-bg-base border-border text-text-primary"
            }`}
          >
            <div className="flex items-center gap-3">
              <FileArchive
                className={`w-5 h-5 ${zipSizeMB > 20 ? "text-accent-critical" : "text-accent-success"}`}
                strokeWidth={1.75}
              />
              <div>
                <div className="font-semibold flex items-center gap-2">
                  <span>Zipped Package:</span>
                  <span className="text-xs text-accent-500">[{pickerMethod.toUpperCase()}]</span>
                  <span className="text-xs">{folderName}.zip</span>
                </div>
                <div className="text-xs text-text-secondary mt-0.5 tnum">
                  Total Zipped Size: <span className="font-semibold text-text-primary">{zipSizeMB.toFixed(2)} MB</span> ({fileCount} file{fileCount !== 1 ? "s" : ""}, Limit: 20.00 MB)
                </div>
              </div>
            </div>

            {zipSizeMB > 20 ? (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-[var(--radius-sm)] bg-accent-critical/20 text-accent-critical border border-accent-critical/40">
                Size Limit Exceeded (&gt; 20MB)
              </span>
            ) : (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-[var(--radius-sm)] bg-accent-success/20 text-accent-success border border-accent-success/40">
                ✓ Ready to Send
              </span>
            )}
          </div>
        )}

        {/* Progress Indicator 2: Email Send Upload */}
        {isSending && (
          <div className="p-4 bg-accent-500/10 border border-accent-500/30 rounded-[var(--radius-md)] space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-accent-500">
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />
                Sending email via SMTP...
              </span>
              <span className="tnum">{sendProgressPercent}%</span>
            </div>
            <div className="w-full bg-bg-base rounded-full h-2 overflow-hidden border border-border">
              <div
                className="bg-accent-500 h-full transition-all duration-150 ease-out"
                style={{ width: `${sendProgressPercent}%` }}
              />
            </div>
          </div>
        )}
        </div>

        {/* Step 2: Email Input & Submit */}
        <form onSubmit={handleSendEmail} className="space-y-5 pt-6 border-t border-border" data-tour="sendfiles-email">
          <div className="space-y-3">
            <Label htmlFor="recipientEmail" className="text-sm font-semibold text-text-primary block">
              Step 2: Recipient Email Address
            </Label>
            <div className="relative max-w-md">
              <Input
                id="recipientEmail"
                type="email"
                placeholder="e.g. recipient@example.com"
                value={recipientEmail}
                onChange={(e) => {
                  setRecipientEmail(e.target.value);
                  if (emailError) setEmailError("");
                }}
                disabled={isSending || isZipping || !zipBlob}
                className={`bg-bg-base border-border text-text-primary pl-10 ${
                  emailError ? "border-accent-critical focus-visible:ring-accent-critical" : ""
                }`}
              />
              <Mail className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.75} />
            </div>
            {emailError && <p className="text-xs text-accent-critical mt-1">{emailError}</p>}
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={!zipBlob || zipSizeMB > 20 || isSending || isZipping}
            className={`font-semibold flex items-center gap-2 transition-all ${
              !zipBlob || zipSizeMB > 20 || isSending || isZipping
                ? "bg-bg-surface-3 border border-border text-text-muted cursor-not-allowed"
                : "bg-accent-700 hover:bg-accent-700/90 text-white"
            }`}
          >
            {isSending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />
                <span className="tnum">Sending Email ({sendProgressPercent}%)...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" strokeWidth={1.75} />
                Email Me the Link
              </>
            )}
          </Button>
        </form>

        {/* Success Message Banner */}
        {sendSuccess && (
          <div className="p-4 bg-accent-success/10 border border-accent-success/30 rounded-[var(--radius-md)] flex items-center gap-2 text-accent-success badge-enter">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" strokeWidth={1.75} />
            <span className="text-sm font-medium">{sendSuccess}</span>
          </div>
        )}
      </div>

      <AppTour
        steps={sendFilesPageTourSteps}
        run={runTour}
        isManualReplay={true}
        onFinish={() => {
          setRunTour(false);
          markPageTourSeen("sendfiles");
        }}
      />
    </PageShell>
  );
}
