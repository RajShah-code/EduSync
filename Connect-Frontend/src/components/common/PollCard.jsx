import React, { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  CheckCircle2,
  Clock,
  Lock,
  Vote,
  RefreshCw,
  AlertCircle,
  Sparkles,
} from "lucide-react";

export function PollCard({
  pollData,
  role = "student",
  onVote,
  isVoting = false,
}) {
  const { poll, options = [], total_votes = 0, closed = false, user_vote_option_id = null } = pollData;
  const [selectedOptionId, setSelectedOptionId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [voteError, setVoteError] = useState(null);

  const hasVoted = user_vote_option_id !== null;
  const isClosed = closed || (poll.closes_at && new Date(poll.closes_at) < new Date());
  const showResults = hasVoted || isClosed || role === "teacher";

  const formattedCloseDate = poll.closes_at
    ? new Date(poll.closes_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  // Prepare chart data for Recharts
  const chartData = options.map((opt) => {
    const percentage = total_votes > 0 ? Math.round((opt.vote_count / total_votes) * 100) : 0;
    return {
      name: opt.option_text,
      votes: opt.vote_count,
      percentage,
      isUserVote: opt.id === user_vote_option_id,
    };
  });

  const handleVoteSubmit = async () => {
    if (!selectedOptionId || submitting || hasVoted || isClosed) return;
    setSubmitting(true);
    setVoteError(null);
    try {
      if (onVote) {
        await onVote(poll.id, selectedOptionId);
      }
    } catch (err) {
      setVoteError(err.message || "Failed to submit vote");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-5 rounded-[var(--radius-lg)] border border-border bg-bg-surface text-text-primary card-hover transition-colors flex flex-col justify-between gap-4 relative overflow-hidden">
      {/* Top Accent Strip */}
      <div
        className={`h-[2px] w-full absolute top-0 left-0 ${
          isClosed ? "bg-text-muted" : "bg-accent-500"
        }`}
      />

      {/* Poll Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-accent-500 flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" />
              Classroom Poll #{poll.id}
            </span>

            {/* Poll Status Badge */}
            {isClosed ? (
              <Badge
                variant="secondary"
                className="gap-1 text-[10px] py-0 px-2 h-4 text-text-muted bg-bg-surface-3"
              >
                <Lock className="w-2.5 h-2.5" />
                <span>Poll Closed</span>
              </Badge>
            ) : (
              <Badge
                variant="success"
                className="gap-1 text-[10px] py-0 px-2 h-4 bg-accent-success/15 text-accent-success border-accent-success/30 font-medium"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-accent-success live-pulse" />
                <span>Active</span>
              </Badge>
            )}
          </div>

          <h3 className="text-sm sm:text-base font-semibold text-text-primary leading-snug">
            {poll.question}
          </h3>
        </div>

        {/* Deadline info */}
        {formattedCloseDate && (
          <div className="flex items-center gap-1 text-[11px] text-text-muted shrink-0 tnum">
            <Clock className="w-3 h-3" />
            <span>{isClosed ? "Closed" : "Closes"} {formattedCloseDate}</span>
          </div>
        )}
      </div>

      {/* Error notification if vote failed */}
      {voteError && (
        <div className="p-2 px-3 bg-accent-critical/10 border border-accent-critical/20 rounded-[var(--radius-sm)] flex items-center gap-2 text-xs text-accent-critical">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{voteError}</span>
        </div>
      )}

      {/* Body: Vote Form or Live Results */}
      {!showResults ? (
        /* VOTING MODE */
        <div className="space-y-3 pt-1">
          <div className="space-y-2">
            {options.map((opt) => {
              const isSelected = selectedOptionId === opt.id;
              return (
                <div
                  key={opt.id}
                  onClick={() => setSelectedOptionId(opt.id)}
                  className={`p-3 rounded-[var(--radius-md)] border text-xs sm:text-sm font-medium cursor-pointer transition-colors flex items-center justify-between gap-3 ${
                    isSelected
                      ? "border-accent-500 bg-accent-500/10 text-text-primary"
                      : "border-border bg-bg-base hover:border-border-hover text-text-secondary"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                        isSelected
                          ? "border-accent-500 bg-accent-500"
                          : "border-text-muted bg-transparent"
                      }`}
                    >
                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <span>{opt.option_text}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-[11px] text-text-muted">
              Select one choice. Votes are final once cast.
            </span>

            <Button
              size="sm"
              onClick={handleVoteSubmit}
              disabled={!selectedOptionId || submitting || isVoting}
              className="h-8 px-3 text-xs font-semibold gap-1.5 btn-press"
            >
              {submitting || isVoting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <Vote className="w-3.5 h-3.5" />
                  <span>Submit Vote</span>
                </>
              )}
            </Button>
          </div>
        </div>
      ) : (
        /* LIVE RESULTS MODE (Recharts Bar Visualization + Breakdown) */
        <div className="space-y-4 pt-1">
          {/* Option-by-Option Breakdown */}
          <div className="space-y-2.5">
            {options.map((opt) => {
              const percentage = total_votes > 0 ? Math.round((opt.vote_count / total_votes) * 100) : 0;
              const isUserChoice = opt.id === user_vote_option_id;

              return (
                <div
                  key={opt.id}
                  className={`p-3 rounded-[var(--radius-md)] border space-y-1.5 transition-colors ${
                    isUserChoice
                      ? "border-accent-500/40 bg-accent-500/10"
                      : "border-border/70 bg-bg-base"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-text-primary">
                        {opt.option_text}
                      </span>
                      {isUserChoice && (
                        <Badge
                          variant="outline"
                          className="text-[9px] py-0 px-1.5 h-3.5 gap-1 bg-accent-500/20 text-accent-500 border-accent-500/30"
                        >
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span>Your Vote</span>
                        </Badge>
                      )}
                    </div>

                    <span className="font-semibold text-text-primary tnum">
                      {opt.vote_count} {opt.vote_count === 1 ? "vote" : "votes"} ({percentage}%)
                    </span>
                  </div>

                  {/* Progress Bar styled with theme tokens */}
                  <div className="w-full h-2 rounded-full bg-bg-surface-3 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ease-out ${
                        isUserChoice ? "bg-accent-500" : "bg-accent-700/70"
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Recharts Simple Comparative Bar Chart */}
          {total_votes > 0 && (
            <div className="h-32 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 0, right: 24, left: 10, bottom: 0 }}
                >
                  <XAxis type="number" hide domain={[0, "dataMax + 1"]} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: "#93969F", fontSize: 11 }}
                    width={110}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="p-2 rounded-[var(--radius-sm)] bg-bg-elevated border border-border text-xs text-text-primary shadow-lg space-y-0.5">
                            <p className="font-semibold">{data.name}</p>
                            <p className="text-accent-500 font-medium tnum">
                              {data.votes} votes ({data.percentage}%)
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="votes" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.isUserVote ? "var(--accent-500)" : "var(--accent-700)"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Summary Footer */}
          <div className="flex items-center justify-between text-[11px] text-text-muted pt-1 border-t border-border/60">
            <span className="tnum font-medium text-text-secondary">
              Total Responses: {total_votes}
            </span>
            <span>
              {isClosed ? "Final Results" : "Live Real-Time Results"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
