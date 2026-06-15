export type Entry = {
  id: number;
  started_at: string;
  task_text: string;
  project: string | null;
  notes: string | null;
};

export type Settings = {
  prompt_interval_minutes: number;
  quiet_start: string;
  quiet_end: string;
  workday_start: string;
  workday_end: string;
};

export type EntryDraft = {
  taskText: string;
  project: string;
  notes: string;
};

export type TimelineBlock = Entry & {
  end_at: string;
  duration_minutes: number;
};

export type SummaryRow = {
  project: string;
  task: string;
  minutes: number;
};
