import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { useAuth } from '../auth/auth-context';
import { canManageShifts } from '../auth/roles';
import type { Department } from '../employees/types';
import { addDays, formatDate, formatDuration, localParts, minutesBetween, mondayOf, todayLocal, toInstant } from '../time/helsinki';
import { type Qualification, type Shift, SHIFT_TYPE_LABELS } from './types';

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; shifts: Shift[]; departments: Department[]; qualifications: Qualification[] };

/**
 * One week of shifts in Helsinki time, Monday to Sunday, optionally for one department. The week and the department
 * are kept in the address (?week=2026-11-02&department=3), so a reload or a shared link shows the same view.
 */
export function ShiftsPage() {
  const { state, request } = useAuth();
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice;
  const [params, setParams] = useSearchParams();
  const week = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(params.get('week') ?? '') ? params.get('week')! : todayLocal());
  const department = params.get('department') ?? '';
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  const fetchAll = useCallback(() => {
    const query = department === '' ? '' : `?departmentId=${department}`;
    Promise.all([
      request<Shift[]>('GET', `/shifts${query}`),
      request<Department[]>('GET', '/departments'),
      request<Qualification[]>('GET', '/qualifications')
    ])
      .then(([shifts, departments, qualifications]) => setLoad({ status: 'ready', shifts, departments, qualifications }))
      .catch((error: unknown) =>
        setLoad({ status: 'error', message: error instanceof Error ? error.message : 'The shifts could not be loaded.' })
      );
  }, [request, department]);

  useEffect(fetchAll, [fetchAll]);

  // A shift belongs to the week of its local start date.
  const rows = useMemo(() => {
    if (load.status !== 'ready') return [];
    const from = toInstant(week, '00:00')!;
    const to = toInstant(addDays(week, 7), '00:00')!;
    return load.shifts.filter((shift) => {
      const startsAt = new Date(shift.startsAt);
      return startsAt >= from && startsAt < to;
    });
  }, [load, week]);

  if (state.status !== 'signed-in') return null;
  const manage = canManageShifts(state.user.role);
  const go = (changes: Record<string, string>) => setParams({ week, ...(department ? { department } : {}), ...changes });
  const ready = load.status === 'ready' ? load : null;
  const departmentName = (id: number) => ready?.departments.find((d) => d.id === id)?.name ?? `#${id}`;
  const qualificationCode = (id: number) => ready?.qualifications.find((q) => q.id === id)?.code ?? `#${id}`;

  return (
    <>
      <div className="page-header">
        <h1>Shifts</h1>
        {manage && (
          <Link className="button primary" to={`/shifts/new${department ? `?department=${department}` : ''}`}>
            New shift
          </Link>
        )}
      </div>
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      <div className="filters">
        <label>
          Department
          <select
            value={department}
            onChange={(event) => {
              setLoad({ status: 'loading' });
              setParams({ week, ...(event.target.value ? { department: event.target.value } : {}) });
            }}
          >
            <option value="">All departments</option>
            {ready?.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Week of
          <input type="date" value={week} onChange={(event) => event.target.value && go({ week: mondayOf(event.target.value) })} />
        </label>
        <div className="week-buttons" role="group" aria-label="Change week">
          <button type="button" className="secondary" onClick={() => go({ week: addDays(week, -7) })}>
            Previous week
          </button>
          <button type="button" className="secondary" onClick={() => go({ week: mondayOf(todayLocal()) })}>
            This week
          </button>
          <button type="button" className="secondary" onClick={() => go({ week: addDays(week, 7) })}>
            Next week
          </button>
        </div>
      </div>
      <h2>
        {formatDate(week)} to {formatDate(addDays(week, 6))}
      </h2>

      {load.status === 'loading' && (
        <p className="page-status" role="status">
          Loading shifts…
        </p>
      )}
      {load.status === 'error' && (
        <div className="form-error" role="alert">
          <p>{load.message}</p>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setLoad({ status: 'loading' });
              fetchAll();
            }}
          >
            Try again
          </button>
        </div>
      )}
      {ready &&
        (rows.length === 0 ? (
          <p className="page-status">No shifts in this week.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Type</th>
                  <th scope="col">Time</th>
                  <th scope="col">Length</th>
                  <th scope="col">Department</th>
                  <th scope="col">People</th>
                  <th scope="col">Qualifications</th>
                  {manage && (
                    <th scope="col">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((shift) => {
                  const startsAt = new Date(shift.startsAt);
                  const endsAt = new Date(shift.endsAt);
                  const start = localParts(startsAt);
                  const end = localParts(endsAt);
                  const label = `${SHIFT_TYPE_LABELS[shift.type]} shift on ${formatDate(start.date)}`;
                  return (
                    <tr key={shift.id}>
                      <td>{formatDate(start.date)}</td>
                      <td>{SHIFT_TYPE_LABELS[shift.type]}</td>
                      <td>
                        {start.time} to {end.time}
                        {end.date !== start.date && <span className="muted"> next day</span>}
                      </td>
                      <td>{formatDuration(minutesBetween(startsAt, endsAt))}</td>
                      <td>{departmentName(shift.departmentId)}</td>
                      <td>{shift.requiredHeadcount}</td>
                      <td>
                        {shift.requirements.length === 0
                          ? '-'
                          : shift.requirements.map((r) => `${qualificationCode(r.qualificationId)} × ${r.count}`).join(', ')}
                      </td>
                      {manage && (
                        <td>
                          <Link to={`/shifts/${shift.id}/edit`} aria-label={`Edit ${label}`}>
                            Edit
                          </Link>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
    </>
  );
}
