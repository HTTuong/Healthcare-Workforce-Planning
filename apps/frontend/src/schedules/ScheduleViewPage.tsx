import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { ApiError } from '../api/client';
import { parseRouteId } from '../api/route-id';
import { usePageTitle } from '../layout/usePageTitle';
import { useAuth } from '../auth/auth-context';
import { useCan } from '../auth/useCan';
import type { Department, Employee } from '../employees/types';
import { SHIFT_TYPE_LABELS, type Shift } from '../shifts/types';
import { formatDate, formatDuration, localParts, minutesBetween } from '../time/helsinki';
import { ScheduleActions, type WorkflowAction } from './ScheduleActions';
import { groupByDay, loadByEmployee } from './schedule-view';
import { StatusBadge } from './StatusBadge';
import type { ScheduleCheck, ScheduleDetail, Violation } from './types';

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; schedule: ScheduleDetail; department: string; shifts: Shift[]; check: ScheduleCheck | null; staffList: Employee[] };

interface Feedback {
  kind: 'success' | 'error';
  text: string;
  violations?: Violation[];
}

const SCORE_LABELS: Array<[keyof ScheduleCheck['scores'], string]> = [
  ['preference', 'Preference'],
  ['fairness', 'Fairness'],
  ['workload', 'Workload'],
  ['overtime', 'Overtime']
];

const DONE: Record<Exclude<WorkflowAction, 'generate'>, string> = {
  submit: 'Submitted for review. A manager can now approve it or send it back.',
  approve: 'Approved. It can now be published.',
  reject: 'Sent back to draft. The planner can change it and generate again.',
  publish: 'Published. Employees can now see their shifts.'
};

function timeRange(startsAt: string, endsAt: string): string {
  const start = localParts(new Date(startsAt));
  const end = localParts(new Date(endsAt));
  return `${start.time} to ${end.time}${end.date !== start.date ? ' next day' : ''}`;
}

function errorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.status > 0 && error.status < 500) return error.message;
  if (error instanceof ApiError && error.status === 0) return error.message;
  return fallback;
}

/**
 * One schedule. Staff see every shift of the period with who works it, the gaps, the hard rule check, the scores,
 * and the workflow steps their role may take now. While the schedule can be edited, a planner can also add and
 * remove people by hand. An employee sees only its own shifts of a published schedule (BR-W04, BR-A03).
 */
export function ScheduleViewPage() {
  const { id: idParam } = useParams();
  const id = parseRouteId(idParam);
  const { request } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // The staff view needs the shifts and the check. An employee's view is built from its own assignments.
  const canCheck = useCan('schedules.check');
  const canReadShifts = useCan('shifts.read');
  const staff = canCheck && canReadShifts;
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [feedback, setFeedback] = useState<Feedback | null>(() => {
    const notice = (location.state as { notice?: string } | null)?.notice;
    return notice ? { kind: 'success', text: notice } : null;
  });
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  usePageTitle(
    load.status === 'ready'
      ? `${load.department}, ${formatDate(load.schedule.periodStart)} to ${formatDate(load.schedule.periodEnd)}`
      : 'Schedule'
  );

  const fetchAll = useCallback(async () => {
    // An address such as /schedules/abc names no schedule, so the page says so without asking the API (U-02).
    if (id === null) throw new ApiError(404, 'Not found');
    const schedule = await request<ScheduleDetail>('GET', `/schedules/${id}`);
    const departments = await request<Department[]>('GET', '/departments');
    const department = departments.find((d) => d.id === schedule.departmentId)?.name ?? `#${schedule.departmentId}`;
    if (!staff) return { status: 'ready' as const, schedule, department, shifts: [], check: null, staffList: [] };
    // Only staff may read shifts, the check and the employee list.
    const editable = schedule.actions.includes('edit');
    const [shifts, check, employees] = await Promise.all([
      request<Shift[]>('GET', `/shifts?departmentId=${schedule.departmentId}`),
      request<ScheduleCheck>('GET', `/schedules/${id}/check`),
      editable ? request<Employee[]>('GET', '/employees') : Promise.resolve([] as Employee[])
    ]);
    const staffList = employees.filter((e) => e.active && e.departmentId === schedule.departmentId);
    return { status: 'ready' as const, schedule, department, shifts, check, staffList };
  }, [id, request, staff]);

  const refresh = useCallback(
    () =>
      fetchAll()
        .then(setLoad)
        .catch((error: unknown) => {
          const message =
            error instanceof ApiError && error.status === 404
              ? 'This schedule does not exist or is not published yet.'
              : errorText(error, 'The schedule could not be loaded.');
          setLoad({ status: 'error', message });
        }),
    [fetchAll]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Runs one change, reloads the schedule and only then shows the result and enables the buttons again. Enabling
   * them before the reload showed the old buttons for a moment, so a second click could repeat a finished step.
   */
  async function change(step: () => Promise<Feedback | null>) {
    setBusy(true);
    setFeedback(null);
    let result: Feedback | null;
    try {
      result = await step();
    } catch (error) {
      // Approval refused because of hard violations returns them in the body (BR-W03).
      const body = error instanceof ApiError ? (error.body as { violations?: Violation[] } | undefined) : undefined;
      result = { kind: 'error', text: errorText(error, 'The step could not be completed. Try again.'), violations: body?.violations };
    }
    await refresh();
    setFeedback(result);
    setBusy(false);
  }

  function runAction(action: WorkflowAction) {
    void change(async () => {
      if (action !== 'generate') {
        await request('POST', `/schedules/${id}/${action}`);
        return { kind: 'success', text: DONE[action] };
      }
      const result = await request<{ added: number; violations: Violation[] }>('POST', `/schedules/${id}/generate`);
      const left = result.violations.length;
      return {
        kind: left === 0 ? 'success' : 'error',
        text: `Generated: ${result.added} ${result.added === 1 ? 'assignment' : 'assignments'} added. ${
          left === 0 ? 'No hard rule is broken.' : `${left} hard rule ${left === 1 ? 'violation remains' : 'violations remain'}, see the check below.`
        }`
      };
    });
  }

  function edit(method: 'POST' | 'DELETE', path: string, body?: unknown) {
    void change(async () => {
      await request(method, path, body);
      return null;
    });
  }

  async function deleteSchedule() {
    setBusy(true);
    try {
      await request('DELETE', `/schedules/${id}`);
      navigate('/schedules', { state: { notice: 'The schedule was deleted.' } });
    } catch (error) {
      setFeedback({ kind: 'error', text: errorText(error, 'The schedule could not be deleted.') });
      setBusy(false);
      setConfirmDelete(false);
    }
  }

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

  const { schedule, department, shifts, check, staffList } = load;
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

  const editable = schedule.actions.includes('edit');
  const days = groupByDay(schedule.periodStart, schedule.periodEnd, shifts, schedule.assignments, check?.violations ?? []);
  const rows = days.flatMap((day) => day.rows);
  const staffed = rows.filter((row) => row.shift.requiredHeadcount === undefined || row.people.length >= row.shift.requiredHeadcount).length;
  const loads = loadByEmployee(schedule.assignments);
  const violations = check?.violations ?? [];

  return (
    <>
      {header}
      {feedback && (
        <div className={feedback.kind === 'success' ? 'success' : 'form-error'} role={feedback.kind === 'success' ? 'status' : 'alert'}>
          <p>{feedback.text}</p>
          {feedback.violations && feedback.violations.length > 0 && (
            <ul className="violations">
              {feedback.violations.map((v, index) => (
                <li key={index}>
                  <strong>{v.ruleId}</strong> {v.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ScheduleActions actions={schedule.actions} busy={busy} onAction={runAction} />

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
      {editable && <p className="hint-inline edit-hint">Adding or removing a person by hand moves the schedule back to draft. Generate it again before submitting.</p>}
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
                  const shiftName = `${SHIFT_TYPE_LABELS[shift.type]} shift on ${formatDate(day.date)}`;
                  const candidates = staffList.filter((e) => !people.some((p) => p.id === e.id));
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
                        {people.length === 0 && <span className="muted">Nobody</span>}
                        {!editable && people.map((p) => `${p.firstName} ${p.lastName}`).join(', ')}
                        {editable &&
                          people.map((p) => {
                            const assignment = schedule.assignments.find((a) => a.shiftId === shift.id && a.employeeId === p.id)!;
                            return (
                              <span key={p.id} className="chip">
                                {p.firstName} {p.lastName}
                                <button
                                  type="button"
                                  disabled={busy}
                                  aria-label={`Remove ${p.firstName} ${p.lastName} from the ${shiftName}`}
                                  onClick={() => edit('DELETE', `/schedules/${id}/assignments/${assignment.id}`)}
                                >
                                  ×
                                </button>
                              </span>
                            );
                          })}
                        {shiftViolations.length > 0 && <span className="flag"> {shiftViolations.map((v) => v.ruleId).join(', ')}</span>}
                        {editable && candidates.length > 0 && (
                          <select
                            className="add-person"
                            value=""
                            disabled={busy}
                            aria-label={`Add a person to the ${shiftName}`}
                            onChange={(event) =>
                              edit('POST', `/schedules/${id}/assignments`, { shiftId: shift.id, employeeId: Number(event.target.value) })
                            }
                          >
                            <option value="">Add…</option>
                            {candidates.map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.firstName} {e.lastName}
                              </option>
                            ))}
                          </select>
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

      {editable && (
        <section className="panel danger-zone" aria-labelledby="delete-title">
          <h2 id="delete-title">Delete schedule</h2>
          {confirmDelete ? (
            <div className="actions">
              <span>Delete this schedule and all its assignments?</span>
              <button type="button" className="danger" disabled={busy} onClick={() => void deleteSchedule()}>
                Yes, delete
              </button>
              <button type="button" className="secondary" onClick={() => setConfirmDelete(false)}>
                Keep it
              </button>
            </div>
          ) : (
            <button type="button" className="secondary" onClick={() => setConfirmDelete(true)}>
              Delete schedule
            </button>
          )}
        </section>
      )}
    </>
  );
}
