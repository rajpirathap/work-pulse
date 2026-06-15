import type { Entry, Settings, SummaryRow, TimelineBlock } from "./types";

const FALLBACK_PROJECT = "Unassigned";

export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function startOfWeek(date: Date) {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const weekStart = startOfDay(date);
  weekStart.setDate(date.getDate() + diff);
  return weekStart;
}

export function endOfDay(date: Date) {
  const end = startOfDay(date);
  end.setDate(end.getDate() + 1);
  end.setMilliseconds(end.getMilliseconds() - 1);
  return end;
}

export function endOfWeek(date: Date) {
  const end = startOfWeek(date);
  end.setDate(end.getDate() + 7);
  end.setMilliseconds(end.getMilliseconds() - 1);
  return end;
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatHours(minutes: number) {
  return (minutes / 60).toFixed(2);
}

export function toDatetimeLocal(value: string) {
  const date = new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function fromDatetimeLocal(value: string) {
  return new Date(value).toISOString();
}

export function isQuietTime(settings: Settings, date = new Date()) {
  const now = minutesSinceMidnight(date);
  const start = parseTime(settings.quiet_start);
  const end = parseTime(settings.quiet_end);

  if (start === end) {
    return false;
  }

  if (start < end) {
    return now >= start && now < end;
  }

  return now >= start || now < end;
}

export function buildTimeline(
  entries: Entry[],
  rangeEnd: Date,
  maxGapMinutes: number,
) {
  const ascending = [...entries].sort(
    (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
  );

  return ascending.map<TimelineBlock>((entry, index) => {
    const current = new Date(entry.started_at);
    const next = ascending[index + 1]
      ? new Date(ascending[index + 1].started_at)
      : rangeEnd;
    const rawMinutes = Math.max(0, Math.round((next.getTime() - current.getTime()) / 60_000));
    const duration = Math.min(rawMinutes, maxGapMinutes);

    return {
      ...entry,
      end_at: new Date(current.getTime() + duration * 60_000).toISOString(),
      duration_minutes: duration,
    };
  });
}

export function summarize(blocks: TimelineBlock[]) {
  const totals = new Map<string, SummaryRow>();

  for (const block of blocks) {
    if (block.duration_minutes <= 0) {
      continue;
    }

    const project = block.project?.trim() || FALLBACK_PROJECT;
    const task = block.task_text.trim();
    const key = `${project}::${task}`;
    const existing = totals.get(key);

    if (existing) {
      existing.minutes += block.duration_minutes;
    } else {
      totals.set(key, { project, task, minutes: block.duration_minutes });
    }
  }

  return [...totals.values()].sort((a, b) => {
    if (a.project === b.project) {
      return b.minutes - a.minutes;
    }

    return a.project.localeCompare(b.project);
  });
}

export function toCsv(rows: SummaryRow[]) {
  const header = ["Project", "Task", "Hours"];
  const body = rows.map((row) => [row.project, row.task, formatHours(row.minutes)]);
  return [header, ...body].map((row) => row.map(escapeCsv).join(",")).join("\n");
}

function minutesSinceMidnight(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function parseTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function escapeCsv(value: string) {
  if (!/[",\n]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}
