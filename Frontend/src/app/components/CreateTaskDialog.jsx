import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import {
  IconClipboardPlus as ClipboardPlus,
  IconFilePencil as FilePencil,
  IconFileDescription as FileDescription,
  IconBracketsAngle as BracketsAngle,
  IconAlarm as Alarm,
  IconClipboardCheck as ClipboardCheck,
  IconLoader2 as Loader2,
  IconBrandJavascript as BrandJavascript,
  IconBrandPython as BrandPython,
  IconBrandHtml5 as BrandHtml5,
  IconBrandCss3 as BrandCss3,
  IconTypography as Typography,
} from "@tabler/icons-react";

// Single source of truth for the task languages + their brand glyphs.
export const LANGUAGES = [
  { name: "JavaScript", dot: "#E8C547", icon: BrandJavascript },
  { name: "Python", dot: "#4B8BBE", icon: BrandPython },
  { name: "HTML", dot: "#E0723C", icon: BrandHtml5 },
  { name: "CSS", dot: "#4D7CE0", icon: BrandCss3 },
  { name: "Plaintext", dot: "#9A9AA2", icon: Typography },
];

// A field header drawn as icon + hairline rule — the "Create a New Task"
// mockup's fieldset-legend style: the icon alone identifies the field (the
// input's own placeholder carries the label text), so there's no separate
// caption competing with it on the same line. `note` renders a small aside
// (e.g. "(optional)") between the icon and the rule.
function FieldLegend({ icon: Icon, note }) {
  return (
    <div className="flex items-center gap-2 mb-1.5 px-0.5">
      <Icon className="w-3.5 h-3.5 text-accent-500 shrink-0" strokeWidth={1.9} />
      {note && <span className="text-[10px] text-text-muted whitespace-nowrap">{note}</span>}
      <span className="flex-1 h-px bg-border" aria-hidden="true" />
    </div>
  );
}

/**
 * The "New Coding Task" form, presented as a modal (mirrors the Live Lecture
 * Session Setup Modal: bg-bg-surface, 27px radius, icon-led title, pill footer).
 * All form state is owned by the parent — this component is presentational.
 *
 *  - onFieldChange(patch)   merge a partial into formData
 *  - onToggleLanguage(name) toggle one language chip
 *  - onSubmit(e)            create the task (parent preventDefaults)
 *  - onOpenChange(false)    fired on Cancel / Esc / overlay / X — parent
 *                           drops the draft tab and restores the previous one
 */
export function CreateTaskDialog({
  open,
  onOpenChange,
  formData,
  onFieldChange,
  onToggleLanguage,
  onSubmit,
  submitting = false,
  canSubmit = false,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-role="teacher"
        className="bg-bg-surface border-border text-text-primary sm:max-w-md rounded-[27px]"
      >
        <DialogHeader>
          <DialogTitle className="text-text-primary flex items-center gap-2">
            <ClipboardPlus className="w-[18px] h-[18px] text-accent-500" strokeWidth={1.75} />
            Create a New Task
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-5 py-1">
          <div>
            <FieldLegend icon={FilePencil} />
            <Input
              id="ct-title"
              value={formData.title}
              onChange={(e) => onFieldChange({ title: e.target.value })}
              className="bg-bg-base border-border text-text-primary focus-visible:ring-accent-500"
              placeholder="Task Title"
              aria-label="Task title"
              autoFocus
              required
            />
          </div>

          <div>
            <FieldLegend icon={FileDescription} />
            <Textarea
              id="ct-desc"
              value={formData.description}
              onChange={(e) => onFieldChange({ description: e.target.value })}
              className="bg-bg-base border-border text-text-primary min-h-[120px] focus-visible:ring-accent-500"
              placeholder="Descriptions / Instructions"
              aria-label="Description and instructions"
              required
            />
          </div>

          <div>
            <FieldLegend icon={BracketsAngle} />
            <div className="flex flex-wrap gap-2" role="group" aria-label="Allowed programming languages">
              {LANGUAGES.map((lang) => {
                const isSelected = formData.languages.includes(lang.name.toLowerCase());
                return (
                  <button
                    type="button"
                    key={lang.name}
                    onClick={() => onToggleLanguage(lang.name)}
                    aria-pressed={isSelected}
                    className={`btn-press flex items-center gap-1.5 px-3 py-1.5 text-xs tracking-wide border rounded-[var(--radius-sm)] transition-[transform,background-color,border-color,color] duration-150 ease-[var(--ease-out-strong)] ${
                      isSelected
                        ? "bg-accent-500/10 border-accent-500/40 text-accent-500"
                        : "border-border text-text-secondary hover:border-border-hover"
                    }`}
                  >
                    <lang.icon className="w-3.5 h-3.5 shrink-0" style={{ color: lang.dot }} />
                    {lang.name.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <FieldLegend icon={Alarm} note="(optional)" />
            <div className="relative w-40">
              <Input
                id="ct-duration"
                type="number"
                min="1"
                max="180"
                value={formData.timeLimitMinutes}
                onChange={(e) => onFieldChange({ timeLimitMinutes: e.target.value })}
                className="bg-bg-base border-border text-text-primary tnum text-sm pr-10 focus-visible:ring-accent-500"
                placeholder="Set Time Limit"
                aria-label="Time limit in minutes (optional)"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted pointer-events-none">
                min
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-text-secondary hover:text-text-primary text-sm h-9"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit || submitting}
              className="btn-press bg-accent-700 hover:bg-accent-600 text-white font-semibold text-sm h-9 px-4 rounded-full"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Assigning…
                </>
              ) : (
                <>
                  <ClipboardCheck className="w-4 h-4" />
                  Assign Task
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
