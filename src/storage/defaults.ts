import type { AppData, Settings } from '../domain/types';

export const defaultSettings: Settings = {
  dailyGoalMinutes: 480,
  restDays: [],
  gridStartHour: 6,
  gridEndHour: 24,
  onboarded: false,
};

export function emptyAppData(): AppData {
  return {
    schemaVersion: 1,
    settings: { ...defaultSettings, restDays: [] },
    courses: [],
    sections: [],
    entries: [],
    weekPlans: {},
    activeTimer: null,
  };
}
