import { FileText } from "lucide-react";

export function ExamResults() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary mb-1">
          Exam Results
        </h1>
        <p className="text-text-secondary">
          View and export student exam scores
        </p>
      </div>

      {/* Empty state */}
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <FileText className="w-12 h-12 text-text-muted" />
        <p className="text-base font-medium text-text-primary">
          No exam results available
        </p>
        <p className="text-sm text-text-muted">
          Results will appear here once an exam has been graded.
        </p>
      </div>
    </div>
  );
}
