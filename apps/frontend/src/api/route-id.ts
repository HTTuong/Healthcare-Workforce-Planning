const MAX_INT32 = 2147483647;

/**
 * The id from an address such as /schedules/12, or null when it cannot be an id. Pages then say the record does not
 * exist instead of showing the API's message about integers (U-02).
 */
export function parseRouteId(value: string | undefined): number | null {
  if (value === undefined || !/^[1-9]\d{0,9}$/.test(value)) return null;
  const id = Number(value);
  return id <= MAX_INT32 ? id : null;
}
