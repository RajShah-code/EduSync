import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from "react";
import {
  Pencil,
  Eraser,
  Minus,
  Square,
  Circle,
  Trash2,
  Moon,
  Sun,
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

const THICKNESSES = [2, 4, 8, 16];

export const WhiteboardCanvas = forwardRef(function WhiteboardCanvas(
  {
    readOnly = false,
    onStrokeEmit,
    onClearEmit,
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
  const [thickness, setThickness] = useState(4);
  const [bgColor, setBgColor] = useState(initialBgColor);

  // Stroke shape history for rendering & snapshotting
  const strokesRef = useRef(initialStrokes || []);
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef(null);

  // Unique instance ID for diagnostic logging
  // Expose save to image methods to parent component
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
    applyRemoteStroke: (stroke) => handleRemoteStroke(stroke),
    applyRemoteClear: () => handleRemoteClear(),
    loadSnapshot: (strokes, bg) => handleLoadSnapshot(strokes, bg),
  }));

  // Sync initialStrokes prop if passed or updated
  useEffect(() => {
    if (initialStrokes) {
      strokesRef.current = [...initialStrokes];
      redrawAll();
    }
  }, [initialStrokes]);

  // Sync initialBgColor prop
  useEffect(() => {
    if (initialBgColor) {
      setBgColor(initialBgColor);
    }
  }, [initialBgColor]);

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
    const { tool, color, thickness, points, x1, y1, x2, y2 } = stroke;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (tool === "eraser") {
      ctx.strokeStyle = bgColor;
      ctx.lineWidth = thickness * 2;
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = thickness;
    }

    if (tool === "pen" || tool === "eraser") {
      if (!points || points.length === 0) {
        ctx.restore();
        return;
      }
      if (points.length === 1) {
        ctx.fillStyle = tool === "eraser" ? bgColor : color;
        ctx.beginPath();
        ctx.arc(points[0].x, points[0].y, (thickness * (tool === "eraser" ? 2 : 1)) / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);

        // Smooth quadratic curve interpolation
        for (let i = 1; i < points.length - 1; i++) {
          const xc = (points[i].x + points[i + 1].x) / 2;
          const yc = (points[i].y + points[i + 1].y) / 2;
          ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        }

        // Draw last segment
        if (points.length > 1) {
          const last = points[points.length - 1];
          const prev = points[points.length - 2];
          ctx.quadraticCurveTo(prev.x, prev.y, last.x, last.y);
        }

        ctx.stroke();
      }
    } else if (tool === "line") {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    } else if (tool === "rectangle") {
      ctx.beginPath();
      const rectX = Math.min(x1, x2);
      const rectY = Math.min(y1, y2);
      const rectW = Math.abs(x2 - x1);
      const rectH = Math.abs(y2 - y1);
      ctx.strokeRect(rectX, rectY, rectW, rectH);
    } else if (tool === "circle") {
      ctx.beginPath();
      const radiusX = Math.abs(x2 - x1) / 2;
      const radiusY = Math.abs(y2 - y1) / 2;
      const centerX = Math.min(x1, x2) + radiusX;
      const centerY = Math.min(y1, y2) + radiusY;
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

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Safe fallback for synthetic events or touch emulation
    }
    isDrawingRef.current = true;

    const coords = getCanvasCoords(e);

    const stroke = {
      id: Date.now() + "-" + Math.random(),
      tool,
      color,
      thickness,
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

    if (current.tool === "pen" || current.tool === "eraser") {
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
    const finishedStroke = { ...currentStrokeRef.current, phase: "end" };

    strokesRef.current.push(finishedStroke);
    currentStrokeRef.current = null;
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
    }

    redrawAll();
  };

  const handleRemoteClear = () => {
    strokesRef.current = [];
    currentStrokeRef.current = null;
    redrawAll();
  };

  const handleLoadSnapshot = (strokes, bg) => {
    strokesRef.current = strokes || [];
    if (bg) setBgColor(bg);
    currentStrokeRef.current = null;
    redrawAll();
  };

  const handleClearAllInternal = () => {
    strokesRef.current = [];
    currentStrokeRef.current = null;
    redrawAll();
    if (onClearEmit) {
      onClearEmit();
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

          {/* Stroke Thickness */}
          <div className="flex items-center gap-1 bg-bg-surface px-2 py-1 rounded-md border border-border">
            <span className="text-[10px] text-text-muted mr-1 font-mono">Size:</span>
            {THICKNESSES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setThickness(t)}
                className={`px-1.5 py-0.5 text-[11px] font-mono rounded transition-all ${
                  thickness === t
                    ? "bg-accent-info text-white font-bold"
                    : "text-text-muted hover:text-text-primary hover:bg-white/5"
                }`}
              >
                {t}px
              </button>
            ))}
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
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          style={{
            touchAction: "none",
            cursor: readOnly ? "default" : tool === "eraser" ? "crosshair" : "crosshair",
            display: "block",
            width: "100%",
            height: "100%",
          }}
        />

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
