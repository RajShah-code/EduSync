import { API_BASE_URL, CONNECT_TOKEN_KEY } from "@/config/api";

/**
 * =======================================================================
 * COMPLETE SERVICE LAYER FOR EDUSYNC CONNECT
 * =======================================================================
 * Integrates with the live backend endpoints:
 * - Classrooms: GET /connect/{teacher|student}/my-classrooms
 * - Messaging: GET /connect/classrooms/:id/messages, POST /connect/classrooms/:id/messages
 * - Announcements: GET /connect/classrooms/:id/announcements, POST /connect/announcements
 * - Admin Announcements: GET /connect/admin/announcements
 * - Admin Class Subjects CRUD:
 *     - GET /connect/admin/class-subjects
 *     - POST /connect/admin/class-subjects
 *     - PUT /connect/admin/class-subjects/:id
 *     - DELETE /connect/admin/class-subjects/:id
 * - Admin Helpers: GET /classes, GET /admin/users
 * - Teacher: DELETE /connect/teacher/classrooms/:id (archived classrooms only)
 * - Polls: GET & POST /connect/classrooms/:id/polls, POST /connect/polls/:id/vote
 * - Assignments: GET & POST /connect/classrooms/:id/assignments
 * - Submissions & Grading: POST /connect/assignments/:id/submit, GET /connect/assignments/:id/submissions, PUT /connect/submissions/:id/grade
 * - Study Materials / Media Library: GET & POST /connect/classrooms/:id/materials, GET /connect/materials/:id/download, DELETE /connect/materials/:id
 * - Web Push: GET /connect/push/vapid-public-key, POST & DELETE /connect/push/subscribe
 *
 * Uses the isolated `connect_edusync_token` stored in localStorage.
 * =======================================================================
 */

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Helper to get auth header.
 */
function getAuthHeaders() {
  const token = localStorage.getItem(CONNECT_TOKEN_KEY);
  if (!token) {
    throw new ApiError("No authentication token found. Please sign in.", 401);
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Fetch classrooms for the authenticated user based on role.
 * 
 * @param {"teacher" | "student"} role 
 * @returns {Promise<Array>} Array of classroom objects from backend
 */
export async function fetchClassroomsByRole(role) {
  const headers = getAuthHeaders();
  const endpoint =
    role === "teacher"
      ? `${API_BASE_URL}/connect/teacher/my-classrooms`
      : `${API_BASE_URL}/connect/student/my-classrooms`;

  try {
    const res = await fetch(endpoint, {
      method: "GET",
      headers,
    });

    if (res.status === 401) {
      throw new ApiError("Session expired or unauthorized. Please sign in again.", 401);
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new ApiError(
        errorData.message || `Failed to fetch classrooms (HTTP ${res.status})`,
        res.status
      );
    }

    const data = await res.json();
    return Array.isArray(data.classrooms) ? data.classrooms : [];
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err.message || "Network error. Unable to connect to server.", 0);
  }
}

/**
 * Fetch paginated message history for a classroom.
 * 
 * @param {string|number} classSubjectId 
 * @param {string|number} [before] Cursor id for pagination
 * @param {number} [limit=40]
 * @returns {Promise<{messages: Array, next_cursor: number|null}>}
 */
export async function fetchClassroomMessages(classSubjectId, before = null, limit = 40) {
  const headers = getAuthHeaders();
  const query = new URLSearchParams();
  if (before) query.append("before", before);
  if (limit) query.append("limit", limit);

  const url = `${API_BASE_URL}/connect/classrooms/${classSubjectId}/messages?${query.toString()}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
    });

    if (res.status === 401) {
      throw new ApiError("Session expired or unauthorized. Please sign in again.", 401);
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new ApiError(
        errorData.message || `Failed to fetch messages (HTTP ${res.status})`,
        res.status
      );
    }

    const data = await res.json();
    return {
      messages: Array.isArray(data.messages) ? data.messages : [],
      next_cursor: data.next_cursor || null,
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err.message || "Network error. Unable to load messages.", 0);
  }
}

/**
 * REST fallback to send a message to a classroom.
 * 
 * @param {string|number} classSubjectId 
 * @param {string} content 
 * @returns {Promise<Object>} Created message object
 */
export async function sendClassroomMessage(classSubjectId, content) {
  const headers = getAuthHeaders();
  const url = `${API_BASE_URL}/connect/classrooms/${classSubjectId}/messages`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ content }),
    });

    if (res.status === 401) {
      throw new ApiError("Session expired or unauthorized. Please sign in again.", 401);
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new ApiError(
        errorData.message || `Failed to send message (HTTP ${res.status})`,
        res.status
      );
    }

    const data = await res.json();
    return data.message;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err.message || "Network error. Unable to send message.", 0);
  }
}

/**
 * Permanently deletes a classroom the caller (teacher) owns — only allowed
 * once it has been archived (its curriculum allotment was removed/
 * unassigned in the main EduSync admin panel). Deleting a still-active
 * classroom stays admin-only.
 * Calls DELETE /connect/teacher/classrooms/:classSubjectId
 *
 * @param {string|number} classSubjectId
 * @returns {Promise<Object>}
 */
export async function deleteOwnClassroom(classSubjectId) {
  const headers = getAuthHeaders();
  const url = `${API_BASE_URL}/connect/teacher/classrooms/${classSubjectId}`;

  try {
    const res = await fetch(url, { method: "DELETE", headers });

    if (res.status === 401) {
      throw new ApiError("Session expired or unauthorized. Please sign in again.", 401);
    }

    if (res.ok) {
      return await res.json();
    }

    const errorData = await res.json().catch(() => ({}));
    throw new ApiError(
      errorData.message || `Failed to delete classroom (HTTP ${res.status})`,
      res.status
    );
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err.message || "Network error. Unable to delete classroom.", 0);
  }
}

/**
 * Fetch announcements for a specific classroom feed.
 * GET /connect/classrooms/:classSubjectId/announcements
 *
 * @param {string|number} classSubjectId
 * @returns {Promise<Array>} Array of announcements
 */
export async function fetchClassroomAnnouncements(classSubjectId) {
  const headers = getAuthHeaders();
  const url = `${API_BASE_URL}/connect/classrooms/${classSubjectId}/announcements`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
    });

    if (res.status === 401) {
      throw new ApiError("Session expired or unauthorized. Please sign in again.", 401);
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new ApiError(
        errorData.message || `Failed to load announcements (HTTP ${res.status})`,
        res.status
      );
    }

    const data = await res.json();
    return Array.isArray(data.announcements) ? data.announcements : [];
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err.message || "Network error. Unable to load announcements.", 0);
  }
}

/**
 * Create an announcement (Teacher or Admin).
 * POST /connect/announcements
 * 
 * @param {Object} params
 * @param {string} params.content
 * @param {boolean} [params.is_global] (Admin only)
 * @param {number[]} [params.target_class_subject_ids] (Teacher or Admin)
 * @returns {Promise<Object>} Created announcement object
 */
export async function createAnnouncement({ content, is_global, target_class_subject_ids }) {
  const headers = getAuthHeaders();
  const url = `${API_BASE_URL}/connect/announcements`;

  const bodyPayload = { content: content.trim() };
  if (is_global !== undefined) {
    bodyPayload.is_global = Boolean(is_global);
  }
  if (Array.isArray(target_class_subject_ids)) {
    bodyPayload.target_class_subject_ids = target_class_subject_ids.map(Number);
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(bodyPayload),
    });

    if (res.status === 401) {
      throw new ApiError("Session expired or unauthorized. Please sign in again.", 401);
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new ApiError(
        errorData.message || `Failed to create announcement (HTTP ${res.status})`,
        res.status
      );
    }

    const data = await res.json();
    return data.announcement;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err.message || "Network error. Unable to post announcement.", 0);
  }
}

/**
 * Fetch all announcements created by the current admin.
 * GET /connect/admin/announcements
 * 
 * @returns {Promise<Array>} Array of admin announcements with target details
 */
export async function fetchAdminAnnouncements() {
  const headers = getAuthHeaders();
  const url = `${API_BASE_URL}/connect/admin/announcements`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
    });

    if (res.status === 401) {
      throw new ApiError("Session expired or unauthorized. Please sign in again.", 401);
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new ApiError(
        errorData.message || `Failed to load admin announcements (HTTP ${res.status})`,
        res.status
      );
    }

    const data = await res.json();
    return Array.isArray(data.announcements) ? data.announcements : [];
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err.message || "Network error. Unable to load admin announcements.", 0);
  }
}

/**
 * =======================================================================
 * ADMIN CLASS-SUBJECT ALLOTMENT CRUD
 * =======================================================================
 */

/**
 * Fetch all class subject allotments (Admin only).
 * GET /connect/admin/class-subjects
 * 
 * @returns {Promise<Array>} Array of allotment objects with teacher and class names
 */
export async function fetchAllClassSubjectsAdmin() {
  const headers = getAuthHeaders();
  const url = `${API_BASE_URL}/connect/admin/class-subjects`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
    });

    if (res.status === 401) {
      throw new ApiError("Session expired or unauthorized. Please sign in again.", 401);
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new ApiError(
        errorData.message || `Failed to fetch class subjects (HTTP ${res.status})`,
        res.status
      );
    }

    const data = await res.json();
    return Array.isArray(data.allotments) ? data.allotments : [];
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err.message || "Network error. Unable to fetch class subjects.", 0);
  }
}

/**
 * Create a new class subject allotment (Admin only).
 * POST /connect/admin/class-subjects
 * 
 * @param {Object} payload
 * @param {number|string} payload.teacher_id
 * @param {number|string} payload.class_id
 * @param {string} payload.subject_name
 * @returns {Promise<Object>} Created allotment
 */
export async function createClassSubjectAllotment({ teacher_id, class_id, subject_name }) {
  const headers = getAuthHeaders();
  const url = `${API_BASE_URL}/connect/admin/class-subjects`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        teacher_id: Number(teacher_id),
        class_id: Number(class_id),
        subject_name: subject_name.trim(),
      }),
    });

    if (res.status === 401) {
      throw new ApiError("Session expired or unauthorized. Please sign in again.", 401);
    }

    if (res.status === 409) {
      const errorData = await res.json().catch(() => ({}));
      throw new ApiError(
        errorData.message || "This teacher already has this subject assigned for this class.",
        409
      );
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new ApiError(
        errorData.message || `Failed to create allotment (HTTP ${res.status})`,
        res.status
      );
    }

    const data = await res.json();
    return data.allotment;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err.message || "Network error. Unable to create allotment.", 0);
  }
}

/**
 * Update an existing allotment (Admin only).
 * PUT /connect/admin/class-subjects/:id
 * 
 * @param {string|number} id
 * @param {Object} payload
 * @param {number|string} [payload.teacher_id]
 * @param {string} [payload.subject_name]
 * @returns {Promise<Object>} Updated allotment
 */
export async function updateClassSubjectAllotment(id, { teacher_id, subject_name }) {
  const headers = getAuthHeaders();
  const url = `${API_BASE_URL}/connect/admin/class-subjects/${id}`;

  const payload = {};
  if (teacher_id !== undefined) payload.teacher_id = Number(teacher_id);
  if (subject_name !== undefined) payload.subject_name = subject_name.trim();

  try {
    const res = await fetch(url, {
      method: "PUT",
      headers,
      body: JSON.stringify(payload),
    });

    if (res.status === 401) {
      throw new ApiError("Session expired or unauthorized. Please sign in again.", 401);
    }

    if (res.status === 409) {
      const errorData = await res.json().catch(() => ({}));
      throw new ApiError(
        errorData.message || "This teacher already has this subject assigned for this class.",
        409
      );
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new ApiError(
        errorData.message || `Failed to update allotment (HTTP ${res.status})`,
        res.status
      );
    }

    const data = await res.json();
    return data.allotment;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err.message || "Network error. Unable to update allotment.", 0);
  }
}

/**
 * Delete an allotment (Admin only).
 * DELETE /connect/admin/class-subjects/:id
 * 
 * @param {string|number} id 
 * @returns {Promise<Object>}
 */
export async function deleteClassSubjectAllotment(id) {
  const headers = getAuthHeaders();
  const url = `${API_BASE_URL}/connect/admin/class-subjects/${id}`;

  try {
    const res = await fetch(url, {
      method: "DELETE",
      headers,
    });

    if (res.status === 401) {
      throw new ApiError("Session expired or unauthorized. Please sign in again.", 401);
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new ApiError(
        errorData.message || `Failed to delete allotment (HTTP ${res.status})`,
        res.status
      );
    }

    return await res.json();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err.message || "Network error. Unable to delete allotment.", 0);
  }
}

/**
 * Fetch all available classes for admin dropdowns.
 * GET /classes
 */
export async function fetchClassesAdmin() {
  const headers = getAuthHeaders();
  const url = `${API_BASE_URL}/classes`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
    });

    if (!res.ok) {
      return [];
    }

    const data = await res.json();
    return Array.isArray(data.classes) ? data.classes : Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Fetch all teacher users for admin teacher picker.
 * GET /admin/users
 */
export async function fetchTeachersAdmin() {
  const headers = getAuthHeaders();
  const url = `${API_BASE_URL}/admin/users`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
    });

    if (!res.ok) {
      return [];
    }

    const data = await res.json();
    const users = Array.isArray(data.users) ? data.users : Array.isArray(data) ? data : [];
    return users.filter((u) => u.role === "teacher");
  } catch {
    return [];
  }
}

/**
 * =======================================================================
 * POLLS API
 * =======================================================================
 */

export async function createClassroomPoll(classSubjectId, { question, option_text, closes_at }) {
  const headers = getAuthHeaders();
  const url = `${API_BASE_URL}/connect/classrooms/${classSubjectId}/polls`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        question: question.trim(),
        option_text: option_text.map((t) => t.trim()).filter(Boolean),
        closes_at: closes_at || null,
      }),
    });

    if (res.status === 401) {
      throw new ApiError("Session expired or unauthorized. Please sign in again.", 401);
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new ApiError(
        errorData.message || `Failed to create poll (HTTP ${res.status})`,
        res.status
      );
    }

    return await res.json();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err.message || "Network error. Unable to create poll.", 0);
  }
}

export async function fetchClassroomPolls(classSubjectId) {
  const headers = getAuthHeaders();
  const url = `${API_BASE_URL}/connect/classrooms/${classSubjectId}/polls`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
    });

    if (res.status === 401) {
      throw new ApiError("Session expired or unauthorized. Please sign in again.", 401);
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new ApiError(
        errorData.message || `Failed to load polls (HTTP ${res.status})`,
        res.status
      );
    }

    const data = await res.json();
    return Array.isArray(data.polls) ? data.polls : [];
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err.message || "Network error. Unable to load polls.", 0);
  }
}

export async function voteOnPoll(pollId, optionId) {
  const headers = getAuthHeaders();
  const url = `${API_BASE_URL}/connect/polls/${pollId}/vote`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ option_id: Number(optionId) }),
    });

    if (res.status === 401) {
      throw new ApiError("Session expired or unauthorized. Please sign in again.", 401);
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new ApiError(
        errorData.message || `Failed to submit vote (HTTP ${res.status})`,
        res.status
      );
    }

    return await res.json();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err.message || "Network error. Unable to submit vote.", 0);
  }
}

/**
 * =======================================================================
 * ASSIGNMENTS & SUBMISSIONS API
 * =======================================================================
 */

export async function createClassroomAssignment(classSubjectId, payload) {
  const headers = getAuthHeaders();
  const url = `${API_BASE_URL}/connect/classrooms/${classSubjectId}/assignments`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (res.status === 401) {
      throw new ApiError("Session expired or unauthorized. Please sign in again.", 401);
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new ApiError(
        errorData.message || `Failed to create assignment (HTTP ${res.status})`,
        res.status
      );
    }

    const data = await res.json();
    return data.assignment;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err.message || "Network error. Unable to create assignment.", 0);
  }
}

export async function fetchClassroomAssignments(classSubjectId) {
  const headers = getAuthHeaders();
  const url = `${API_BASE_URL}/connect/classrooms/${classSubjectId}/assignments`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
    });

    if (res.status === 401) {
      throw new ApiError("Session expired or unauthorized. Please sign in again.", 401);
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new ApiError(
        errorData.message || `Failed to load assignments (HTTP ${res.status})`,
        res.status
      );
    }

    const data = await res.json();
    return Array.isArray(data.assignments) ? data.assignments : [];
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err.message || "Network error. Unable to load assignments.", 0);
  }
}

export async function submitAssignmentWork(assignmentId, payload) {
  const headers = getAuthHeaders();
  const url = `${API_BASE_URL}/connect/assignments/${assignmentId}/submit`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (res.status === 401) {
      throw new ApiError("Session expired or unauthorized. Please sign in again.", 401);
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new ApiError(
        errorData.message || `Failed to submit assignment (HTTP ${res.status})`,
        res.status
      );
    }

    const data = await res.json();
    return data.submission;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err.message || "Network error. Unable to submit assignment.", 0);
  }
}

export async function fetchAssignmentSubmissions(assignmentId) {
  const headers = getAuthHeaders();
  const url = `${API_BASE_URL}/connect/assignments/${assignmentId}/submissions`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
    });

    if (res.status === 401) {
      throw new ApiError("Session expired or unauthorized. Please sign in again.", 401);
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new ApiError(
        errorData.message || `Failed to load submissions (HTTP ${res.status})`,
        res.status
      );
    }

    const data = await res.json();
    return Array.isArray(data.submissions) ? data.submissions : [];
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err.message || "Network error. Unable to load submissions.", 0);
  }
}

export async function gradeStudentSubmission(submissionId, { grade, feedback }) {
  const headers = getAuthHeaders();
  const url = `${API_BASE_URL}/connect/submissions/${submissionId}/grade`;

  try {
    const res = await fetch(url, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        grade: Number(grade),
        feedback: feedback ? feedback.trim() : null,
      }),
    });

    if (res.status === 401) {
      throw new ApiError("Session expired or unauthorized. Please sign in again.", 401);
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new ApiError(
        errorData.message || `Failed to grade submission (HTTP ${res.status})`,
        res.status
      );
    }

    const data = await res.json();
    return data.submission;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err.message || "Network error. Unable to grade submission.", 0);
  }
}

/**
 * =======================================================================
 * STUDY MATERIALS / MEDIA LIBRARY API
 * =======================================================================
 */

export function uploadClassroomMaterial(classSubjectId, payload, onProgress) {
  return new Promise((resolve, reject) => {
    const token = localStorage.getItem(CONNECT_TOKEN_KEY);
    if (!token) {
      return reject(new ApiError("No authentication token found. Please sign in.", 401));
    }

    const xhr = new XMLHttpRequest();
    const url = `${API_BASE_URL}/connect/classrooms/${classSubjectId}/materials`;

    xhr.open("POST", url, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    if (xhr.upload && typeof onProgress === "function") {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      let response;
      try {
        response = JSON.parse(xhr.responseText);
      } catch {
        response = { message: xhr.responseText };
      }

      if (xhr.status === 401) {
        return reject(new ApiError("Session expired or unauthorized. Please sign in again.", 401));
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(response.material);
      } else {
        reject(new ApiError(response.message || `Upload failed (HTTP ${xhr.status})`, xhr.status));
      }
    };

    xhr.onerror = () => {
      reject(new ApiError("Network error while uploading material.", 0));
    };

    xhr.ontimeout = () => {
      reject(new ApiError("Upload request timed out.", 0));
    };

    xhr.send(JSON.stringify(payload));
  });
}

export async function fetchClassroomMaterials(classSubjectId) {
  const headers = getAuthHeaders();
  const url = `${API_BASE_URL}/connect/classrooms/${classSubjectId}/materials`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
    });

    if (res.status === 401) {
      throw new ApiError("Session expired or unauthorized. Please sign in again.", 401);
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new ApiError(
        errorData.message || `Failed to load study materials (HTTP ${res.status})`,
        res.status
      );
    }

    const data = await res.json();
    return Array.isArray(data.materials) ? data.materials : [];
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err.message || "Network error. Unable to load study materials.", 0);
  }
}

export async function fetchMaterialDownloadLink(materialId) {
  const headers = getAuthHeaders();
  const url = `${API_BASE_URL}/connect/materials/${materialId}/download`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
    });

    if (res.status === 401) {
      throw new ApiError("Session expired or unauthorized. Please sign in again.", 401);
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new ApiError(
        errorData.message || `Failed to get download link (HTTP ${res.status})`,
        res.status
      );
    }

    return await res.json();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err.message || "Network error. Unable to retrieve download link.", 0);
  }
}

export async function deleteClassroomMaterial(materialId) {
  const headers = getAuthHeaders();
  const url = `${API_BASE_URL}/connect/materials/${materialId}`;

  try {
    const res = await fetch(url, {
      method: "DELETE",
      headers,
    });

    if (res.status === 401) {
      throw new ApiError("Session expired or unauthorized. Please sign in again.", 401);
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new ApiError(
        errorData.message || `Failed to delete material (HTTP ${res.status})`,
        res.status
      );
    }

    return await res.json();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err.message || "Network error. Unable to delete material.", 0);
  }
}
