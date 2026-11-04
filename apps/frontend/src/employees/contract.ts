// Contract hours are stored as minutes per week (2295 = 38 h 15 min, a common full-time week in Finnish
// healthcare). The UI shows and edits them as hours and minutes.

export const MAX_CONTRACT_MINUTES = 10080; // the API's limit: every minute of a week
export const DEFAULT_CONTRACT_MINUTES = 2295;

export function formatContract(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function splitContract(minutes: number): { hours: string; minutes: string } {
  return { hours: String(Math.floor(minutes / 60)), minutes: String(minutes % 60) };
}

/** Total minutes from the two fields, or an error message. Whole numbers only, minutes 0 to 59. */
export function joinContract(hours: string, minutes: string): number | string {
  if (!/^\d+$/.test(hours.trim()) || !/^\d+$/.test(minutes.trim())) return 'Enter whole hours and minutes.';
  const h = Number(hours);
  const m = Number(minutes);
  if (m > 59) return 'Minutes must be between 0 and 59.';
  const total = h * 60 + m;
  if (total > MAX_CONTRACT_MINUTES) return 'A week has at most 168 hours.';
  return total;
}
