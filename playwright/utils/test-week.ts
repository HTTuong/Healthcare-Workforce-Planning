// A fixed winter week far ahead (Helsinki at +02:00), Monday 3 to Sunday 9 March 2031. Tests own their department,
// so they can all use the same dates without meeting each other's shifts or schedules.
export const WEEK = {
  monday: '2031-03-03',
  tuesday: '2031-03-04',
  wednesday: '2031-03-05',
  sunday: '2031-03-09',
  nextMonday: '2031-03-10'
} as const;
