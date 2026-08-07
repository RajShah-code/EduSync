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

  useEffect(() => {
    if (!("showDirectoryPicker" in window) || !("showOpenFilePicker" in window)) {
      setIsSupported(false);
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

    const startTime = performance.now();
    console.log(`[DEBUG] zip-build start for method: ${currentMethod}...`);

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

      const endTime = performance.now();
      const durationMs = Math.round(endTime - startTime);
      const sizeMB = blob.size / (1024 * 1024);

      let pkgDisplayName = "";
      if (currentMethod === "combined") {
        pkgDisplayName = `${currentDirHandle.name} + ${currentFileHandles.length} file(s)`;
      } else if (currentMethod === "folder") {
        pkgDisplayName = currentDirHandle.name;
      } else {
        pkgDisplayName = `${currentFileHandles.length} file(s)`;
      }

      console.log(
        `[DEBUG] zip-build complete in ${durationMs} ms, size: ${blob.size} bytes (${sizeMB.toFixed(2)} MB), total files: ${countRef.count}, method: ${currentMethod}`
      );

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
      console.error("[DEBUG] Error processing zip selection:", err);
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
        console.error("[DEBUG] Error selecting folder:", err);
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
        console.error("[DEBUG] Error selecting files:", err);
        toast.error(`Failed to select files: ${err.message}`);
      }
    }
  };

  const handleRemoveFolder = async () => {
    console.log(`[DEBUG] Item removed: folder "${dirHandle?.name}"`);
    setDirHandle(null);
    await processSelection(null, fileHandles);
    toast.info("Folder removed from selection.");
  };

  const handleRemoveFile = async (indexToRemove) => {
    const fileToRemove = fileHandles[indexToRemove];
    console.log(`[DEBUG] Item removed: file "${fileToRemove?.name}"`);
    const updatedFiles = fileHandles.filter((_, idx) => idx !== indexToRemove);
    setFileHandles(updatedFiles);
    await processSelection(dirHandle, updatedFiles);
    toast.info(`Removed ${fileToRemove?.name || "file"}`);
  };

  const handleClearAll = () => {
    console.log("[DEBUG] Clear All triggered — selection reset to empty state");
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

    const startTime = performance.now();
    console.log(
      `[DEBUG] send start for recipient: ${recipientEmail.trim()}, package: ${folderName}, size: ${zipSizeMB.toFixed(2)} MB, picker method: ${pickerMethod}`
    );

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
      const endTime = performance.now();
      const durationMs = Math.round(endTime - startTime);
      setIsSending(false);

      let data;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = { message: xhr.responseText };
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        console.log(
          `[DEBUG] send complete in ${durationMs} ms, recipient: ${recipientEmail.trim()}, messageId: ${data.messageId || "N/A"}`
        );
        toast.success("Email sent successfully!");
        setSendSuccess(`Email delivered to ${recipientEmail.trim()}! (Message ID: ${data.messageId || "Sent"})`);
      } else {
        console.error(`[DEBUG] send failure (${xhr.status}) in ${durationMs} ms:`, data.message);
        toast.error(data.message || "Failed to send email.");
      }
    };

    xhr.onerror = () => {
      const endTime = performance.now();
      const durationMs = Math.round(endTime - startTime);
      setIsSending(false);
      console.error(`[DEBUG] send network failure after ${durationMs} ms`);
      toast.error("Network error while sending email.");
    };

    xhr.ontimeout = () => {
      setIsSending(false);
      console.error("[DEBUG] send request timed out");
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
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="border-b border-border pb-4">
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Mail className="w-6 h-6 text-accent-info" />
          Email My Files / Folder
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Select local folders or files on your computer to zip client-side and email as a backup attachment.
        </p>
      </div>

      {/* Unsupported Browser Alert */}
      {!isSupported && (
        <div className="p-4 bg-accent-warning/10 border border-accent-warning/30 rounded-lg flex items-start gap-3 text-text-primary">
          <AlertTriangle className="w-5 h-5 text-accent-warning flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-accent-warning">Browser Not Supported</h4>
            <p className="text-sm text-text-secondary mt-1">
              File or folder selection via <code className="font-mono text-xs bg-bg-base px-1.5 py-0.5 rounded border border-border">showDirectoryPicker</code> / <code className="font-mono text-xs bg-bg-base px-1.5 py-0.5 rounded border border-border">showOpenFilePicker</code> is not available on this browser (e.g. Firefox or Safari). Please use Google Chrome, Microsoft Edge, or Opera.
            </p>
          </div>
        </div>
      )}

      {/* Main Card */}
      <div className="bg-bg-surface border border-border rounded-xl p-6 space-y-6 shadow-sm">
        {/* Step 1: Select Items */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-text-primary block">
              Step 1: Choose Folder or File(s) to Zip
            </label>
            {/* Subtle Limits Info Line */}
            <div className="text-xs text-text-muted flex items-center gap-1.5 font-medium">
              <Info className="w-3.5 h-3.5 text-accent-info flex-shrink-0" />
              <span>Max size: 20MB per send &bull; Up to 5 sends per hour</span>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Button 1: Select Folder */}
            <Button
              type="button"
              onClick={handleSelectFolder}
              disabled={!isSupported || isZipping || isSending}
              className="bg-accent-info hover:bg-accent-info/90 text-white font-medium flex items-center gap-2"
            >
              <FolderOpen className="w-4 h-4" />
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
              <File className="w-4 h-4 text-accent-info" />
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
                <Trash2 className="w-3.5 h-3.5" />
                Clear All
              </Button>
            )}
          </div>
        </div>

        {/* Queued Items List */}
        {hasSelection && (
          <div className="space-y-2 p-4 bg-bg-base border border-border rounded-lg text-sm">
            <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
              Queued Items for Zip Package:
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {/* Queued Folder Entry */}
              {dirHandle && (
                <div className="flex items-center justify-between py-1 px-2.5 bg-bg-surface border border-border rounded text-text-primary">
                  <span className="flex items-center gap-2 truncate font-medium">
                    <FolderOpen className="w-4 h-4 text-accent-info flex-shrink-0" />
                    <span className="truncate">Folder: {dirHandle.name}</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleRemoveFolder}
                    disabled={isZipping || isSending}
                    title="Remove folder"
                    className="p-1 text-text-muted hover:text-accent-critical hover:bg-accent-critical/10 rounded transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Queued Individual File Entries */}
              {fileHandles.map((fh, idx) => (
                <div
                  key={`${fh.name}-${idx}`}
                  className="flex items-center justify-between py-1 px-2.5 bg-bg-surface border border-border rounded text-text-primary"
                >
                  <span className="flex items-center gap-2 truncate font-medium">
                    <File className="w-4 h-4 text-text-muted flex-shrink-0" />
                    <span className="truncate">{fh.name}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(idx)}
                    disabled={isZipping || isSending}
                    title="Remove file"
                    className="p-1 text-text-muted hover:text-accent-critical hover:bg-accent-critical/10 rounded transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Progress Indicator 1: Zip Compression */}
        {isZipping && (
          <div className="p-4 bg-accent-info/10 border border-accent-info/30 rounded-lg space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-accent-info">
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Compressing files...
              </span>
              <span>{zipProgressPercent}%</span>
            </div>
            <div className="w-full bg-bg-base rounded-full h-2 overflow-hidden border border-border">
              <div
                className="bg-accent-info h-full transition-all duration-150 ease-out"
                style={{ width: `${zipProgressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Zip Summary & Size Badge */}
        {!isZipping && zipBlob && (
          <div
            className={`p-4 rounded-lg border text-sm flex items-center justify-between ${
              zipSizeMB > 20
                ? "bg-accent-critical/10 border-accent-critical/30 text-text-primary"
                : "bg-bg-base border-border text-text-primary"
            }`}
          >
            <div className="flex items-center gap-3">
              <FileArchive
                className={`w-5 h-5 ${zipSizeMB > 20 ? "text-accent-critical" : "text-accent-success"}`}
              />
              <div>
                <div className="font-semibold flex items-center gap-2">
                  <span>Zipped Package:</span>
                  <span className="font-mono text-xs text-accent-info">[{pickerMethod.toUpperCase()}]</span>
                  <span className="font-mono text-xs">{folderName}.zip</span>
                </div>
                <div className="text-xs text-text-secondary mt-0.5">
                  Total Zipped Size: <span className="font-semibold text-text-primary">{zipSizeMB.toFixed(2)} MB</span> ({fileCount} file{fileCount !== 1 ? "s" : ""}, Limit: 20.00 MB)
                </div>
              </div>
            </div>

            {zipSizeMB > 20 ? (
              <span className="text-xs font-semibold px-2.5 py-1 rounded bg-accent-critical/20 text-accent-critical border border-accent-critical/40">
                Size Limit Exceeded (&gt; 20MB)
              </span>
            ) : (
              <span className="text-xs font-semibold px-2.5 py-1 rounded bg-accent-success/20 text-accent-success border border-accent-success/40">
                ✓ Ready to Send
              </span>
            )}
          </div>
        )}

        {/* Progress Indicator 2: Email Send Upload */}
        {isSending && (
          <div className="p-4 bg-accent-info/10 border border-accent-info/30 rounded-lg space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-accent-info">
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending email via SMTP...
              </span>
              <span>{sendProgressPercent}%</span>
            </div>
            <div className="w-full bg-bg-base rounded-full h-2 overflow-hidden border border-border">
              <div
                className="bg-accent-info h-full transition-all duration-150 ease-out"
                style={{ width: `${sendProgressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Step 2: Email Input & Submit */}
        <form onSubmit={handleSendEmail} className="space-y-4 pt-2 border-t border-border">
          <div className="space-y-2">
            <Label htmlFor="recipientEmail" className="text-sm font-semibold text-text-primary">
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
              <Mail className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
            {emailError && <p className="text-xs text-accent-critical mt-1">{emailError}</p>}
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={!zipBlob || zipSizeMB > 20 || isSending || isZipping}
            className={`font-semibold flex items-center gap-2 ${
              !zipBlob || zipSizeMB > 20 || isSending || isZipping
                ? "opacity-50 cursor-not-allowed bg-accent-info text-white"
                : "bg-accent-info hover:bg-accent-info/90 text-white"
            }`}
          >
            {isSending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending Email ({sendProgressPercent}%)...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send Zip Attachment
              </>
            )}
          </Button>
        </form>

        {/* Success Message Banner */}
        {sendSuccess && (
          <div className="p-4 bg-accent-success/10 border border-accent-success/30 rounded-lg flex items-center gap-3 text-accent-success">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-medium">{sendSuccess}</span>
          </div>
        )}
      </div>
    </div>
  );
}
