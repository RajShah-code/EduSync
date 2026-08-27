import { useEffect, useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router";
import { IconUsers as Users, IconStack2 as Layers, IconLogout as LogOut, IconSchool as GraduationCap, IconBookmark as BookMarked, IconClipboardText as ClipboardList, IconShieldCheck as ShieldCheck } from "@tabler/icons-react";
import { cn } from "../components/ui/utils";
import { Toaster } from "sonner";

const navigation = [
  { name: "Users", href: "/admin/users", icon: Users },
  { name: "Classes", href: "/admin/classes", icon: Layers, dataTour: "admin-classes" },
  { name: "Subjects", href: "/admin/subjects", icon: BookMarked },
  { name: "Allotments", href: "/admin/subject-allotments", icon: ClipboardList },
  { name: "App Allow-List", href: "/admin/app-allowlist", icon: ShieldCheck },
];

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  // Marks the document as "inside a dashboard shell" so html/body suppress
  // their own scroll (see theme.css's html.app-shell-active rule) — every
  // scroll region in here is one of this layout's own internal containers.
  // Must be scoped to this class, not a bare html/body rule, since routes
  // outside this layout (LandingPage, Login) rely on normal document scroll.
  useEffect(() => {
    document.documentElement.classList.add("app-shell-active");
    return () => document.documentElement.classList.remove("app-shell-active");
  }, []);

  // Mirrors the [data-role] scope onto <body> so role-accent CSS variables
  // (--accent-500, --ring, --primary, ...) still resolve correctly inside
  // Radix Dialog/AlertDialog content, which portals to document.body and
  // would otherwise sit outside the [data-role="admin"] wrapper div and
  // fall back to :root's default (student orange).
  useEffect(() => {
    document.body.setAttribute("data-role", "admin");
    return () => document.body.removeAttribute("data-role");
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("edusync_token");
    localStorage.removeItem("edusync_user");
    navigate("/");
  };

  const [displayUser, setDisplayUser] = useState(() =>
    JSON.parse(localStorage.getItem("edusync_user") || "{}")
  );

  useEffect(() => {
    const refresh = () => setDisplayUser(JSON.parse(localStorage.getItem("edusync_user") || "{}"));
    window.addEventListener("edusync:user-updated", refresh);
    return () => window.removeEventListener("edusync:user-updated", refresh);
  }, []);

  // Client-side authentication guard
  useEffect(() => {
    const token = localStorage.getItem("edusync_token");
    const userStr = localStorage.getItem("edusync_user");
    if (!token || !userStr) {
      localStorage.removeItem("edusync_token");
      localStorage.removeItem("edusync_user");
      navigate("/login");
      return;
    }
    try {
      const user = JSON.parse(userStr);
      if (user.role !== "admin") {
        localStorage.removeItem("edusync_token");
        localStorage.removeItem("edusync_user");
        navigate("/login");
        return;
      }
    } catch {
      localStorage.removeItem("edusync_token");
      localStorage.removeItem("edusync_user");
      navigate("/login");
      return;
    }
  }, [navigate]);

  const adminInitials = (displayUser.name || "Admin")
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex h-screen bg-bg-base" data-role="admin">
      {/* Sidebar — 3 distinct rounded blocks (brand / nav / user), tight gap
          between them, rather than one continuous panel with dividers.
          Structurally identical to TeacherLayout.jsx / StudentLayout.jsx —
          only the [data-role="admin"] accent scope differs. */}
      <aside className="w-16 min-w-16 md:w-[230px] md:min-w-[230px] flex flex-col gap-2 p-2 bg-bg-base transition-all duration-200">
        {/* Brand */}
        <div className="rounded-[var(--radius-lg)] border border-border bg-bg-surface px-3 md:px-4 py-3.5 flex items-center gap-2.5 justify-center md:justify-start shrink-0">
          <div
            className="w-[26px] h-[26px] rounded-lg shrink-0 flex items-center justify-center"
            style={{ background: "linear-gradient(155deg, var(--accent-700), color-mix(in srgb, var(--accent-700) 55%, var(--bg-base)))" }}
          >
            <GraduationCap className="w-3.5 h-3.5 text-white" strokeWidth={2} />
          </div>
          <span className="font-display font-semibold text-text-primary text-[14.5px] tracking-tight hidden md:inline">
            EduSync
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 min-h-0 rounded-[var(--radius-lg)] border border-border bg-bg-surface p-2 md:p-2.5 space-y-0.5 overflow-y-auto">
          {navigation.map((item) => {
            const isActive =
              location.pathname === item.href ||
              location.pathname.startsWith(item.href + "/");

            return (
              <Link
                key={item.name}
                to={item.href}
                data-tour={item.dataTour}
                title={item.name}
                className={cn(
                  "flex items-center gap-2.5 pr-3 py-2 text-[13px] rounded-[var(--radius-md)] justify-center md:justify-start",
                  isActive ? "nav-active" : "nav-inactive"
                )}
              >
                <item.icon className="nav-icon w-4 h-4 shrink-0" strokeWidth={1.75} />
                <span className="hidden md:inline">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* User info & Actions */}
        <div className="rounded-[var(--radius-lg)] border border-border bg-bg-surface p-2 md:p-2.5 shrink-0">
          <div className="hidden md:flex items-center gap-2.5 px-1 py-1">
            <div className="w-7 h-7 rounded-full bg-bg-surface-3 border border-border flex items-center justify-center text-[10.5px] font-semibold text-text-secondary shrink-0">
              {adminInitials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-medium text-text-primary truncate">
                {displayUser.name || "Admin"}
              </div>
              <div className="text-[10.5px] text-text-muted truncate">
                {displayUser.email || "Admin"}
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Logout"
              className="btn-press w-7 h-7 rounded-md flex items-center justify-center text-text-muted hover:text-accent-critical hover:bg-accent-critical/10 transition-std shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
          </div>

          {/* Collapsed (mobile) — icon-only logout, name/avatar hidden */}
          <button
            onClick={handleLogout}
            title="Logout"
            className="btn-press md:hidden w-full flex items-center justify-center py-2 text-text-secondary hover:text-accent-critical hover:bg-accent-critical/10 rounded-lg transition-std"
          >
            <LogOut className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto page-enter">
          <Outlet />
        </main>
        <Toaster position="top-right" richColors />
      </div>
    </div>
  );
}
