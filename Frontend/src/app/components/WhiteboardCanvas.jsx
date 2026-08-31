import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useEffect,
  useState,
} from "react";
import { IconPointer as Pointer, IconPencil as Pencil, IconEraser as Eraser, IconMinus as Minus, IconSquare as Square, IconCircle as Circle, IconTrash as Trash2, IconMoon as Moon, IconSun as Sun, IconArrowBackUp as Undo2, IconArrowForwardUp as Redo2, IconRuler2 as Ruler2 } from "@tabler/icons-react";

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
const ERASER_SIZES = [10, 20, 40, 60, 100];
const ERASER_MIN_SIZE = 10;
const ERASER_MAX_SIZE = 100;
const ERASER_STEP = 5;

// Shapes that can be selected (immediately after drawing, or by clicking
// them again later) to bring back resize handles.
const SELECTABLE_TOOLS = ["line", "rectangle", "circle"];

export const WhiteboardCanvas = forwardRef(function WhiteboardCanvas(
  {
    readOnly = false,
    isActive = true,
    onStrokeEmit,
    onStrokeDeleteEmit,
    onClearEmit,
    onSnapshotEmit,
    onSyncEmit,
    initialStrokes = [],
    initialBgColor = "#17171A",
  },
  ref
) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const canvasContainerRef = useRef(null);

  // Drawing tools & configuration state
  const [tool, setTool] = useState("pen"); // 'select' | 'pen' | 'eraser' | 'line' | 'rectangle' | 'circle'
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

  // Shape selection/activation (Line/Rectangle/Circle) — drives the marching-ants
  // outline and the resize handles. Set either right after drawing, or by
  // clicking an existing shape with the Select tool.
  const selectedShapeIdRef = useRef(null);
  const [selectedShapeId, setSelectedShapeId] = useState(null);
  const [selectedShapeTool, setSelectedShapeTool] = useState(null); // 'line' | 'rectangle' | 'circle' | null
  const [resizeHandlePositions, setResizeHandlePositions] = useState(null); // {x1,y1,x2,y2} in on-screen CSS px
  // In-progress Select-tool move-drag on the activated shape's body.
  const movingShapeRef = useRef(null);

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

  // Clears the active shape selection, its marching-ants outline, and its resize handles.
  const deselectShape = () => {
    selectedShapeIdRef.current = null;
    setSelectedShapeId(null);
    setSelectedShapeTool(null);
    setResizeHandlePositions(null);
  };

  const handleUndoInternal = () => {
    if (readOnly || undoStackRef.current.length === 0) return;
    const previousSnapshot = undoStackRef.current.pop();
    if (previousSnapshot) {
      redoStackRef.current.push([...strokesRef.current.map((s) => ({ ...s }))]);
      strokesRef.current = previousSnapshot;
      deselectShape();
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
      deselectShape();
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
    applyRemoteStrokeDelete: (strokeId) => handleRemoteStrokeDelete(strokeId),
    applyRemoteClear: () => handleRemoteClear(),
    loadSnapshot: (strokes, bg) => handleLoadSnapshot(strokes, bg),
  }));

  // Sync initialStrokes prop if passed or updated
  useEffect(() => {
    if (initialStrokes) {
      strokesRef.current = [...initialStrokes];
      deselectShape();
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

  // Switching tools drops the current shape selection/handles.
  useEffect(() => {
    deselectShape();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  // Stylus button / Context menu and Keyboard shortcuts
  useEffect(() => {
    if (readOnly || !isActive) return;

    const handleKeyDown = (e) => {
      if (!isActive) return;
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
      } else if (
        selectedShapeIdRef.current &&
        (e.key === "Delete" || code === "Delete" || e.key === "Backspace" || code === "Backspace")
      ) {
        // A shape is activated — Delete/Backspace removes just that shape.
        e.preventDefault();
        e.stopPropagation();
        handleDeleteSelectedShape();
      } else if (e.key === "Delete" || code === "Delete") {
        // Nothing activated — Delete keeps its original "clear whole canvas"
        // behavior. Backspace alone (nothing selected) intentionally does
        // nothing, so it never doubles as a surprise wipe-canvas shortcut.
        e.preventDefault();
        e.stopPropagation();
        handleClearAllInternal();
      } else if (e.key === "Escape" || code === "Escape") {
        if (selectedShapeIdRef.current) {
          e.preventDefault();
          e.stopPropagation();
          deselectShape();
        }
      } else if (
        isCtrlOrCmd &&
        (keyLower === "=" || keyLower === "+" || code === "Equal" || code === "NumpadAdd")
      ) {
        // Ctrl/Cmd + '=' (i.e. Ctrl+Plus) — grow the eraser, capped at ERASER_MAX_SIZE.
        e.preventDefault();
        e.stopPropagation();
        setEraserSize((prev) => Math.min(ERASER_MAX_SIZE, prev + ERASER_STEP));
      } else if (
        isCtrlOrCmd &&
        (keyLower === "-" || keyLower === "_" || code === "Minus" || code === "NumpadSubtract")
      ) {
        // Ctrl/Cmd + '-' — shrink the eraser, floored at ERASER_MIN_SIZE.
        e.preventDefault();
        e.stopPropagation();
        setEraserSize((prev) => Math.max(ERASER_MIN_SIZE, prev - ERASER_STEP));
      } else if (keyLower === "v" || code === "KeyV") {
        setTool("select");
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
  }, [readOnly, isActive]);

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

      // Re-derive resize-handle screen positions for the selected shape —
      // the scale factor between stroke-space and CSS px just changed.
      if (selectedShapeIdRef.current) {
        const stroke = strokesRef.current.find((s) => s.id === selectedShapeIdRef.current);
        setResizeHandlePositions(stroke ? computeHandlePositions(stroke) : null);
      }
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

    // Render historical strokes — skip one whose id matches the in-progress
    // stroke below, so a resize-in-flight (same id, already-committed shape)
    // doesn't draw the stale committed version underneath the live preview.
    for (const stroke of strokesRef.current) {
      if (currentStrokeRef.current && stroke.id === currentStrokeRef.current.id) continue;
      drawSingleStroke(ctx, stroke);
    }

    // Render active in-progress stroke
    if (currentStrokeRef.current) {
      drawSingleStroke(ctx, currentStrokeRef.current);
    }

    ctx.restore();
  };

  // Shared stroke-space → live-canvas-CSS-px scale factor, reconciling a stroke's
  // stored canvasWidth/canvasHeight against the current canvas size. Used both
  // when rendering a stroke and when positioning its resize handles, so the two
  // never drift apart.
  const getStrokeScale = (stroke) => {
    const { canvasWidth, canvasHeight } = stroke;
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const curW = canvas ? canvas.width / dpr : (canvasWidth || 800);
    const curH = canvas ? canvas.height / dpr : (canvasHeight || 600);

    const scaleX = (canvasWidth && canvasWidth > 0) ? (curW / canvasWidth) : 1;
    const scaleY = (canvasHeight && canvasHeight > 0) ? (curH / canvasHeight) : 1;
    return { scaleX, scaleY };
  };

  // On-screen CSS-px position of a Line/Rectangle/Circle stroke's two resize
  // handles, reusing the exact same scale factor as rendering.
  const computeHandlePositions = (stroke) => {
    if (!stroke) return null;
    const { scaleX, scaleY } = getStrokeScale(stroke);
    return {
      x1: stroke.x1 * scaleX,
      y1: stroke.y1 * scaleY,
      x2: stroke.x2 * scaleX,
      y2: stroke.y2 * scaleY,
    };
  };

  // ── Shape Hit-Testing (reselect an existing shape to resize it) ───────────
  // All distance helpers work in on-screen CSS-px space (same as what's
  // actually rendered), so a click matches what the teacher sees, not the
  // stroke's original recorded coordinate space.
  const distToSegment = (px, py, x1, y1, x2, y2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  };

  const distToRectBorder = (px, py, x1, y1, x2, y2) => {
    const rx = Math.min(x1, x2);
    const ry = Math.min(y1, y2);
    const rw = Math.abs(x2 - x1);
    const rh = Math.abs(y2 - y1);
    return Math.min(
      distToSegment(px, py, rx, ry, rx + rw, ry), // top
      distToSegment(px, py, rx, ry + rh, rx + rw, ry + rh), // bottom
      distToSegment(px, py, rx, ry, rx, ry + rh), // left
      distToSegment(px, py, rx + rw, ry, rx + rw, ry + rh) // right
    );
  };

  const distToEllipseBoundary = (px, py, x1, y1, x2, y2) => {
    const radiusX = Math.abs(x2 - x1) / 2;
    const radiusY = Math.abs(y2 - y1) / 2;
    const centerX = Math.min(x1, x2) + radiusX;
    const centerY = Math.min(y1, y2) + radiusY;
    if (radiusX < 0.5 || radiusY < 0.5) return Math.hypot(px - centerX, py - centerY);
    // Approximate closest boundary point: use the click's angle from center
    // (normalized for the two radii) and project it back onto the ellipse.
    const angle = Math.atan2((py - centerY) / radiusY, (px - centerX) / radiusX);
    const boundaryX = centerX + radiusX * Math.cos(angle);
    const boundaryY = centerY + radiusY * Math.sin(angle);
    return Math.hypot(px - boundaryX, py - boundaryY);
  };

  // Iterates strokesRef.current back-to-front (most recently drawn = topmost)
  // and returns the first selectable shape whose outline passes near coords
  // (already in on-screen CSS-px, from getCanvasCoords), or null.
  const hitTestShapeAt = (coords) => {
    for (let i = strokesRef.current.length - 1; i >= 0; i--) {
      const stroke = strokesRef.current[i];
      if (!SELECTABLE_TOOLS.includes(stroke.tool)) continue;

      const { scaleX, scaleY } = getStrokeScale(stroke);
      const scaleAvg = (scaleX + scaleY) / 2;
      const sx1 = stroke.x1 * scaleX;
      const sy1 = stroke.y1 * scaleY;
      const sx2 = stroke.x2 * scaleX;
      const sy2 = stroke.y2 * scaleY;

      const tolerance = Math.max(6, (stroke.thickness || 0) * scaleAvg / 2 + 4);

      let dist;
      if (stroke.tool === "line") {
        dist = distToSegment(coords.x, coords.y, sx1, sy1, sx2, sy2);
      } else if (stroke.tool === "rectangle") {
        dist = distToRectBorder(coords.x, coords.y, sx1, sy1, sx2, sy2);
      } else {
        dist = distToEllipseBoundary(coords.x, coords.y, sx1, sy1, sx2, sy2);
      }

      if (dist <= tolerance) return stroke;
    }
    return null;
  };

  const drawSingleStroke = (ctx, stroke) => {
    const { tool, color, thickness, points, x1, y1, x2, y2 } = stroke;

    const { scaleX, scaleY } = getStrokeScale(stroke);
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

    // A new stroke is starting (or the teacher clicked elsewhere on the
    // canvas) — drop any active shape selection/handles.
    if (selectedShapeIdRef.current) {
      deselectShape();
    }

    // Select tool: click an existing Line/Rectangle/Circle to activate it —
    // and arm a move-drag from this same pointerdown, in case the teacher
    // drags rather than just clicks. Never starts a new stroke, hit or not.
    // (A click that actually landed on a resize handle never reaches here —
    // the handle is a separate, topmost element with its own pointer
    // handlers — so that priority is already preserved.)
    if (tool === "select") {
      const coords = getCanvasCoords(e);
      const hitStroke = hitTestShapeAt(coords);
      if (hitStroke) {
        selectedShapeIdRef.current = hitStroke.id;
        setSelectedShapeId(hitStroke.id);
        setSelectedShapeTool(hitStroke.tool);
        setResizeHandlePositions(computeHandlePositions(hitStroke));

        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          // Safe fallback for synthetic events or touch emulation
        }

        movingShapeRef.current = {
          id: hitStroke.id,
          startX: coords.x,
          startY: coords.y,
          origX1: hitStroke.x1,
          origY1: hitStroke.y1,
          origX2: hitStroke.x2,
          origY2: hitStroke.y2,
          snapshotPushed: false,
        };
      }
      return;
    }

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
    // Select-tool move-drag on the activated shape's body takes priority
    // over the normal drawing path (which is inert anyway while dragging,
    // since isDrawingRef is never set true for the Select tool).
    if (movingShapeRef.current) {
      if (readOnly) return;
      const moving = movingShapeRef.current;
      const stroke = strokesRef.current.find((s) => s.id === moving.id);
      if (!stroke) {
        movingShapeRef.current = null;
        return;
      }

      // Lazily commit an undo snapshot only once real movement happens, so
      // a plain click-to-select never pollutes the undo stack.
      if (!moving.snapshotPushed) {
        pushSnapshotBeforeChange();
        moving.snapshotPushed = true;
      }

      const coords = getCanvasCoords(e);
      const { scaleX, scaleY } = getStrokeScale(stroke);
      const dxStroke = (coords.x - moving.startX) / (scaleX || 1);
      const dyStroke = (coords.y - moving.startY) / (scaleY || 1);

      stroke.x1 = moving.origX1 + dxStroke;
      stroke.y1 = moving.origY1 + dyStroke;
      stroke.x2 = moving.origX2 + dxStroke;
      stroke.y2 = moving.origY2 + dyStroke;

      redrawAll();
      setResizeHandlePositions(computeHandlePositions(stroke));

      if (onStrokeEmit) {
        onStrokeEmit({ ...stroke, phase: "draw" });
      }
      return;
    }

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
    if (movingShapeRef.current) {
      const canvas = canvasRef.current;
      if (canvas && e.pointerId !== undefined) {
        try {
          canvas.releasePointerCapture(e.pointerId);
        } catch {
          // Safe fallback if already released
        }
      }

      const moving = movingShapeRef.current;
      movingShapeRef.current = null;
      const stroke = strokesRef.current.find((s) => s.id === moving.id);
      if (!stroke) return;

      // Only redraw/reposition/sync if a real move actually happened —
      // a plain click-to-select leaves everything exactly as it was.
      if (moving.snapshotPushed) {
        redrawAll();
        setResizeHandlePositions(computeHandlePositions(stroke));
        if (onStrokeEmit) {
          onStrokeEmit({ ...stroke, phase: "end" });
        }
      }
      return;
    }

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

    // Keep a just-finished Line/Rectangle/Circle selected so the teacher can
    // immediately resize it via handles at its two endpoints.
    if (SELECTABLE_TOOLS.includes(finishedStroke.tool)) {
      selectedShapeIdRef.current = finishedStroke.id;
      setSelectedShapeId(finishedStroke.id);
      setSelectedShapeTool(finishedStroke.tool);
      setResizeHandlePositions(computeHandlePositions(finishedStroke));
    }
  };

  const handlePointerCancel = (e) => {
    handlePointerUp(e);
  };

  // ── Resize Handle Drag (Line/Rectangle/Circle, post-draw) ─────────────────
  // Builds the pointerdown/move/up trio for one handle ('p1' → x1,y1 or
  // 'p2' → x2,y2), mutating the selected stroke in strokesRef.current by id
  // and re-emitting it through the existing onStrokeEmit sync path — same
  // "draw"/"end" phases already used for in-progress strokes, so the
  // receiving side doesn't need a new sync mechanism.
  const makeHandleDragHandlers = (which) => {
    const onDown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const stroke = strokesRef.current.find((s) => s.id === selectedShapeIdRef.current);
      if (!stroke) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Safe fallback for synthetic events or touch emulation
      }
      pushSnapshotBeforeChange();
    };

    const onMove = (e) => {
      if (e.buttons === 0) return; // ignore stray hover moves without an active press
      const stroke = strokesRef.current.find((s) => s.id === selectedShapeIdRef.current);
      if (!stroke) return;
      e.preventDefault();

      const coords = getCanvasCoords(e);
      const { scaleX, scaleY } = getStrokeScale(stroke);
      const strokeX = coords.x / (scaleX || 1);
      const strokeY = coords.y / (scaleY || 1);

      if (which === "p1") {
        stroke.x1 = strokeX;
        stroke.y1 = strokeY;
      } else {
        stroke.x2 = strokeX;
        stroke.y2 = strokeY;
      }

      redrawAll();
      setResizeHandlePositions(computeHandlePositions(stroke));

      if (onStrokeEmit) {
        onStrokeEmit({ ...stroke, phase: "draw" });
      }
    };

    const onUp = (e) => {
      const stroke = strokesRef.current.find((s) => s.id === selectedShapeIdRef.current);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Safe fallback if already released
      }
      if (!stroke) return;

      redrawAll();
      setResizeHandlePositions(computeHandlePositions(stroke));

      if (onStrokeEmit) {
        onStrokeEmit({ ...stroke, phase: "end" });
      }
    };

    return { onDown, onMove, onUp };
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
      // Update-by-id: a repeat "end" for an id we already have (e.g. a
      // resize on an already-finished shape) replaces that entry instead of
      // appending a duplicate.
      const existingIndex = strokesRef.current.findIndex((s) => s.id === stroke.id);
      if (existingIndex !== -1) {
        strokesRef.current[existingIndex] = stroke;
      } else {
        strokesRef.current.push(stroke);
      }
      currentStrokeRef.current = null;
      updateHistoryState();
    }

    redrawAll();
  };

  // Removes a stroke by id when a *remote* delete arrives — does not
  // re-emit, since the sender already told everyone else.
  const handleRemoteStrokeDelete = (strokeId) => {
    if (!strokeId) return;
    const exists = strokesRef.current.some((s) => s.id === strokeId);
    if (!exists) return;

    pushSnapshotBeforeChange();
    strokesRef.current = strokesRef.current.filter((s) => s.id !== strokeId);
    if (selectedShapeIdRef.current === strokeId) {
      deselectShape();
    }
    updateHistoryState();
    redrawAll();
  };

  const handleRemoteClear = () => {
    pushSnapshotBeforeChange();
    strokesRef.current = [];
    currentStrokeRef.current = null;
    deselectShape();
    updateHistoryState();
    redrawAll();
  };

  const handleLoadSnapshot = (strokes, bg) => {
    strokesRef.current = strokes || [];
    if (bg) setBgColor(bg);
    currentStrokeRef.current = null;
    deselectShape();
    updateHistoryState();
    redrawAll();
  };

  const handleClearAllInternal = () => {
    if (strokesRef.current.length > 0) {
      pushSnapshotBeforeChange();
    }
    strokesRef.current = [];
    currentStrokeRef.current = null;
    deselectShape();
    updateHistoryState();
    redrawAll();
    if (onClearEmit) {
      onClearEmit();
    }
    if (onSyncEmit) {
      onSyncEmit([]);
    }
  };

  // Deletes just the currently activated shape (Delete/Backspace) — the
  // local action; the remote/mirroring side applies it via
  // handleRemoteStrokeDelete instead of re-running this.
  const handleDeleteSelectedShape = () => {
    const id = selectedShapeIdRef.current;
    if (!id) return;
    const exists = strokesRef.current.some((s) => s.id === id);
    if (!exists) return;

    pushSnapshotBeforeChange();
    strokesRef.current = strokesRef.current.filter((s) => s.id !== id);
    deselectShape();
    updateHistoryState();
    redrawAll();

    if (onStrokeDeleteEmit) {
      onStrokeDeleteEmit(id);
    }
  };

  const handleBgToggle = () => {
    const newBg = bgColor === "#17171A" ? "#FFFFFF" : "#17171A";
    setBgColor(newBg);

    // If text color matches background, flip stroke color automatically
    if (newBg === "#FFFFFF" && color === "#FFFFFF") {
      setColor("#000000");
    } else if (newBg === "#17171A" && color === "#000000") {
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
          <div className="flex items-center gap-0.5 bg-bg-surface p-1 rounded-[var(--radius-md)] border border-border">
            <button
              type="button"
              onClick={() => setTool("select")}
              className={`btn-press p-1.5 rounded-[var(--radius-sm)] transition-colors duration-150 ${
                tool === "select"
                  ? "bg-accent-info text-white"
                  : "text-text-muted hover:text-text-primary hover:bg-bg-surface-3"
              }`}
              title="Select (V)"
            >
              <Pointer className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setTool("pen")}
              className={`btn-press p-1.5 rounded-[var(--radius-sm)] transition-colors duration-150 ${
                tool === "pen"
                  ? "bg-accent-info text-white"
                  : "text-text-muted hover:text-text-primary hover:bg-bg-surface-3"
              }`}
              title="Pen"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setTool("eraser")}
              className={`btn-press p-1.5 rounded-[var(--radius-sm)] transition-colors duration-150 ${
                tool === "eraser"
                  ? "bg-accent-info text-white"
                  : "text-text-muted hover:text-text-primary hover:bg-bg-surface-3"
              }`}
              title="Eraser (E) — Ctrl+/Ctrl- to resize"
            >
              <Eraser className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setTool("line")}
              className={`btn-press p-1.5 rounded-[var(--radius-sm)] transition-colors duration-150 ${
                tool === "line"
                  ? "bg-accent-info text-white"
                  : "text-text-muted hover:text-text-primary hover:bg-bg-surface-3"
              }`}
              title="Straight Line"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setTool("rectangle")}
              className={`btn-press p-1.5 rounded-[var(--radius-sm)] transition-colors duration-150 ${
                tool === "rectangle"
                  ? "bg-accent-info text-white"
                  : "text-text-muted hover:text-text-primary hover:bg-bg-surface-3"
              }`}
              title="Rectangle"
            >
              <Square className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setTool("circle")}
              className={`btn-press p-1.5 rounded-[var(--radius-sm)] transition-colors duration-150 ${
                tool === "circle"
                  ? "bg-accent-info text-white"
                  : "text-text-muted hover:text-text-primary hover:bg-bg-surface-3"
              }`}
              title="Circle / Ellipse"
            >
              <Circle className="w-4 h-4" />
            </button>
          </div>

          {/* Color Palette */}
          {tool !== "eraser" && (
            <div className="flex items-center gap-1.5 bg-bg-surface px-2 py-1 rounded-[var(--radius-md)] border border-border">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-4 h-4 rounded-full border transition-transform duration-150 ${
                    color === c ? "scale-125 border-text-primary" : "border-border hover:scale-110"
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-4 h-4 rounded-[var(--radius-sm)] cursor-pointer bg-transparent border-0 p-0"
                title="Custom Color"
              />
            </div>
          )}

          {/* Requirement 2: Dedicated Size selector — binds dynamically to tool === 'eraser' ? eraserSize : thickness */}
          <div
            className="flex items-center gap-1 bg-bg-surface px-2 py-1 rounded-[var(--radius-md)] border border-border"
            title={isEraserActive ? "Eraser Size" : "Pen Size"}
            aria-label={isEraserActive ? "Eraser Size" : "Pen Size"}
          >
            <Ruler2 className="w-3.5 h-3.5 text-text-muted mr-1 shrink-0" />
            {(isEraserActive ? ERASER_SIZES : PEN_SIZES).map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => (isEraserActive ? setEraserSize(sz) : setThickness(sz))}
                className={`btn-press px-1.5 py-0.5 text-[11px] font-mono rounded-[var(--radius-sm)] transition-colors duration-150 ${
                  (isEraserActive ? eraserSize : thickness) === sz
                    ? "bg-accent-info text-white font-bold"
                    : "text-text-muted hover:text-text-primary hover:bg-bg-surface-3"
                }`}
              >
                {sz}px
              </button>
            ))}
            {/* Live readout when Ctrl+/Ctrl- has moved the eraser off every preset */}
            {isEraserActive && !ERASER_SIZES.includes(eraserSize) && (
              <span className="px-1.5 py-0.5 text-[11px] font-mono font-bold text-accent-info">
                {eraserSize}px
              </span>
            )}
          </div>

          {/* Requirement 1: Undo / Redo controls — disabled when stack is empty */}
          <div className="flex items-center gap-0.5 bg-bg-surface p-1 rounded-[var(--radius-md)] border border-border">
            <button
              type="button"
              onClick={handleUndoInternal}
              disabled={!canUndo}
              className="btn-press p-1.5 rounded-[var(--radius-sm)] transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed text-text-muted hover:text-text-primary hover:bg-bg-surface-3"
              title="Undo (Ctrl+Z / Cmd+Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleRedoInternal}
              disabled={!canRedo}
              className="btn-press p-1.5 rounded-[var(--radius-sm)] transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed text-text-muted hover:text-text-primary hover:bg-bg-surface-3"
              title="Redo (Ctrl+Y / Cmd+Shift+Z)"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          {/* Background Theme & Clear */}
          <div className="flex items-center gap-1.5 ml-auto">
            <button
              type="button"
              onClick={handleBgToggle}
              className="btn-press p-1.5 border border-border rounded-[var(--radius-md)] text-text-secondary hover:text-text-primary hover:bg-bg-surface-3 transition-colors duration-150 flex items-center justify-center"
              title="Toggle Board Background"
              aria-label="Toggle Board Background"
            >
              {bgColor === "#17171A" ? (
                <Sun className="w-4 h-4 text-accent-warning" />
              ) : (
                <Moon className="w-4 h-4 text-accent-info" />
              )}
            </button>

            <button
              type="button"
              onClick={handleClearAllInternal}
              className="btn-press p-1.5 border border-accent-critical/30 bg-accent-critical/10 text-accent-critical hover:bg-accent-critical/20 rounded-[var(--radius-md)] transition-colors duration-150 flex items-center justify-center"
              title="Wipe Canvas"
              aria-label="Wipe Canvas"
            >
              <Trash2 className="w-4 h-4" />
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
            cursor: readOnly ? "default" : isEraserActive ? "none" : tool === "select" ? "default" : "crosshair",
            display: "block",
            width: "100%",
            height: "100%",
          }}
        />

        {/* Eraser Cursor Size Border Overlay */}
        {!readOnly && isEraserActive && eraserPos.visible && (
          <div
            className="pointer-events-none absolute z-30 rounded-full border-2 border-accent-critical -translate-x-1/2 -translate-y-1/2 transition-transform duration-75"
            style={{
              left: `${eraserPos.x}px`,
              top: `${eraserPos.y}px`,
              width: `${eraserSize}px`,
              height: `${eraserSize}px`,
              boxShadow: "0 0 0 1.5px rgba(255, 255, 255, 0.9), 0 0 8px rgba(232, 85, 107, 0.5)",
              backgroundColor: "rgba(232, 85, 107, 0.15)",
            }}
          />
        )}

        {/* Marching-ants outline traced along the activated shape's actual
            geometry (segment / 4 rect edges / ellipse boundary) — not just a
            bounding box. Reuses resizeHandlePositions, the same on-screen
            CSS-px coordinates the resize handles already use. */}
        {!readOnly && selectedShapeId && selectedShapeTool && resizeHandlePositions && (
          <svg className="absolute inset-0 pointer-events-none z-[35]" width="100%" height="100%">
            <style>{`
              @keyframes eduSyncMarchingAnts {
                to { stroke-dashoffset: -10; }
              }
            `}</style>
            {selectedShapeTool === "line" && (
              <line
                x1={resizeHandlePositions.x1}
                y1={resizeHandlePositions.y1}
                x2={resizeHandlePositions.x2}
                y2={resizeHandlePositions.y2}
                className="stroke-accent-info"
                strokeWidth={2}
                strokeDasharray="6 4"
                style={{ animation: "eduSyncMarchingAnts 0.6s linear infinite" }}
              />
            )}
            {selectedShapeTool === "rectangle" && (
              <rect
                x={Math.min(resizeHandlePositions.x1, resizeHandlePositions.x2)}
                y={Math.min(resizeHandlePositions.y1, resizeHandlePositions.y2)}
                width={Math.abs(resizeHandlePositions.x2 - resizeHandlePositions.x1)}
                height={Math.abs(resizeHandlePositions.y2 - resizeHandlePositions.y1)}
                fill="none"
                className="stroke-accent-info"
                strokeWidth={2}
                strokeDasharray="6 4"
                style={{ animation: "eduSyncMarchingAnts 0.6s linear infinite" }}
              />
            )}
            {selectedShapeTool === "circle" && (
              <ellipse
                cx={(resizeHandlePositions.x1 + resizeHandlePositions.x2) / 2}
                cy={(resizeHandlePositions.y1 + resizeHandlePositions.y2) / 2}
                rx={Math.abs(resizeHandlePositions.x2 - resizeHandlePositions.x1) / 2}
                ry={Math.abs(resizeHandlePositions.y2 - resizeHandlePositions.y1) / 2}
                fill="none"
                className="stroke-accent-info"
                strokeWidth={2}
                strokeDasharray="6 4"
                style={{ animation: "eduSyncMarchingAnts 0.6s linear infinite" }}
              />
            )}
          </svg>
        )}

        {/* Resize Handles — shown on a just-finished Line/Rectangle/Circle,
            or a shape re-activated with the Select tool, until the teacher
            switches tool, starts a new stroke, presses Escape, or clicks
            elsewhere on the canvas. */}
        {!readOnly && selectedShapeId && resizeHandlePositions && (() => {
          const p1Handlers = makeHandleDragHandlers("p1");
          const p2Handlers = makeHandleDragHandlers("p2");
          return (
            <>
              <div
                onPointerDown={p1Handlers.onDown}
                onPointerMove={p1Handlers.onMove}
                onPointerUp={p1Handlers.onUp}
                onPointerCancel={p1Handlers.onUp}
                className="absolute z-40 w-3.5 h-3.5 rounded-full bg-accent-info border-2 border-white shadow-[var(--shadow-modal)] -translate-x-1/2 -translate-y-1/2 cursor-move touch-none"
                style={{ left: `${resizeHandlePositions.x1}px`, top: `${resizeHandlePositions.y1}px` }}
                title="Drag to resize"
                aria-label="Resize handle, start point"
              />
              <div
                onPointerDown={p2Handlers.onDown}
                onPointerMove={p2Handlers.onMove}
                onPointerUp={p2Handlers.onUp}
                onPointerCancel={p2Handlers.onUp}
                className="absolute z-40 w-3.5 h-3.5 rounded-full bg-accent-info border-2 border-white shadow-[var(--shadow-modal)] -translate-x-1/2 -translate-y-1/2 cursor-move touch-none"
                style={{ left: `${resizeHandlePositions.x2}px`, top: `${resizeHandlePositions.y2}px` }}
                title="Drag to resize"
                aria-label="Resize handle, end point"
              />
            </>
          );
        })()}

        {/* Read-Only Indicator Overlay on Student side */}
        {readOnly && (
          <div className="absolute top-2 right-2 px-2.5 py-1 bg-bg-base/80 backdrop-blur border border-border rounded-[var(--radius-sm)] text-[11px] font-mono text-text-muted pointer-events-none">
            Live Whiteboard (View Only)
          </div>
        )}
      </div>
    </div>
  );
});
