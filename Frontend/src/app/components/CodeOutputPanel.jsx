import React, { useRef, useState, useEffect } from "react";
import { IconLayoutBottombar as PanelBottom, IconLayoutSidebarRight as PanelRight, IconLayoutSidebar as PanelLeft, IconLayoutNavbar as PanelTop, IconChevronDown as ChevronDown, IconCheck as Check } from "@tabler/icons-react";

export function CodeOutputPanel({
  outputMode = "none",
  iframeSrcdoc = "",
  iframeKey = 0,
  consoleLines = [],
  textOutput = "",
  dockPosition = "bottom",
  onDockChange,
  size = 220,
  onSizeChange,
  resizable = true,
  showIframe = true,
}) {
  const panelRef = useRef(null);
  const isDraggingRef = useRef(false);
  const [isDockMenuOpen, setIsDockMenuOpen] = useState(false);
  const dropdownRef = useRef(null);
  // Hover-to-open, matching the language dropdown. Dock is a plain div/button
  // (not Radix), so it doesn't have Radix Select's `body { pointer-events:
  // none }` quirk — a normal mouseleave-with-delay is enough, no pointer-
  // coordinate hit-testing needed here.
  const dockMenuCloseTimerRef = useRef(null);

  const openDockMenu = () => {
    if (dockMenuCloseTimerRef.current) {
      clearTimeout(dockMenuCloseTimerRef.current);
      dockMenuCloseTimerRef.current = null;
    }
    setIsDockMenuOpen(true);
  };
  const scheduleDockMenuClose = () => {
    if (dockMenuCloseTimerRef.current) return;
    dockMenuCloseTimerRef.current = setTimeout(() => {
      dockMenuCloseTimerRef.current = null;
      setIsDockMenuOpen(false);
    }, 180);
  };

  useEffect(() => {
    return () => {
      if (dockMenuCloseTimerRef.current) clearTimeout(dockMenuCloseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsDockMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (outputMode === "none") {
    return null;
  }

  const isIframeCollapsed = outputMode === "console" && !showIframe;

  const handleMouseDown = (e) => {
    if (!resizable || !onSizeChange) return;
    e.preventDefault();
    isDraggingRef.current = true;

    const startX = e.clientX;
    const startY = e.clientY;
    const startSize = size;

    const handleMouseMove = (moveEvent) => {
      if (!isDraggingRef.current) return;
      let delta = 0;

      if (dockPosition === "bottom") {
        delta = startY - moveEvent.clientY; // Dragging up increases height
      } else if (dockPosition === "top") {
        delta = moveEvent.clientY - startY; // Dragging down increases height
      } else if (dockPosition === "right") {
        delta = startX - moveEvent.clientX; // Dragging left increases width
      } else if (dockPosition === "left") {
        delta = moveEvent.clientX - startX; // Dragging right increases width
      }

      const isColumn = dockPosition === "bottom" || dockPosition === "top";
      const parentEl = panelRef.current?.parentElement;
      const parentLimit = parentEl
        ? (isColumn ? parentEl.clientHeight : parentEl.clientWidth) * 0.7
        : 600;

      const newSize = Math.max(120, Math.min(parentLimit, startSize + delta));
      onSizeChange(Math.round(newSize));
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const getResizeHandleStyle = () => {
    if (dockPosition === "bottom") {
      return "absolute top-0 left-0 right-0 h-1.5 cursor-row-resize hover:bg-accent-info/50 active:bg-accent-info z-20 -translate-y-1/2";
    }
    if (dockPosition === "top") {
      return "absolute bottom-0 left-0 right-0 h-1.5 cursor-row-resize hover:bg-accent-info/50 active:bg-accent-info z-20 translate-y-1/2";
    }
    if (dockPosition === "right") {
      return "absolute top-0 bottom-0 left-0 w-1.5 cursor-col-resize hover:bg-accent-info/50 active:bg-accent-info z-20 -translate-x-1/2";
    }
    if (dockPosition === "left") {
      return "absolute top-0 bottom-0 right-0 w-1.5 cursor-col-resize hover:bg-accent-info/50 active:bg-accent-info z-20 translate-x-1/2";
    }
    return "";
  };

  const getContainerStyle = () => {
    const isRow = dockPosition === "right" || dockPosition === "left";
    return {
      width: isRow ? `${size}px` : "100%",
      height: isRow ? "100%" : `${size}px`,
      flexShrink: 0,
    };
  };

  return (
    <div
      ref={panelRef}
      style={getContainerStyle()}
      className={`relative flex flex-col bg-bg-base border-border select-none overflow-hidden ${
        dockPosition === "bottom"
          ? "border-t"
          : dockPosition === "top"
          ? "border-b"
          : dockPosition === "right"
          ? "border-l"
          : "border-r"
      }`}
    >
      {/* Drag handle */}
      {resizable && <div onMouseDown={handleMouseDown} className={getResizeHandleStyle()} />}

      {/* Header bar with title & Dock selector */}
      <div className="flex items-center justify-between px-3 py-1 bg-bg-elevated border-b border-border text-[11px] font-mono text-text-muted flex-shrink-0 h-7">
        <span className="font-semibold text-text-secondary">Output</span>

        {/* Dock position selector dropdown */}
        {resizable && onDockChange && (
          <div
            className="relative"
            ref={dropdownRef}
            onMouseEnter={openDockMenu}
            onMouseLeave={scheduleDockMenuClose}
          >
            <button
              type="button"
              onClick={() => setIsDockMenuOpen((prev) => !prev)}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-bg-surface border border-border hover:text-text-primary hover:bg-white/5 transition-all text-xs"
              title="Dock Position"
            >
              {dockPosition === "bottom" && (
                <>
                  <PanelBottom className="w-3.5 h-3.5 text-accent-info" /> Dock Bottom
                </>
              )}
              {dockPosition === "top" && (
                <>
                  <PanelTop className="w-3.5 h-3.5 text-accent-info" /> Dock Top
                </>
              )}
              {dockPosition === "right" && (
                <>
                  <PanelRight className="w-3.5 h-3.5 text-accent-info" /> Dock Right
                </>
              )}
              {dockPosition === "left" && (
                <>
                  <PanelLeft className="w-3.5 h-3.5 text-accent-info" /> Dock Left
                </>
              )}
              <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
            </button>

            {isDockMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-36 bg-bg-elevated border border-border rounded-md shadow-lg z-50 py-1">
                <button
                  type="button"
                  onClick={() => {
                    onDockChange("bottom");
                    setIsDockMenuOpen(false);
                  }}
                  className={`group btn-press w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-white/5 transition-colors ${
                    dockPosition === "bottom" ? "text-accent-info font-bold" : "text-text-primary"
                  }`}
                >
                  <span className="relative w-4 h-4 shrink-0">
                    <PanelBottom
                      className={`w-4 h-4 absolute inset-0 transition-opacity duration-150 ${
                        dockPosition === "bottom" ? "opacity-100" : "opacity-100 group-hover:opacity-0"
                      }`}
                    />
                    <Check
                      className={`w-4 h-4 absolute inset-0 transition-opacity duration-150 ${
                        dockPosition === "bottom" ? "opacity-0" : "opacity-0 group-hover:opacity-100"
                      }`}
                    />
                  </span>
                  Dock Bottom
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDockChange("top");
                    setIsDockMenuOpen(false);
                  }}
                  className={`group btn-press w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-white/5 transition-colors ${
                    dockPosition === "top" ? "text-accent-info font-bold" : "text-text-primary"
                  }`}
                >
                  <span className="relative w-4 h-4 shrink-0">
                    <PanelTop
                      className={`w-4 h-4 absolute inset-0 transition-opacity duration-150 ${
                        dockPosition === "top" ? "opacity-100" : "opacity-100 group-hover:opacity-0"
                      }`}
                    />
                    <Check
                      className={`w-4 h-4 absolute inset-0 transition-opacity duration-150 ${
                        dockPosition === "top" ? "opacity-0" : "opacity-0 group-hover:opacity-100"
                      }`}
                    />
                  </span>
                  Dock Top
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDockChange("right");
                    setIsDockMenuOpen(false);
                  }}
                  className={`group btn-press w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-white/5 transition-colors ${
                    dockPosition === "right" ? "text-accent-info font-bold" : "text-text-primary"
                  }`}
                >
                  <span className="relative w-4 h-4 shrink-0">
                    <PanelRight
                      className={`w-4 h-4 absolute inset-0 transition-opacity duration-150 ${
                        dockPosition === "right" ? "opacity-100" : "opacity-100 group-hover:opacity-0"
                      }`}
                    />
                    <Check
                      className={`w-4 h-4 absolute inset-0 transition-opacity duration-150 ${
                        dockPosition === "right" ? "opacity-0" : "opacity-0 group-hover:opacity-100"
                      }`}
                    />
                  </span>
                  Dock Right
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDockChange("left");
                    setIsDockMenuOpen(false);
                  }}
                  className={`group btn-press w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-white/5 transition-colors ${
                    dockPosition === "left" ? "text-accent-info font-bold" : "text-text-primary"
                  }`}
                >
                  <span className="relative w-4 h-4 shrink-0">
                    <PanelLeft
                      className={`w-4 h-4 absolute inset-0 transition-opacity duration-150 ${
                        dockPosition === "left" ? "opacity-100" : "opacity-100 group-hover:opacity-0"
                      }`}
                    />
                    <Check
                      className={`w-4 h-4 absolute inset-0 transition-opacity duration-150 ${
                        dockPosition === "left" ? "opacity-0" : "opacity-0 group-hover:opacity-100"
                      }`}
                    />
                  </span>
                  Dock Left
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main output content area */}
      <div className="flex-1 flex flex-col min-h-0 w-full overflow-hidden">
        {/* Rendered iframe (Always mounted for iframe & console mode so scripts execute and postMessage) */}
        {(outputMode === "iframe" || outputMode === "console") && (
          <iframe
            key={iframeKey}
            srcDoc={iframeSrcdoc}
            sandbox="allow-scripts"
            title="Code output"
            style={{
              width: "100%",
              flex: isIframeCollapsed ? "0 0 0px" : outputMode === "console" ? "0 0 55%" : "1",
              height: isIframeCollapsed ? "0px" : "auto",
              minHeight: isIframeCollapsed ? "0px" : "auto",
              border: "none",
              background: "#fff",
              display: "block",
              overflow: isIframeCollapsed ? "hidden" : "visible",
              visibility: isIframeCollapsed ? "hidden" : "visible",
            }}
          />
        )}

        {/* Console / text output */}
        {(outputMode === "console" || outputMode === "text") && (
          <pre
            style={{
              margin: 0,
              padding: "8px 12px",
              flex: isIframeCollapsed ? "1" : outputMode === "console" ? "0 0 45%" : "1",
              overflow: "auto",
              background: "var(--bg-base)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              borderTop: isIframeCollapsed ? "none" : outputMode === "console" ? "1px solid var(--border)" : "none",
            }}
          >
            {outputMode === "console"
              ? consoleLines.length > 0
                ? consoleLines.join("\n")
                : "// No console output"
              : textOutput || "(no output)"}
          </pre>
        )}
      </div>
    </div>
  );
}
