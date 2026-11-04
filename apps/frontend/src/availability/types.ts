export type AvailabilityType = 'AVAILABLE' | 'UNAVAILABLE' | 'LEAVE';

export const AVAILABILITY_LABELS: Record<AvailabilityType, string> = {
  AVAILABLE: 'Available',
  UNAVAILABLE: 'Unavailable',
  LEAVE: 'Leave'
};

/** What each type means for the schedule (BR-H02 and BR-S01), shown next to the choice. */
export const AVAILABILITY_HELP: Record<AvailabilityType, string> = {
  AVAILABLE: 'You would like to work then. The planner tries to give you these hours.',
  UNAVAILABLE: 'You cannot work then. You will not be scheduled.',
  LEAVE: 'Holiday or other leave. You will not be scheduled.'
};

/** GET /availabilities */
export interface Availability {
  id: number;
  employeeId: number;
  startsAt: string;
  endsAt: string;
  type: AvailabilityType;
}
