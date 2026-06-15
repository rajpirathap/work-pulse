import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function isPromptWindow() {
  return getCurrentWindow().label === "prompt";
}

export function isMainWindow() {
  return getCurrentWindow().label === "main";
}

export async function openPromptWindow() {
  await invoke<void>("show_prompt");
}

export async function hidePromptWindow() {
  await invoke<void>("hide_prompt");
}

export async function showDashboard() {
  await invoke<void>("show_dashboard");
}
