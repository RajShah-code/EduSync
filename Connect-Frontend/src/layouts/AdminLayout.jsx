import React from "react";
import { Outlet, useNavigate, useLocation, Navigate, Link } from "react-router";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogOut, Shield, Megaphone, Layers } from "lucide-react";

export function AdminLayout() {
  const { user, isAuthenticated, role, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center text-text-muted text-sm">
        Loading EduSync Connect...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Role Gate: Non-admin users are redirected to their designated portals
  if (role !== "admin") {
    if (role === "student") {
      return <Navigate to="/student" replace />;
    }
    return <Navigate to="/teacher" replace />;
  }

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const isAllotments =
    location.pathname === "/admin" ||
    location.pathname === "/admin/allotments" ||
    location.pathname === "/admin/";
  const isAnnouncements = location.pathname.startsWith("/admin/announcements");

  return (
    <div data-role="admin" className="min-h-screen bg-bg-base text-text-primary flex flex-col antialiased">
      {/* Top Navigation Bar */}
      <header className="h-14 border-b border-border bg-bg-surface px-6 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-[var(--radius-md)] bg-admin-500/10 border border-admin-500/30 flex items-center justify-center font-bold text-admin-500 tracking-tight text-sm">
              ES
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm tracking-tight text-text-primary">
                EduSync Connect
              </span>
              <Badge
                variant="outline"
                className="bg-admin-500/15 text-admin-300 border-admin-500/30 text-[10px] py-0 px-2 uppercase tracking-wider font-semibold"
              >
                Admin Panel
              </Badge>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 border-l border-border/80 pl-6 h-6">
            <Link
              to="/admin"
              className={`flex items-center gap-1.5 px-3 py-1 rounded-[var(--radius-md)] text-xs font-medium transition-colors ${
                isAllotments
                  ? "bg-admin-500/15 text-text-primary border border-admin-500/30 font-semibold"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-surface-3"
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-admin-500" />
              <span>Allotments & Overview</span>
            </Link>

            <Link
              to="/admin/announcements"
              className={`flex items-center gap-1.5 px-3 py-1 rounded-[var(--radius-md)] text-xs font-medium transition-colors ${
                isAnnouncements
                  ? "bg-admin-500/15 text-text-primary border border-admin-500/30 font-semibold"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-surface-3"
              }`}
            >
              <Megaphone className="w-3.5 h-3.5 text-admin-500" />
              <span>Campus Announcements</span>
            </Link>
          </nav>
        </div>

        {/* User Info & Actions */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 text-xs">
            <span className="text-text-secondary">{user?.name || "System Admin"}</span>
            <span className="text-text-muted">({user?.email || "admin@edusync.internal"})</span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-text-secondary hover:text-accent-critical gap-1.5 text-xs h-8 px-2.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </Button>
        </div>
      </header>

      {/* Mobile Subnav */}
      <div className="md:hidden flex items-center border-b border-border bg-bg-surface px-4 py-2 gap-2 text-xs">
        <Link
          to="/admin"
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-[var(--radius-md)] text-xs ${
            isAllotments
              ? "bg-admin-500/15 text-text-primary font-semibold border border-admin-500/30"
              : "text-text-secondary"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Allotments</span>
        </Link>
        <Link
          to="/admin/announcements"
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-[var(--radius-md)] text-xs ${
            isAnnouncements
              ? "bg-admin-500/15 text-text-primary font-semibold border border-admin-500/30"
              : "text-text-secondary"
          }`}
        >
          <Megaphone className="w-3.5 h-3.5" />
          <span>Announcements</span>
        </Link>
      </div>

      {/* Main Content View */}
      <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto">
        <Outlet />
      </main>
    </div>
  );
}
