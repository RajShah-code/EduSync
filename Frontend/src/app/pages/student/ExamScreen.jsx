import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Timer } from "../../components/Timer";
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group";
import { Label } from "../../components/ui/label";
import { Flag, ChevronLeft, ChevronRight, FileText } from "lucide-react";

// Mock data cleared - empty state shown
const mockExam = null;

export function ExamScreen() {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState({});
  const [markedForReview, setMarkedForReview] = useState(new Set());

  if (!mockExam) {
    return (
      <div className="h-screen bg-bg-base flex flex-col items-center justify-center gap-3">
        <FileText className="w-12 h-12 text-text-muted" />
        <h3 className="text-base font-medium text-text-primary">
          No active exam
        </h3>
        <p className="text-sm text-text-secondary">
          You will be notified when the exam starts.
        </p>
      </div>
    );
  }

  const question = mockExam.questions[currentQuestion];
  const timeRemaining = mockExam.timeRemaining;

  const handleAnswer = (questionId, answer) => {
    setAnswers({ ...answers, [questionId]: answer });
  };

  const toggleMarkForReview = () => {
    const newMarked = new Set(markedForReview);
    if (newMarked.has(question.id)) {
      newMarked.delete(question.id);
    } else {
      newMarked.add(question.id);
    }
    setMarkedForReview(newMarked);
  };

  const goToQuestion = (index) => {
    setCurrentQuestion(index);
  };

  const getQuestionStatus = (index) => {
    const q = mockExam.questions[index];
    if (index === currentQuestion) return "current";
    if (markedForReview.has(q.id)) return "marked";
    if (answers[q.id]) return "answered";
    return "unanswered";
  };

  const isCritical = timeRemaining < 300;

  return (
    <div className="h-screen flex flex-col bg-bg-base">
      {/* Top Bar */}
      <div
        className={`h-14 px-6 border-b flex items-center justify-between transition-colors ${
          isCritical
            ? "bg-accent-critical/10 border-accent-critical/20"
            : "bg-bg-surface border-border"
        }`}
      >
        <div className="flex items-center gap-4">
          <h1 className="text-base font-semibold text-text-primary">
            {mockExam.title}
          </h1>
          <div className="px-2 py-1 bg-accent-locked/10 border border-accent-locked/20 rounded-sm">
            <span className="text-xs font-mono text-accent-locked">
              ⊘ SECURE MODE
            </span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {isCritical && (
            <div className="px-3 py-1.5 bg-accent-critical/20 border border-accent-critical/30 rounded">
              <span className="text-xs font-semibold text-accent-critical">
                WARNING — TIME CRITICAL
              </span>
            </div>
          )}
          <Timer seconds={timeRemaining} size="lg" />
          <div className="text-sm font-mono text-text-secondary">
            Question {currentQuestion + 1} of {mockExam.totalQuestions}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Question Area */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Question Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="px-3 py-1.5 bg-accent-info/10 border border-accent-info/20 rounded font-mono text-sm text-accent-info">
                  Q{question.id}
                </div>
                <div>
                  <div className="text-xs text-text-secondary uppercase tracking-wider mb-1">
                    Multiple Choice
                  </div>
                  <div className="text-lg font-medium text-text-primary">
                    {question.question}
                  </div>
                </div>
              </div>
              <div className="text-sm font-mono text-text-secondary">
                {question.marks} marks
              </div>
            </div>

            {/* Options */}
            <RadioGroup
              value={answers[question.id] || ""}
              onValueChange={(value) => handleAnswer(question.id, value)}
              className="space-y-3"
            >
              {question.options.map((option, index) => (
                <div
                  key={index}
                  className={`relative flex items-start p-4 rounded border transition-all cursor-pointer ${
                    answers[question.id] === option
                      ? "bg-accent-info/10 border-accent-info/50"
                      : "bg-bg-surface border-border hover:border-accent-info/30"
                  }`}
                >
                  <RadioGroupItem
                    value={option}
                    id={`option-${index}`}
                    className="mt-0.5"
                  />

                  <Label
                    htmlFor={`option-${index}`}
                    className="flex-1 ml-3 text-sm text-text-primary cursor-pointer"
                  >
                    {option}
                  </Label>
                </div>
              ))}
            </RadioGroup>

            {/* Navigation */}
            <div className="flex items-center justify-between pt-6 border-t border-border">
              <div className="flex gap-2">
                <Button
                  onClick={() => goToQuestion(currentQuestion - 1)}
                  disabled={currentQuestion === 0}
                  variant="outline"
                >
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  Previous
                </Button>
                <Button
                  onClick={toggleMarkForReview}
                  variant="outline"
                  className={
                    markedForReview.has(question.id)
                      ? "border-accent-warning text-accent-warning"
                      : ""
                  }
                >
                  <Flag className="w-4 h-4 mr-2" />
                  {markedForReview.has(question.id)
                    ? "Marked for Review"
                    : "Mark for Review"}
                </Button>
              </div>

              {currentQuestion < mockExam.questions.length - 1 ? (
                <Button
                  onClick={() => goToQuestion(currentQuestion + 1)}
                  className="bg-accent-info hover:bg-accent-info/90"
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button className="bg-accent-success hover:bg-accent-success/90">
                  Submit Exam
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar - Question Navigator */}
        <div className="w-64 border-l border-border bg-bg-surface overflow-y-auto">
          <div className="p-4">
            <h3 className="text-sm font-semibold text-text-primary mb-3">
              Question Navigator
            </h3>
            <div className="grid grid-cols-4 gap-2">
              {mockExam.questions.map((q, index) => {
                const status = getQuestionStatus(index);
                return (
                  <button
                    key={q.id}
                    onClick={() => goToQuestion(index)}
                    className={`aspect-square rounded flex items-center justify-center text-xs font-mono transition-all ${
                      status === "current"
                        ? "bg-accent-info text-white"
                        : status === "answered"
                          ? "bg-accent-success/20 border border-accent-success/50 text-accent-success"
                          : status === "marked"
                            ? "bg-accent-warning/20 border border-accent-warning/50 text-accent-warning"
                            : "bg-bg-base border border-border text-text-muted hover:border-accent-info/50"
                    }`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-6 space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-accent-success/20 border border-accent-success/50" />
                <span className="text-text-secondary">Answered</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-accent-warning/20 border border-accent-warning/50" />
                <span className="text-text-secondary">Marked</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-bg-base border border-border" />
                <span className="text-text-secondary">Unanswered</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
