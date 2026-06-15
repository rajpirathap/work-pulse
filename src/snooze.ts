const SNOOZE_KEY = "work-pulse-snooze-until";

export function getSnoozeUntil(): Date | null {
  const value = localStorage.getItem(SNOOZE_KEY);
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return date.getTime() > Date.now() ? date : null;
}

export function setSnoozeUntil(date: Date | null) {
  if (date) {
    localStorage.setItem(SNOOZE_KEY, date.toISOString());
    return;
  }

  localStorage.removeItem(SNOOZE_KEY);
}

export function clearSnooze() {
  setSnoozeUntil(null);
}
