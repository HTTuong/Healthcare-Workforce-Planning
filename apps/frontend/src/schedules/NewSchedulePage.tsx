import { type FormEvent, useEffect, useId, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/auth-context';
import type { Department } from '../employees/types';
import { checkPeriod, daysInPeriod, defaultPeriod } from './period';
import type { ScheduleSummary } from './types';

/** A planner or admin starts a DRAFT schedule for one department and period. */
export function NewSchedulePage() {
  const { request } = useAuth();
  const navigate = useNavigate();
  const id = useId();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [department, setDepartment] = useState('');
  const [period, setPeriod] = useState(defaultPeriod);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    request<Department[]>('GET', '/departments')
      .then(setDepartments)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'The departments could not be loaded.'));
  }, [request]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = department === '' ? 'Choose a department.' : checkPeriod(period.start, period.end);
    setError(problem);
    if (problem) return;
    setSaving(true);
    try {
      const created = await request<ScheduleSummary>('POST', '/schedules', {
        departmentId: Number(department),
        periodStart: period.start,
        periodEnd: period.end
      });
      navigate(`/schedules/${created.id}`, { state: { notice: 'The schedule was created as a draft. Generate it to fill the shifts.' } });
    } catch (caught) {
      // 409: another schedule of the department already covers part of the period.
      setError(caught instanceof ApiError && caught.status > 0 && caught.status < 500 ? caught.message : 'The schedule could not be created. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const days = checkPeriod(period.start, period.end) === null ? daysInPeriod(period.start, period.end) : null;
  return (
    <>
      <p>
        <Link to="/schedules">← Schedules</Link>
      </p>
      <h1>New schedule</h1>
      <form className="panel" onSubmit={handleSubmit} noValidate aria-label="New schedule">
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="field">
          <label htmlFor={`${id}-department`}>Department</label>
          <select id={`${id}-department`} value={department} onChange={(event) => setDepartment(event.target.value)}>
            <option value="">Choose…</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="inline wrap field">
          <label>
            First day
            <input type="date" value={period.start} onChange={(event) => setPeriod({ ...period, start: event.target.value })} />
          </label>
          <label>
            Last day
            <input type="date" value={period.end} onChange={(event) => setPeriod({ ...period, end: event.target.value })} />
          </label>
        </div>
        <p className="hint-inline" aria-live="polite">
          {days !== null && `${days} ${days === 1 ? 'day' : 'days'}. Only shifts that start and end inside the period are planned.`}
        </p>
        <div className="actions">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create draft'}
          </button>
          <Link to="/schedules">Cancel</Link>
        </div>
      </form>
    </>
  );
}
