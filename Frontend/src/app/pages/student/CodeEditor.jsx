import { useState, useEffect, useRef, useCallback } from "react";
import Editor from "@monaco-editor/react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import { Timer } from "../../components/Timer";
import { cn } from "../../components/ui/utils";
import { Play, Check, CaretLeft as ChevronLeft, CaretRight as ChevronRight, Code, Question as HelpCircle, WarningCircle as AlertCircle, TerminalWindow as Terminal, X, CircleNotch as Loader2, Lock, CheckCircle as CheckCircle2 } from "@phosphor-icons/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

// ── Panel resize bounds — dragging can't collapse the editor to nothing or
// blow past a sane max; below the collapse threshold the panel snaps shut
// instead of leaving a sliver too thin to use. ──
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 480;
const DEFAULT_SIDEBAR_WIDTH = 320;
const MIN_OUTPUT_WIDTH = 260;
const MAX_OUTPUT_WIDTH = 520;
const DEFAULT_OUTPUT_WIDTH = 384;
const COLLAPSE_THRESHOLD = 72;

// Lightweight modal composer — matches the app's bg-elevated modal
// convention (shared shell pattern used on the teacher side) rather than a
// bespoke inline panel, so it doesn't fight the sidebar for space while
// it's also being made resizable.
function AskDoubtModal({ open, onClose, onSend, submitting }) {
  const [text, setText] = useState("");

  useEffect(() => {
    if (open) setText("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim() || submitting) return;
    const ok = await onSend(text);
    if (ok) onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Ask a doubt"
            className="relative w-full max-w-md bg-bg-elevated border border-border rounded-[var(--radius-lg)] p-5"
            style={{ boxShadow: "var(--shadow-modal)" }}
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-accent-500" />
                Ask a Doubt
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-text-muted hover:text-text-primary rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-text-secondary mb-3">
              Your instructor will see this question along with a snapshot of your current code.
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <Textarea
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="What are you stuck on?"
                className="min-h-[100px] bg-bg-base border-border text-text-primary text-sm"
                required
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submitting || !text.trim()}
                  className="bg-accent-500 hover:bg-accent-500/90 text-white text-xs font-semibold"
                >
                  {submitting ? "Sending..." : "Send"}
                </Button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Pyodide lazy-loader (self-hosted) ─────────────────────────────────────────
let _studentPyodideLoadPromise = null;

async function loadStudentPyodide() {
  if (_studentPyodideLoadPromise) return _studentPyodideLoadPromise;

  _studentPyodideLoadPromise = (async () => {
    if (!window.__edusync_pyodide_ready) {
      await new Promise((resolve, reject) => {
        const el = document.createElement("script");
        el.src = "/pyodide/pyodide.js";
        el.onload = () => {
          window.__edusync_pyodide_ready = true;
          resolve();
        };
        el.onerror = () =>
          reject(
            new Error(
              "Could not load /pyodide/pyodide.js — ensure Pyodide files are in public/pyodide/"
            )
          );
        document.head.appendChild(el);
      });
    }
    return globalThis.loadPyodide({ indexURL: "/pyodide/" });
  })();

  return _studentPyodideLoadPromise;
}

const wrapCssInHtml = (css) =>
  `<!DOCTYPE html><html><head><style>
body{margin:0;padding:20px;background:#1a1a24;color:#f0f0f5;font-family:system-ui}
${css}
</style></head><body>
  <h1>Heading 1</h1><h2>Heading 2</h2>
  <p>Sample paragraph for CSS preview.</p>
  <button>Button</button>
  <a href="#">Anchor link</a>
  <ul><li>List item one</li><li>List item two</li></ul>
  <div class="container"><div class="box">Box element</div></div>
</body></html>`;

const buildJsSrcdoc = (code) =>
  `<!DOCTYPE html><html><head>
<script>
(function(){
  const send=(m,args)=>{
    const msg=args.map(a=>{try{return typeof a==='object'?JSON.stringify(a,null,2):String(a)}catch{return String(a)}}).join(' ');
    window.parent.postMessage({type:'__edusync_student_console__',method:m,msg},'*');
  };
  ['log','warn','error','info'].forEach(fn=>{console[fn]=(...a)=>send(fn,a);});
  window.onerror=(msg,_,line)=>{send('error',['Line '+line+': '+msg]);return true;};
  window.onunhandledrejection=e=>{send('error',['Unhandled promise: '+e.reason]);};
})();
<\/script>
</head>
<body style="margin:0;background:#1a1a24;color:#f0f0f5;font-family:system-ui;padding:12px">
<script>
try{
${code}
}catch(e){window.parent.postMessage({type:'__edusync_student_console__',method:'error',msg:e.message},'*');}
<\/script>
</body></html>`;

export function CodeEditor({
  mode = "mirror",
  task = null,
  tasks = [],
  activeTaskId = null,
  onSelectTask = () => {},
  allTasksCompleted = false,
  code = "",
  setCode = () => {},
  language = "javascript",
  setLanguage = () => {},
  isSubmitted = false,
  onSubmit = () => {},
  onAskDoubt = () => {},
  submittingDoubt = false,
  doubt = null,
  hintRange = null,
  onDismissHint = () => {},
  timerSeconds = null
}) {
  const [doubtComposerOpen, setDoubtComposerOpen] = useState(false);

  // Resizable side panels — plain pointer events, no library. Width in px
  // (not a Tailwind class) since it's continuously dragged; collapsed state
  // is separate so a collapsed panel remembers its last width for reopening.
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [outputWidth, setOutputWidth] = useState(DEFAULT_OUTPUT_WIDTH);
  const [outputCollapsed, setOutputCollapsed] = useState(false);
  const dragStateRef = useRef(null);

  const handleResizeMove = useCallback((e) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    const delta = drag.panel === "sidebar" ? e.clientX - drag.startX : drag.startX - e.clientX;
    const raw = drag.startWidth + delta;
    if (raw < COLLAPSE_THRESHOLD) {
      if (drag.panel === "sidebar") setSidebarCollapsed(true);
      else setOutputCollapsed(true);
      return;
    }
    const [min, max] = drag.panel === "sidebar"
      ? [MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH]
      : [MIN_OUTPUT_WIDTH, MAX_OUTPUT_WIDTH];
    const clamped = Math.min(max, Math.max(min, raw));
    if (drag.panel === "sidebar") {
      setSidebarCollapsed(false);
      setSidebarWidth(clamped);
    } else {
      setOutputCollapsed(false);
      setOutputWidth(clamped);
    }
  }, []);

  const handleResizeEnd = useCallback(() => {
    dragStateRef.current = null;
    window.removeEventListener("pointermove", handleResizeMove);
    window.removeEventListener("pointerup", handleResizeEnd);
  }, [handleResizeMove]);

  const handleResizeStart = useCallback((panel) => (e) => {
    e.preventDefault();
    dragStateRef.current = {
      panel,
      startX: e.clientX,
      startWidth: panel === "sidebar" ? sidebarWidth : outputWidth,
    };
    window.addEventListener("pointermove", handleResizeMove);
    window.addEventListener("pointerup", handleResizeEnd);
  }, [sidebarWidth, outputWidth, handleResizeMove, handleResizeEnd]);

  useEffect(() => () => {
    window.removeEventListener("pointermove", handleResizeMove);
    window.removeEventListener("pointerup", handleResizeEnd);
  }, [handleResizeMove, handleResizeEnd]);

  // Local execution state
  const [isRunning, setIsRunning] = useState(false);
  const [outputMode, setOutputMode] = useState("none"); // "none" | "iframe" | "console" | "text"
  const [iframeSrcdoc, setIframeSrcdoc] = useState("");
  const [iframeKey, setIframeKey] = useState(0);
  const [consoleLines, setConsoleLines] = useState([]);
  const [textOutput, setTextOutput] = useState("");
  const [pyodideLoading, setPyodideLoading] = useState(false);

  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const decorationsRef = useRef([]);

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
  };

  // Monaco deltaDecorations for doubt hint range
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;

    // Clear previous decorations if any
    if (decorationsRef.current.length > 0) {
      decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, []);
    }

    // Apply new highlight if hintRange is provided
    if (mode === "task" && hintRange && hintRange.startLine && hintRange.endLine) {
      const monaco = monacoRef.current;
      const range = new monaco.Range(
        hintRange.startLine,
        1,
        hintRange.endLine,
        1
      );

      decorationsRef.current = editorRef.current.deltaDecorations([], [
        {
          range: range,
          options: {
            isWholeLine: true,
            className: "monaco-hint-line-highlight",
            marginClassName: "monaco-hint-glyph-margin"
          }
        }
      ]);

      // Reveal the hint range lines in the editor viewport
      editorRef.current.revealLineInCenter(hintRange.startLine);
    }
  }, [hintRange, mode, code]); // Re-apply if code changes or hint changes

  // Listener for iframe postMessage (console mode)
  useEffect(() => {
    if (mode !== "task") return;

    const handler = (event) => {
      if (event.data?.type !== "__edusync_student_console__") return;
      const { method, msg } = event.data;
      const prefix =
        method === "error" ? "❌" : method === "warn" ? "⚠️" : method === "info" ? "info" : "›";
      setConsoleLines((prev) => [...prev, `${prefix} ${msg}`]);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [mode]);

  // Execute Code Pipeline
  const handleRunCode = async () => {
    if (language === "plaintext") return;
    setIsRunning(true);
    setConsoleLines([]);
    setTextOutput("");

    if (language === "html") {
      setOutputMode("iframe");
      setIframeSrcdoc(code);
      setIframeKey((k) => k + 1);
      setIsRunning(false);
    } else if (language === "css") {
      setOutputMode("iframe");
      setIframeSrcdoc(wrapCssInHtml(code));
      setIframeKey((k) => k + 1);
      setIsRunning(false);
    } else if (language === "javascript") {
      setOutputMode("console");
      setIframeSrcdoc(buildJsSrcdoc(code));
      setIframeKey((k) => k + 1);
      setIsRunning(false);
    } else if (language === "python") {
      setOutputMode("text");
      setTextOutput("⏳ Loading Python runtime…");
      setPyodideLoading(true);

      let pyodide;
      try {
        pyodide = await loadStudentPyodide();
      } catch (loadErr) {
        setPyodideLoading(false);
        setIsRunning(false);
        setTextOutput(
          `❌ Python runtime unavailable:\n${loadErr.message}\n\n` +
            `Ensure Pyodide files are in public/pyodide/`
        );
        return;
      }

      setPyodideLoading(false);
      setTextOutput("");

      try {
        pyodide.runPython(
          `import sys, io\n_out=io.StringIO()\n_err=io.StringIO()\nsys.stdout=_out\nsys.stderr=_err`
        );
        await pyodide.runPythonAsync(code);
        const stdout = pyodide.runPython("_out.getvalue()");
        const stderr = pyodide.runPython("_err.getvalue()");
        const combined = [stdout, stderr ? `[stderr]\n${stderr}` : ""]
          .filter(Boolean)
          .join("\n");
        setTextOutput(combined || "(no output)");
      } catch (runErr) {
        let errText = runErr.message || String(runErr);
        try {
          const stderr = pyodide.runPython("_err.getvalue()");
          if (stderr) errText = stderr;
        } catch {
          // ignore
        }
        setTextOutput(`❌ ${errText}`);
      } finally {
        setIsRunning(false);
      }
    }
  };

  const getLanguageMode = (lang) => {
    const modes = {
      python: "python",
      javascript: "javascript",
      html: "html",
      css: "css",
      plaintext: "plaintext"
    };
    return modes[lang?.toLowerCase()] || "plaintext";
  };

  // ─── MIRROR MODE ───
  if (mode === "mirror") {
    return (
      <div className="h-full flex flex-col bg-bg-surface">
        <Editor
          height="100%"
          language={getLanguageMode(language)}
          value={code}
          theme="vs-dark"
          options={{
            readOnly: true,
            domReadOnly: true,
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: "JetBrains Mono, Consolas, Monaco, monospace",
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: "on",
          }}
        />
      </div>
    );
  }

  // ─── TASK MODE ───
  if (!task) {
    return (
      <div className="h-screen bg-bg-base flex flex-col items-center justify-center gap-3">
        <Code className="w-12 h-12 text-text-muted" />
        <h3 className="text-base font-medium text-text-primary">
          No active task
        </h3>
        <p className="text-sm text-text-secondary">
          Ask your instructor to assign a coding task.
        </p>
      </div>
    );
  }

  const allowedLanguagesList = task.allowed_languages || ["javascript", "python", "html", "css"];
  const isDoubtPending = doubt && doubt.status === "pending";

  return (
    <div className="h-full flex flex-col bg-bg-base overflow-hidden">
      <style>{`
        .monaco-hint-line-highlight {
          background: color-mix(in srgb, var(--accent-500) 15%, transparent) !important;
          border-left: 2px solid var(--accent-500) !important;
        }
      `}</style>

      {/* Browser-tab task strip — switching between session tasks, minimal
          (no search/filter). Active tab shares the page's bg-bg-base so it
          reads as physically attached to the workspace below it; a locked
          tab (sequential-lock, computed in TaskWorkspace) is inert and shows
          the Student-orange lock icon, a completed one a green check. */}
      <div className="h-11 px-2 bg-bg-surface border-b border-border flex items-end gap-1 overflow-x-auto flex-shrink-0" role="tablist" aria-label="Session tasks">
        {tasks.map((t, idx) => {
          const isSelected = t.id === activeTaskId;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              disabled={t.locked}
              onClick={() => onSelectTask(t)}
              className={cn(
                "flex items-center gap-1.5 px-3 h-9 rounded-t-[var(--radius-md)] text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-colors duration-150",
                t.locked
                  ? "text-text-muted/50 cursor-not-allowed"
                  : isSelected
                    ? "bg-bg-base text-text-primary"
                    : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
              )}
            >
              {t.locked ? (
                <Lock className="w-3 h-3 text-accent-500 flex-shrink-0" />
              ) : t.done ? (
                <CheckCircle2 className="w-3 h-3 text-accent-success flex-shrink-0" />
              ) : null}
              <span className="max-w-[160px] truncate">{idx + 1}. {t.title}</span>
            </button>
          );
        })}
        {allTasksCompleted && (
          <span className="ml-auto mb-1.5 mr-1 flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-pill)] bg-accent-success/15 border border-accent-success/30 text-[11px] font-semibold text-accent-success">
            <CheckCircle2 className="w-3.5 h-3.5" />
            All tasks completed
          </span>
        )}
      </div>

      {/* Main Workspace Panels */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Task Title & Description */}
        <div
          className="border-r border-border bg-bg-surface overflow-y-auto flex-shrink-0"
          style={{ width: sidebarCollapsed ? 0 : sidebarWidth }}
        >
          {!sidebarCollapsed && (
            <div className="p-4 space-y-4">
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
                  Task Description
                </h3>
                <h2 className="text-sm font-semibold text-text-primary mb-2">
                  {task.title}
                </h2>
                <div className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
                  {task.description}
                </div>
              </div>

              {/* Resolved Doubt Banner / Hint Display */}
              {hintRange && (
                <div className="p-3 bg-accent-info/10 border border-accent-info/20 rounded-md relative space-y-2">
                  <button
                    onClick={onDismissHint}
                    aria-label="Dismiss instructor hint"
                    className="absolute top-2 right-2 text-text-muted hover:text-text-primary rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-accent-info">
                    <AlertCircle className="w-4 h-4" />
                    <span>Instructor Hint Available</span>
                  </div>
                  <p className="text-xs text-text-primary leading-relaxed font-mono bg-bg-base/40 p-2 rounded">
                    {doubt?.teacher_response_text}
                  </p>
                  <div className="text-[10px] text-text-muted font-mono">
                    Lines highlighted: {hintRange.startLine} - {hintRange.endLine}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Drag-resize handle — click-and-drag adjusts the description panel's
            width; dragging past the collapse threshold snaps it shut. While
            collapsed the handle widens into a click target (with a chevron)
            that reopens it, so the "hide this panel" capability survives. */}
        <div
          onPointerDown={sidebarCollapsed ? undefined : handleResizeStart("sidebar")}
          onDoubleClick={sidebarCollapsed ? undefined : () => setSidebarCollapsed(true)}
          onClick={sidebarCollapsed ? () => setSidebarCollapsed(false) : undefined}
          role="separator"
          aria-orientation="vertical"
          aria-label={sidebarCollapsed ? "Expand task description" : "Resize task description panel"}
          tabIndex={0}
          className={cn(
            "flex-shrink-0 bg-bg-surface border-r border-border hover:bg-accent-500/15 active:bg-accent-500/25 transition-colors flex items-center justify-center touch-none",
            sidebarCollapsed ? "w-4 cursor-pointer" : "w-1.5 cursor-col-resize"
          )}
        >
          {sidebarCollapsed && <ChevronRight className="w-3 h-3 text-text-muted" />}
        </div>

        {/* Central Editor Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Editor header — language selector on the left; Ask Doubt and Run
              (the execution/help cluster) on the right, immediately next to
              a live Timer. Submit now lives on the Console Output panel. */}
          <div className="h-12 px-3 border-b border-border bg-bg-surface flex items-center justify-between gap-3 flex-shrink-0">
            <Select
              value={language}
              onValueChange={setLanguage}
              disabled={isSubmitted}
            >
              <SelectTrigger className="w-32 h-8 bg-bg-base border-border font-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-bg-surface border-border text-text-primary">
                {allowedLanguagesList.map((lang) => (
                  <SelectItem key={lang} value={lang.toLowerCase()}>
                    {lang.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Button
                onClick={() => setDoubtComposerOpen(true)}
                disabled={isSubmitted || isDoubtPending}
                variant="outline"
                size="sm"
                className={`text-xs font-semibold py-1 px-3 h-8 border ${
                  isDoubtPending
                    ? "border-border text-text-muted"
                    : "border-accent-info/30 text-accent-info hover:bg-accent-info/10"
                }`}
              >
                <HelpCircle className="w-4 h-4 mr-1.5" />
                {isDoubtPending ? "Waiting for response..." : "Ask Doubt"}
              </Button>

              <Button
                onClick={handleRunCode}
                disabled={isRunning || pyodideLoading || isSubmitted}
                variant="outline"
                size="sm"
                className="border-accent-success text-accent-success hover:bg-accent-success/10 h-8 font-semibold text-xs py-1 px-3"
              >
                {pyodideLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-1.5" />
                    {isRunning ? "Running..." : "Run"}
                  </>
                )}
              </Button>

              {timerSeconds !== null && (
                <>
                  <div className="w-px h-5 bg-border mx-0.5" aria-hidden="true" />
                  <Timer seconds={timerSeconds} size="md" />
                </>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-hidden relative">
            <Editor
              height="100%"
              language={getLanguageMode(language)}
              value={code}
              onChange={(value) => setCode(value || "")}
              onMount={handleEditorDidMount}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                fontFamily: "JetBrains Mono, Consolas, Monaco, monospace",
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 4,
                wordWrap: "on",
                readOnly: isSubmitted,
                domReadOnly: isSubmitted,
              }}
            />
          </div>
        </div>

        {/* Drag-resize handle for the console panel — same behavior as the
            description panel's handle, mirrored (collapsed state widens with
            a chevron pointing the other way). */}
        <div
          onPointerDown={outputCollapsed ? undefined : handleResizeStart("output")}
          onDoubleClick={outputCollapsed ? undefined : () => setOutputCollapsed(true)}
          onClick={outputCollapsed ? () => setOutputCollapsed(false) : undefined}
          role="separator"
          aria-orientation="vertical"
          aria-label={outputCollapsed ? "Expand console output" : "Resize console output panel"}
          tabIndex={0}
          className={cn(
            "flex-shrink-0 bg-bg-surface border-l border-border hover:bg-accent-500/15 active:bg-accent-500/25 transition-colors flex items-center justify-center touch-none",
            outputCollapsed ? "w-4 cursor-pointer" : "w-1.5 cursor-col-resize"
          )}
        >
          {outputCollapsed && <ChevronLeft className="w-3 h-3 text-text-muted" />}
        </div>

        {/* Right Sidebar: Execution Console/Output Drawer */}
        <div
          className="border-l border-border bg-bg-surface flex flex-col flex-shrink-0"
          style={{ width: outputCollapsed ? 0 : outputWidth }}
        >
          {!outputCollapsed && (
            <div className="p-4 flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2 mb-3 flex-shrink-0">
                <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                  <Terminal className="w-4 h-4" />
                  Console Output
                </h3>
                <Button
                  onClick={onSubmit}
                  disabled={isSubmitted}
                  size="sm"
                  className={`font-semibold text-white text-xs h-7 px-3 ${
                    isSubmitted
                      ? "bg-accent-success/20 text-accent-success border border-accent-success/30 cursor-not-allowed"
                      : "bg-accent-success hover:bg-accent-success/90"
                  }`}
                >
                  {isSubmitted ? (
                    <>
                      <Check className="w-3.5 h-3.5 mr-1.5" />
                      SUBMITTED
                    </>
                  ) : (
                    "Submit"
                  )}
                </Button>
              </div>

              <div className="flex-1 flex flex-col bg-bg-base border border-border rounded overflow-hidden min-h-0">
                {outputMode === "iframe" && (
                  <iframe
                    key={iframeKey}
                    srcDoc={iframeSrcdoc}
                    sandbox="allow-scripts"
                    title="Student html output"
                    className="w-full flex-1 border-none bg-white"
                  />
                )}

                {outputMode === "console" && (
                  <div className="flex-1 flex flex-col min-h-0">
                    <iframe
                      key={iframeKey}
                      srcDoc={iframeSrcdoc}
                      sandbox="allow-scripts"
                      title="Student js console runtime"
                      className="hidden"
                    />
                    <pre className="flex-1 overflow-y-auto p-3 font-mono text-xs text-text-primary whitespace-pre-wrap leading-relaxed select-text">
                      {consoleLines.length > 0
                        ? consoleLines.join("\n")
                        : "// No console output. Use console.log() to print."}
                    </pre>
                  </div>
                )}

                {outputMode === "text" && (
                  <pre className="flex-1 overflow-y-auto p-3 font-mono text-xs text-text-primary whitespace-pre-wrap leading-relaxed select-text">
                    {textOutput || "(no output)"}
                  </pre>
                )}

                {outputMode === "none" && (
                  <div className="flex-1 flex items-center justify-center text-xs text-text-muted italic">
                    Run your code to see output
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <AskDoubtModal
        open={doubtComposerOpen}
        onClose={() => setDoubtComposerOpen(false)}
        onSend={onAskDoubt}
        submitting={submittingDoubt}
      />
    </div>
  );
}
