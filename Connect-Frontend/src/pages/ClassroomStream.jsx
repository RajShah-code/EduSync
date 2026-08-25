import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router";
import { useAuth } from "@/context/AuthContext";
import {
  fetchClassroomsByRole,
  fetchClassroomMessages,
  sendClassroomMessage,
  fetchClassroomAnnouncements,
  createAnnouncement,
  fetchClassroomPolls,
  createClassroomPoll,
  voteOnPoll,
  fetchClassroomAssignments,
  createClassroomAssignment,
  fetchClassroomMaterials,
  uploadClassroomMaterial,
  ApiError,
} from "@/data/mockClassrooms";
import { getConnectSocket, initConnectSocket } from "@/lib/socket";
import { parseClassroomDisplayName, getClassMonogram } from "@/lib/utils";
import { AnnouncementCard } from "@/components/common/AnnouncementCard";
import { PollCard } from "@/components/common/PollCard";
import { AssignmentCard } from "@/components/common/AssignmentCard";
import { MaterialCard } from "@/components/common/MaterialCard";
import { StudentSubmissionModal } from "@/components/common/StudentSubmissionModal";
import { TeacherGradingModal } from "@/components/common/TeacherGradingModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  ArrowLeft,
  Send,
  Lock,
  MessagesSquare,
  RefreshCw,
  AlertCircle,
  Megaphone,
  BarChart3,
  FileText,
  FolderOpen,
  Plus,
  Trash2,
  X,
  Pin,
  CheckCircle2,
  Calendar,
  UploadCloud,
  Paperclip,
  HardDrive,
  Loader2,
  Archive,
} from "lucide-react";

export function ClassroomStream({ role = "teacher" }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const [activeTab, setActiveTab] = useState("stream"); // "stream" | "announcements" | "polls" | "assignments" | "materials"

  const [classroom, setClassroom] = useState(location.state?.classroom || null);
  const [messages, setMessages] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [polls, setPolls] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [materials, setMaterials] = useState([]);

  const [loadingClassroom, setLoadingClassroom] = useState(!classroom);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(false);
  const [loadingPolls, setLoadingPolls] = useState(false);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);

  const [error, setError] = useState(null);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);

  // Teacher Announcement Composer State
  const [showAnnouncementComposer, setShowAnnouncementComposer] = useState(false);
  const [announcementText, setAnnouncementText] = useState("");
  const [postingAnnouncement, setPostingAnnouncement] = useState(false);
  const [announcementSuccess, setAnnouncementSuccess] = useState(false);

  // Teacher Poll Composer State
  const [showPollComposer, setShowPollComposer] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollClosesAt, setPollClosesAt] = useState("");
  const [creatingPoll, setCreatingPoll] = useState(false);
  const [pollSuccess, setPollSuccess] = useState(false);

  // Teacher Assignment Composer State
  const [showAssignmentComposer, setShowAssignmentComposer] = useState(false);
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [assignmentDesc, setAssignmentDesc] = useState("");
  const [assignmentDueAt, setAssignmentDueAt] = useState("");
  const [assignmentFileData, setAssignmentFileData] = useState(null);
  const [assignmentFileName, setAssignmentFileName] = useState("");
  const [assignmentFileType, setAssignmentFileType] = useState("");
  const [creatingAssignment, setCreatingAssignment] = useState(false);
  const [assignmentSuccess, setAssignmentSuccess] = useState(false);

  // Teacher Material Upload State
  const [showMaterialComposer, setShowMaterialComposer] = useState(false);
  const [materialTitle, setMaterialTitle] = useState("");
  const [materialFileData, setMaterialFileData] = useState(null);
  const [materialFileName, setMaterialFileName] = useState("");
  const [materialFileType, setMaterialFileType] = useState("");
  const [materialFileSize, setMaterialFileSize] = useState(0);
  const [uploadingMaterial, setUploadingMaterial] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [materialSuccess, setMaterialSuccess] = useState(false);

  // Modals for Student Submission and Teacher Grading
  const [activeSubmissionAssignment, setActiveSubmissionAssignment] = useState(null);
  const [activeGradingAssignment, setActiveGradingAssignment] = useState(null);

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  const classSubjectId = parseInt(id, 10) || id;
  const isTeacher = role === "teacher";

  // 1. Fetch classroom metadata if not passed in location state
  useEffect(() => {
    let isMounted = true;

    async function loadClassroom() {
      if (classroom) {
        return;
      }

      setLoadingClassroom(true);
      try {
        const list = await fetchClassroomsByRole(role);
        const found = list.find((c) => String(c.id) === String(id));
        if (found && isMounted) {
          setClassroom(found);
        } else if (isMounted) {
          setError("Classroom not found or you do not have permission to view it.");
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          logout();
          navigate("/login", { replace: true });
          return;
        }
        if (isMounted) {
          setError(err.message || "Failed to load classroom details.");
        }
      } finally {
        if (isMounted) setLoadingClassroom(false);
      }
    }

    loadClassroom();
    return () => {
      isMounted = false;
    };
  }, [id, role, navigate, logout]);

  // 2. Fetch initial messages history
  const loadMessages = async () => {
    setLoadingMessages(true);
    setError(null);
    try {
      const data = await fetchClassroomMessages(classSubjectId, null, 40);
      const chronological = [...data.messages].reverse();
      setMessages(chronological);
      setNextCursor(data.next_cursor);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      setError(err.message || "Failed to load messages.");
    } finally {
      setLoadingMessages(false);
    }
  };

  // 3. Fetch announcements
  const loadAnnouncements = async () => {
    setLoadingAnnouncements(true);
    try {
      const data = await fetchClassroomAnnouncements(classSubjectId);
      setAnnouncements(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      console.warn("Failed to load announcements:", err);
    } finally {
      setLoadingAnnouncements(false);
    }
  };

  // 4. Fetch polls
  const loadPolls = async () => {
    setLoadingPolls(true);
    try {
      const data = await fetchClassroomPolls(classSubjectId);
      setPolls(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      console.warn("Failed to load polls:", err);
    } finally {
      setLoadingPolls(false);
    }
  };

  // 5. Fetch assignments
  const loadAssignments = async () => {
    setLoadingAssignments(true);
    try {
      const data = await fetchClassroomAssignments(classSubjectId);
      setAssignments(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      console.warn("Failed to load assignments:", err);
    } finally {
      setLoadingAssignments(false);
    }
  };

  // 6. Fetch materials
  const loadMaterials = async () => {
    setLoadingMaterials(true);
    try {
      const data = await fetchClassroomMaterials(classSubjectId);
      setMaterials(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      console.warn("Failed to load materials:", err);
    } finally {
      setLoadingMaterials(false);
    }
  };

  useEffect(() => {
    if (classSubjectId) {
      loadMessages();
      loadAnnouncements();
      loadPolls();
      loadAssignments();
      loadMaterials();
    }
  }, [classSubjectId]);

  // 7. Load older messages (Pagination)
  const loadOlderMessages = async () => {
    if (!nextCursor || loadingOlder) return;

    setLoadingOlder(true);
    try {
      const scrollHeightBefore = messagesContainerRef.current?.scrollHeight || 0;
      const data = await fetchClassroomMessages(classSubjectId, nextCursor, 30);
      const olderChronological = [...data.messages].reverse();

      setMessages((prev) => [...olderChronological, ...prev]);
      setNextCursor(data.next_cursor);

      setTimeout(() => {
        if (messagesContainerRef.current) {
          const scrollHeightAfter = messagesContainerRef.current.scrollHeight;
          messagesContainerRef.current.scrollTop = scrollHeightAfter - scrollHeightBefore;
        }
      }, 50);
    } catch (err) {
      console.error("Failed to load older messages:", err);
    } finally {
      setLoadingOlder(false);
    }
  };

  // 8. Socket.io Real-Time Room & Event Wiring
  useEffect(() => {
    if (!classSubjectId) return;

    const socket = getConnectSocket() || initConnectSocket();
    if (!socket) return;

    function handleConnect() {
      console.log(`[Connect Stream] Joining room connect:classroom:${classSubjectId}`);
      socket.emit("connect:classroom:join", { classSubjectId });
    }

    function handleNewMessage(newMsg) {
      if (String(newMsg.class_subject_id) === String(classSubjectId)) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      }
    }

    function handlePollUpdated(updatedPollPayload) {
      console.log("[Connect Socket] Received connect:poll:updated event:", updatedPollPayload);
      setPolls((prev) =>
        prev.map((item) => {
          if (item.poll.id === updatedPollPayload.pollId || item.poll.id === updatedPollPayload.poll?.id) {
            return {
              ...item,
              poll: updatedPollPayload.poll || item.poll,
              options: updatedPollPayload.options || item.options,
              total_votes: updatedPollPayload.total_votes ?? item.total_votes,
              closed: !!(
                updatedPollPayload.poll?.closes_at &&
                new Date(updatedPollPayload.poll.closes_at) < new Date()
              ),
            };
          }
          return item;
        })
      );
    }

    function handleNewAnnouncement(newAnnouncement) {
      setAnnouncements((prev) => {
        if (prev.some((a) => a.id === newAnnouncement.id)) return prev;
        return [newAnnouncement, ...prev];
      });
    }

    function handleNewAssignment(newAssignment) {
      if (String(newAssignment.class_subject_id) === String(classSubjectId)) {
        setAssignments((prev) => {
          if (prev.some((a) => a.id === newAssignment.id)) return prev;
          return [newAssignment, ...prev];
        });
      }
    }

    function handleSubmissionGraded(updatedSubmission) {
      if (String(updatedSubmission.student_id) !== String(user?.id)) return;
      setAssignments((prev) =>
        prev.map((a) => {
          if (a.id !== updatedSubmission.assignment_id) return a;
          return { ...a, submission_status: "graded", my_submission: updatedSubmission };
        })
      );
    }

    function handleNewMaterial(newMaterial) {
      if (String(newMaterial.class_subject_id) === String(classSubjectId)) {
        setMaterials((prev) => {
          if (prev.some((m) => m.id === newMaterial.id)) return prev;
          return [newMaterial, ...prev];
        });
      }
    }

    if (socket.connected) {
      handleConnect();
    } else {
      socket.on("connect", handleConnect);
    }

    socket.on("connect:message:new", handleNewMessage);
    socket.on("connect:poll:updated", handlePollUpdated);
    socket.on("connect:announcement:new", handleNewAnnouncement);
    socket.on("connect:assignment:new", handleNewAssignment);
    socket.on("connect:submission:graded", handleSubmissionGraded);
    socket.on("connect:material:new", handleNewMaterial);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("connect:message:new", handleNewMessage);
      socket.off("connect:poll:updated", handlePollUpdated);
      socket.off("connect:announcement:new", handleNewAnnouncement);
      socket.off("connect:assignment:new", handleNewAssignment);
      socket.off("connect:submission:graded", handleSubmissionGraded);
      socket.off("connect:material:new", handleNewMaterial);
    };
  }, [classSubjectId, user?.id]);

  // 9. Scroll to bottom when new messages arrive (Stream tab only)
  useEffect(() => {
    if (activeTab === "stream" && !loadingMessages && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loadingMessages, activeTab]);

  // 10. Send Message handler
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    const content = inputText.trim();
    if (!content || sending) return;

    if (!isTeacher) return;

    setSending(true);
    setInputText("");

    try {
      const socket = getConnectSocket();
      if (socket && socket.connected) {
        socket.emit("connect:message:send", {
          classSubjectId,
          content,
        });
      } else {
        const created = await sendClassroomMessage(classSubjectId, content);
        if (created) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === created.id)) return prev;
            return [...prev, created];
          });
        }
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      setError(err.message || "Failed to deliver message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  // 12. Teacher Create Announcement
  const handlePostAnnouncement = async (e) => {
    if (e) e.preventDefault();
    const content = announcementText.trim();
    if (!content || postingAnnouncement) return;

    setPostingAnnouncement(true);
    setError(null);

    try {
      const newAnnouncement = await createAnnouncement({
        content,
        target_class_subject_ids: [classSubjectId],
      });

      if (newAnnouncement) {
        setAnnouncements((prev) => [
          {
            ...newAnnouncement,
            author_name: user?.name || "Faculty Member",
          },
          ...prev,
        ]);
        setAnnouncementText("");
        setShowAnnouncementComposer(false);
        setAnnouncementSuccess(true);
        setTimeout(() => setAnnouncementSuccess(false), 3000);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      setError(err.message || "Failed to post announcement.");
    } finally {
      setPostingAnnouncement(false);
    }
  };

  // 13. Dynamic Poll Option Handlers
  const handleAddOption = () => {
    if (pollOptions.length < 8) {
      setPollOptions((prev) => [...prev, ""]);
    }
  };

  const handleRemoveOption = (indexToRemove) => {
    if (pollOptions.length > 2) {
      setPollOptions((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    }
  };

  const handleOptionChange = (value, index) => {
    setPollOptions((prev) => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  // 14. Teacher Create Poll
  const handleCreatePoll = async (e) => {
    if (e) e.preventDefault();
    const validOptions = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (!pollQuestion.trim() || validOptions.length < 2 || creatingPoll) return;

    setCreatingPoll(true);
    setError(null);

    try {
      const result = await createClassroomPoll(classSubjectId, {
        question: pollQuestion.trim(),
        option_text: validOptions,
        closes_at: pollClosesAt ? new Date(pollClosesAt).toISOString() : null,
      });

      if (result) {
        setPolls((prev) => [
          {
            ...result,
            closed: !!(result.poll.closes_at && new Date(result.poll.closes_at) < new Date()),
            user_vote_option_id: null,
          },
          ...prev,
        ]);
        setPollQuestion("");
        setPollOptions(["", ""]);
        setPollClosesAt("");
        setShowPollComposer(false);
        setPollSuccess(true);
        setTimeout(() => setPollSuccess(false), 3000);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      setError(err.message || "Failed to create poll.");
    } finally {
      setCreatingPoll(false);
    }
  };

  // 15. Student Cast Vote
  const handleVote = async (pollId, optionId) => {
    try {
      const updatedResults = await voteOnPoll(pollId, optionId);
      setPolls((prev) =>
        prev.map((item) => {
          if (item.poll.id === pollId) {
            return {
              ...item,
              poll: updatedResults.poll || item.poll,
              options: updatedResults.options || item.options,
              total_votes: updatedResults.total_votes ?? item.total_votes,
              user_vote_option_id: optionId,
            };
          }
          return item;
        })
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      throw err;
    }
  };

  // 16. Teacher Assignment File Upload Handler
  const handleAssignmentFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      setError("File size exceeds 20MB limit.");
      return;
    }

    setAssignmentFileName(file.name);
    setAssignmentFileType(file.type || "application/octet-stream");

    const reader = new FileReader();
    reader.onload = () => {
      setAssignmentFileData(reader.result);
    };
    reader.readAsDataURL(file);
  };

  // 17. Teacher Create Assignment
  const handleCreateAssignment = async (e) => {
    if (e) e.preventDefault();
    if (!assignmentTitle.trim() || creatingAssignment) return;

    setCreatingAssignment(true);
    setError(null);

    try {
      const payload = {
        title: assignmentTitle.trim(),
        description: assignmentDesc.trim() || null,
        due_at: assignmentDueAt ? new Date(assignmentDueAt).toISOString() : null,
      };

      if (assignmentFileData) {
        payload.attachment_data = assignmentFileData;
        payload.attachment_filename = assignmentFileName;
        payload.attachment_content_type = assignmentFileType;
      }

      const created = await createClassroomAssignment(classSubjectId, payload);
      if (created) {
        setAssignments((prev) => [created, ...prev]);
        setAssignmentTitle("");
        setAssignmentDesc("");
        setAssignmentDueAt("");
        setAssignmentFileData(null);
        setAssignmentFileName("");
        setShowAssignmentComposer(false);
        setAssignmentSuccess(true);
        setTimeout(() => setAssignmentSuccess(false), 3000);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      setError(err.message || "Failed to create assignment.");
    } finally {
      setCreatingAssignment(false);
    }
  };

  // 18. Teacher Study Material File Upload Handler
  const handleMaterialFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      setError("Material file size exceeds 20MB limit.");
      return;
    }

    setMaterialFileName(file.name);
    setMaterialFileType(file.type || "application/octet-stream");
    setMaterialFileSize(file.size);

    const reader = new FileReader();
    reader.onload = () => {
      setMaterialFileData(reader.result);
    };
    reader.readAsDataURL(file);
  };

  // 19. Teacher Upload Material
  const handleUploadMaterial = async (e) => {
    if (e) e.preventDefault();
    if (!materialTitle.trim() || !materialFileData || uploadingMaterial) return;

    setUploadingMaterial(true);
    setUploadProgress(0);
    setError(null);

    try {
      const payload = {
        title: materialTitle.trim(),
        file_data: materialFileData,
        file_filename: materialFileName,
        file_content_type: materialFileType,
      };

      const newMaterial = await uploadClassroomMaterial(
        classSubjectId,
        payload,
        (percent) => {
          setUploadProgress(percent);
        }
      );

      if (newMaterial) {
        setMaterials((prev) => [
          {
            ...newMaterial,
            uploader_name: user?.name || "Faculty Member",
          },
          ...prev,
        ]);
        setMaterialTitle("");
        setMaterialFileData(null);
        setMaterialFileName("");
        setMaterialFileType("");
        setMaterialFileSize(0);
        setShowMaterialComposer(false);
        setMaterialSuccess(true);
        setTimeout(() => setMaterialSuccess(false), 3000);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      setError(err.message || "Failed to upload study material.");
    } finally {
      setUploadingMaterial(false);
    }
  };

  // 20. Student Submission Update callback
  const handleStudentSubmissionSuccess = (assignmentId, submission) => {
    setAssignments((prev) =>
      prev.map((a) => {
        if (a.id === assignmentId) {
          const isLate = submission.is_late;
          const status = submission.grade !== null && submission.grade !== undefined ? "graded" : isLate ? "late" : "submitted";
          return {
            ...a,
            submission_status: status,
            my_submission: submission,
          };
        }
        return a;
      })
    );
  };

  // A classroom is archived when its curriculum allotment was removed/
  // unassigned in the main EduSync admin panel — read-only from here on,
  // history stays fully visible but nothing new can be posted.
  const isArchived = classroom?.status === "archived";
  const canPost = isTeacher && !isArchived;

  const parsed = parseClassroomDisplayName(
    classroom?.display_name || classroom?.subject_name || classroom?.class_name || "Classroom"
  );
  const monogram = getClassMonogram(parsed.title);

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] max-w-5xl mx-auto page-enter bg-bg-surface border border-border rounded-[var(--radius-lg)] overflow-hidden shadow-none">
      {/* Top Classroom Header */}
      <div className="p-4 px-6 border-b border-border bg-bg-surface flex items-center justify-between gap-4 z-10 shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(isTeacher ? "/teacher" : "/student")}
            className="h-8 w-8 text-text-secondary hover:text-text-primary"
            title="Back to classrooms"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>

          <div className="w-9 h-9 rounded-[var(--radius-md)] bg-bg-surface-3 border border-border flex items-center justify-center font-bold text-xs text-text-primary tracking-wider shrink-0">
            {monogram}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-text-primary leading-tight">
                {parsed.title}
              </h2>
              {parsed.detail && (
                <span className="text-xs font-medium text-accent-500">
                  ({parsed.detail})
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
              <span>Channel #{classSubjectId}</span>
              {classroom?.class_name && <span>• {classroom.class_name}</span>}
              {classroom?.teacher_name && <span>• Prof. {classroom.teacher_name}</span>}
            </div>
          </div>
        </div>

        {/* Right Controls: Mode Badge & Refresh */}
        <div className="flex items-center gap-3">
          {isArchived ? (
            <Badge variant="secondary" className="text-[11px] font-normal gap-1">
              <Archive className="w-3 h-3" />
              Archived — Read Only
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[11px] font-normal">
              Announcements Only
            </Badge>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (activeTab === "stream") loadMessages();
              else if (activeTab === "announcements") loadAnnouncements();
              else if (activeTab === "polls") loadPolls();
              else if (activeTab === "assignments") loadAssignments();
              else loadMaterials();
            }}
            disabled={
              loadingMessages ||
              loadingAnnouncements ||
              loadingPolls ||
              loadingAssignments ||
              loadingMaterials
            }
            className="h-8 w-8 text-text-muted hover:text-text-primary"
            title="Refresh current tab"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                loadingMessages ||
                loadingAnnouncements ||
                loadingPolls ||
                loadingAssignments ||
                loadingMaterials
                  ? "animate-spin text-accent-500"
                  : ""
              }`}
            />
          </Button>
        </div>
      </div>

      {/* Archived banner — persistent across every tab, since read-only
          applies to the whole classroom, not just one feature. */}
      {isArchived && (
        <div className="flex items-center gap-2.5 px-6 py-2.5 border-b border-border bg-bg-surface-3/40 text-xs text-text-muted shrink-0">
          <Archive className="w-3.5 h-3.5 shrink-0" />
          <span>
            This classroom has been archived — you can view its history, but new posts aren&apos;t allowed.
          </span>
        </div>
      )}

      {/* Tab Switcher: Stream vs Announcements vs Polls vs Assignments vs Materials */}
      <div className="flex items-center gap-1 px-6 border-b border-border bg-bg-surface/50 text-xs overflow-x-auto">
        <button
          onClick={() => setActiveTab("stream")}
          className={`flex items-center gap-2 py-2.5 px-3.5 font-medium border-b-2 transition-colors cursor-pointer shrink-0 ${
            activeTab === "stream"
              ? "border-accent-500 text-text-primary bg-bg-surface-3/40"
              : "border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-surface-3/20"
          }`}
        >
          <MessagesSquare className="w-3.5 h-3.5" />
          <span>Chat Stream</span>
          {messages.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-bg-surface-3 text-text-muted tnum font-semibold">
              {messages.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("announcements")}
          className={`flex items-center gap-2 py-2.5 px-3.5 font-medium border-b-2 transition-colors cursor-pointer shrink-0 ${
            activeTab === "announcements"
              ? "border-accent-500 text-text-primary bg-bg-surface-3/40"
              : "border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-surface-3/20"
          }`}
        >
          <Megaphone className="w-3.5 h-3.5" />
          <span>Announcements</span>
          {announcements.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-accent-500/20 text-accent-500 tnum font-semibold">
              {announcements.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("polls")}
          className={`flex items-center gap-2 py-2.5 px-3.5 font-medium border-b-2 transition-colors cursor-pointer shrink-0 ${
            activeTab === "polls"
              ? "border-accent-500 text-text-primary bg-bg-surface-3/40"
              : "border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-surface-3/20"
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Polls</span>
          {polls.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-accent-500/20 text-accent-500 tnum font-semibold">
              {polls.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("assignments")}
          className={`flex items-center gap-2 py-2.5 px-3.5 font-medium border-b-2 transition-colors cursor-pointer shrink-0 ${
            activeTab === "assignments"
              ? "border-accent-500 text-text-primary bg-bg-surface-3/40"
              : "border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-surface-3/20"
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Assignments</span>
          {assignments.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-accent-500/20 text-accent-500 tnum font-semibold">
              {assignments.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("materials")}
          className={`flex items-center gap-2 py-2.5 px-3.5 font-medium border-b-2 transition-colors cursor-pointer shrink-0 ${
            activeTab === "materials"
              ? "border-accent-500 text-text-primary bg-bg-surface-3/40"
              : "border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-surface-3/20"
          }`}
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span>Materials</span>
          {materials.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-accent-500/20 text-accent-500 tnum font-semibold">
              {materials.length}
            </span>
          )}
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-3 px-6 bg-accent-critical/10 border-b border-accent-critical/20 flex items-center justify-between gap-3 text-xs text-accent-critical">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setError(null)}
            className="h-6 px-2 text-xs text-accent-critical hover:bg-accent-critical/20"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Success Notification */}
      {(announcementSuccess || pollSuccess || assignmentSuccess || materialSuccess) && (
        <div className="p-3 px-6 bg-accent-success/10 border-b border-accent-success/20 flex items-center gap-2 text-xs text-accent-success">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>
            {announcementSuccess
              ? "Announcement published successfully to this classroom cohort!"
              : pollSuccess
              ? "Classroom poll launched successfully!"
              : assignmentSuccess
              ? "Assignment created and assigned to classroom cohort!"
              : "Course study material uploaded and accessible to students!"}
          </span>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 1: CHAT STREAM
          ───────────────────────────────────────────────────────────── */}
      {activeTab === "stream" && (
        <>
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto p-6 space-y-4 bg-bg-base/40"
          >
            {nextCursor && (
              <div className="flex justify-center mb-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadOlderMessages}
                  disabled={loadingOlder}
                  className="h-7 text-xs text-text-secondary border-border bg-bg-surface"
                >
                  {loadingOlder ? "Loading older messages..." : "↑ Load earlier messages"}
                </Button>
              </div>
            )}

            {loadingMessages ? (
              <div className="space-y-4 py-8">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-start gap-3 animate-pulse">
                    <div className="w-8 h-8 rounded-full bg-bg-surface-3" />
                    <div className="space-y-2 flex-1 max-w-md">
                      <div className="h-3.5 w-32 bg-bg-surface-3 rounded" />
                      <div className="h-10 bg-bg-surface-3 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-text-muted">
                <div className="w-12 h-12 rounded-full bg-bg-surface-3 border border-border flex items-center justify-center mb-3">
                  <MessagesSquare className="w-6 h-6 text-text-muted" />
                </div>
                <p className="text-sm font-semibold text-text-primary">No messages in this channel yet</p>
                <p className="text-xs text-text-secondary max-w-sm mt-1">
                  {isTeacher
                    ? "Post an announcement or start a discussion for your students."
                    : "Your instructor hasn't posted any messages yet. Conversations will appear here."}
                </p>
              </div>
            ) : (
              messages.map((msg, index) => {
                const isMe = msg.sender_id === user?.id;
                const isTeacherSender = msg.sender_role === "teacher";
                const senderMonogram = getClassMonogram(msg.sender_name || "User");
                const timeFormatted = msg.created_at
                  ? new Date(msg.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "";

                return (
                  <div
                    key={msg.id || index}
                    className={`flex items-start gap-3 group ${
                      isMe ? "flex-row-reverse" : "flex-row"
                    }`}
                  >
                    <Avatar className="h-8 w-8 mt-0.5 shrink-0 border border-border">
                      <AvatarFallback
                        className={`text-[11px] font-semibold ${
                          isTeacherSender
                            ? "bg-teacher-500/20 text-teacher-500"
                            : "bg-student-500/20 text-student-500"
                        }`}
                      >
                        {senderMonogram}
                      </AvatarFallback>
                    </Avatar>

                    <div
                      className={`flex flex-col max-w-[78%] ${
                        isMe ? "items-end" : "items-start"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1 px-1">
                        <span className="text-xs font-semibold text-text-primary">
                          {isMe ? "You" : msg.sender_name || "User"}
                        </span>

                        <Badge
                          variant={isTeacherSender ? "default" : "secondary"}
                          className={`text-[9px] py-0 px-1.5 h-3.5 tracking-wider ${
                            isTeacherSender
                              ? "bg-teacher-500/15 text-teacher-500 border-teacher-500/30"
                              : "bg-student-500/15 text-student-500 border-student-500/30"
                          }`}
                        >
                          {isTeacherSender ? "Faculty" : "Student"}
                        </Badge>

                        <span className="text-[10px] text-text-muted tnum">
                          {timeFormatted}
                        </span>
                      </div>

                      <div
                        className={`p-3.5 px-4 rounded-[var(--radius-lg)] text-xs sm:text-sm leading-relaxed border transition-colors ${
                          isMe
                            ? "bg-bg-elevated border-accent-500/30 text-text-primary"
                            : "bg-bg-surface border-border text-text-primary"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Stream Compose Box Area */}
          <div className="p-4 px-6 border-t border-border bg-bg-surface">
            {canPost ? (
              <form onSubmit={handleSendMessage} className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Input
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={
                      isTeacher
                        ? "Broadcast message to classroom stream..."
                        : "Type your message or question..."
                    }
                    className="bg-bg-base border-border text-xs sm:text-sm py-2 pr-10 focus-visible:ring-accent-500/30"
                    disabled={sending}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={!inputText.trim() || sending}
                  className="h-9 px-4 font-medium gap-1.5 btn-press"
                >
                  {sending ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span className="hidden sm:inline text-xs">Send</span>
                      <Send className="w-3.5 h-3.5" />
                    </>
                  )}
                </Button>
              </form>
            ) : isArchived ? (
              <div className="p-3 rounded-[var(--radius-md)] bg-bg-surface-3/60 border border-border flex items-center gap-2.5 text-xs text-text-secondary">
                <Archive className="w-4 h-4 text-text-muted shrink-0" />
                <p className="leading-relaxed">
                  <span className="font-semibold text-text-primary">Archived: </span>
                  This classroom is read-only. You can still read its full history above.
                </p>
              </div>
            ) : (
              <div className="p-3 rounded-[var(--radius-md)] bg-bg-surface-3/60 border border-border flex items-center gap-2.5 text-xs text-text-secondary">
                <Lock className="w-4 h-4 text-text-muted shrink-0" />
                <p className="leading-relaxed">
                  <span className="font-semibold text-text-primary">Faculty Announcements Only: </span>
                  This channel is set to broadcast mode by the instructor. Students can read updates and announcements here.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 2: ANNOUNCEMENTS FEED & TEACHER COMPOSER
          ───────────────────────────────────────────────────────────── */}
      {activeTab === "announcements" && (
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-bg-base/40">
          {isTeacher && !isArchived && (
            <div className="bg-bg-surface border border-border rounded-[var(--radius-lg)] p-4 transition-colors">
              {!showAnnouncementComposer ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-xs text-text-secondary">
                    <Pin className="w-4 h-4 text-accent-500" />
                    <span>Need to pin an important notice or syllabus update for this classroom?</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setShowAnnouncementComposer(true)}
                    className="gap-1.5 text-xs h-8 px-3"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Post Announcement</span>
                  </Button>
                </div>
              ) : (
                <form onSubmit={handlePostAnnouncement} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                      <Megaphone className="w-4 h-4 text-accent-500" />
                      Publish Classroom Announcement
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowAnnouncementComposer(false)}
                      className="h-6 w-6 text-text-muted hover:text-text-primary"
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <textarea
                    value={announcementText}
                    onChange={(e) => setAnnouncementText(e.target.value)}
                    placeholder="Type your official announcement or class notification here..."
                    rows={3}
                    className="w-full rounded-[var(--radius-md)] border border-border bg-bg-base p-3 text-xs sm:text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/20"
                    required
                    autoFocus
                  />

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-text-muted">
                      Will be pinned to this classroom cohort and marked with a priority notice badge.
                    </span>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAnnouncementComposer(false)}
                        className="h-8 text-xs text-text-secondary"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={!announcementText.trim() || postingAnnouncement}
                        className="h-8 text-xs font-medium gap-1.5 btn-press"
                      >
                        {postingAnnouncement ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <>
                            <span>Publish</span>
                            <Send className="w-3.5 h-3.5" />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          )}

          {loadingAnnouncements ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-32 rounded-[var(--radius-lg)] border border-border bg-bg-surface animate-pulse"
                />
              ))}
            </div>
          ) : announcements.length === 0 ? (
            <div className="p-12 text-center border border-border border-dashed rounded-[var(--radius-lg)] bg-bg-surface/30 flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-bg-surface-3 border border-border flex items-center justify-center text-text-muted mb-3">
                <Megaphone className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-text-primary">No announcements posted yet</h3>
              <p className="text-xs text-text-secondary max-w-sm mt-1 leading-relaxed">
                {isTeacher
                  ? "Broadcast important updates, timetable notices, or exam reminders to your students."
                  : "Important updates and notices from faculty and campus administration will be pinned here."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {announcements.map((item) => (
                <AnnouncementCard key={item.id} announcement={item} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 3: POLLS FEED & TEACHER COMPOSER
          ───────────────────────────────────────────────────────────── */}
      {activeTab === "polls" && (
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-bg-base/40">
          {isTeacher && !isArchived && (
            <div className="bg-bg-surface border border-border rounded-[var(--radius-lg)] p-4 transition-colors">
              {!showPollComposer ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-xs text-text-secondary">
                    <BarChart3 className="w-4 h-4 text-accent-500" />
                    <span>Want to poll students for revision topics, project slots, or quick feedback?</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setShowPollComposer(true)}
                    className="gap-1.5 text-xs h-8 px-3"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Poll</span>
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleCreatePoll} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                      <BarChart3 className="w-4 h-4 text-accent-500" />
                      Create Classroom Poll
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowPollComposer(false)}
                      className="h-6 w-6 text-text-muted hover:text-text-primary"
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-text-secondary">
                      Question
                    </label>
                    <Input
                      value={pollQuestion}
                      onChange={(e) => setPollQuestion(e.target.value)}
                      placeholder="e.g. Which topic should we review in tomorrow's practical session?"
                      className="bg-bg-base border-border text-xs"
                      required
                      autoFocus
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-medium text-text-secondary">
                        Options (Minimum 2)
                      </label>
                      {pollOptions.length < 8 && (
                        <button
                          type="button"
                          onClick={handleAddOption}
                          className="text-[11px] text-accent-500 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add Choice</span>
                        </button>
                      )}
                    </div>

                    <div className="space-y-2">
                      {pollOptions.map((opt, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Input
                            value={opt}
                            onChange={(e) => handleOptionChange(e.target.value, idx)}
                            placeholder={`Option ${idx + 1}`}
                            className="bg-bg-base border-border text-xs h-8"
                            required
                          />
                          {pollOptions.length > 2 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveOption(idx)}
                              className="h-8 w-8 text-text-muted hover:text-accent-critical shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-text-secondary flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>Optional Deadline (Leaves open indefinitely if empty)</span>
                    </label>
                    <Input
                      type="datetime-local"
                      value={pollClosesAt}
                      onChange={(e) => setPollClosesAt(e.target.value)}
                      className="bg-bg-base border-border text-xs h-8 max-w-xs text-text-primary"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-border">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPollComposer(false)}
                      className="h-8 text-xs text-text-secondary"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={
                        !pollQuestion.trim() ||
                        pollOptions.filter((o) => o.trim()).length < 2 ||
                        creatingPoll
                      }
                      className="h-8 text-xs font-semibold gap-1.5 btn-press"
                    >
                      {creatingPoll ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          <span>Launch Poll</span>
                          <Send className="w-3.5 h-3.5" />
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}

          {loadingPolls ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-44 rounded-[var(--radius-lg)] border border-border bg-bg-surface animate-pulse"
                />
              ))}
            </div>
          ) : polls.length === 0 ? (
            <div className="p-12 text-center border border-border border-dashed rounded-[var(--radius-lg)] bg-bg-surface/30 flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-bg-surface-3 border border-border flex items-center justify-center text-text-muted mb-3">
                <BarChart3 className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-text-primary">No active polls</h3>
              <p className="text-xs text-text-secondary max-w-sm mt-1 leading-relaxed">
                {isTeacher
                  ? "Launch a poll to gather instant feedback, schedule sessions, or test comprehension."
                  : "When your instructor launches a poll, you can cast your vote and view real-time results here."}
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {polls.map((item) => (
                <PollCard
                  key={item.poll.id}
                  pollData={item}
                  role={role}
                  onVote={handleVote}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 4: ASSIGNMENTS FEED & TEACHER COMPOSER
          ───────────────────────────────────────────────────────────── */}
      {activeTab === "assignments" && (
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-bg-base/40">
          {isTeacher && !isArchived && (
            <div className="bg-bg-surface border border-border rounded-[var(--radius-lg)] p-4 transition-colors">
              {!showAssignmentComposer ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-xs text-text-secondary">
                    <FileText className="w-4 h-4 text-accent-500" />
                    <span>Create a new homework assignment, lab report, or coursework task for this class?</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setShowAssignmentComposer(true)}
                    className="gap-1.5 text-xs h-8 px-3"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Assignment</span>
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleCreateAssignment} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-accent-500" />
                      Create Classroom Assignment
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowAssignmentComposer(false)}
                      className="h-6 w-6 text-text-muted hover:text-text-primary"
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-text-secondary">
                      Assignment Title
                    </label>
                    <Input
                      value={assignmentTitle}
                      onChange={(e) => setAssignmentTitle(e.target.value)}
                      placeholder="e.g. Lab Exercise 4: Database Schema Normalization"
                      className="bg-bg-base border-border text-xs"
                      required
                      autoFocus
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-text-secondary">
                      Instructions & Submission Brief
                    </label>
                    <textarea
                      value={assignmentDesc}
                      onChange={(e) => setAssignmentDesc(e.target.value)}
                      placeholder="Specify requirements, deliverables, grading criteria, and file formats..."
                      rows={3}
                      className="w-full rounded-[var(--radius-md)] border border-border bg-bg-base p-3 text-xs sm:text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/20"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-text-secondary flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>Due Date & Time (Optional)</span>
                      </label>
                      <Input
                        type="datetime-local"
                        value={assignmentDueAt}
                        onChange={(e) => setAssignmentDueAt(e.target.value)}
                        className="bg-bg-base border-border text-xs h-8 text-text-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-text-secondary flex items-center gap-1">
                        <Paperclip className="w-3 h-3" />
                        <span>Course Material Attachment (Optional)</span>
                      </label>
                      <label className="flex items-center gap-2 px-3 py-1.5 border border-border border-dashed rounded-[var(--radius-md)] bg-bg-base hover:bg-bg-surface-3 cursor-pointer text-xs text-text-secondary hover:text-text-primary transition-colors h-8">
                        <UploadCloud className="w-3.5 h-3.5 text-accent-500 shrink-0" />
                        <span className="truncate">
                          {assignmentFileName ? assignmentFileName : "Attach PDF/Doc Material"}
                        </span>
                        <input
                          type="file"
                          onChange={handleAssignmentFileSelect}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAssignmentComposer(false)}
                      className="h-8 text-xs text-text-secondary"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={!assignmentTitle.trim() || creatingAssignment}
                      className="h-8 text-xs font-semibold gap-1.5 btn-press"
                    >
                      {creatingAssignment ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          <span>Publish Assignment</span>
                          <Send className="w-3.5 h-3.5" />
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}

          {loadingAssignments ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-36 rounded-[var(--radius-lg)] border border-border bg-bg-surface animate-pulse"
                />
              ))}
            </div>
          ) : assignments.length === 0 ? (
            <div className="p-12 text-center border border-border border-dashed rounded-[var(--radius-lg)] bg-bg-surface/30 flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-bg-surface-3 border border-border flex items-center justify-center text-text-muted mb-3">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-text-primary">No coursework assigned yet</h3>
              <p className="text-xs text-text-secondary max-w-sm mt-1 leading-relaxed">
                {isTeacher
                  ? "Publish assignments, problem sets, and lab exercises for your students to submit."
                  : "All coursework assignments, deadlines, and grade evaluations will be listed here."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {assignments.map((assignmentItem) => (
                <AssignmentCard
                  key={assignmentItem.id}
                  assignment={assignmentItem}
                  role={role}
                  onOpenAction={(selected) => {
                    if (isTeacher) {
                      setActiveGradingAssignment(selected);
                    } else if (isArchived && selected.submission_status === "not_submitted") {
                      setError("This classroom has been archived — new submissions aren't accepted here.");
                    } else {
                      setActiveSubmissionAssignment(selected);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 5: STUDY MATERIALS & MEDIA LIBRARY
          ───────────────────────────────────────────────────────────── */}
      {activeTab === "materials" && (
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-bg-base/40">
          {/* Teacher Upload Study Material Composer */}
          {isTeacher && !isArchived && (
            <div className="bg-bg-surface border border-border rounded-[var(--radius-lg)] p-4 transition-colors">
              {!showMaterialComposer ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-xs text-text-secondary">
                    <FolderOpen className="w-4 h-4 text-accent-500" />
                    <span>Upload lecture notes, problem sets, reference PDFs, or class slides for students to download?</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setShowMaterialComposer(true)}
                    className="gap-1.5 text-xs h-8 px-3"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Upload Material</span>
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleUploadMaterial} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                      <FolderOpen className="w-4 h-4 text-accent-500" />
                      Upload Study Material / Media
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowMaterialComposer(false)}
                      className="h-6 w-6 text-text-muted hover:text-text-primary"
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {/* Title */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-text-secondary">
                      Material Title
                    </label>
                    <Input
                      value={materialTitle}
                      onChange={(e) => setMaterialTitle(e.target.value)}
                      placeholder="e.g. Chapter 3: Dynamic Programming Notes & Cheat Sheet (PDF)"
                      className="bg-bg-base border-border text-xs"
                      required
                      autoFocus
                    />
                  </div>

                  {/* File Upload Selector */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-text-secondary flex items-center justify-between">
                      <span>Choose File (PDF, Slides, Archives, Docs - max 20MB)</span>
                      {materialFileSize > 0 && (
                        <span className="text-text-muted tnum">
                          Size: {(materialFileSize / (1024 * 1024)).toFixed(2)} MB
                        </span>
                      )}
                    </label>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 px-3 py-2 border border-border border-dashed rounded-[var(--radius-md)] bg-bg-base hover:bg-bg-surface-3 cursor-pointer text-xs text-text-secondary hover:text-text-primary transition-colors">
                        <UploadCloud className="w-4 h-4 text-accent-500" />
                        <span>{materialFileName ? `Change File (${materialFileName})` : "Select File to Upload"}</span>
                        <input
                          type="file"
                          onChange={handleMaterialFileSelect}
                          className="hidden"
                          required
                        />
                      </label>
                      {materialFileName && (
                        <span className="text-xs text-text-muted truncate max-w-xs">
                          {materialFileName}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Real-time Percentage Upload Progress Bar */}
                  {uploadingMaterial && (
                    <div className="p-3 bg-accent-500/10 border border-accent-500/30 rounded-[var(--radius-md)] space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-accent-500">
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Uploading to secure storage...
                        </span>
                        <span className="tnum font-bold">{uploadProgress}%</span>
                      </div>
                      <div className="w-full bg-bg-base rounded-full h-2 overflow-hidden border border-border">
                        <div
                          className="bg-accent-500 h-full transition-all duration-150 ease-out"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowMaterialComposer(false)}
                      disabled={uploadingMaterial}
                      className="h-8 text-xs text-text-secondary"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={!materialTitle.trim() || !materialFileData || uploadingMaterial}
                      className="h-8 text-xs font-semibold gap-1.5 btn-press"
                    >
                      {uploadingMaterial ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span className="tnum">Uploading ({uploadProgress}%)...</span>
                        </>
                      ) : (
                        <>
                          <span>Upload File</span>
                          <UploadCloud className="w-3.5 h-3.5" />
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Materials List */}
          {loadingMaterials ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-28 rounded-[var(--radius-lg)] border border-border bg-bg-surface animate-pulse"
                />
              ))}
            </div>
          ) : materials.length === 0 ? (
            <div className="p-12 text-center border border-border border-dashed rounded-[var(--radius-lg)] bg-bg-surface/30 flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-bg-surface-3 border border-border flex items-center justify-center text-text-muted mb-3">
                <FolderOpen className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-text-primary">No study materials uploaded yet</h3>
              <p className="text-xs text-text-secondary max-w-sm mt-1 leading-relaxed">
                {isTeacher
                  ? "Upload lecture slides, reference guides, and syllabus notes for students to download."
                  : "Course documents, lecture PDFs, and reference files shared by your instructor will appear here."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {materials.map((item) => (
                <MaterialCard
                  key={item.id}
                  material={item}
                  role={role}
                  onDeleteSuccess={(deletedId) => {
                    setMaterials((prev) => prev.filter((m) => m.id !== deletedId));
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Student Submission Modal */}
      {activeSubmissionAssignment && (
        <StudentSubmissionModal
          assignment={activeSubmissionAssignment}
          onClose={() => setActiveSubmissionAssignment(null)}
          onSubmissionSuccess={(assignmentId, updatedSubmission) => {
            handleStudentSubmissionSuccess(assignmentId, updatedSubmission);
          }}
        />
      )}

      {/* Teacher Grading Modal */}
      {activeGradingAssignment && (
        <TeacherGradingModal
          assignment={activeGradingAssignment}
          onClose={() => {
            setActiveGradingAssignment(null);
            loadAssignments();
          }}
        />
      )}
    </div>
  );
}
