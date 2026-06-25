import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import {
  ArrowRight,
  Play,
  PlayCircle,
  Monitor,
  BarChart3,
  ChevronDown,
} from "lucide-react";

// ─── Scroll-reveal hook ──────────────────────────────────────────────────────
function useScrollReveal() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

// ─── Animated counter hook ───────────────────────────────────────────────────
function useCounter(target, duration = 1200, suffix = "") {
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const tick = (now) => {
            const progress = Math.min((now - start) / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.round(ease * target) + suffix;
            if (progress < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, duration, suffix]);

  return ref;
}

// ─── Feature mock visuals ────────────────────────────────────────────────────
function BroadcastMockup() {
  return (
    <div
      className="w-full rounded-xl overflow-hidden"
      style={{
        background: "#0A0A0F",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
      }}
    >
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "#111118",
        }}
      >
        <div
          className="w-2.5 h-2.5 rounded-full"
          style={{ background: "#EF4444" }}
        />

        <div
          className="w-2.5 h-2.5 rounded-full"
          style={{ background: "#F59E0B" }}
        />

        <div
          className="w-2.5 h-2.5 rounded-full"
          style={{ background: "#22C55E" }}
        />

        <span
          className="ml-3 font-mono"
          style={{
            fontSize: "11px",
            color: "#4A4A6A",
            letterSpacing: "0.05em",
          }}
        >
          binary_search_tree.py
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span
            className="live-pulse inline-block w-2 h-2 rounded-full"
            style={{ background: "#22C55E" }}
          />

          <span
            className="font-mono"
            style={{
              fontSize: "11px",
              color: "#22C55E",
              letterSpacing: "0.08em",
            }}
          >
            LIVE
          </span>
        </div>
      </div>
      <div
        className="p-5 font-mono"
        style={{ fontSize: "13px", lineHeight: "1.8", color: "#8B8BA7" }}
      >
        <div>
          <span style={{ color: "#A371F7" }}>class </span>
          <span style={{ color: "#4F8EF7" }}>Node</span>
          <span style={{ color: "#F0F0F5" }}>:</span>
        </div>
        <div className="ml-4">
          <span style={{ color: "#A371F7" }}>def </span>
          <span style={{ color: "#22C55E" }}>__init__</span>
          <span style={{ color: "#F0F0F5" }}>(self, val):</span>
        </div>
        <div className="ml-8">
          <span style={{ color: "#F0F0F5" }}>self.val = val</span>
        </div>
        <div className="ml-8">
          <span style={{ color: "#F0F0F5" }}>self.left = </span>
          <span style={{ color: "#F59E0B" }}>None</span>
        </div>
        <div className="ml-8">
          <span style={{ color: "#F0F0F5" }}>self.right = </span>
          <span style={{ color: "#F59E0B" }}>None</span>
        </div>
        <div className="mt-2">
          <span style={{ color: "#A371F7" }}>class </span>
          <span style={{ color: "#4F8EF7" }}>BST</span>
          <span style={{ color: "#F0F0F5" }}>:</span>
        </div>
        <div className="ml-4">
          <span style={{ color: "#A371F7" }}>def </span>
          <span style={{ color: "#22C55E" }}>insert</span>
          <span style={{ color: "#F0F0F5" }}>(self, val):</span>
        </div>
        <div className="ml-8 opacity-50">...</div>
      </div>
    </div>
  );
}

function MonitorMockup() {
  const students = [
    { name: "Rajesh K.", status: "active" },
    { name: "Priya M.", status: "active" },
    { name: "Arjun S.", status: "idle" },
    { name: "Deepa R.", status: "active" },
    { name: "Vikram P.", status: "offline" },
    { name: "Anita B.", status: "active" },
  ];
  const colors = {
    active: {
      dot: "#22C55E",
      border: "rgba(34,197,94,0.25)",
      bg: "rgba(34,197,94,0.04)",
    },
    idle: {
      dot: "#F59E0B",
      border: "rgba(245,158,11,0.35)",
      bg: "rgba(245,158,11,0.06)",
    },
    offline: {
      dot: "#4A4A6A",
      border: "rgba(255,255,255,0.06)",
      bg: "transparent",
    },
  };
  return (
    <div
      className="w-full rounded-xl p-4"
      style={{
        background: "#111118",
        border: "1px solid rgba(255,255,255,0.07)",
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <span
          className="font-mono"
          style={{
            fontSize: "11px",
            color: "#4A4A6A",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Lab 301 — Live Monitor
        </span>
        <span
          className="font-mono"
          style={{ fontSize: "11px", color: "#22C55E" }}
        >
          5 active
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {students.map((s) => {
          const c = colors[s.status];
          return (
            <div
              key={s.name}
              className="rounded-lg p-3 flex flex-col gap-2"
              style={{ border: `1px solid ${c.border}`, background: c.bg }}
            >
              <div
                className="rounded"
                style={{
                  height: "44px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.04)",
                }}
              />

              <div className="flex items-center gap-1.5">
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: c.dot }}
                />

                <span
                  style={{
                    fontSize: "10px",
                    color: "#8B8BA7",
                    fontFamily: "JetBrains Mono",
                  }}
                >
                  {s.name}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AttendanceMockup() {
  const rows = [
    {
      name: "Rajesh Kumar",
      id: "CS21B1001",
      status: "PRESENT",
      color: "#22C55E",
      bg: "rgba(34,197,94,0.10)",
      border: "rgba(34,197,94,0.2)",
    },
    {
      name: "Priya Mehta",
      id: "CS21B1002",
      status: "PRESENT",
      color: "#22C55E",
      bg: "rgba(34,197,94,0.10)",
      border: "rgba(34,197,94,0.2)",
    },
    {
      name: "Arjun Singh",
      id: "CS21B1003",
      status: "PARTIAL",
      color: "#F59E0B",
      bg: "rgba(245,158,11,0.10)",
      border: "rgba(245,158,11,0.2)",
    },
    {
      name: "Vikram Kumar",
      id: "CS21B1004",
      status: "ABSENT",
      color: "#EF4444",
      bg: "rgba(239,68,68,0.10)",
      border: "rgba(239,68,68,0.2)",
    },
  ];
  return (
    <div
      className="w-full rounded-xl overflow-hidden"
      style={{
        background: "#111118",
        border: "1px solid rgba(255,255,255,0.07)",
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
      }}
    >
      <div
        className="px-4 py-3 flex items-center gap-2"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <span
          className="font-mono"
          style={{
            fontSize: "11px",
            color: "#4A4A6A",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Attendance — June 13
        </span>
        <span
          className="ml-auto font-mono"
          style={{
            fontSize: "11px",
            color: "#4F8EF7",
            background: "rgba(79,142,247,0.10)",
            border: "1px solid rgba(79,142,247,0.2)",
            borderRadius: "999px",
            padding: "2px 8px",
          }}
        >
          Auto-logged
        </span>
      </div>
      <div
        className="divide-y"
        style={{ borderColor: "rgba(255,255,255,0.04)" }}
      >
        {rows.map((r) => (
          <div key={r.id} className="flex items-center px-4 py-2.5 gap-3">
            <div className="flex-1">
              <div style={{ fontSize: "13px", color: "#F0F0F5" }}>{r.name}</div>
              <div
                className="font-mono"
                style={{ fontSize: "10px", color: "#4A4A6A" }}
              >
                {r.id}
              </div>
            </div>
            <span
              className="font-mono"
              style={{
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.08em",
                color: r.color,
                background: r.bg,
                border: `1px solid ${r.border}`,
                borderRadius: "6px",
                padding: "2px 8px",
              }}
            >
              {r.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExamMockup() {
  const steps = ["Setup", "Questions", "Settings", "Launch"];
  return (
    <div
      className="w-full rounded-xl p-5"
      style={{
        background: "#111118",
        border: "1px solid rgba(255,255,255,0.07)",
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
      }}
    >
      {/* Stepper */}
      <div className="flex items-center gap-0 mb-6">
        {steps.map((step, i) => (
          <div key={step} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center font-mono"
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  background:
                    i < 2
                      ? "#4F8EF7"
                      : i === 2
                        ? "rgba(79,142,247,0.15)"
                        : "rgba(255,255,255,0.05)",
                  color: i < 2 ? "#fff" : i === 2 ? "#4F8EF7" : "#4A4A6A",
                  border: i === 2 ? "1.5px solid #4F8EF7" : "none",
                }}
              >
                {i < 2 ? "✓" : i + 1}
              </div>
              <span
                style={{
                  fontSize: "10px",
                  color: i <= 2 ? "#8B8BA7" : "#4A4A6A",
                }}
              >
                {step}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className="flex-1 h-px mx-2 mt-[-10px]"
                style={{
                  background: i < 2 ? "#4F8EF7" : "rgba(255,255,255,0.08)",
                }}
              />
            )}
          </div>
        ))}
      </div>
      {/* Mock question */}
      <div
        className="rounded-lg p-4"
        style={{
          background: "#1A1A24",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span
            className="font-mono"
            style={{
              fontSize: "10px",
              color: "#4F8EF7",
              background: "rgba(79,142,247,0.10)",
              borderRadius: "4px",
              padding: "2px 6px",
            }}
          >
            Q3
          </span>
          <span style={{ fontSize: "11px", color: "#8B8BA7" }}>
            Multiple Choice · 10 pts
          </span>
          <span
            className="ml-auto font-mono"
            style={{ fontSize: "10px", color: "#F59E0B" }}
          >
            Randomized ✓
          </span>
        </div>
        <p style={{ fontSize: "13px", color: "#F0F0F5", lineHeight: 1.6 }}>
          What is the time complexity of BST insertion in the worst case?
        </p>
        <div className="mt-3 space-y-1.5">
          {["O(log n)", "O(n)", "O(n²)", "O(1)"].map((opt, i) => (
            <div
              key={opt}
              className="flex items-center gap-2 px-3 py-1.5 rounded"
              style={{
                background: i === 1 ? "rgba(79,142,247,0.08)" : "transparent",
                border: `1px solid ${i === 1 ? "rgba(79,142,247,0.2)" : "rgba(255,255,255,0.04)"}`,
              }}
            >
              <div
                className="w-4 h-4 rounded-full flex-shrink-0"
                style={{
                  border: `1.5px solid ${i === 1 ? "#4F8EF7" : "rgba(255,255,255,0.15)"}`,
                }}
              />

              <span
                style={{
                  fontSize: "12px",
                  color: i === 1 ? "#4F8EF7" : "#8B8BA7",
                }}
              >
                {opt}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AnalyticsMockup() {
  const bars = [78, 82, 75, 88, 71];
  const labels = ["Q1", "Q2", "Mid", "Q3", "Q4"];
  const maxH = 80;
  return (
    <div
      className="w-full rounded-xl p-5"
      style={{
        background: "#111118",
        border: "1px solid rgba(255,255,255,0.07)",
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
      }}
    >
      <div
        className="flex items-end gap-3 mb-4"
        style={{ height: `${maxH + 24}px` }}
      >
        {bars.map((val, i) => (
          <div
            key={labels[i]}
            className="flex-1 flex flex-col items-center gap-1"
          >
            <span
              className="font-mono"
              style={{ fontSize: "10px", color: "#8B8BA7" }}
            >
              {val}%
            </span>
            <div
              className="w-full rounded-sm"
              style={{
                height: `${(val / 100) * maxH}px`,
                background:
                  "linear-gradient(180deg, #4F8EF7 0%, rgba(79,142,247,0.5) 100%)",
              }}
            />

            <span
              className="font-mono"
              style={{ fontSize: "9px", color: "#4A4A6A" }}
            >
              {labels[i]}
            </span>
          </div>
        ))}
      </div>
      <div
        className="rounded-lg overflow-hidden"
        style={{ border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div
          className="px-3 py-2 flex items-center gap-2"
          style={{
            background: "#1A1A24",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <span style={{ fontSize: "11px", color: "#EF4444" }}>⚠</span>
          <span style={{ fontSize: "11px", color: "#8B8BA7" }}>
            At-Risk Students
          </span>
          <span
            className="ml-auto font-mono"
            style={{
              fontSize: "10px",
              color: "#EF4444",
              background: "rgba(239,68,68,0.10)",
              borderRadius: "4px",
              padding: "1px 6px",
            }}
          >
            2 flagged
          </span>
        </div>
        {[
          { name: "Rahul Verma", att: "65%", risk: "HIGH" },
          { name: "Rohan Shah", att: "55%", risk: "HIGH" },
        ].map((s) => (
          <div
            key={s.name}
            className="flex items-center px-3 py-2 gap-3"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
          >
            <span style={{ fontSize: "12px", color: "#F0F0F5", flex: 1 }}>
              {s.name}
            </span>
            <span
              className="font-mono"
              style={{ fontSize: "10px", color: "#8B8BA7" }}
            >
              {s.att}
            </span>
            <span
              className="font-mono"
              style={{
                fontSize: "9px",
                fontWeight: 700,
                color: "#EF4444",
                background: "rgba(239,68,68,0.10)",
                borderRadius: "4px",
                padding: "1px 6px",
                letterSpacing: "0.06em",
              }}
            >
              {s.risk}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StudentDashMockup() {
  return (
    <div
      className="w-full rounded-xl overflow-hidden"
      style={{
        background: "#111118",
        border: "1px solid rgba(255,255,255,0.07)",
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
      }}
    >
      <div className="flex gap-0">
        {/* Mini sidebar */}
        <div
          className="flex flex-col gap-1 py-4 px-2"
          style={{
            width: "48px",
            background: "#0A0A0F",
            borderRight: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {["⌂", "⊞", "✓"].map((icon, i) => (
            <div
              key={i}
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                background: i === 0 ? "rgba(79,142,247,0.15)" : "transparent",
                color: i === 0 ? "#4F8EF7" : "#4A4A6A",
                fontSize: "14px",
              }}
            >
              {icon}
            </div>
          ))}
        </div>
        {/* Content */}
        <div className="flex-1 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full live-pulse"
              style={{ background: "#22C55E" }}
            />

            <span
              style={{
                fontSize: "11px",
                color: "#22C55E",
                fontFamily: "JetBrains Mono",
              }}
            >
              Session Active — LAB 301
            </span>
          </div>
          <div
            className="rounded-lg p-3"
            style={{
              background: "#1A1A24",
              border: "1px solid rgba(79,142,247,0.15)",
            }}
          >
            <div
              style={{
                fontSize: "10px",
                color: "#4F8EF7",
                fontFamily: "JetBrains Mono",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: "4px",
              }}
            >
              Active Task
            </div>
            <div style={{ fontSize: "12px", color: "#F0F0F5" }}>
              Implement a Binary Search Tree
            </div>
            <div className="flex items-center gap-2 mt-2">
              <div
                className="flex-1 rounded-full overflow-hidden"
                style={{ height: "4px", background: "rgba(255,255,255,0.06)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: "60%", background: "#4F8EF7" }}
                />
              </div>
              <span
                className="font-mono"
                style={{ fontSize: "10px", color: "#8B8BA7" }}
              >
                60%
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Attendance", val: "92%", color: "#22C55E" },
              { label: "Tasks Done", val: "8/10", color: "#4F8EF7" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg p-3"
                style={{
                  background: "#1A1A24",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div
                  style={{
                    fontSize: "9px",
                    color: "#4A4A6A",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {stat.label}
                </div>
                <div
                  className="font-mono"
                  style={{
                    fontSize: "18px",
                    color: stat.color,
                    fontWeight: 600,
                  }}
                >
                  {stat.val}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Feature section item ─────────────────────────────────────────────────────
const features = [
  {
    id: "broadcast",
    tag: "LIVE BROADCAST",
    headline: "Every student sees exactly what you see.",
    body: "Share your screen in real time — live coding, browser tabs, IDEs, presentations. No lag. No confusion. Every student follows, always.",
    accent: "#4F8EF7",
    side: "left",
    Visual: BroadcastMockup,
  },
  {
    id: "monitor",
    tag: "STUDENT MONITOR",
    headline: "Know who's focused. Know who needs help.",
    body: "See every student's screen in a live grid. Spot students not viewing instantly. Click any card for a full view. View-only — no disruption to their work.",
    accent: "#22C55E",
    side: "right",
    Visual: MonitorMockup,
  },
  {
    id: "attendance",
    tag: "AUTO ATTENDANCE",
    headline: "Roll call, handled.",
    body: "Attendance is tracked automatically from login activity. Present, partial, or absent — determined without a single manual entry.",
    accent: "#4F8EF7",
    side: "left",
    Visual: AttendanceMockup,
  },
  {
    id: "exams",
    tag: "SECURE EXAMS",
    headline: "Randomized. Timed. Tamper-proof.",
    body: "Each student gets unique questions. A countdown timer enforces the deadline. Screens lock automatically the moment time expires.",
    accent: "#F59E0B",
    side: "right",
    Visual: ExamMockup,
  },
  {
    id: "analytics",
    tag: "ANALYTICS",
    headline: "See the gaps before they become problems.",
    body: "Track attendance trends, task completion, and exam scores over time. At-risk students are surfaced automatically so you can act early.",
    accent: "#22C55E",
    side: "left",
    Visual: AnalyticsMockup,
  },
];

function FeatureItem({ feature, isLast }) {
  const { ref, visible } = useScrollReveal();
  const isLeft = feature.side === "left";
  return (
    <div
      ref={ref}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "80px",
        marginBottom: isLast ? 0 : "120px",
        flexDirection: isLeft ? "row" : "row-reverse",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(40px)",
        transition: "opacity 600ms ease-out, transform 600ms ease-out",
      }}
    >
      <div style={{ flex: "0 0 440px", maxWidth: "440px" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            marginBottom: "16px",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: feature.accent,
            background: `${feature.accent}14`,
            border: `1px solid ${feature.accent}40`,
            borderRadius: "999px",
            padding: "4px 12px",
          }}
        >
          {feature.tag}
        </div>
        <h2
          style={{
            fontSize: "clamp(28px, 3vw, 38px)",
            fontWeight: 700,
            letterSpacing: "-0.03em",
            lineHeight: 1.15,
            color: "#F0F0F5",
            margin: "0 0 16px",
          }}
        >
          {feature.headline}
        </h2>
        <p
          style={{
            fontSize: "16px",
            color: "#8B8BA7",
            lineHeight: 1.7,
            margin: 0,
          }}
        >
          {feature.body}
        </p>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <feature.Visual />
      </div>
    </div>
  );
}

// ─── Reveal wrapper ───────────────────────────────────────────────────────────
function RevealSection({ children, className = "" }) {
  const { ref, visible } = useScrollReveal();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(40px)",
        transition: "opacity 600ms ease-out, transform 600ms ease-out",
      }}
    >
      {children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function LandingPage() {
  const navigate = useNavigate();
  const [navHidden, setNavHidden] = useState(false);
  const lastScrollY = useRef(0);

  // Navbar hide/show on scroll
  useEffect(() => {
    const handleScroll = () => {
      const current = window.scrollY;
      setNavHidden(current > lastScrollY.current && current > 80);
      lastScrollY.current = current;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Stat counters
  const c1 = useCounter(2400, 1200, "+");
  const c2 = useCounter(120, 1000, "+");
  const c3 = useCounter(98, 900, "%");
  const c4 = useCounter(0, 500, "");

  const handleGetStarted = useCallback(
    () => navigate("/login"),
    [navigate],
  );

  const handleLogin = useCallback(
    () => navigate("/login"),
    [navigate],
  );

  return (
    <div
      style={{
        background: "#0A0A0F",
        color: "#F0F0F5",
        fontFamily: "Inter, system-ui, sans-serif",
        overflowX: "hidden",
      }}
    >
      {/* ── NAVBAR ─────────────────────────────────────────────────────── */}
      <nav
        aria-label="Main navigation"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          background: "rgba(10,10,15,0.85)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          transform: navHidden ? "translateY(-100%)" : "translateY(0)",
          transition: "transform 300ms ease",
        }}
      >
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "0 24px",
            height: "60px",
            display: "flex",
            alignItems: "center",
            gap: "32px",
          }}
        >
          {/* Logo */}
          <div
            style={{
              fontWeight: 700,
              fontSize: "17px",
              letterSpacing: "-0.02em",
              color: "#F0F0F5",
              flexShrink: 0,
            }}
          >
            Lab Control
          </div>

          {/* Center links */}
          <div
            style={{
              display: "flex",
              gap: "4px",
              flex: 1,
              justifyContent: "center",
            }}
          >
            {["Features", "How It Works", "For Students", "Pricing"].map(
              (link) => (
                <button
                  key={link}
                  className="nav-link-btn"
                  style={{
                    background: "none",
                    border: "none",
                    padding: "6px 14px",
                    fontSize: "14px",
                    color: "#8B8BA7",
                    cursor: "pointer",
                    borderRadius: "6px",
                    position: "relative",
                    transition: "color 200ms",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#F0F0F5";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "#8B8BA7";
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ")
                      e.currentTarget.click();
                  }}
                >
                  {link}
                </button>
              ),
            )}
          </div>

          {/* Right CTAs */}
          <div
            style={{
              display: "flex",
              gap: "10px",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <button
              onClick={handleLogin}
              style={{
                background: "none",
                border: "1px solid rgba(255,255,255,0.12)",
                padding: "8px 16px",
                borderRadius: "8px",
                fontSize: "14px",
                color: "#F0F0F5",
                cursor: "pointer",
                transition: "all 160ms ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") handleLogin();
              }}
              aria-label="Log in to Lab Control"
            >
              Log In
            </button>
            <button
              onClick={handleGetStarted}
              style={{
                background: "linear-gradient(135deg, #4F8EF7, #3B78E7)",
                border: "none",
                padding: "8px 18px",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                color: "#fff",
                cursor: "pointer",
                transition: "all 160ms ease",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.02)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = "scale(0.97)";
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = "scale(1)";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") handleGetStarted();
              }}
              aria-label="Get started with Lab Control"
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ───────────────────────────────────────────────────────── */}
      <section
        aria-label="Hero"
        style={{
          position: "relative",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "120px 24px 80px",
          overflow: "hidden",
        }}
      >
        {/* Ambient orbs */}
        <div
          aria-hidden="true"
          className="orb-blue"
          style={{
            position: "absolute",
            top: "5%",
            left: "-10%",
            width: "600px",
            height: "600px",
            borderRadius: "50%",
            background: "rgba(79,142,247,0.10)",
            filter: "blur(120px)",
            pointerEvents: "none",
          }}
        />

        <div
          aria-hidden="true"
          className="orb-green"
          style={{
            position: "absolute",
            bottom: "10%",
            right: "-8%",
            width: "500px",
            height: "500px",
            borderRadius: "50%",
            background: "rgba(34,197,94,0.07)",
            filter: "blur(120px)",
            pointerEvents: "none",
          }}
        />

        {/* Content */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            textAlign: "center",
            maxWidth: "800px",
            animation: "heroEnter 700ms ease-out both",
          }}
        >
          {/* Eyebrow badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "28px",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "5px 14px",
                borderRadius: "999px",
                border: "1px solid rgba(79,142,247,0.3)",
                background: "rgba(79,142,247,0.06)",
                fontFamily: "JetBrains Mono, monospace",
                fontSize: "11px",
                fontWeight: 600,
                color: "#4F8EF7",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              <span
                className="live-pulse inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: "#4F8EF7" }}
              />
              Now in Beta — Built for University Labs
            </span>
          </div>

          {/* Headline */}
          <h1
            style={{
              fontSize: "clamp(52px, 7vw, 80px)",
              fontWeight: 800,
              letterSpacing: "-0.05em",
              lineHeight: 1.05,
              margin: "0 0 24px",
              color: "#F0F0F5",
            }}
          >
            Teaching, Upgraded.
            <br />
            <span
              style={{
                backgroundImage: "linear-gradient(90deg, #4F8EF7, #22C55E)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Labs, In Control.
            </span>
          </h1>

          {/* Subheadline */}
          <p
            style={{
              fontSize: "20px",
              color: "#8B8BA7",
              maxWidth: "580px",
              margin: "0 auto 40px",
              lineHeight: 1.7,
            }}
          >
            Live screen broadcasting, auto attendance, secure exams, and
            real-time analytics — all in one platform built for computer labs.
          </p>

          {/* CTAs */}
          <div
            style={{
              display: "flex",
              gap: "16px",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={handleGetStarted}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "0 28px",
                height: "48px",
                background: "linear-gradient(135deg, #4F8EF7, #3B78E7)",
                border: "none",
                borderRadius: "10px",
                fontSize: "15px",
                fontWeight: 600,
                color: "#fff",
                cursor: "pointer",
                boxShadow:
                  "0 8px 24px rgba(79,142,247,0.3), inset 0 1px 0 rgba(255,255,255,0.15)",
                transition: "all 160ms ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.03)";
                e.currentTarget.style.boxShadow =
                  "0 12px 32px rgba(79,142,247,0.4), inset 0 1px 0 rgba(255,255,255,0.15)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.boxShadow =
                  "0 8px 24px rgba(79,142,247,0.3), inset 0 1px 0 rgba(255,255,255,0.15)";
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = "scale(0.97)";
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = "scale(1.03)";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") handleGetStarted();
              }}
              aria-label="Get early access to Lab Control"
            >
              Get Early Access
              <ArrowRight aria-hidden="true" size={16} />
            </button>
            <button
              onClick={handleGetStarted}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "0 28px",
                height: "48px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: "10px",
                fontSize: "15px",
                color: "#F0F0F5",
                cursor: "pointer",
                transition: "all 160ms ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
                e.currentTarget.style.background = "rgba(255,255,255,0.07)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)";
                e.currentTarget.style.background = "rgba(255,255,255,0.04)";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") handleGetStarted();
              }}
              aria-label="Watch a demo of Lab Control"
            >
              <Play aria-hidden="true" size={15} />
              Watch Demo
            </button>
          </div>
        </div>

        {/* Floating mockup */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            marginTop: "64px",
            width: "100%",
            maxWidth: "860px",
            animation:
              "heroMockupEnter 800ms ease-out 300ms both, mockupFloat 4s ease-in-out 1100ms infinite",
            perspective: "1000px",
          }}
        >
          <div
            style={{
              borderRadius: "16px",
              overflow: "hidden",
              boxShadow:
                "0 40px 120px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.07)",
              transform: "rotateX(6deg) rotateY(-4deg)",
            }}
          >
            {/* Browser chrome */}
            <div
              style={{
                background: "#111118",
                padding: "12px 16px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <div
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: "#EF4444",
                }}
              />

              <div
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: "#F59E0B",
                }}
              />

              <div
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: "#22C55E",
                }}
              />

              <div
                style={{
                  flex: 1,
                  margin: "0 12px",
                  background: "rgba(255,255,255,0.05)",
                  borderRadius: "6px",
                  padding: "4px 12px",
                  fontSize: "11px",
                  color: "#4A4A6A",
                  fontFamily: "JetBrains Mono, monospace",
                }}
              >
                labcontrol.app/teacher
              </div>
            </div>
            {/* Dashboard preview */}
            <div
              style={{
                background: "#0A0A0F",
                display: "flex",
                minHeight: "320px",
              }}
            >
              {/* Sidebar */}
              <div
                style={{
                  width: "200px",
                  background: "#111118",
                  borderRight: "1px solid rgba(255,255,255,0.06)",
                  padding: "16px 8px",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    padding: "0 12px 16px",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    marginBottom: "12px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#F0F0F5",
                    }}
                  >
                    Lab Control
                  </div>
                  <div
                    style={{
                      fontSize: "10px",
                      color: "#4A4A6A",
                      fontFamily: "JetBrains Mono, monospace",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    Teacher
                  </div>
                </div>
                {[
                  { label: "Dashboard", active: true },
                  { label: "Broadcast", active: false },
                  { label: "Monitor", active: false },
                  { label: "Exams", active: false },
                  { label: "Analytics", active: false },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      padding: "7px 12px",
                      borderRadius: "8px",
                      marginBottom: "2px",
                      fontSize: "12px",
                      color: item.active ? "#4F8EF7" : "#8B8BA7",
                      background: item.active
                        ? "rgba(79,142,247,0.12)"
                        : "transparent",
                      borderLeft: item.active
                        ? "3px solid #4F8EF7"
                        : "3px solid transparent",
                    }}
                  >
                    {item.label}
                  </div>
                ))}
              </div>
              {/* Main content area */}
              <div style={{ flex: 1, padding: "20px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    marginBottom: "20px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <div
                      className="live-pulse"
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: "#22C55E",
                      }}
                    />

                    <span
                      style={{
                        fontSize: "11px",
                        color: "#22C55E",
                        fontFamily: "JetBrains Mono, monospace",
                        letterSpacing: "0.06em",
                      }}
                    >
                      SESSION LIVE
                    </span>
                  </div>
                  <span style={{ fontSize: "11px", color: "#4A4A6A" }}>
                    LAB 301
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      color: "#4A4A6A",
                      fontFamily: "JetBrains Mono, monospace",
                      marginLeft: "auto",
                    }}
                  >
                    00:47:23
                  </span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: "12px",
                    marginBottom: "16px",
                  }}
                >
                  {[
                    { label: "Students", val: "23", color: "#4F8EF7" },
                    { label: "Active", val: "19", color: "#22C55E" },
                    { label: "Not Viewing", val: "3", color: "#F59E0B" },
                    { label: "Offline", val: "1", color: "#4A4A6A" },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      style={{
                        background: "#111118",
                        border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: "10px",
                        padding: "12px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "9px",
                          color: "#4A4A6A",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          marginBottom: "4px",
                        }}
                      >
                        {stat.label}
                      </div>
                      <div
                        style={{
                          fontSize: "22px",
                          fontWeight: 700,
                          fontFamily: "JetBrains Mono, monospace",
                          color: stat.color,
                        }}
                      >
                        {stat.val}
                      </div>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    background: "#111118",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: "10px",
                    padding: "12px",
                    fontSize: "11px",
                    color: "#4A4A6A",
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                >
                  3 students submitted · 16 in progress · Avg time remaining:
                  18m
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll cue */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: "32px",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <div
            style={{
              width: "1px",
              height: "48px",
              background: "linear-gradient(to bottom, transparent, #4A4A6A)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              className="scroll-dot"
              style={{
                width: "1px",
                background: "#4A4A6A",
                position: "absolute",
                top: 0,
              }}
            />
          </div>
          <ChevronDown aria-hidden="true" size={14} color="#4A4A6A" />
        </div>
      </section>

      {/* ── SOCIAL PROOF BAR ───────────────────────────────────────────── */}
      <section
        aria-label="Social proof statistics"
        style={{
          background: "#111118",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          padding: "48px 24px",
        }}
      >
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            gap: "48px",
            flexWrap: "wrap",
            justifyContent: "space-between",
          }}
        >
          <p
            style={{
              fontSize: "14px",
              color: "#4A4A6A",
              maxWidth: "200px",
              lineHeight: 1.6,
            }}
          >
            Trusted in university computer labs across India
          </p>
          <div style={{ display: "flex", gap: "64px", flexWrap: "wrap" }}>
            {[
              { ref: c1, label: "Students Managed", prefix: "" },
              { ref: c2, label: "Lab Sessions Run", prefix: "" },
              { ref: c3, label: "Attendance Accuracy", prefix: "" },
              { ref: c4, label: "Manual Processes", prefix: "" },
            ].map(({ ref, label }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: "28px",
                    fontWeight: 600,
                    color: "#F0F0F5",
                    lineHeight: 1,
                  }}
                >
                  <span ref={ref}>0</span>
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#4A4A6A",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    marginTop: "6px",
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ───────────────────────────────────────────────────── */}
      <main>
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "120px 24px",
          }}
        >
          {features.map((feature, idx) => (
            <FeatureItem
              key={feature.id}
              feature={feature}
              isLast={idx === features.length - 1}
            />
          ))}
        </div>
      </main>

      {/* ── HOW IT WORKS ───────────────────────────────────────────────── */}
      <section
        aria-label="How it works"
        style={{
          background: "#0A0A0F",
          padding: "120px 24px",
          borderTop: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <RevealSection>
          <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
            <h2
              style={{
                textAlign: "center",
                fontSize: "clamp(32px, 4vw, 48px)",
                fontWeight: 700,
                letterSpacing: "-0.03em",
                color: "#F0F0F5",
                marginBottom: "64px",
              }}
            >
              Up and running in 3 steps.
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "24px",
                position: "relative",
              }}
            >
              {/* Connector line */}
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: "48px",
                  left: "calc(33.33% + 16px)",
                  right: "calc(33.33% + 16px)",
                  height: "1px",
                  background: "rgba(79,142,247,0.15)",
                  borderTop: "1px dashed rgba(79,142,247,0.2)",
                }}
              />

              {[
                {
                  num: "01",
                  title: "Start a Lab Session",
                  body: "Open Lab Control, create a session for your lab room. Students join automatically when they log in.",
                  Icon: PlayCircle,
                },
                {
                  num: "02",
                  title: "Teach, Assign & Monitor",
                  body: "Broadcast your screen live, assign coding tasks, and watch every student's progress in real time.",
                  Icon: Monitor,
                },
                {
                  num: "03",
                  title: "Review & Improve",
                  body: "After the session, attendance is logged, submissions are collected, and analytics are ready instantly.",
                  Icon: BarChart3,
                },
              ].map(({ num, title, body, Icon }) => (
                <div
                  key={num}
                  style={{
                    background: "#111118",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: "16px",
                    padding: "32px",
                    transition:
                      "transform 200ms cubic-bezier(0.4,0,0.2,1), box-shadow 200ms",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-4px)";
                    e.currentTarget.style.boxShadow =
                      "0 16px 48px rgba(0,0,0,0.4)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <div
                    style={{
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: "48px",
                      fontWeight: 700,
                      color: "rgba(79,142,247,0.15)",
                      lineHeight: 1,
                      marginBottom: "20px",
                    }}
                  >
                    {num}
                  </div>
                  <Icon
                    aria-hidden="true"
                    size={24}
                    color="#4F8EF7"
                    style={{ marginBottom: "16px" }}
                  />

                  <h3
                    style={{
                      fontSize: "18px",
                      fontWeight: 600,
                      color: "#F0F0F5",
                      margin: "0 0 10px",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {title}
                  </h3>
                  <p
                    style={{
                      fontSize: "15px",
                      color: "#8B8BA7",
                      lineHeight: 1.7,
                      margin: 0,
                    }}
                  >
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </RevealSection>
      </section>

      {/* ── STUDENT SECTION ────────────────────────────────────────────── */}
      <section
        aria-label="For students"
        style={{
          background: "#111118",
          padding: "120px 24px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <RevealSection>
          <div
            style={{
              maxWidth: "1200px",
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              gap: "80px",
            }}
          >
            <div style={{ flex: "0 0 440px", maxWidth: "440px" }}>
              <div
                style={{
                  display: "inline-block",
                  marginBottom: "16px",
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#22C55E",
                  background: "rgba(34,197,94,0.08)",
                  border: "1px solid rgba(34,197,94,0.2)",
                  borderRadius: "999px",
                  padding: "4px 12px",
                }}
              >
                FOR STUDENTS
              </div>
              <h2
                style={{
                  fontSize: "clamp(28px, 3vw, 38px)",
                  fontWeight: 700,
                  letterSpacing: "-0.03em",
                  color: "#F0F0F5",
                  margin: "0 0 16px",
                  lineHeight: 1.15,
                }}
              >
                Everything you need, in one place.
              </h2>
              <p
                style={{
                  fontSize: "16px",
                  color: "#8B8BA7",
                  lineHeight: 1.7,
                  margin: "0 0 28px",
                }}
              >
                Join live sessions, receive tasks directly in your browser,
                submit code without switching tools, and track your own
                attendance and grades — all from a single dashboard.
              </p>
              <button
                onClick={() => navigate("/login")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 20px",
                  borderRadius: "8px",
                  background: "rgba(34,197,94,0.08)",
                  border: "1px solid rgba(34,197,94,0.2)",
                  color: "#22C55E",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 160ms ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(34,197,94,0.14)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(34,197,94,0.08)";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ")
                    navigate("/login");
                }}
                aria-label="See the student view of Lab Control"
              >
                See Student View
                <ArrowRight aria-hidden="true" size={14} />
              </button>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <StudentDashMockup />
            </div>
          </div>
        </RevealSection>
      </section>

      {/* ── FINAL CTA ──────────────────────────────────────────────────── */}
      <section
        aria-label="Get started"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(79,142,247,0.10) 0%, #0A0A0F 70%)",
          borderTop: "1px solid rgba(79,142,247,0.15)",
          padding: "120px 24px",
          textAlign: "center",
        }}
      >
        <RevealSection>
          <h2
            style={{
              fontSize: "clamp(40px, 5vw, 64px)",
              fontWeight: 700,
              letterSpacing: "-0.04em",
              color: "#F0F0F5",
              margin: "0 0 16px",
            }}
          >
            Your lab, smarter.
          </h2>
          <p style={{ fontSize: "18px", color: "#8B8BA7", margin: "0 0 40px" }}>
            No installation. No hardware. Just open a browser and teach.
          </p>
          <button
            onClick={handleGetStarted}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              padding: "0 40px",
              height: "56px",
              background: "linear-gradient(135deg, #4F8EF7, #3B78E7)",
              border: "none",
              borderRadius: "12px",
              fontSize: "16px",
              fontWeight: 600,
              color: "#fff",
              cursor: "pointer",
              boxShadow:
                "0 8px 32px rgba(79,142,247,0.35), inset 0 1px 0 rgba(255,255,255,0.15)",
              transition: "all 160ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.03)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = "scale(0.97)";
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = "scale(1.03)";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") handleGetStarted();
            }}
            aria-label="Get early access to Lab Control"
          >
            Get Early Access
            <ArrowRight aria-hidden="true" size={18} />
          </button>
          <p style={{ fontSize: "13px", color: "#4A4A6A", marginTop: "20px" }}>
            Free for academic institutions during beta.
          </p>
        </RevealSection>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────────── */}
      <footer
        style={{
          background: "#0A0A0F",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          padding: "64px 24px 32px",
        }}
      >
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.5fr 1fr 1fr 1fr",
              gap: "48px",
              marginBottom: "48px",
            }}
          >
            {/* Brand */}
            <div>
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "#F0F0F5",
                  marginBottom: "10px",
                  letterSpacing: "-0.02em",
                }}
              >
                Lab Control
              </div>
              <p
                style={{
                  fontSize: "13px",
                  color: "#4A4A6A",
                  lineHeight: 1.7,
                  maxWidth: "220px",
                }}
              >
                The smart teaching and lab management platform for universities.
              </p>
            </div>
            {/* Links */}
            {[
              {
                heading: "Product",
                links: ["Features", "How It Works", "Pricing", "Changelog"],
              },
              {
                heading: "For Users",
                links: ["Teachers", "Students", "Administrators"],
              },
              {
                heading: "Company",
                links: ["About", "Contact", "Privacy Policy"],
              },
            ].map(({ heading, links }) => (
              <div key={heading}>
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#F0F0F5",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    marginBottom: "16px",
                  }}
                >
                  {heading}
                </div>
                <ul
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  {links.map((link) => (
                    <li key={link}>
                      <button
                        style={{
                          background: "none",
                          border: "none",
                          fontSize: "13px",
                          color: "#4A4A6A",
                          cursor: "pointer",
                          padding: 0,
                          transition: "color 150ms",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = "#8B8BA7";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = "#4A4A6A";
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ")
                            e.currentTarget.click();
                        }}
                      >
                        {link}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div
            style={{
              borderTop: "1px solid rgba(255,255,255,0.06)",
              paddingTop: "24px",
              fontSize: "12px",
              color: "#4A4A6A",
            }}
          >
            © 2026 Lab Control. Built for universities.
          </div>
        </div>
      </footer>

      {/* Inline keyframes for landing-page-specific animations */}
      <style>{`
        @keyframes heroEnter {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes heroMockupEnter {
          from { opacity: 0; transform: rotateX(6deg) rotateY(-4deg) translateY(48px) scale(0.97); }
          to   { opacity: 1; transform: rotateX(6deg) rotateY(-4deg) translateY(0) scale(1); }
        }
        @keyframes mockupFloat {
          0%, 100% { transform: rotateX(6deg) rotateY(-4deg) translateY(0); }
          50%       { transform: rotateX(6deg) rotateY(-4deg) translateY(-12px); }
        }
        @keyframes orbDriftBlue {
          0%   { transform: translate(0, 0); }
          33%  { transform: translate(40px, -30px); }
          66%  { transform: translate(-20px, 20px); }
          100% { transform: translate(0, 0); }
        }
        @keyframes orbDriftGreen {
          0%   { transform: translate(0, 0); }
          33%  { transform: translate(-30px, 20px); }
          66%  { transform: translate(20px, -40px); }
          100% { transform: translate(0, 0); }
        }
        @keyframes scrollDot {
          0%   { top: 0; opacity: 0; height: 0; }
          30%  { opacity: 1; }
          100% { top: 100%; opacity: 0; height: 100%; }
        }
        .orb-blue  { animation: orbDriftBlue  16s ease-in-out infinite; }
        .orb-green { animation: orbDriftGreen 20s ease-in-out infinite; }
        .scroll-dot { animation: scrollDot 2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .orb-blue, .orb-green, .scroll-dot { animation: none; }
          [style*="animation"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
