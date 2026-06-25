import { useEffect, useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router";
import { Users, Layers, LogOut, Shield } from "lucide-react";
import { cn } from "../components/ui/utils";
import { Toaster } from "sonner";

const navigation = [
  { name: "Users", href: "/admin/users", icon: Users },
  { name: "Classes", href: "/admin/classes", icon: Layers },
];

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [adminUser, setAdminUser] = useState(null);

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
      setAdminUser(user);
    } catch {
      localStorage.removeItem("edusync_token");
      localStorage.removeItem("edusync_user");
      navigate("/login");
      return;
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("edusync_token");
    localStorage.removeItem("edusync_user");
    navigate("/");
  };

  if (!adminUser) return null; // Guard loading state

  return (
    <div className="flex h-screen bg-bg-base">
      {/* Sidebar */}
      <aside
        className="flex flex-col bg-bg-surface"
        style={{
          width: "240px",
          minWidth: "240px",
          borderRight: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Brand */}
        <div
          className="px-5 py-4 flex items-center gap-3"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="p-2 bg-accent-info/10 text-accent-info rounded-lg">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div
              className="font-semibold text-text-primary"
              style={{ fontSize: "15px", letterSpacing: "-0.01em" }}
            >
              Lab Control
            </div>
            <div
              className="font-mono text-text-muted"
              style={{
                fontSize: "10px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginTop: "2px",
              }}
            >
              Administrator
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav
          className="flex-1 py-3 overflow-y-auto"
          style={{ padding: "12px 8px" }}
        >
          {navigation.map((item) => {
            const isActive =
              location.pathname === item.href ||
              location.pathname.startsWith(item.href + "/");

            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 py-2 rounded-lg text-sm mb-0.5 px-3 transition-colors",
                  isActive 
                    ? "bg-accent-info/10 text-accent-info" 
                    : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
                )}
                style={{
                  borderRadius: "8px",
                  fontSize: "13.5px",
                  fontWeight: isActive ? 500 : 400,
                }}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* User info */}
        <div
          className="p-3 space-y-1"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="px-3 py-2">
            <div className="text-sm font-medium text-text-primary">
              {adminUser.name || "System Admin"}
            </div>
            <div
              className="font-mono text-text-muted"
              style={{ fontSize: "11px" }}
            >
              {adminUser.email || "admin"}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-text-secondary hover:text-accent-critical transition-colors rounded-lg hover:bg-accent-critical/10"
            style={{ borderRadius: "8px" }}
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>

        {/* Version */}
        <div
          className="px-5 py-3 font-mono text-text-muted text-center"
          style={{
            fontSize: "11px",
            borderTop: "1px solid rgba(255,255,255,0.04)",
          }}
        >
          v2.5.0
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-auto bg-bg-base">
          <Outlet />
        </main>
        <Toaster position="top-right" richColors />
      </div>
    </div>
  );
}
