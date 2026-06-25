import { useState, useEffect } from "react";
import { 
  Search, 
  UserPlus, 
  Edit2, 
  Key, 
  Trash2, 
  X, 
  Check, 
  Copy,
  AlertTriangle,
  UserCheck
} from "lucide-react";
import { toast } from "sonner";

export function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [roleFilter, setRoleFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Active user for editing/resetting/deleting
  const [selectedUser, setSelectedUser] = useState(null);

  // Success Modal for transient password display
  const [passwordDisplay, setPasswordDisplay] = useState(null); // { name, password, email }

  // Form states
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    role: "student",
    class_id: "",
    roll_no: "",
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
      const classesRes = await fetch("http://localhost:3000/classes", {
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
      const usersRes = await fetch(`http://localhost:3000/admin/users?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const usersData = await usersRes.json();
      if (usersRes.ok) {
        setUsers(usersData.users || []);
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
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch("http://localhost:3000/admin/users", {
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
        password: "",
      });

      fetchData();
    } catch {
      toast.error("Network error. Please try again.");
    }
  };

  const handleEditOpen = (user) => {
    setSelectedUser(user);
    setEditForm({
      name: user.name,
      email: user.email,
      role: user.role,
      class_id: user.class_id || "",
      roll_no: user.roll_no || "",
    });
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`http://localhost:3000/admin/users/${selectedUser.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: editForm.name,
          email: editForm.email,
          role: editForm.role,
          class_id: editForm.role === "student" ? editForm.class_id : undefined,
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
    }
  };

  const handleResetOpen = (user) => {
    setSelectedUser(user);
    setResetPasswordForm({ new_password: "" });
    setIsResetModalOpen(true);
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`http://localhost:3000/admin/users/${selectedUser.id}/reset-password`, {
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
    }
  };

  const handleDeleteOpen = (user) => {
    setSelectedUser(user);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteSubmit = async () => {
    try {
      const token = localStorage.getItem("edusync_token");
      const res = await fetch(`http://localhost:3000/admin/users/${selectedUser.id}`, {
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
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Password copied to clipboard!");
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary mb-1">
            User Management
          </h1>
          <p className="text-sm text-text-secondary">
            Provision and manage credentials for teachers and students
          </p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="btn-press flex items-center justify-center gap-2 bg-accent-info hover:bg-accent-info/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all"
        >
          <UserPlus className="w-4 h-4" />
          <span>Provision User</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 bg-bg-surface border border-border rounded-lg flex flex-col md:flex-row gap-4 items-center">
        {/* Search */}
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search by name or email/username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-bg-base border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-info transition-colors"
          />
        </div>

        {/* Role Filter */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <label className="text-xs text-text-secondary font-medium whitespace-nowrap">Role:</label>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="bg-bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-info w-full md:w-40"
          >
            <option value="all">All Roles</option>
            <option value="teacher">Teachers</option>
            <option value="student">Students</option>
            <option value="admin">Administrators</option>
          </select>
        </div>

        {/* Class Filter */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <label className="text-xs text-text-secondary font-medium whitespace-nowrap">Class:</label>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="bg-bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-info w-full md:w-40"
          >
            <option value="all">All Classes</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-bg-surface border border-border rounded-lg overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-sm text-text-muted">
            Fetching user directory...
          </div>
        ) : users.length === 0 ? (
          <div className="py-20 text-center text-sm text-text-muted">
            No users found matching current filters
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/80 text-[11px] font-semibold text-text-muted tracking-wider uppercase bg-white/[0.01]">
                  <th className="px-6 py-3.5">Name</th>
                  <th className="px-6 py-3.5">Username / Email</th>
                  <th className="px-6 py-3.5">Role</th>
                  <th className="px-6 py-3.5">Class</th>
                  <th className="px-6 py-3.5">Roll No</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-text-primary">
                      {user.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-text-secondary font-mono">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                        user.role === 'admin' 
                          ? 'bg-accent-warning/10 text-accent-warning border border-accent-warning/20'
                          : user.role === 'teacher'
                          ? 'bg-accent-info/10 text-accent-info border border-accent-info/20'
                          : 'bg-accent-success/10 text-accent-success border border-accent-success/20'
                      }`}>
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
                          onClick={() => handleEditOpen(user)}
                          className="p-1.5 hover:bg-white/5 rounded text-text-secondary hover:text-text-primary transition-colors"
                          title="Edit Details"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleResetOpen(user)}
                          className="p-1.5 hover:bg-white/5 rounded text-text-secondary hover:text-accent-warning transition-colors"
                          title="Reset Password"
                        >
                          <Key className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteOpen(user)}
                          className="p-1.5 hover:bg-white/5 rounded text-text-secondary hover:text-accent-critical transition-colors"
                          title="Delete User"
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
                <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">Email / Username</label>
                <input
                  type="text"
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
                  <select
                    value={createForm.role}
                    onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                    className="w-full bg-bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-info"
                  >
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                    <option value="admin">Admin</option>
                  </select>
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
                <div className="grid grid-cols-2 gap-4 p-3 bg-bg-base rounded-lg border border-border/80">
                  <div>
                    <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">Class</label>
                    <select
                      required
                      value={createForm.class_id}
                      onChange={(e) => setCreateForm({ ...createForm, class_id: e.target.value })}
                      className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-info"
                    >
                      <option value="">Select...</option>
                      {classes.map((cls) => (
                        <option key={cls.id} value={cls.id}>
                          {cls.name}
                        </option>
                      ))}
                    </select>
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
                  className="px-4 py-2 bg-accent-info hover:bg-accent-info/90 text-white rounded-lg text-sm font-medium"
                >
                  Create User
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
                <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">Email / Username</label>
                <input
                  type="text"
                  required
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full bg-bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-info"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">Role</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                  className="w-full bg-bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-info"
                >
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {editForm.role === "student" && (
                <div className="grid grid-cols-2 gap-4 p-3 bg-bg-base rounded-lg border border-border/80">
                  <div>
                    <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">Class</label>
                    <select
                      required
                      value={editForm.class_id}
                      onChange={(e) => setEditForm({ ...editForm, class_id: e.target.value })}
                      className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-info"
                    >
                      <option value="">Select...</option>
                      {classes.map((cls) => (
                        <option key={cls.id} value={cls.id}>
                          {cls.name}
                        </option>
                      ))}
                    </select>
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
                  className="px-4 py-2 bg-accent-info hover:bg-accent-info/90 text-white rounded-lg text-sm font-medium"
                >
                  Save Changes
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
                  className="px-4 py-2 bg-accent-warning hover:bg-accent-warning/90 text-white rounded-lg text-sm font-medium"
                >
                  Reset Password
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
                  className="px-4 py-2 bg-accent-critical hover:bg-accent-critical/90 text-white rounded-lg text-sm font-medium"
                >
                  Confirm Delete
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
                  <span className="block text-[10px] text-text-muted uppercase font-semibold">Username / Email</span>
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
    </div>
  );
}
