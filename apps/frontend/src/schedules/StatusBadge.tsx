import { STATUS_LABELS, type ScheduleStatus } from './types';

export function StatusBadge({ status }: { status: ScheduleStatus }) {
  return <span className={`status-badge ${status.toLowerCase()}`}>{STATUS_LABELS[status]}</span>;
}
