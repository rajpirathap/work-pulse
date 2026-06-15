import { invoke } from "@tauri-apps/api/core";
import type { Entry, EntryDraft, Settings } from "./types";

export async function initDatabase() {
  return invoke<void>("init_database");
}

export async function listEntries(from?: string, to?: string) {
  return invoke<Entry[]>("list_entries", { from: from ?? null, to: to ?? null });
}

export async function createEntry(entry: EntryDraft) {
  return invoke<Entry>("create_entry", {
    entry: {
      task_text: entry.taskText,
      project: entry.project || null,
      notes: entry.notes || null,
    },
  });
}

export async function updateEntry(entry: Entry) {
  return invoke<Entry>("update_entry", { entry });
}

export async function deleteEntry(id: number) {
  return invoke<void>("delete_entry", { id });
}

export async function listProjects() {
  return invoke<string[]>("list_projects");
}

export async function getSettings() {
  return invoke<Settings>("get_settings");
}

export async function updateSettings(settings: Settings) {
  return invoke<Settings>("update_settings", { settings });
}
