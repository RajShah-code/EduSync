import { createBrowserRouter } from "react-router";

// Landing
import { LandingPage } from "./pages/LandingPage";

// Auth
import { Login } from "./pages/auth/Login";

// Admin Pages
import { AdminLayout } from "./layouts/AdminLayout";
import { AdminUsers } from "./pages/admin/AdminUsers";
import { AdminClasses } from "./pages/admin/AdminClasses";

// Teacher Pages
import { TeacherDashboard } from "./pages/teacher/TeacherDashboard";
import { LiveBroadcast } from "./pages/teacher/LiveBroadcast";
import { StudentMonitor } from "./pages/teacher/StudentMonitor";
import { TaskAssignment } from "./pages/teacher/TaskAssignment";
import { TaskProgress } from "./pages/teacher/TaskProgress";
import { SubmissionReview } from "./pages/teacher/SubmissionReview";
import { ExamCreation } from "./pages/teacher/ExamCreation";
import { ActiveExam } from "./pages/teacher/ActiveExam";
import { ExamResults } from "./pages/teacher/ExamResults";
import { Attendance } from "./pages/teacher/Attendance";
import { Analytics } from "./pages/teacher/Analytics";
import { SessionRecording } from "./pages/teacher/SessionRecording";
import { TeacherSettings } from "./pages/teacher/TeacherSettings";
import { TeacherLayout } from "./layouts/TeacherLayout";

// Student Pages
import { StudentDashboard } from "./pages/student/StudentDashboard";
import { LiveSession } from "./pages/student/LiveSession";
import { CodeEditor } from "./pages/student/CodeEditor";
import { TaskWorkspace } from "./pages/student/TaskWorkspace";
import { ExamScreen } from "./pages/student/ExamScreen";
import { ExamLocked } from "./pages/student/ExamLocked";
import { MyFiles } from "./pages/student/MyFiles";
import { AttendanceHistory } from "./pages/student/AttendanceHistory";
import { SessionList } from "./pages/student/SessionList";
import { StudentLayout } from "./layouts/StudentLayout";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: LandingPage,
  },
  {
    path: "/login",
    Component: Login,
  },
  // Admin Routes
  {
    path: "/admin",
    Component: AdminLayout,
    children: [
      { index: true, Component: AdminUsers },
      { path: "users", Component: AdminUsers },
      { path: "classes", Component: AdminClasses },
    ],
  },
  // Teacher Routes
  {
    path: "/teacher",
    Component: TeacherLayout,
    children: [
      { index: true, Component: TeacherDashboard },
      { path: "broadcast", Component: LiveBroadcast },
      { path: "monitor", Component: StudentMonitor },
      { path: "task/assign", Component: TaskAssignment },
      { path: "task/progress/:taskId", Component: TaskProgress },
      { path: "task/review/:taskId", Component: SubmissionReview },
      { path: "exam/create", Component: ExamCreation },
      { path: "exam/active/:examId", Component: ActiveExam },
      { path: "exam/results/:examId", Component: ExamResults },
      { path: "attendance", Component: Attendance },
      { path: "analytics", Component: Analytics },
      { path: "recordings", Component: SessionRecording },
      { path: "settings", Component: TeacherSettings },
    ],
  },
  // Student Routes
  {
    path: "/student",
    Component: StudentLayout,
    children: [
      { index: true, Component: StudentDashboard },
      { path: "sessions", Component: SessionList },
      { path: "live-session", Component: LiveSession },
      { path: "session/:sessionId", Component: LiveSession },
      { path: "tasks", Component: TaskWorkspace },
      { path: "task/:taskId", Component: TaskWorkspace },
      { path: "exam/:examId", Component: ExamScreen },
      { path: "exam/:examId/locked", Component: ExamLocked },
      { path: "files", Component: MyFiles },
      { path: "attendance", Component: AttendanceHistory },
    ],
  },
]);
