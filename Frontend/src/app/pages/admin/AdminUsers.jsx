import { API_BASE_URL } from "../../config/api.js";
import { useState, useEffect } from "react";
import { useLocation } from "react-router";
import * as XLSX from "xlsx";
import { IconSearch as Search, IconUserPlus as UserPlus, IconPencil as Edit2, IconKey as Key, IconTrash as Trash2, IconX as X, IconCheck as Check, IconCopy as Copy, IconAlertTriangle as AlertTriangle, IconUserCheck as UserCheck, IconHelpCircle as HelpCircle, IconUpload as Upload, IconDownload as Download, IconFileSpreadsheet as FileSpreadsheet, IconChevronLeft as ChevronLeft, IconChevronRight as ChevronRight } from "@tabler/icons-react";
import { toast } from "sonner";
import { AppTour } from "../../components/AppTour";
import { adminTourSteps } from "../../tours/adminTourSteps";
import { Button } from "../../components/ui/button";
import Dropdown from "../../components/Dropdown";

const PAGE_SIZE = 10;


// Role identity colors — deliberately the raw per-role scale tokens
// (--student-500 / --teacher-500 / --admin-500), not --accent-*. This page
// always renders under [data-role="admin"], so --accent-500 only ever
// resolves to ink blue; a role badge needs to show that *role's* color
// regardless of which role is viewing the page, so it reads the unscoped
// :root scale directly instead.
const ROLE_COLORS = {
  admin: "var(--admin-500)",
  teacher: "var(--teacher-500)",
  student: "var(--student-500)",
};

export function AdminUsers() {
  const location = useLocation();
  const [users, setUsers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  const [runTour, setRunTour] = useState(false);
  const [isManualReplay, setIsManualReplay] = useState(false);

  useEffect(() => {
    const userStr = localStorage.getItem("edusync_user");
    const user = userStr ? JSON.parse(userStr) : {};

    if (location.state?.startTour) {
      setIsManualReplay(true);
      const timer = setTimeout(() => setRunTour(true), 400);
      return () => clearTimeout(timer);
    } else if (user.has_seen_tour !== true) {
      setIsManualReplay(false);
      const timer = setTimeout(() => setRunTour(true), 400);
      return () => clearTimeout(timer);
    }
  }, [location.state]);

  const handleRestartTour = () => {
    setIsManualReplay(true);
    setRunTour(true);
  };

  // Filters state
  const [roleFilter, setRoleFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Pagination — 10 users per page. Resets to page 1 whenever the active
  // filters change, so a narrower result set never lands on a now-empty page.
  const [currentPage, setCurrentPage] = useState(1);
  useEffect(() => {
    setCurrentPage(1);
  }, [roleFilter, classFilter, searchQuery]);

  const handleRoleFilterChange = (value) => {
    setRoleFilter(value);
    // Class filter only applies to students — clear it once it's hidden so a
    // stale selection doesn't silently narrow a later "All Roles" search.
    if (value !== "student") setClassFilter("all");
  };

  // Modals state
  const [selectedUser, setSelectedUser] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  // Bulk import state
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResults, setBulkResults] = useState(null);

  // Guards against double-submission while a mutating request is in flight
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isResettingPw, setIsResettingPw] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Download template with Data and Instructions sheets
  const handleDownloadTemplate = () => {
    // Sheet 1: Data (Header Row)
    const dataHeaders = [["name", "email", "role", "class", "roll_no", "windows_username", "password"]];
    const dataSheet = XLSX.utils.aoa_to_sheet(dataHeaders);

    // Sheet 2: Instructions
    const instructionsContent = [
      ["========================================================================================"],
      ["                               EDUSYNC BULK USER IMPORT INSTRUCTIONS"],
      ["========================================================================================"],
      [""],
      ["FIELD SPECIFICATIONS:"],
      ["1. name (Required)"],
      ["   - Full name of the user (e.g. \"John Doe\")."],
      [""],
      ["2. email (Required)"],
      ["   - Unique email address used for login and notifications (e.g. \"student@domain.com\")."],
      [""],
      ["3. role (Required)"],
      ["   - Must be exactly one of: \"admin\", \"teacher\", or \"student\" (lowercase only)."],
      [""],
      ["4. class (Required for Students only)"],
      ["   - Required when role = student. Leave blank for teachers/admins."],
      ["   - Must match an existing class name in EduSync (e.g. \"FYBCA\", \"SYBCA\", \"TYBCA\")."],
      [""],
      ["5. roll_no (Required for Students only)"],
      ["   - Required when role = student. Leave blank for teachers/admins."],
      ["   - Numeric roll number assigned to the student."],
      [""],
      ["6. windows_username (Optional)"],
      ["   - Captured Windows username for auto-login (e.g. \"SYBCA48\" or \"jdoe\")."],
      ["   - Leave blank if unknown; can be set or updated later."],
      [""],
      ["7. password (Optional)"],
      ["   - Plaintext password. Leave blank to auto-generate:"],
      ["     * Students: ClassName + RollNo (e.g. \"FYBCA48\")."],
      ["     * Teachers/Admins: Name with no spaces, lowercase (e.g. \"johndoe\")."],
      [""],
      ["IMPORT RULES:"],
      ["- Fill your user records in Sheet 1 (\"Data\")."],
      ["- One row represents one user. Do not leave blank rows between entries."],
      ["- Duplicate emails (already in EduSync or repeated within this file) will be skipped and reported as failed, without blocking valid rows in the batch."]
    ];
    const instructionsSheet = XLSX.utils.aoa_to_sheet(instructionsContent);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, dataSheet, "Data");
    XLSX.utils.book_append_sheet(workbook, instructionsSheet, "Instructions");

    XLSX.writeFile(workbook, "EduSync_User_Import_Template.xlsx");
  };

  // Bulk upload handler
  const handleBulkUpload = async (e) => {
    e.preventDefault();
    if (!bulkFile) {
      toast.error("Please select an Excel file (.xlsx) to upload");
      return;
    }

    setBulkUploading(true);
    setBulkResults(null);

    try {
      const token = localStorage.getItem("edusync_token");
      const formData = new FormData();
      formData.append("file", bulkFile);

      const res = await fetch(`${API_BASE_URL}/admin/users/bulk-import`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "Failed to process bulk import file");
        return;
      }

      setBulkResults(data.results || []);
      const createdCount = (data.results || []).filter((r) => r.status === "created").length;
      const failedCount = (data.results || []).filter((r) => r.status === "failed").length;

      if (createdCount > 0) {
        toast.success(`Successfully imported ${createdCount} user(s)`);
        fetchData();
      }
      if (failedCount > 0) {
        toast.warning(`${failedCount} row(s) failed validation. See details below.`);
      }
    } catch {
      toast.error("Network error during bulk import upload");
    } finally {
      setBulkUploading(false);
    }
  };

  // Success Modal for transient password display
  const [passwordDisplay, setPasswordDisplay] = useState(null); // { name, password, email }

  // Form states
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    role: "student",
    class_id: "",
    roll_no: "",
    windows_username: "",
    password: "",
  });

  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    role: "student",
    class_id: "",
    roll_no: "",
  });

  const [resetPasswordForm, setResetPasswordForm] = useState({
    new_password: ""
  });

  // Fetch initial data
  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("edusync_token");
      
      // Fetch classes
      const classesRes = await fetch(`${API_BASE_URL}/classes`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const classesData = await classesRes.json();
      if (classesRes.ok) {
        setClasses(classesData.classes || []);
      }

      // Fetch users
      const queryParams = new URLSearchParams({
        role: roleFilter,
        class_id: classFilter,
        search: searchQuery
      });
      const usersRes = await fetch(`${API_BASE_URL}/admin/users?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const usersData = await usersRes.json();
      if (usersRes.ok) {
        setUsers(Array.isArray(usersData) ? usersData : (usersData.users || []));
      }
    } catch (err) {
      toast.error("Failed to sync admin data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [roleFilter, classFilter, searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (isCreating) return;
    setIsCreating(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/admin/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: createForm.name,
          email: createForm.email,
          role: createForm.role,
          class_id: createForm.role === "student" ? createForm.class_id : undefined,
          roll_no: createForm.role === "student" ? createForm.roll_no : undefined,
          windows_username: createForm.role === "student" ? (createForm.windows_username || undefined) : undefined,
          password: createForm.password || undefined
        })
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Failed to create user");
        return;
      }

      toast.success(data.message || "User created successfully!");
      setIsCreateModalOpen(false);
      
      // Show password display confirmation
      setPasswordDisplay({
        name: data.user.name,
        email: data.user.email,
        password: data.generatedPassword
      });

      // Reset form
      setCreateForm({
        name: "",
        email: "",
        role: "student",
        class_id: "",
        roll_no: "",
        windows_username: "",
        password: "",
      });

      fetchData();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleEditOpen = (user) => {
    if (!user) return;
    setSelectedUser(user);
    setEditForm({
      name: user.name || "",
      email: user.email || "",
      role: user.role || "student",
      class_id: user.class_id ? String(user.class_id) : "",
      roll_no: user.roll_no || "",
    });
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!selectedUser || isUpdating) return;
    setIsUpdating(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/admin/users/${selectedUser.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: editForm.name,
          email: editForm.email,
          role: editForm.role,
          class_id: editForm.role === "student" ? (editForm.class_id ? Number(editForm.class_id) : undefined) : undefined,
          roll_no: editForm.role === "student" ? editForm.roll_no : undefined,
        })
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Failed to update user");
        return;
      }

      toast.success(data.message || "User details updated!");
      setIsEditModalOpen(false);
      setSelectedUser(null);
      fetchData();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleResetOpen = (user) => {
    if (!user) return;
    setSelectedUser(user);
    setResetPasswordForm({ new_password: "" });
    setIsResetModalOpen(true);
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    if (!selectedUser || isResettingPw) return;
    setIsResettingPw(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/admin/users/${selectedUser.id}/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          new_password: resetPasswordForm.new_password || undefined
        })
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Failed to reset password");
        return;
      }

      toast.success("Password reset completed!");
      setIsResetModalOpen(false);

      // Show password display confirmation
      setPasswordDisplay({
        name: selectedUser.name,
        email: selectedUser.email,
        password: data.generatedPassword
      });

      setSelectedUser(null);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setIsResettingPw(false);
    }
  };

  const handleDeleteOpen = (user) => {
    if (!user) return;
    setSelectedUser(user);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteSubmit = async () => {
    if (!selectedUser || isDeleting) return;
    setIsDeleting(true);
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`${API_BASE_URL}/admin/users/${selectedUser.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Failed to delete user");
        return;
      }

      toast.success("User deleted successfully!");
      setIsDeleteModalOpen(false);
      setSelectedUser(null);
      fetchData();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Password copied to clipboard!");
    } catch {
      toast.error("Couldn't access the clipboard. Copy the password manually.");
    }
  };

  const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const paginatedUsers = users.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header + filters — fixed height; only the table card below grows
          to fill whatever space remains on the current screen. */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary mb-1">
            User Management
          </h1>
          <p className="text-sm text-text-secondary">
            Provision and manage credentials for teachers and students
          </p>
        </div>
        <div data-tour="admin-bulk" className="flex items-center gap-2">
          <Button
            data-tour="admin-restart-tour"
            onClick={handleRestartTour}
            variant="outline"
            title="Restart App Tour"
          >
            <HelpCircle className="w-4 h-4 text-accent-info" strokeWidth={1.75} />
            Restart Tour
          </Button>
          <Button
            onClick={handleDownloadTemplate}
            variant="outline"
            title="Download Excel Import Template"
          >
            <Download className="w-4 h-4 text-accent-info" strokeWidth={1.75} />
            Download Template
          </Button>
          <Button
            onClick={() => {
              setBulkFile(null);
              setBulkResults(null);
              setIsBulkModalOpen(true);
            }}
            variant="outline"
            title="Bulk Import Users via Excel"
          >
            <FileSpreadsheet className="w-4 h-4 text-accent-info" strokeWidth={1.75} />
            Bulk Import
          </Button>
          <Button
            data-tour="admin-provision"
            onClick={() => setIsCreateModalOpen(true)}
            className="bg-accent-info hover:bg-accent-info/90 text-white"
          >
            <UserPlus className="w-4 h-4" strokeWidth={1.75} />
            Provision User
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div data-tour="admin-filters" className="p-4 bg-bg-surface border border-border rounded-[var(--radius-lg)] flex flex-col md:flex-row gap-4 items-center flex-shrink-0">
        {/* Search */}
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" strokeWidth={1.75} />
          <input
            type="text"
            placeholder="Search by name or email/username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-bg-base border border-border rounded-[var(--radius-md)] pl-10 pr-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-info transition-colors"
          />
        </div>

        {/* Role Filter */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <label className="text-xs text-text-secondary font-medium whitespace-nowrap">Role:</label>
          <Dropdown
            value={roleFilter}
            onChange={handleRoleFilterChange}
            aria-label="Filter by role"
            className="px-3 py-2 w-full md:w-40"
            options={[
              { value: "all", label: "All Roles" },
              { value: "teacher", label: "Teachers" },
              { value: "student", label: "Students" },
              { value: "admin", label: "Administrators" },
            ]}
          />
        </div>

        {/* Class Filter — student-only, mirrors the Provision modal's
            show/hide-on-role pattern. Combines with role + search since
            fetchData already sends all three as one query. */}
        {roleFilter === "student" && (
          <div className="flex items-center gap-2 w-full md:w-auto">
            <label className="text-xs text-text-secondary font-medium whitespace-nowrap">Class:</label>
            <Dropdown
              value={classFilter}
              onChange={setClassFilter}
              aria-label="Filter by class"
              className="px-3 py-2 w-full md:w-40"
              options={[
                { value: "all", label: "All Classes" },
                ...classes.map((cls) => ({ value: String(cls.id), label: cls.name })),
              ]}
            />
          </div>
        )}
      </div>
      </div>

      {/* Users Table — fills whatever vertical space remains below the
          fixed header/filters, down to a small breathing-room gap above the
          viewport edge (pb-6, matching the app's standard page padding).
          The table body scrolls internally only if its own rows still don't
          fit that space; header/filters/pagination never move. */}
      <div className="flex-1 min-h-0 px-6 pb-6 flex flex-col">
      <div data-tour="admin-table" className="flex-1 min-h-0 flex flex-col bg-bg-surface border border-border rounded-[var(--radius-lg)] overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-sm text-text-muted">
            Fetching user directory...
          </div>
        ) : users.length === 0 ? (
          <div className="py-20 text-center text-sm text-text-muted">
            No users found matching current filters
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-bg-surface z-10">
                <tr className="border-b border-border/80 text-[11px] font-semibold text-text-muted tracking-wider uppercase bg-bg-surface">
                  <th className="px-6 py-3.5">Name</th>
                  <th className="px-6 py-3.5">Email</th>
                  <th className="px-6 py-3.5">Role</th>
                  <th className="px-6 py-3.5">Class</th>
                  <th className="px-6 py-3.5">Roll No</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {paginatedUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-text-primary">
                      {user.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-text-secondary font-mono">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className="inline-block px-2.5 py-0.5 rounded-[var(--radius-pill)] text-xs font-semibold uppercase tracking-wider border"
                        style={{
                          color: ROLE_COLORS[user.role],
                          background: `color-mix(in srgb, ${ROLE_COLORS[user.role]} 12%, transparent)`,
                          borderColor: `color-mix(in srgb, ${ROLE_COLORS[user.role]} 28%, transparent)`,
                        }}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-text-secondary">
                      {user.role === 'student' ? (user.class_name || <span className="text-text-muted italic">None</span>) : "—"}
                    </td>
                    <td className="px-6 py-4 text-sm text-text-secondary font-mono">
                      {user.role === 'student' ? (user.roll_no || "—") : "—"}
                    </td>
                    <td className="px-6 py-4 text-sm text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleEditOpen(user)}
                          className="p-1.5 hover:bg-white/5 rounded text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                          title="Edit Details"
                          aria-label={`Edit details for ${user.name || "this user"}`}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResetOpen(user)}
                          className="p-1.5 hover:bg-white/5 rounded text-text-secondary hover:text-accent-warning transition-colors cursor-pointer"
                          title="Reset Password"
                          aria-label={`Reset password for ${user.name || "this user"}`}
                        >
                          <Key className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteOpen(user)}
                          className="p-1.5 hover:bg-white/5 rounded text-text-secondary hover:text-accent-critical transition-colors cursor-pointer"
                          title="Delete User"
                          aria-label={`Delete ${user.name || "this user"}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination — always visible below the (possibly internally
            scrolling) table, never pushed off-screen by a long list. */}
        {!loading && users.length > 0 && (
          <div className="flex-shrink-0 flex items-center justify-between gap-4 flex-wrap px-4 py-3 border-t border-border">
            <span className="text-xs tnum text-text-secondary">
              {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, users.length)} of {users.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="p-1.5 rounded-[var(--radius-sm)] border border-border text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.75} />
              </button>
              <span className="text-xs tnum text-text-primary px-2 min-w-[4.5rem] text-center">
                Page {safePage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="p-1.5 rounded-[var(--radius-sm)] border border-border text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
                aria-label="Next page"
              >
                <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.75} />
              </button>
            </div>
          </div>
        )}
      </div>
      </div>

      {/* ────────────────── CREATE USER MODAL ────────────────── */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border rounded-xl shadow-2xl max-w-md w-full flex flex-col p-6 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <h3 className="text-lg font-semibold text-text-primary">
                Provision New User Account
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 hover:bg-white/5 rounded-lg text-text-secondary hover:text-text-primary"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="e.g. John Doe"
                  className="w-full bg-bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-info"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  placeholder="e.g. john.doe@edusync.com"
                  className="w-full bg-bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-info"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">Role</label>
                  <Dropdown
                    value={createForm.role}
                    onChange={(val) => setCreateForm({ ...createForm, role: val })}
                    aria-label="Role"
                    className="px-3 py-2 rounded-lg"
                    options={[
                      { value: "student", label: "Student" },
                      { value: "teacher", label: "Teacher" },
                      { value: "admin", label: "Admin" },
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">
                    Password <span className="text-[10px] text-text-muted normal-case">(optional)</span>
                  </label>
                  <input
                    type="password"
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    placeholder="Auto-generate"
                    className="w-full bg-bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-info"
                  />
                </div>
              </div>

              {createForm.role === "student" && (
                <div className="space-y-3 p-3 bg-bg-base rounded-lg border border-border/80">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">Class</label>
                      <Dropdown
                        value={createForm.class_id}
                        onChange={(val) => setCreateForm({ ...createForm, class_id: val })}
                        aria-label="Class"
                        placeholder="Select..."
                        className="px-3 py-2 rounded-lg bg-bg-surface"
                        options={classes.map((cls) => ({ value: String(cls.id), label: cls.name }))}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">Roll No</label>
                      <input
                        type="text"
                        required
                        value={createForm.roll_no}
                        onChange={(e) => setCreateForm({ ...createForm, roll_no: e.target.value })}
                        placeholder="e.g. 05"
                        className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-info"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">
                      Windows Username <span className="text-[10px] text-text-muted normal-case">(optional, auto-login)</span>
                    </label>
                    <input
                      type="text"
                      value={createForm.windows_username}
                      onChange={(e) => setCreateForm({ ...createForm, windows_username: e.target.value })}
                      placeholder="e.g. SYBCA48 or jdoe"
                      className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-info"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-border pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 bg-bg-base hover:bg-white/5 border border-border rounded-lg text-sm text-text-primary font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-4 py-2 bg-accent-info hover:bg-accent-info/90 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
                >
                  {isCreating ? "Creating…" : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────── EDIT USER MODAL ────────────────── */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border rounded-xl shadow-2xl max-w-md w-full flex flex-col p-6 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <h3 className="text-lg font-semibold text-text-primary">
                Edit User Details
              </h3>
              <button
                onClick={() => { setIsEditModalOpen(false); setSelectedUser(null); }}
                className="p-1 hover:bg-white/5 rounded-lg text-text-secondary hover:text-text-primary"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full bg-bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-info"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full bg-bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-info"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">Role</label>
                <Dropdown
                  value={editForm.role}
                  onChange={(val) => setEditForm({ ...editForm, role: val })}
                  aria-label="Role"
                  className="px-3 py-2 rounded-lg"
                  options={[
                    { value: "student", label: "Student" },
                    { value: "teacher", label: "Teacher" },
                    { value: "admin", label: "Admin" },
                  ]}
                />
              </div>

              {editForm.role === "student" && (
                <div className="grid grid-cols-2 gap-4 p-3 bg-bg-base rounded-lg border border-border/80">
                  <div>
                    <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">Class</label>
                    <Dropdown
                      value={editForm.class_id}
                      onChange={(val) => setEditForm({ ...editForm, class_id: val })}
                      aria-label="Class"
                      placeholder="Select..."
                      className="px-3 py-2 rounded-lg bg-bg-surface"
                      options={classes.map((cls) => ({ value: String(cls.id), label: cls.name }))}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">Roll No</label>
                    <input
                      type="text"
                      required
                      value={editForm.roll_no}
                      onChange={(e) => setEditForm({ ...editForm, roll_no: e.target.value })}
                      className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-info"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-border pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => { setIsEditModalOpen(false); setSelectedUser(null); }}
                  className="px-4 py-2 bg-bg-base hover:bg-white/5 border border-border rounded-lg text-sm text-text-primary font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-4 py-2 bg-accent-info hover:bg-accent-info/90 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
                >
                  {isUpdating ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────── RESET PASSWORD MODAL ────────────────── */}
      {isResetModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border rounded-xl shadow-2xl max-w-sm w-full flex flex-col p-6 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <h3 className="text-lg font-semibold text-text-primary">
                Reset User Password
              </h3>
              <button
                onClick={() => { setIsResetModalOpen(false); setSelectedUser(null); }}
                className="p-1 hover:bg-white/5 rounded-lg text-text-secondary hover:text-text-primary"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleResetSubmit} className="space-y-4">
              <p className="text-sm text-text-secondary leading-relaxed">
                Confirm resetting the password for <strong className="text-text-primary">{selectedUser?.name}</strong>?
              </p>
              
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">
                  Manual Password Override <span className="text-[10px] text-text-muted normal-case">(optional)</span>
                </label>
                <input
                  type="password"
                  value={resetPasswordForm.new_password}
                  onChange={(e) => setResetPasswordForm({ new_password: e.target.value })}
                  placeholder="Auto-generate default"
                  className="w-full bg-bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-info"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-border pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => { setIsResetModalOpen(false); setSelectedUser(null); }}
                  className="px-4 py-2 bg-bg-base hover:bg-white/5 border border-border rounded-lg text-sm text-text-primary font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResettingPw}
                  className="px-4 py-2 bg-accent-warning hover:bg-accent-warning/90 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
                >
                  {isResettingPw ? "Resetting…" : "Reset Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────── DELETE CONFIRMATION MODAL ────────────────── */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border rounded-xl shadow-2xl max-w-sm w-full flex flex-col p-6 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <h3 className="text-lg font-semibold text-accent-critical flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                <span>Confirm Deletion</span>
              </h3>
              <button
                onClick={() => { setIsDeleteModalOpen(false); setSelectedUser(null); }}
                className="p-1 hover:bg-white/5 rounded-lg text-text-secondary hover:text-text-primary"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-text-secondary leading-relaxed">
                Are you sure you want to permanently delete the account for <strong className="text-text-primary">{selectedUser?.name}</strong> ({selectedUser?.role})?
              </p>
              
              <div className="p-3 bg-accent-critical/5 border border-accent-critical/15 rounded-lg text-xs text-accent-critical">
                This action will fail if the user has any historical sessions or attendance records in the system.
              </div>

              <div className="flex justify-end gap-2 border-t border-border pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => { setIsDeleteModalOpen(false); setSelectedUser(null); }}
                  className="px-4 py-2 bg-bg-base hover:bg-white/5 border border-border rounded-lg text-sm text-text-primary font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteSubmit}
                  disabled={isDeleting}
                  className="px-4 py-2 bg-accent-critical hover:bg-accent-critical/90 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
                >
                  {isDeleting ? "Deleting…" : "Confirm Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── TRANSIENT PASSWORD DISPLAY MODAL ────────────────── */}
      {passwordDisplay && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[300] flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-accent-success/35 rounded-xl shadow-2xl max-w-md w-full flex flex-col p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-3 text-accent-success mb-3 border-b border-border/80 pb-3">
              <UserCheck className="w-6 h-6" />
              <h3 className="text-lg font-semibold text-text-primary">
                Generated Login Credentials
              </h3>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-text-secondary leading-relaxed">
                The credentials for <strong className="text-text-primary">{passwordDisplay.name}</strong> have been generated. Copy this password now; **it will not be displayed again**.
              </p>

              <div className="p-4 bg-bg-base rounded-lg border border-border space-y-3">
                <div>
                  <span className="block text-[10px] text-text-muted uppercase font-semibold">Email</span>
                  <span className="text-sm font-mono text-text-primary">{passwordDisplay.email}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-text-muted uppercase font-semibold">One-Time password</span>
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <span className="text-lg font-mono font-semibold text-accent-info tracking-wider">
                      {passwordDisplay.password}
                    </span>
                    <button
                      onClick={() => copyToClipboard(passwordDisplay.password)}
                      className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-text-secondary hover:text-text-primary transition-colors border border-border"
                      title="Copy Password"
                      aria-label="Copy password to clipboard"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setPasswordDisplay(null)}
                  className="w-full md:w-auto px-6 py-2.5 bg-accent-success hover:bg-accent-success/90 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>I have saved the credentials</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            <div className="p-5 border-b border-border flex items-center justify-between sticky top-0 bg-bg-surface z-10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-accent-info/10 border border-accent-info/20 rounded-lg">
                  <FileSpreadsheet className="w-5 h-5 text-accent-info" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Bulk User Import</h2>
                  <p className="text-xs text-text-secondary">Upload an Excel (.xlsx) file to create multiple users at once</p>
                </div>
              </div>
              <button
                onClick={() => setIsBulkModalOpen(false)}
                className="p-1 text-text-muted hover:text-text-primary rounded-lg transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleBulkUpload} className="p-6 space-y-5 flex-1">
              <div className="p-4 bg-bg-base border border-border rounded-lg flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-medium text-text-primary">Don't have the template yet?</h4>
                  <p className="text-xs text-text-secondary mt-0.5">
                    Download our 2-sheet Excel template containing empty headers and field instructions.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 text-text-primary border border-border rounded-lg text-xs font-medium flex items-center gap-1.5 shrink-0 transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-accent-info" />
                  <span>Template</span>
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-2">
                  Select Excel File (.xlsx)
                </label>
                <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-accent-info/50 transition-colors bg-bg-base">
                  <input
                    type="file"
                    accept=".xlsx"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setBulkFile(e.target.files[0]);
                        setBulkResults(null);
                      }
                    }}
                    className="hidden"
                    id="bulk-excel-upload"
                  />
                  <label htmlFor="bulk-excel-upload" className="cursor-pointer flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-text-muted" />
                    <span className="text-sm font-medium text-text-primary">
                      {bulkFile ? bulkFile.name : "Click to browse or drop .xlsx file here"}
                    </span>
                    <span className="text-xs text-text-muted">
                      {bulkFile ? `${(bulkFile.size / 1024).toFixed(1)} KB` : "Maximum file size: 5MB"}
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsBulkModalOpen(false)}
                  className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!bulkFile || bulkUploading}
                  className="px-5 py-2 bg-accent-info hover:bg-accent-info/90 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
                >
                  {bulkUploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Processing File...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Upload & Import Users</span>
                    </>
                  )}
                </button>
              </div>

              {/* Import Results Table */}
              {bulkResults && bulkResults.length > 0 && (
                <div className="mt-6 pt-5 border-t border-border space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-text-primary">Import Summary</h3>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-accent-success font-medium">
                        {bulkResults.filter((r) => r.status === "created").length} Created
                      </span>
                      <span className="text-accent-critical font-medium">
                        {bulkResults.filter((r) => r.status === "failed").length} Failed
                      </span>
                    </div>
                  </div>

                  <div className="border border-border rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-bg-base text-text-secondary font-medium border-b border-border sticky top-0">
                        <tr>
                          <th className="p-2.5">Row #</th>
                          <th className="p-2.5">Email</th>
                          <th className="p-2.5">Status</th>
                          <th className="p-2.5">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {bulkResults.map((res, idx) => (
                          <tr key={idx} className="hover:bg-white/[0.02]">
                            <td className="p-2.5 font-mono text-text-muted">Row {res.row}</td>
                            <td className="p-2.5 font-mono text-text-primary">{res.email || "—"}</td>
                            <td className="p-2.5">
                              {res.status === "created" ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent-success/10 text-accent-success border border-accent-success/20">
                                  <Check className="w-3 h-3" /> Created
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent-critical/10 text-accent-critical border border-accent-critical/20">
                                  <X className="w-3 h-3" /> Failed
                                </span>
                              )}
                            </td>
                            <td className="p-2.5 text-text-secondary">{res.reason || "User created successfully"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      <AppTour
        steps={adminTourSteps}
        run={runTour}
        isManualReplay={isManualReplay}
        onFinish={() => setRunTour(false)}
      />
    </div>
  );
}
