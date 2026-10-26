import type { AppData } from '../domain/types';
import { validateAppData } from '../domain/validate';

export function exportJson(data: AppData): string {
  return JSON.stringify(data, null, 2);
}

export function importJson(text: string): { data: AppData; warnings: string[] } | { errors: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { errors: ['The file is not valid JSON.'] };
  }
  const warnings: string[] = [];
  const result = validateAppData(parsed, warnings);
  return Array.isArray(result) ? { errors: result } : { data: result, warnings };
}
