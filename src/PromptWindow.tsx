import { FormEvent, useEffect, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { createEntry, initDatabase, listProjects, clearSnooze, setSnoozeUntil } from "./api";
import type { EntryDraft } from "./types";
import { hidePromptWindow } from "./windows";

const EMPTY_DRAFT: EntryDraft = {
  taskText: "",
  project: "",
  notes: "",
};

export default function PromptWindow() {
  const [draft, setDraft] = useState<EntryDraft>(EMPTY_DRAFT);
  const [projects, setProjects] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    const unlistenOpen = listen("prompt:open", () => {
      setDraft(EMPTY_DRAFT);
      setError(null);
    });

    return () => {
      void unlistenOpen.then((stop) => stop());
    };
  }, []);

  async function bootstrap() {
    try {
      await initDatabase();
      setProjects(await listProjects());
      setReady(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function dismissPrompt() {
    setDraft(EMPTY_DRAFT);
    await hidePromptWindow();
  }

  async function savePrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.taskText.trim()) {
      return;
    }

    try {
      setError(null);
      await createEntry(draft);
      await clearSnooze();
      setDraft(EMPTY_DRAFT);
      await emit("entry:saved");
      await hidePromptWindow();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function snoozePrompt(minutes: number) {
    const until = new Date(Date.now() + minutes * 60_000);
    await setSnoozeUntil(until.toISOString());
    await emit("prompt:snoozed", { until: until.toISOString() });
    await dismissPrompt();
  }

  if (!ready) {
    return (
      <main className="prompt-shell">
        <div className="prompt-widget">Loading...</div>
      </main>
    );
  }

  return (
    <main className="prompt-shell">
      <form className="prompt-widget" onSubmit={savePrompt}>
        <div className="prompt-widget-header" data-tauri-drag-region>
          <div className="prompt-widget-title" data-tauri-drag-region>
            <p className="eyebrow">Work Pulse</p>
            <h2>What are you doing?</h2>
          </div>
          <button type="button" className="prompt-close" onClick={() => void dismissPrompt()} aria-label="Close">
            ×
          </button>
        </div>

        {error ? <div className="alert">{error}</div> : null}

        <input
          autoFocus
          value={draft.taskText}
          onChange={(event) => setDraft((current) => ({ ...current, taskText: event.target.value }))}
          placeholder="Example: Weekly invoice report"
        />
        <input
          list="projects"
          value={draft.project}
          onChange={(event) => setDraft((current) => ({ ...current, project: event.target.value }))}
          placeholder="Project/client (optional)"
        />

        <div className="prompt-actions">
          <button type="button" onClick={() => void snoozePrompt(10)}>
            Snooze
          </button>
          <button type="button" onClick={() => void dismissPrompt()}>
            Skip
          </button>
          <button type="submit" className="primary" disabled={!draft.taskText.trim()}>
            Save
          </button>
        </div>
      </form>

      <datalist id="projects">
        {projects.map((project) => (
          <option value={project} key={project} />
        ))}
      </datalist>
    </main>
  );
}
