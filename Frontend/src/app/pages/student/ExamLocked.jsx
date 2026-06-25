import { ShieldOff } from "lucide-react";

export function ExamLocked() {
  return (
    <div className="h-screen bg-bg-base flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-6">
        {/* Lock Icon */}
        <div className="w-20 h-20 mx-auto rounded-full bg-accent-locked/10 border-2 border-accent-locked/30 flex items-center justify-center">
          <ShieldOff className="w-10 h-10 text-accent-locked" />
        </div>

        {/* Heading */}
        <div>
          <h1 className="text-3xl font-semibold text-text-primary mb-2">
            EXAM CLOSED
          </h1>
          <p className="text-text-secondary">
            Time has expired. Your work has been submitted.
          </p>
        </div>

        {/* Submission Details */}
        <div className="p-6 bg-bg-surface border border-border rounded-lg">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Exam</span>
              <span className="font-medium text-text-primary">
                Data Structures Mid-term
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Questions Answered</span>
              <span className="font-mono font-medium text-text-primary">
                12 / 12
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Submitted At</span>
              <span className="font-mono font-medium text-text-primary">
                11:47:23 AM
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Status</span>
              <span className="px-2 py-0.5 text-xs font-mono border border-accent-locked/20 bg-accent-locked/10 text-accent-locked rounded-sm">
                ⊘ LOCKED
              </span>
            </div>
          </div>
        </div>

        {/* Message */}
        <div className="p-4 bg-accent-info/10 border border-accent-info/20 rounded-lg">
          <p className="text-sm text-text-primary">
            Your responses have been automatically saved and submitted. Results
            will be available once grading is complete.
          </p>
        </div>
      </div>
    </div>
  );
}
