import { useEffect } from "react";
import type { Settings } from "./types";
import { getSnoozeUntil } from "./snooze";
import { isQuietTime } from "./time";
import { openPromptWindow } from "./windows";

export function usePromptScheduler(settings: Settings, enabled: boolean) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    let timeout: number | undefined;

    const scheduleNext = () => {
      const now = Date.now();
      const snoozeUntil = getSnoozeUntil();
      const snoozeDelay = snoozeUntil ? Math.max(0, snoozeUntil.getTime() - now) : 0;
      const intervalDelay = settings.prompt_interval_minutes * 60_000;
      const delay = snoozeDelay > 0 ? snoozeDelay : intervalDelay;

      timeout = window.setTimeout(() => {
        if (!isQuietTime(settings)) {
          void openPromptWindow();
        }
        scheduleNext();
      }, delay);
    };

    scheduleNext();

    return () => {
      if (timeout !== undefined) {
        window.clearTimeout(timeout);
      }
    };
  }, [enabled, settings]);
}
