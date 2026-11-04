import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/auth-context';
import { canViewShifts } from '../auth/roles';
import type { Department } from '../employees/types';
import { SHIFT_TYPE_LABELS, type Shift } from '../shifts/types';
import { formatDate, formatDuration, localParts, minutesBetween } from '../time/helsinki';
import { groupByDay, loadByEmployee } from './schedule-view';
import { StatusBadge } from './StatusBadge';
import type { ScheduleCheck, ScheduleDetail } from './types';

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; schedule: ScheduleDetail; department: string; shifts: Shift[]; check: ScheduleCheck | null };

const SCORE_LABELS: Array<[keyof ScheduleCheck['scores'], string]> = [
  ['preference', 'Preference'],
  ['fairness', 'Fairness'],
  ['workload', 'Workload'],
  ['overtime', 'Overtime'],
];

function timeRange(startsAt: string, endsAt: string): string {
  const start = localParts(new Date(startsAt));
  const end = localParts(new Date(endsAt));
  return `${start.time} to ${end.time}${end.date !== start.date ? ' next day' : ''}`;
}

/**
 * One schedule. Staff see every shift of the period with who works it, the gaps, the hard rule check and the
 * quality scores. An employee sees only its own shifts of a published schedule (BR-W04, BR-A03).
 */
export function ScheduleViewPage() {
  const { id } = useParams();
  const { state, request } = useAuth();
  const staff = state.status === 'signed-in' && canViewShifts(state.user.role);
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    (async () => {
      const schedule = await request<ScheduleDetail>('GET', `/schedules/${id}`);
      const departments = await request<Department[]>('GET', '/departments');
      const department = departments.find((d) => d.id === schedule.departmentId)?.name ?? `#${schedule.departmentId}`;
      // Only staff may read shifts and the check. An employee's view is built from its assignments alone.
      const [shifts, check] = staff
        ? await Promise.all([
            request<Shift[]>('GET', `/shifts?departmentId=${schedule.departmentId}`),
            request<ScheduleCheck>('GET', `/schedules/${id}/check`)
          ])
        : [[], null];
      if (active) setLoad({ status: 'ready', schedule, department, shifts, check });
    })().catch((error: unknown) => {
      if (!active) return;
      const message =
        error instanceof ApiError && error.status === 404
          ? 'This schedule does not exist or is not published yet.'
          : error instanceof Error
            ? error.message
            : 'The schedule could not be loaded.';
      setLoad({ status: 'error', message });
    });
    return () => {
      active = false;
    };
  }, [id, request, staff]);

  if (load.status === 'loading') {
    return (
      <p className="page-status" role="status">
        Loading schedule…
      </p>
    );
  }
  if (load.status === 'error') {
    return (
      <>
        <h1>Schedule</h1>
        <p className="form-error" role="alert">
          {load.message}
        </p>
        <Link to="/schedules">Back to schedules</Link>
      </>
    );
  }

  const { schedule, department, shifts, check } = load;
  const period = `${formatDate(schedule.periodStart)} to ${formatDate(schedule.periodEnd)}`;
  const header = (
    <>
      <p>
        <Link to="/schedules">← Schedules</Link>
      </p>
      <div className="page-header">
        <h1>
          {department}, {period}
        </h1>
        <StatusBadge status={schedule.status} />
      </div>
    </>
  );

  if (!staff) {
    const mine = [...schedule.assignments].sort((a, b) => Date.parse(a.shift.startsAt) - Date.parse(b.shift.startsAt));
    const minutes = mine.reduce((sum, a) => sum + minutesBetween(new Date(a.shift.startsAt), new Date(a.shift.endsAt)), 0);
    return (
      <>
        {header}
        <h2>My shifts</h2>
        {mine.length === 0 ? (
          <p className="page-status">You have no shifts in this schedule.</p>
        ) : (
          <>
            <p className="count">
              {mine.length} {mine.length === 1 ? 'shift' : 'shifts'}, {formatDuration(minutes)} in total
            </p>
            <ul className="entries" aria-label="My shifts">
              {mine.map((a) => (
                <li key={a.id} className="entry">
                  <span className={`kind shift-${a.shift.type.toLowerCase()}`}>{SHIFT_TYPE_LABELS[a.shift.type]}</span>
                  <span className="entry-text">
                    {formatDate(localParts(new Date(a.shift.startsAt)).date)}, {timeRange(a.shift.startsAt, a.shift.endsAt)}
                  </span>
                  <span className="muted">{formatDuration(minutesBetween(new Date(a.shift.startsAt), new Date(a.shift.endsAt)))}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </>
    );
  }

  const days = groupByDay(schedule.periodStart, schedule.periodEnd, shifts, schedule.assignments, check?.violations ?? []);
  const rows = days.flatMap((day) => day.rows);
  const staffed = rows.filter((row) => row.shift.requiredHeadcount === undefined || row.people.length >= row.shift.requiredHeadcount).length;
  const loads = loadByEmployee(schedule.assignments);
  const violations = check?.violations ?? [];

  return (
    <>
      {header}
      <dl className="profile summary">
        <dt>Assignments</dt>
        <dd>{schedule.assignments.length}</dd>
        <dt>Shifts fully staffed</dt>
        <dd>
          {staffed} of {rows.length}
        </dd>
        <dt>Saved quality score</dt>
        <dd>{schedule.qualityScore === null ? 'Not generated since the last change' : `${schedule.qualityScore} / 100`}</dd>
      </dl>

      {check && (
        <section className="panel wide-panel" aria-labelledby="check-title">
          <h2 id="check-title">Check with today's data</h2>
          {violations.length === 0 ? (
            <p className="success">No hard rule is broken. The schedule can be approved.</p>
          ) : (
            <>
              <p className="form-error">
                {violations.length} hard rule {violations.length === 1 ? 'violation' : 'violations'}. The schedule cannot be approved until they are fixed
                (BR-W03).
              </p>
              <ul className="violations">
                {violations.map((v, index) => (
                  <li key={index}>
                    <strong>{v.ruleId}</strong> {v.message}
                  </li>
                ))}
              </ul>
            </>
          )}
          <dl className="scores">
            {SCORE_LABELS.map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{Math.round(check.scores[key])}</dd>
              </div>
            ))}
            <div className="total">
              <dt>Quality</dt>
              <dd>{Math.round(check.scores.quality)}</dd>
            </div>
          </dl>
        </section>
      )}

      <h2>Shifts</h2>
      {days.length === 0 && <p className="page-status">This department has no shifts in the period.</p>}
      {days.map((day) => (
        <section key={day.date} className="day" aria-labelledby={`day-${day.date}`}>
          <h3 id={`day-${day.date}`}>{formatDate(day.date)}</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Type</th>
                  <th scope="col">Staffed</th>
                  <th scope="col">People</th>
                </tr>
              </thead>
              <tbody>
                {day.rows.map(({ shift, people, violations: shiftViolations }) => {
                  const short = shift.requiredHeadcount !== undefined && people.length < shift.requiredHeadcount;
                  return (
                    <tr key={shift.id} className={short || shiftViolations.length > 0 ? 'problem' : undefined}>
                      <td>{timeRange(shift.startsAt, shift.endsAt)}</td>
                      <td>{SHIFT_TYPE_LABELS[shift.type]}</td>
                      <td>
                        {people.length}
                        {shift.requiredHeadcount !== undefined && ` of ${shift.requiredHeadcount}`}
                        {short && <span className="flag"> short</span>}
                      </td>
                      <td className="wrap-cell">
                        {people.length === 0 ? <span className="muted">Nobody</span> : people.map((p) => `${p.firstName} ${p.lastName}`).join(', ')}
                        {shiftViolations.length > 0 && (
                          <span className="flag">
                            {' '}
                            {shiftViolations.map((v) => v.ruleId).join(', ')}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {loads.length > 0 && (
        <>
          <h2>Work per employee</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Employee</th>
                  <th scope="col">Shifts</th>
                  <th scope="col">Hours</th>
                  <th scope="col">Nights</th>
                </tr>
              </thead>
              <tbody>
                {loads.map((l) => (
                  <tr key={l.employee.id}>
                    <td>
                      {l.employee.firstName} {l.employee.lastName}
                    </td>
                    <td>{l.shifts}</td>
                    <td>{formatDuration(l.minutes)}</td>
                    <td>{l.nights}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
