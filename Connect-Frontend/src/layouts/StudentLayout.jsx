import React from "react";
import { Outlet, Navigate } from "react-router";
import { useAuth } from "@/context/AuthContext";
import { Header } from "@/components/common/Header";

export function StudentLayout() {
  const { isAuthenticated, role, loading } = useAuth();

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

  // If role is teacher/admin, redirect to teacher view
  if (role === "teacher" || role === "admin") {
    return <Navigate to="/teacher" replace />;
  }

  return (
    <div data-role="student" className="min-h-screen bg-bg-base text-text-primary flex flex-col antialiased">
      <Header role="student" title="Student Dashboard" />
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
