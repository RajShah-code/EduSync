import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useEffect,
  useState,
} from "react";
import {
  Pencil,
  Eraser,
  Minus,
  Square,
  Circle,
  Trash2,
  Moon,
  Sun,
  Undo2,
  Redo2,
} from "lucide-react";

const PRESET_COLORS = [
  "#FFFFFF",
  "#000000",
  "#EF4444",
  "#22C55E",
  "#3B82F6",
  "#EAB308",
  "#A855F7",
  "#F97316",
];

const PEN_SIZES = [2, 4, 8, 16];
const ERASER_SIZES = [10, 20, 40, 60];

export const WhiteboardCanvas = forwardRef(function WhiteboardCanvas(
  {
    readOnly = false,
    onStrokeEmit,
    onClearEmit,
    onSnapshotEmit,
    onSyncEmit,
    initialStrokes = [],
    initialBgColor = "#111118",
  },
  ref
) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const canvasContainerRef = useRef(null);

  // Drawing tools & configuration state
  const [tool, setTool] = useState("pen"); // 'pen' | 'eraser' | 'line' | 'rectangle' | 'circle'
  const [color, setColor] = useState("#FFFFFF");
  const [thickness, setThickness] = useState(4); // default pen thickness = 4
  const [eraserSize, setEraserSize] = useState(20); // default eraser size = 20
  const [bgColor, setBgColor] = useState(initialBgColor);
  const [eraserPos, setEraserPos] = useState({ x: 0, y: 0, visible: false });

  // Snapshot undo/redo stacks (store full snapshots of strokesRef.current)
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const strokesRef = useRef(initialStrokes || []);
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef(null);
  const strokeToolOverrideRef = useRef(null);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateHistoryState = () => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  };

  const pushSnapshotBeforeChange = () => {
    undoStackRef.current.push([...strokesRef.current.map((s) => ({ ...s }))]);
    redoStackRef.current = [];
    updateHistoryState();
  };

  const handleUndoInternal = () => {
    if (readOnly || undoStackRef.current.length === 0) return;
    const previousSnapshot = undoStackRef.current.pop();
    if (previousSnapshot) {
      redoStackRef.current.push([...strokesRef.current.map((s) => ({ ...s }))]);
      strokesRef.current = previousSnapshot;
      redrawAll();
      updateHistoryState();
      if (onSyncEmit) onSyncEmit([...strokesRef.current]);
      if (onSnapshotEmit) onSnapshotEmit([...strokesRef.current]);
    }
  };

  const handleRedoInternal = () => {
    if (readOnly || redoStackRef.current.length === 0) return;
    const nextSnapshot = redoStackRef.current.pop();
    if (nextSnapshot) {
      undoStackRef.current.push([...strokesRef.current.map((s) => ({ ...s }))]);
      strokesRef.current = nextSnapshot;
      redrawAll();
      updateHistoryState();
      if (onSyncEmit) onSyncEmit([...strokesRef.current]);
      if (onSnapshotEmit) onSnapshotEmit([...strokesRef.current]);
    }
  };

  // Expose save, load, clear, undo, redo methods to parent component
  useImperativeHandle(ref, () => ({
    getCanvasBlob: () => {
      return new Promise((resolve) => {
        if (!canvasRef.current) return resolve(null);
        canvasRef.current.toBlob((blob) => resolve(blob), "image/png");
      });
    },
    getCanvasDataURL: () => {
      if (!canvasRef.current) return null;
      return canvasRef.current.toDataURL("image/png");
    },
    getStrokes: () => strokesRef.current,
    getBgColor: () => bgColor,
    clearCanvas: () => handleClearAllInternal(),
    undo: () => handleUndoInternal(),
    redo: () => handleRedoInternal(),
    applyRemoteStroke: (stroke) => handleRemoteStroke(stroke),
    applyRemoteClear: () => handleRemoteClear(),
    loadSnapshot: (strokes, bg) => handleLoadSnapshot(strokes, bg),
  }));

  // Sync initialStrokes prop if passed or updated
  useEffect(() => {
    if (initialStrokes) {
      strokesRef.current = [...initialStrokes];
      updateHistoryState();
      redrawAll();
    }
  }, [initialStrokes]);

  // Sync initialBgColor prop
  useEffect(() => {
    if (initialBgColor) {
      setBgColor(initialBgColor);
    }
  }, [initialBgColor]);

  // Stylus button / Context menu and Keyboard shortcuts
  useEffect(() => {
    if (readOnly) return;

    const handleKeyDown = (e) => {
      // Ignore key events when user is typing in form inputs
      const targetTag = e.target?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(targetTag)) return;

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const keyLower = (e.key || "").toLowerCase();
      const code = e.code || "";

      if (isCtrlOrCmd && (keyLower === "z" || code === "KeyZ")) {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
          handleRedoInternal();
        } else {
          handleUndoInternal();
        }
      } else if (isCtrlOrCmd && (keyLower === "y" || code === "KeyY")) {
        e.preventDefault();
        e.stopPropagation();
        handleRedoInternal();
      } else if (e.key === "Delete" || code === "Delete") {
        e.preventDefault();
        e.stopPropagation();
        handleClearAllInternal();
      } else if (keyLower === "e" || code === "KeyE") {
        setTool("eraser");
      } else if (keyLower === "b" || code === "KeyB" || keyLower === "p" || code === "KeyP") {
        setTool("pen");
      } else if (keyLower === "l" || code === "KeyL") {
        setTool("line");
      } else if (keyLower === "r" || code === "KeyR") {
        setTool("rectangle");
      } else if (keyLower === "c" || code === "KeyC") {
        setTool("circle");
      }
    };

    const preventCanvasContextMenu = (e) => {
      e.preventDefault();
    };

    const container = canvasContainerRef.current;
    if (container) {
      container.addEventListener("contextmenu", preventCanvasContextMenu);
    }
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      if (container) {
        container.removeEventListener("contextmenu", preventCanvasContextMenu);
      }
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [readOnly]);

  // Resize listener to ensure sharp canvas resolution matching inner canvas wrapper bounds
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = canvasContainerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = window.devicePixelRatio || 1;

      // Commit in-progress stroke if present before resize clears context
      if (currentStrokeRef.current) {
        strokesRef.current.push(currentStrokeRef.current);
        currentStrokeRef.current = null;
      }

      // Update resolution matching inner drawing area ONLY
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      // Redraw everything after resize
      redrawAll();
    };

    handleResize();

    const resizeObserver = new ResizeObserver(() => handleResize());
    if (canvasContainerRef.current) {
      resizeObserver.observe(canvasContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [bgColor]);

  // ── Canvas Redraw Engine ───────────────────────────────────────────────────
  const redrawAll = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Clear background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    // Render historical strokes
    for (const stroke of strokesRef.current) {
      drawSingleStroke(ctx, stroke);
    }

    // Render active in-progress stroke
    if (currentStrokeRef.current) {
      drawSingleStroke(ctx, currentStrokeRef.current);
    }

    ctx.restore();
  };

  const drawSingleStroke = (ctx, stroke) => {
    const { tool, color, thickness, points, x1, y1, x2, y2, canvasWidth, canvasHeight } = stroke;

    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const curW = canvas ? canvas.width / dpr : (canvasWidth || 800);
    const curH = canvas ? canvas.height / dpr : (canvasHeight || 600);

    const scaleX = (canvasWidth && canvasWidth > 0) ? (curW / canvasWidth) : 1;
    const scaleY = (canvasHeight && canvasHeight > 0) ? (curH / canvasHeight) : 1;
    const scaleAvg = (scaleX + scaleY) / 2;

    const effThickness = thickness * scaleAvg;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (tool === "eraser") {
      ctx.strokeStyle = bgColor;
      ctx.lineWidth = effThickness;
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = effThickness;
    }

    if (tool === "pen" || tool === "eraser") {
      if (!points || points.length === 0) {
        ctx.restore();
        return;
      }
      if (points.length === 1) {
        ctx.fillStyle = tool === "eraser" ? bgColor : color;
        ctx.beginPath();
        ctx.arc(points[0].x * scaleX, points[0].y * scaleY, effThickness / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(points[0].x * scaleX, points[0].y * scaleY);

        for (let i = 1; i < points.length - 1; i++) {
          const xc = ((points[i].x + points[i + 1].x) / 2) * scaleX;
          const yc = ((points[i].y + points[i + 1].y) / 2) * scaleY;
          ctx.quadraticCurveTo(points[i].x * scaleX, points[i].y * scaleY, xc, yc);
        }

        if (points.length > 1) {
          const last = points[points.length - 1];
          const prev = points[points.length - 2];
          ctx.quadraticCurveTo(prev.x * scaleX, prev.y * scaleY, last.x * scaleX, last.y * scaleY);
        }

        ctx.stroke();
      }
    } else if (tool === "line") {
      ctx.beginPath();
      ctx.moveTo(x1 * scaleX, y1 * scaleY);
      ctx.lineTo(x2 * scaleX, y2 * scaleY);
      ctx.stroke();
    } else if (tool === "rectangle") {
      ctx.beginPath();
      const sx1 = x1 * scaleX;
      const sy1 = y1 * scaleY;
      const sx2 = x2 * scaleX;
      const sy2 = y2 * scaleY;
      const rectX = Math.min(sx1, sx2);
      const rectY = Math.min(sy1, sy2);
      const rectW = Math.abs(sx2 - sx1);
      const rectH = Math.abs(sy2 - sy1);
      ctx.strokeRect(rectX, rectY, rectW, rectH);
    } else if (tool === "circle") {
      ctx.beginPath();
      const sx1 = x1 * scaleX;
      const sy1 = y1 * scaleY;
      const sx2 = x2 * scaleX;
      const sy2 = y2 * scaleY;
      const radiusX = Math.abs(sx2 - sx1) / 2;
      const radiusY = Math.abs(sy2 - sy1) / 2;
      const centerX = Math.min(sx1, sx2) + radiusX;
      const centerY = Math.min(sy1, sy2) + radiusY;
      ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  };

  // Helper to calculate canvas-relative coordinates
  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  // ── Pointer Event Handlers (Teacher Side) ──────────────────────────────────
  const handlePointerDown = (e) => {
    if (readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const isPen = e.pointerType === "pen";
    const button = e.button;
    const buttons = e.buttons;

    // Requirement 3: Hardware stylus eraser tip (e.button === 5) or barrel button held (e.buttons & 0x20)
    const isHardwareEraser =
      isPen &&
      (button === 5 ||
        (buttons & 0x20) === 0x20 ||
        button === 2 ||
        (buttons & 2) === 2);

    const activeTool = isHardwareEraser ? "eraser" : tool;
    strokeToolOverrideRef.current = isHardwareEraser ? "eraser" : null;

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Safe fallback for synthetic events or touch emulation
    }

    // Push snapshot before starting a new completed stroke
    pushSnapshotBeforeChange();

    isDrawingRef.current = true;

    const coords = getCanvasCoords(e);
    const dpr = window.devicePixelRatio || 1;
    const cWidth = canvas.width / dpr;
    const cHeight = canvas.height / dpr;

    // Requirement 2: Store resolved line width directly into stroke's thickness field
    const baseWidth = activeTool === "eraser" ? eraserSize : thickness;
    const effThickness =
      isPen && e.pressure && e.pressure > 0
        ? Math.max(1, baseWidth * (0.3 + e.pressure * 0.7))
        : baseWidth;

    const stroke = {
      id: Date.now() + "-" + Math.random(),
      tool: activeTool,
      color,
      thickness: effThickness,
      canvasWidth: cWidth,
      canvasHeight: cHeight,
      points: [coords],
      x1: coords.x,
      y1: coords.y,
      x2: coords.x,
      y2: coords.y,
      phase: "start",
    };

    currentStrokeRef.current = stroke;
    redrawAll();

    if (onStrokeEmit) {
      onStrokeEmit(stroke);
    }
  };

  const handlePointerMove = (e) => {
    if (readOnly || !isDrawingRef.current || !currentStrokeRef.current) return;
    const coords = getCanvasCoords(e);
    const current = currentStrokeRef.current;
    const activeTool = current.tool;

    if (activeTool === "pen" || activeTool === "eraser") {
      current.points.push(coords);
    } else {
      current.x2 = coords.x;
      current.y2 = coords.y;
    }

    current.phase = "draw";
    redrawAll();

    if (onStrokeEmit) {
      onStrokeEmit({ ...current, phase: "draw" });
    }
  };

  const handlePointerMoveWithEraser = (e) => {
    const activeTool = strokeToolOverrideRef.current || tool;
    if (!readOnly && activeTool === "eraser") {
      const coords = getCanvasCoords(e);
      setEraserPos({ x: coords.x, y: coords.y, visible: true });
    } else if (eraserPos.visible) {
      setEraserPos((prev) => ({ ...prev, visible: false }));
    }
    handlePointerMove(e);
  };

  const handlePointerLeave = () => {
    if (eraserPos.visible) {
      setEraserPos((prev) => ({ ...prev, visible: false }));
    }
  };

  const handlePointerUp = (e) => {
    if (readOnly || !isDrawingRef.current || !currentStrokeRef.current) return;
    const canvas = canvasRef.current;
    if (canvas && e.pointerId !== undefined) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // Safe fallback if already released
      }
    }

    isDrawingRef.current = false;
    strokeToolOverrideRef.current = null;

    const finishedStroke = { ...currentStrokeRef.current, phase: "end" };
    strokesRef.current.push(finishedStroke);
    currentStrokeRef.current = null;
    updateHistoryState();
    redrawAll();

    if (onStrokeEmit) {
      onStrokeEmit(finishedStroke);
    }
  };

  const handlePointerCancel = (e) => {
    handlePointerUp(e);
  };

  // ── Remote Event Handlers (Student / Mirroring Side) ──────────────────────
  const handleRemoteStroke = (stroke) => {
    if (!stroke) return;
    const { phase } = stroke;

    if (phase === "start") {
      currentStrokeRef.current = stroke;
    } else if (phase === "draw") {
      currentStrokeRef.current = stroke;
    } else if (phase === "end") {
      strokesRef.current.push(stroke);
      currentStrokeRef.current = null;
      updateHistoryState();
    }

    redrawAll();
  };

  const handleRemoteClear = () => {
    pushSnapshotBeforeChange();
    strokesRef.current = [];
    currentStrokeRef.current = null;
    updateHistoryState();
    redrawAll();
  };

  const handleLoadSnapshot = (strokes, bg) => {
    strokesRef.current = strokes || [];
    if (bg) setBgColor(bg);
    currentStrokeRef.current = null;
    updateHistoryState();
    redrawAll();
  };

  const handleClearAllInternal = () => {
    if (strokesRef.current.length > 0) {
      pushSnapshotBeforeChange();
    }
    strokesRef.current = [];
    currentStrokeRef.current = null;
    updateHistoryState();
    redrawAll();
    if (onClearEmit) {
      onClearEmit();
    }
    if (onSyncEmit) {
      onSyncEmit([]);
    }
  };

  const handleBgToggle = () => {
    const newBg = bgColor === "#111118" ? "#FFFFFF" : "#111118";
    setBgColor(newBg);

    // If text color matches background, flip stroke color automatically
    if (newBg === "#FFFFFF" && color === "#FFFFFF") {
      setColor("#000000");
    } else if (newBg === "#111118" && color === "#000000") {
      setColor("#FFFFFF");
    }
  };

  const isEraserActive = tool === "eraser" || strokeToolOverrideRef.current === "eraser";

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col bg-bg-base select-none overflow-hidden">
      {/* Teacher Control Toolbar */}
      {!readOnly && (
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-bg-elevated border-b border-border text-xs flex-wrap z-10 flex-shrink-0">
          {/* Tool selectors */}
          <div className="flex items-center gap-1 bg-bg-surface p-1 rounded-md border border-border">
            <button
              type="button"
              onClick={() => setTool("pen")}
              className={`p-1.5 rounded transition-all ${
                tool === "pen"
                  ? "bg-accent-info text-white"
                  : "text-text-muted hover:text-text-primary hover:bg-white/5"
              }`}
              title="Pen"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setTool("eraser")}
              className={`p-1.5 rounded transition-all ${
                tool === "eraser"
                  ? "bg-accent-info text-white"
                  : "text-text-muted hover:text-text-primary hover:bg-white/5"
              }`}
              title="Eraser"
            >
              <Eraser className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setTool("line")}
              className={`p-1.5 rounded transition-all ${
                tool === "line"
                  ? "bg-accent-info text-white"
                  : "text-text-muted hover:text-text-primary hover:bg-white/5"
              }`}
              title="Straight Line"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setTool("rectangle")}
              className={`p-1.5 rounded transition-all ${
                tool === "rectangle"
                  ? "bg-accent-info text-white"
                  : "text-text-muted hover:text-text-primary hover:bg-white/5"
              }`}
              title="Rectangle"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setTool("circle")}
              className={`p-1.5 rounded transition-all ${
                tool === "circle"
                  ? "bg-accent-info text-white"
                  : "text-text-muted hover:text-text-primary hover:bg-white/5"
              }`}
              title="Circle / Ellipse"
            >
              <Circle className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Color Palette */}
          {tool !== "eraser" && (
            <div className="flex items-center gap-1.5 bg-bg-surface px-2 py-1 rounded-md border border-border">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-4 h-4 rounded-full border transition-all ${
                    color === c ? "scale-125 border-white shadow" : "border-border/60 hover:scale-110"
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-4 h-4 rounded cursor-pointer bg-transparent border-0 p-0"
                title="Custom Color"
              />
            </div>
          )}

          {/* Requirement 2: Dedicated Size selector — binds dynamically to tool === 'eraser' ? eraserSize : thickness */}
          <div className="flex items-center gap-1 bg-bg-surface px-2 py-1 rounded-md border border-border">
            <span className="text-[10px] text-text-muted mr-1 font-mono">
              {isEraserActive ? "Eraser Size:" : "Pen Size:"}
            </span>
            {(isEraserActive ? ERASER_SIZES : PEN_SIZES).map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => (isEraserActive ? setEraserSize(sz) : setThickness(sz))}
                className={`px-1.5 py-0.5 text-[11px] font-mono rounded transition-all ${
                  (isEraserActive ? eraserSize : thickness) === sz
                    ? "bg-accent-info text-white font-bold"
                    : "text-text-muted hover:text-text-primary hover:bg-white/5"
                }`}
              >
                {sz}px
              </button>
            ))}
          </div>

          {/* Requirement 1: Undo / Redo controls — disabled when stack is empty */}
          <div className="flex items-center gap-1 bg-bg-surface p-1 rounded-md border border-border">
            <button
              type="button"
              onClick={handleUndoInternal}
              disabled={!canUndo}
              className="p-1.5 rounded transition-all disabled:opacity-30 disabled:cursor-not-allowed text-text-muted hover:text-text-primary hover:bg-white/5"
              title="Undo (Ctrl+Z / Cmd+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleRedoInternal}
              disabled={!canRedo}
              className="p-1.5 rounded transition-all disabled:opacity-30 disabled:cursor-not-allowed text-text-muted hover:text-text-primary hover:bg-white/5"
              title="Redo (Ctrl+Y / Cmd+Shift+Z)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Background Theme & Clear */}
          <div className="flex items-center gap-1.5 ml-auto">
            <button
              type="button"
              onClick={handleBgToggle}
              className="px-2.5 py-1 text-xs font-medium border border-border rounded-md text-text-secondary hover:text-text-primary hover:bg-white/5 transition-all flex items-center gap-1.5"
              title="Toggle Board Background"
            >
              {bgColor === "#111118" ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-accent-warning" /> Light Board
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-accent-info" /> Dark Board
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleClearAllInternal}
              className="px-2.5 py-1 text-xs font-medium border border-accent-danger/30 bg-accent-danger/10 text-accent-danger hover:bg-accent-danger/20 rounded-md transition-all flex items-center gap-1.5"
              title="Wipe Canvas"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear All
            </button>
          </div>
        </div>
      )}

      {/* Main Drawing Surface */}
      <div ref={canvasContainerRef} className="relative flex-1 w-full min-h-0 overflow-hidden">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMoveWithEraser}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={handlePointerLeave}
          style={{
            touchAction: "none",
            cursor: readOnly ? "default" : isEraserActive ? "none" : "crosshair",
            display: "block",
            width: "100%",
            height: "100%",
          }}
        />

        {/* Eraser Cursor Size Border Overlay */}
        {!readOnly && isEraserActive && eraserPos.visible && (
          <div
            className="pointer-events-none absolute z-30 rounded-full border-2 border-accent-danger -translate-x-1/2 -translate-y-1/2 transition-transform duration-75"
            style={{
              left: `${eraserPos.x}px`,
              top: `${eraserPos.y}px`,
              width: `${eraserSize}px`,
              height: `${eraserSize}px`,
              boxShadow: "0 0 0 1.5px rgba(255, 255, 255, 0.9), 0 0 8px rgba(239, 68, 68, 0.5)",
              backgroundColor: "rgba(239, 68, 68, 0.15)",
            }}
          />
        )}

        {/* Read-Only Indicator Overlay on Student side */}
        {readOnly && (
          <div className="absolute top-2 right-2 px-2.5 py-1 bg-black/60 backdrop-blur border border-white/10 rounded text-[11px] font-mono text-text-muted pointer-events-none">
            Live Whiteboard (View Only)
          </div>
        )}
      </div>
    </div>
  );
});
