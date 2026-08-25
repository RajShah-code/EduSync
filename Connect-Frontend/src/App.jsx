import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Login } from "@/pages/Login";
import { TeacherLayout } from "@/layouts/TeacherLayout";
import { StudentLayout } from "@/layouts/StudentLayout";
import { AdminLayout } from "@/layouts/AdminLayout";
import { TeacherClassrooms } from "@/pages/teacher/TeacherClassrooms";
import { StudentClassrooms } from "@/pages/student/StudentClassrooms";
import { ClassroomStream } from "@/pages/ClassroomStream";
import { AdminAllotments } from "@/pages/admin/AdminAllotments";
import { AdminAnnouncements } from "@/pages/admin/AdminAnnouncements";

function RootRedirect() {
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

  if (role === "admin") {
    return <Navigate to="/admin" replace />;
  }

  if (role === "student") {
    return <Navigate to="/student" replace />;
  }

  return <Navigate to="/teacher" replace />;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />

          {/* Teacher Routes */}
          <Route path="/teacher" element={<TeacherLayout />}>
            <Route index element={<TeacherClassrooms />} />
            <Route path="classrooms/:id" element={<ClassroomStream role="teacher" />} />
          </Route>

          {/* Student Routes */}
          <Route path="/student" element={<StudentLayout />}>
            <Route index element={<StudentClassrooms />} />
            <Route path="classrooms/:id" element={<ClassroomStream role="student" />} />
          </Route>

          {/* Admin Routes */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminAllotments />} />
            <Route path="allotments" element={<AdminAllotments />} />
            <Route path="announcements" element={<AdminAnnouncements />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
