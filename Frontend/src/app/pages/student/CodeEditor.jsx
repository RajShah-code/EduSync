import { useState, useEffect, useRef, useCallback } from "react";
import Editor from "@monaco-editor/react";
import { Button } from "../../components/ui/button";
import { Timer } from "../../components/Timer";
import { 
  Play, Check, ChevronLeft, ChevronRight, Code, 
  HelpCircle, AlertCircle, Terminal, X, Loader2
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

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
  code = "",
  setCode = () => {},
  language = "javascript",
  setLanguage = () => {},
  isSubmitted = false,
  onSubmit = () => {},
  onAskDoubt = () => {},
  doubt = null,
  hintRange = null,
  onDismissHint = () => {},
  timerSeconds = null
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [outputOpen, setOutputOpen] = useState(true);
  
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
          background: rgba(79, 142, 247, 0.15) !important;
          border-left: 4px solid #4F8EF7 !important;
        }
      `}</style>

      {/* Top Bar */}
      <div className="h-14 px-4 border-b border-border bg-bg-surface flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-base font-semibold text-text-primary">
            {task.title}
          </h1>
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
        </div>

        <div className="flex items-center gap-3">
          {/* Ask Doubt Button */}
          <Button
            onClick={onAskDoubt}
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

          {/* Run Button */}
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
            <Timer seconds={timerSeconds} size="md" />
          )}

          <Button
            onClick={onSubmit}
            disabled={isSubmitted}
            size="sm"
            className={`font-semibold text-white ${
              isSubmitted 
                ? "bg-accent-success/20 text-accent-success border border-accent-success/30 cursor-not-allowed" 
                : "bg-accent-success hover:bg-accent-success/90"
            }`}
          >
            {isSubmitted ? (
              <>
                <Check className="w-4 h-4 mr-1.5" />
                SUBMITTED
              </>
            ) : (
              "Submit"
            )}
          </Button>
        </div>
      </div>

      {/* Main Workspace Panels */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Task Description */}
        <div
          className={`border-r border-border bg-bg-surface transition-all duration-200 overflow-y-auto ${
            sidebarOpen ? "w-80" : "w-0"
          }`}
        >
          {sidebarOpen && (
            <div className="p-4 space-y-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2">
                  Task Description
                </h3>
                <div className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
                  {task.description}
                </div>
              </div>

              {/* Resolved Doubt Banner / Hint Display */}
              {hintRange && (
                <div className="p-3 bg-accent-info/10 border border-accent-info/20 rounded-md relative space-y-2">
                  <button 
                    onClick={onDismissHint}
                    className="absolute top-2 right-2 text-text-muted hover:text-text-primary"
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

        {/* Toggle Description Sidebar */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="w-5 bg-bg-surface border-r border-border hover:bg-bg-elevated transition-colors flex items-center justify-center flex-shrink-0"
        >
          {sidebarOpen ? (
            <ChevronLeft className="w-3.5 h-3.5 text-text-muted" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
          )}
        </button>

        {/* Central Editor Area */}
        <div className="flex-1 flex flex-col min-w-0">
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

        {/* Toggle Output Sidebar */}
        <button
          onClick={() => setOutputOpen(!outputOpen)}
          className="w-5 bg-bg-surface border-l border-border hover:bg-bg-elevated transition-colors flex items-center justify-center flex-shrink-0"
        >
          {outputOpen ? (
            <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5 text-text-muted" />
          )}
        </button>

        {/* Right Sidebar: Execution Console/Output Drawer */}
        <div
          className={`border-l border-border bg-bg-surface transition-all duration-200 flex flex-col ${
            outputOpen ? "w-96" : "w-0"
          }`}
        >
          {outputOpen && (
            <div className="p-4 flex-1 flex flex-col min-h-0 overflow-hidden">
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3 flex items-center gap-1.5 flex-shrink-0">
                <Terminal className="w-4 h-4" />
                Console Output
              </h3>

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
    </div>
  );
}
