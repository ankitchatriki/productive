import type { AppData, FocusSettings, Settings } from '../domain/types';
import { DEFAULT_SCENE } from '../focus/scenes/ids';

export const defaultFocusSettings: FocusSettings = {
  defaultBlockMinutes: 50,
  lastChoice: { kind: 'preset', minutes: 50 },
  askBlockEachTime: true,
  enterOnClockIn: true,
  breakMinutes: 10,
  chime: true,
  scene: DEFAULT_SCENE,
  motion: 'system',
};

export const defaultSettings: Settings = {
  dailyGoalMinutes: 480,
  restDays: [],
  gridStartHour: 6,
  gridEndHour: 24,
  onboarded: false,
  showSplash: true,
  focus: defaultFocusSettings,
};

export function emptyAppData(): AppData {
  return {
    schemaVersion: 2,
    settings: { ...defaultSettings, restDays: [], focus: { ...defaultFocusSettings, lastChoice: { ...defaultFocusSettings.lastChoice } } },
    courses: [],
    sections: [],
    entries: [],
    weekPlans: {},
    activeTimer: null,
    focus: null,
  };
}
