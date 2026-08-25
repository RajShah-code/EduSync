import React from "react";
import { Outlet, Navigate } from "react-router";
import { useAuth } from "@/context/AuthContext";
import { Header } from "@/components/common/Header";

export function TeacherLayout() {
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

  // If role is student, redirect to student view
  if (role === "student") {
    return <Navigate to="/student" replace />;
  }

  return (
    <div data-role="teacher" className="min-h-screen bg-bg-base text-text-primary flex flex-col antialiased">
      <Header role="teacher" title="Faculty Dashboard" />
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
