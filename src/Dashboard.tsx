import { FormEvent, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  createEntry,
  deleteEntry,
  getSettings,
  initDatabase,
  listEntries,
  listProjects,
  updateEntry,
  updateSettings,
} from "./api";
import type { Entry, EntryDraft, Settings } from "./types";
import {
  buildTimeline,
  endOfDay,
  endOfWeek,
  formatDateTime,
  formatHours,
  formatTime,
  fromDatetimeLocal,
  startOfDay,
  startOfWeek,
  summarize,
  toCsv,
  toDatetimeLocal,
} from "./time";
import { openPromptWindow } from "./windows";

const EMPTY_DRAFT: EntryDraft = {
  taskText: "",
  project: "",
  notes: "",
};

const DEFAULT_SETTINGS: Settings = {
  prompt_interval_minutes: 30,
  quiet_start: "18:00",
  quiet_end: "08:00",
  workday_start: "09:00",
  workday_end: "17:00",
};

export default function Dashboard() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [quickDraft, setQuickDraft] = useState<EntryDraft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Loading Work Pulse...");
  const [error, setError] = useState<string | null>(null);

  const weekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate]);
  const weekEnd = useMemo(() => endOfWeek(selectedDate), [selectedDate]);
  const dayStart = useMemo(() => startOfDay(selectedDate), [selectedDate]);
  const dayEnd = useMemo(() => endOfDay(selectedDate), [selectedDate]);

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    void refreshEntries();
  }, [selectedDate]);

  useEffect(() => {
    const unlistenSaved = listen("entry:saved", () => {
      void Promise.all([refreshEntries(), refreshProjects()]);
      setStatus("Entry saved. Keep going.");
    });

    const unlistenSnoozed = listen<{ until: string }>("prompt:snoozed", (event) => {
      setStatus(`Prompt snoozed until ${formatTime(event.payload.until)}.`);
    });

    return () => {
      void unlistenSaved.then((stop) => stop());
      void unlistenSnoozed.then((stop) => stop());
    };
  }, []);

  const dailyEntries = useMemo(
    () =>
      entries.filter((entry) => {
        const startedAt = new Date(entry.started_at);
        return startedAt >= dayStart && startedAt <= dayEnd;
      }),
    [entries, dayStart, dayEnd],
  );

  const dailyTimeline = useMemo(
    () =>
      buildTimeline(
        dailyEntries,
        new Date(Math.min(Date.now(), dayEnd.getTime())),
        settings.prompt_interval_minutes * 2,
      ),
    [dailyEntries, dayEnd, settings.prompt_interval_minutes],
  );

  const weeklyTimeline = useMemo(
    () => buildTimeline(entries, weekEnd, settings.prompt_interval_minutes * 2),
    [entries, settings.prompt_interval_minutes, weekEnd],
  );

  const weeklySummary = useMemo(() => summarize(weeklyTimeline), [weeklyTimeline]);
  const totalWeekMinutes = weeklySummary.reduce((total, row) => total + row.minutes, 0);

  async function bootstrap() {
    try {
      setError(null);
      await initDatabase();
      const [loadedSettings, loadedProjects] = await Promise.all([getSettings(), listProjects()]);
      setSettings(loadedSettings);
      setProjects(loadedProjects);
      await refreshEntries();
      setReady(true);
      setStatus(
        "Running in the background. Closing the window hides Work Pulse to the menu bar, and prompts still appear on top.",
      );
    } catch (caught) {
      setError(toErrorMessage(caught));
      setStatus("Work Pulse could not start.");
    }
  }

  async function refreshEntries() {
    try {
      const loadedEntries = await listEntries(weekStart.toISOString(), weekEnd.toISOString());
      setEntries(loadedEntries);
    } catch (caught) {
      setError(toErrorMessage(caught));
    }
  }

  async function refreshProjects() {
    try {
      setProjects(await listProjects());
    } catch (caught) {
      setError(toErrorMessage(caught));
    }
  }

  async function saveQuickEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quickDraft.taskText.trim()) {
      return;
    }

    try {
      setError(null);
      await createEntry(quickDraft);
      setQuickDraft(EMPTY_DRAFT);
      await Promise.all([refreshEntries(), refreshProjects()]);
      setStatus("Manual entry saved.");
    } catch (caught) {
      setError(toErrorMessage(caught));
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setError(null);
      const saved = await updateSettings(settings);
      setSettings(saved);
      setStatus("Settings saved.");
    } catch (caught) {
      setError(toErrorMessage(caught));
    }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || !editing.task_text.trim()) {
      return;
    }

    try {
      setError(null);
      await updateEntry(editing);
      setEditing(null);
      await Promise.all([refreshEntries(), refreshProjects()]);
      setStatus("Entry updated.");
    } catch (caught) {
      setError(toErrorMessage(caught));
    }
  }

  async function removeEntry(id: number) {
    try {
      setError(null);
      await deleteEntry(id);
      await refreshEntries();
      setStatus("Entry deleted.");
    } catch (caught) {
      setError(toErrorMessage(caught));
    }
  }

  function exportWeeklyCsv() {
    const csv = toCsv(weeklySummary);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `work-pulse-week-${weekStart.toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Local timesheet assistant</p>
          <h1>Work Pulse</h1>
          <p>
            Answer one small prompt during the day, then turn those snapshots into
            weekly timesheet totals. Close this window anytime — Work Pulse keeps
            running from the menu bar.
          </p>
        </div>
        <div className="hero-actions">
          <button type="button" className="primary" onClick={() => void openPromptWindow()}>
            Prompt me now
          </button>
          <button type="button" onClick={exportWeeklyCsv} disabled={!weeklySummary.length}>
            Export weekly CSV
          </button>
        </div>
      </section>

      {error ? <div className="alert">{error}</div> : <div className="status">{status}</div>}

      <section className="grid">
        <article className="card span-2">
          <div className="card-header">
            <div>
              <p className="eyebrow">Daily log</p>
              <h2>{selectedDate.toLocaleDateString(undefined, { dateStyle: "full" })}</h2>
            </div>
            <input
              type="date"
              value={toDateInput(selectedDate)}
              onChange={(event) => setSelectedDate(new Date(`${event.target.value}T12:00:00`))}
            />
          </div>

          <form className="quick-entry" onSubmit={saveQuickEntry}>
            <input
              value={quickDraft.taskText}
              onChange={(event) =>
                setQuickDraft((current) => ({ ...current, taskText: event.target.value }))
              }
              placeholder="Add what you are doing right now"
            />
            <input
              list="projects"
              value={quickDraft.project}
              onChange={(event) =>
                setQuickDraft((current) => ({ ...current, project: event.target.value }))
              }
              placeholder="Project/client"
            />
            <button type="submit" className="primary">
              Save
            </button>
          </form>

          <div className="card-scroll">
            {dailyTimeline.length ? (
              <div className="timeline">
                {dailyTimeline.map((entry) => (
                  <div className="timeline-row" key={entry.id}>
                    <div className="time-range">
                      {formatTime(entry.started_at)} - {formatTime(entry.end_at)}
                      <span>{formatHours(entry.duration_minutes)}h</span>
                    </div>
                    <div>
                      <strong>{entry.task_text}</strong>
                      <p>{entry.project || "Unassigned"}</p>
                    </div>
                    <div className="row-actions">
                      <button type="button" onClick={() => setEditing(entry)}>
                        Edit
                      </button>
                      <button type="button" className="danger" onClick={() => void removeEntry(entry.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-state">No entries for this day yet.</p>
            )}
          </div>
        </article>

        <article className="card">
          <p className="eyebrow">This week</p>
          <h2>{formatHours(totalWeekMinutes)} hours</h2>
          <p className="muted">
            Week of {weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </p>
          <div className="summary-list card-scroll">
            {weeklySummary.length ? (
              weeklySummary.map((row) => (
                <div className="summary-row" key={`${row.project}-${row.task}`}>
                  <div>
                    <strong>{row.project}</strong>
                    <p>{row.task}</p>
                  </div>
                  <span>{formatHours(row.minutes)}h</span>
                </div>
              ))
            ) : (
              <p className="empty-state">No weekly totals yet.</p>
            )}
          </div>
        </article>

        <article className="card">
          <p className="eyebrow">Settings</p>
          <h2>Prompt rhythm</h2>
          <form className="settings-form" onSubmit={saveSettings}>
            <label>
              Interval minutes
              <input
                type="number"
                min="1"
                max="480"
                value={settings.prompt_interval_minutes}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    prompt_interval_minutes: Number(event.target.value),
                  }))
                }
              />
            </label>
            <div className="split">
              <label>
                Quiet starts
                <input
                  type="time"
                  value={settings.quiet_start}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, quiet_start: event.target.value }))
                  }
                />
              </label>
              <label>
                Quiet ends
                <input
                  type="time"
                  value={settings.quiet_end}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, quiet_end: event.target.value }))
                  }
                />
              </label>
            </div>
            <div className="split">
              <label>
                Workday starts
                <input
                  type="time"
                  value={settings.workday_start}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, workday_start: event.target.value }))
                  }
                />
              </label>
              <label>
                Workday ends
                <input
                  type="time"
                  value={settings.workday_end}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, workday_end: event.target.value }))
                  }
                />
              </label>
            </div>
            <button type="submit" className="primary">
              Save settings
            </button>
          </form>
        </article>
      </section>

      <datalist id="projects">
        {projects.map((project) => (
          <option value={project} key={project} />
        ))}
      </datalist>

      {editing ? (
        <div className="modal-backdrop">
          <form className="prompt-card" onSubmit={saveEdit}>
            <p className="eyebrow">Edit entry</p>
            <h2>{formatDateTime(editing.started_at)}</h2>
            <input
              type="datetime-local"
              value={toDatetimeLocal(editing.started_at)}
              onChange={(event) =>
                setEditing((current) =>
                  current ? { ...current, started_at: fromDatetimeLocal(event.target.value) } : current,
                )
              }
            />
            <textarea
              value={editing.task_text}
              onChange={(event) =>
                setEditing((current) =>
                  current ? { ...current, task_text: event.target.value } : current,
                )
              }
            />
            <input
              list="projects"
              value={editing.project ?? ""}
              onChange={(event) =>
                setEditing((current) =>
                  current ? { ...current, project: event.target.value || null } : current,
                )
              }
              placeholder="Project/client"
            />
            <input
              value={editing.notes ?? ""}
              onChange={(event) =>
                setEditing((current) =>
                  current ? { ...current, notes: event.target.value || null } : current,
                )
              }
              placeholder="Optional notes"
            />
            <div className="prompt-actions">
              <button type="button" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" className="primary">
                Save changes
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
