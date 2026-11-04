import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../auth/auth-context';
import { canManageShifts, canViewShifts } from '../auth/roles';
import type { Department } from '../employees/types';
import { formatDate } from '../time/helsinki';
import { StatusBadge } from './StatusBadge';
import { type ScheduleStatus, type ScheduleSummary, STATUS_LABELS } from './types';

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; schedules: ScheduleSummary[]; departments: Department[] };

/**
 * Staff see every schedule in every status. An employee gets only published schedules of its own department or
 * with its own shifts, because the API filters them (BR-W04).
 */
export function SchedulesPage() {
  const { state, request } = useAuth();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState<ScheduleStatus | ''>('');
  const notice = (useLocation().state as { notice?: string } | null)?.notice;

  useEffect(() => {
    let active = true;
    Promise.all([request<ScheduleSummary[]>('GET', '/schedules'), request<Department[]>('GET', '/departments')])
      .then(([schedules, departments]) => active && setLoad({ status: 'ready', schedules, departments }))
      .catch((error: unknown) => active && setLoad({ status: 'error', message: error instanceof Error ? error.message : 'The schedules could not be loaded.' }));
    return () => {
      active = false;
    };
  }, [request]);

  const rows = useMemo(
    () =>
      load.status === 'ready'
        ? load.schedules.filter((s) => (department === '' || String(s.departmentId) === department) && (status === '' || s.status === status))
        : [],
    [load, department, status]
  );

  if (state.status !== 'signed-in') return null;
  const staff = canViewShifts(state.user.role);
  const departmentName = (id: number) => (load.status === 'ready' && load.departments.find((d) => d.id === id)?.name) || `#${id}`;
  const used = load.status === 'ready' ? load.departments.filter((d) => load.schedules.some((s) => s.departmentId === d.id)) : [];

  return (
    <>
      <div className="page-header">
        <h1>{staff ? 'Schedules' : 'Published schedules'}</h1>
        {canManageShifts(state.user.role) && (
          <Link className="button primary" to="/schedules/new">
            New schedule
          </Link>
        )}
      </div>
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      {staff && (
        <div className="filters">
          <label>
            Department
            <select value={department} onChange={(event) => setDepartment(event.target.value)}>
              <option value="">All departments</option>
              {used.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value as ScheduleStatus | '')}>
              <option value="">All statuses</option>
              {(Object.keys(STATUS_LABELS) as ScheduleStatus[]).map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {load.status === 'loading' && (
        <p className="page-status" role="status">
          Loading schedules…
        </p>
      )}
      {load.status === 'error' && (
        <p className="form-error" role="alert">
          {load.message}
        </p>
      )}
      {load.status === 'ready' &&
        (rows.length === 0 ? (
          <p className="page-status">{staff ? 'No schedules match the filters.' : 'No published schedule for you yet.'}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Period</th>
                  <th scope="col">Department</th>
                  <th scope="col">Status</th>
                  {staff && <th scope="col">Quality</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link to={`/schedules/${s.id}`}>
                        {formatDate(s.periodStart)} to {formatDate(s.periodEnd)}
                      </Link>
                    </td>
                    <td>{departmentName(s.departmentId)}</td>
                    <td>
                      <StatusBadge status={s.status} />
                    </td>
                    {staff && <td>{s.qualityScore === null ? '-' : `${s.qualityScore} / 100`}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </>
  );
}
