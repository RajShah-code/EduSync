import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Switch } from "../../components/ui/switch";
import { Plus } from "lucide-react";

const steps = [
  { id: 1, name: "Settings", description: "Basic exam configuration" },
  { id: 2, name: "Questions", description: "Add and organize questions" },
  { id: 3, name: "Restrictions", description: "Security and rules" },
];

export function ExamCreation() {
  const [currentStep, setCurrentStep] = useState(1);
  const [examData, setExamData] = useState({
    title: "",
    subject: "",
    duration: 60,
    shuffleQuestions: false,
    shuffleOptions: false,
    browserLock: true,
    copyPasteDisable: true,
    screenChangeAlert: true,
  });

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-text-primary mb-1">
            Create Exam
          </h1>
          <p className="text-text-secondary">
            Set up a new proctored examination
          </p>
        </div>

        <div className="grid grid-cols-[1fr_2fr] gap-6">
          {/* Left: Step Indicator */}
          <div className="space-y-4">
            <div className="p-4 bg-bg-surface border border-border rounded-lg">
              <h3 className="text-sm font-semibold text-text-primary mb-3">
                Setup Steps
              </h3>
              <div className="space-y-2">
                {steps.map((step, index) => (
                  <button
                    key={step.id}
                    onClick={() => setCurrentStep(step.id)}
                    className={`w-full text-left p-3 rounded transition-colors ${
                      currentStep === step.id
                        ? "bg-accent-info/10 border border-accent-info/20"
                        : "bg-bg-elevated hover:bg-bg-base"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono ${
                          currentStep === step.id
                            ? "bg-accent-info text-white"
                            : currentStep > step.id
                              ? "bg-accent-success text-white"
                              : "bg-bg-base text-text-muted border border-border"
                        }`}
                      >
                        {currentStep > step.id ? "✓" : step.id}
                      </div>
                      <div className="flex-1">
                        <div
                          className={`text-sm font-medium ${
                            currentStep === step.id
                              ? "text-accent-info"
                              : "text-text-primary"
                          }`}
                        >
                          {step.name}
                        </div>
                        <div className="text-xs text-text-secondary mt-0.5">
                          {step.description}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Exam Summary */}
            <div className="p-4 bg-bg-surface border border-border rounded-lg">
              <h3 className="text-sm font-semibold text-text-primary mb-3">
                Exam Summary
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Questions:</span>
                  <span className="font-mono text-text-primary">0</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Duration:</span>
                  <span className="font-mono text-text-primary">
                    {examData.duration} min
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Total Marks:</span>
                  <span className="font-mono text-text-primary">0</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Step Content */}
          <div className="bg-bg-surface border border-border rounded-lg p-6">
            {currentStep === 1 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-text-primary mb-4">
                  Exam Settings
                </h2>
                <div>
                  <Label htmlFor="title">Exam Title</Label>
                  <Input
                    id="title"
                    value={examData.title}
                    onChange={(e) =>
                      setExamData({ ...examData, title: e.target.value })
                    }
                    placeholder="e.g., Data Structures Mid-term"
                    className="mt-1 bg-bg-base border-border"
                  />
                </div>
                <div>
                  <Label htmlFor="subject">Subject</Label>
                  <Input
                    id="subject"
                    value={examData.subject}
                    onChange={(e) =>
                      setExamData({ ...examData, subject: e.target.value })
                    }
                    placeholder="e.g., Computer Science"
                    className="mt-1 bg-bg-base border-border"
                  />
                </div>
                <div>
                  <Label htmlFor="duration">Duration (minutes)</Label>
                  <Input
                    id="duration"
                    type="number"
                    value={examData.duration}
                    onChange={(e) =>
                      setExamData({
                        ...examData,
                        duration: parseInt(e.target.value) || 60,
                      })
                    }
                    className="mt-1 bg-bg-base border-border font-mono"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Shuffle Questions</Label>
                    <p className="text-xs text-text-muted mt-1">
                      Randomize question order for each student
                    </p>
                  </div>
                  <Switch
                    checked={examData.shuffleQuestions}
                    onCheckedChange={(checked) =>
                      setExamData({ ...examData, shuffleQuestions: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Shuffle Options</Label>
                    <p className="text-xs text-text-muted mt-1">
                      Randomize answer choices for MCQs
                    </p>
                  </div>
                  <Switch
                    checked={examData.shuffleOptions}
                    onCheckedChange={(checked) =>
                      setExamData({ ...examData, shuffleOptions: checked })
                    }
                  />
                </div>
                <div className="pt-4">
                  <Button
                    onClick={() => setCurrentStep(2)}
                    className="w-full bg-accent-info hover:bg-accent-info/90"
                  >
                    Continue to Questions
                  </Button>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-text-primary mb-4">
                  Question Bank
                </h2>
                <div className="text-center py-12 border-2 border-dashed border-border rounded-lg">
                  <Plus className="w-8 h-8 text-text-muted mx-auto mb-2" />
                  <p className="text-text-muted text-sm">
                    No questions added yet
                  </p>
                  <Button className="mt-4" variant="outline">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Question
                  </Button>
                </div>
                <div className="flex gap-2 pt-4">
                  <Button
                    onClick={() => setCurrentStep(1)}
                    variant="outline"
                    className="flex-1"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={() => setCurrentStep(3)}
                    className="flex-1 bg-accent-info hover:bg-accent-info/90"
                  >
                    Continue to Restrictions
                  </Button>
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-text-primary mb-4">
                  Security Restrictions
                </h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Browser Lock</Label>
                      <p className="text-xs text-text-muted mt-1">
                        Prevent students from switching tabs or windows
                      </p>
                    </div>
                    <Switch
                      checked={examData.browserLock}
                      onCheckedChange={(checked) =>
                        setExamData({ ...examData, browserLock: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Disable Copy/Paste</Label>
                      <p className="text-xs text-text-muted mt-1">
                        Block clipboard operations during exam
                      </p>
                    </div>
                    <Switch
                      checked={examData.copyPasteDisable}
                      onCheckedChange={(checked) =>
                        setExamData({ ...examData, copyPasteDisable: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Screen Change Alerts</Label>
                      <p className="text-xs text-text-muted mt-1">
                        Alert when student switches windows
                      </p>
                    </div>
                    <Switch
                      checked={examData.screenChangeAlert}
                      onCheckedChange={(checked) =>
                        setExamData({ ...examData, screenChangeAlert: checked })
                      }
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-4">
                  <Button
                    onClick={() => setCurrentStep(2)}
                    variant="outline"
                    className="flex-1"
                  >
                    Back
                  </Button>
                  <Button className="flex-1 bg-accent-success hover:bg-accent-success/90">
                    Activate Exam
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
