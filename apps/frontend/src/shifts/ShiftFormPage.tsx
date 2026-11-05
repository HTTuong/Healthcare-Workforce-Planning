import { type FormEvent, useEffect, useId, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ApiError } from '../api/client';
import { parseRouteId } from '../api/route-id';
import { usePageTitle } from '../layout/usePageTitle';
import { useAuth } from '../auth/auth-context';
import type { Department } from '../employees/types';
import { formatDate, formatDuration, localParts, mondayOf, toOffsetString, todayLocal } from '../time/helsinki';
import { parseHeadcount, parseRequirements, type RequirementRow, requirementChanges, shiftInstants } from './shift-form';
import { type Qualification, type Requirement, type Shift, SHIFT_TYPE_HOURS, SHIFT_TYPE_LABELS, type ShiftType } from './types';

interface Fields {
  departmentId: string;
  type: ShiftType;
  date: string;
  start: string;
  end: string;
  headcount: string;
  requirements: RequirementRow[];
}

type FieldErrors = Partial<Record<'department' | 'times' | 'headcount' | 'requirements', string>>;

function apiMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.status !== 0 && error.status < 500) return error.message;
  if (error instanceof ApiError && error.status === 0) return error.message;
  return fallback;
}

function fieldsOf(shift: Shift): Fields {
  const start = localParts(new Date(shift.startsAt));
  return {
    departmentId: String(shift.departmentId),
    type: shift.type,
    date: start.date,
    start: start.time,
    end: localParts(new Date(shift.endsAt)).time,
    headcount: String(shift.requiredHeadcount),
    requirements: shift.requirements.map((r) => ({ qualificationId: String(r.qualificationId), count: String(r.count) }))
  };
}

/** Create a shift (/shifts/new) or edit or delete one (/shifts/:id/edit). Admin and Planner. Times are Helsinki time. */
export function ShiftFormPage() {
  const { id: idParam } = useParams();
  const [params] = useSearchParams();
  const editId = idParam === undefined ? null : parseRouteId(idParam);
  const badId = idParam !== undefined && editId === null;
  const { request } = useAuth();
  const navigate = useNavigate();
  const formId = useId();
  const [fields, setFields] = useState<Fields>({
    departmentId: params.get('department') ?? '',
    type: 'MORNING',
    date: todayLocal(),
    ...SHIFT_TYPE_HOURS.MORNING,
    headcount: '1',
    requirements: []
  });
  const [original, setOriginal] = useState<Shift | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  usePageTitle(idParam === undefined ? 'New shift' : 'Edit shift');

  useEffect(() => {
    if (badId) return;
    let active = true;
    const shift = editId === null ? Promise.resolve(null) : request<Shift>('GET', `/shifts/${editId}`);
    Promise.all([request<Department[]>('GET', '/departments'), request<Qualification[]>('GET', '/qualifications'), shift])
      .then(([foundDepartments, foundQualifications, found]) => {
        if (!active) return;
        setDepartments(foundDepartments);
        setQualifications(foundQualifications);
        if (found) {
          setOriginal(found);
          setFields(fieldsOf(found));
        }
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadError(error instanceof ApiError && error.status === 404 ? 'This shift does not exist.' : apiMessage(error, 'The shift could not be loaded.'));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [badId, editId, request]);

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => setFields((current) => ({ ...current, [key]: value }));
  const times = shiftInstants(fields);
  const title = idParam === undefined ? 'New shift' : 'Edit shift';
  const backTo = `/shifts?week=${mondayOf(fields.date || todayLocal())}${fields.departmentId ? `&department=${fields.departmentId}` : ''}`;

  function changeType(type: ShiftType) {
    // A new shift takes the usual hours of its type. An existing shift keeps its times.
    setFields((current) => ({ ...current, type, ...(editId === null ? SHIFT_TYPE_HOURS[type] : {}) }));
  }

  function setRequirement(index: number, row: Partial<RequirementRow>) {
    set(
      'requirements',
      fields.requirements.map((current, i) => (i === index ? { ...current, ...row } : current))
    );
  }

  async function save(times: { startsAt: Date; endsAt: Date }, headcount: number, requirements: Requirement[]) {
    const body = {
      type: fields.type,
      startsAt: toOffsetString(times.startsAt),
      endsAt: toOffsetString(times.endsAt),
      requiredHeadcount: headcount
    };
    if (editId === null) {
      await request('POST', '/shifts', { ...body, departmentId: Number(fields.departmentId), requirements });
      return;
    }
    // The API changes requirements one by one. This order never leaves a requirement above the headcount.
    const changes = requirementChanges(original!.requirements, requirements);
    for (const qualificationId of changes.removed) await request('DELETE', `/shifts/${editId}/requirements/${qualificationId}`);
    for (const r of changes.lowered) await request('PUT', `/shifts/${editId}/requirements/${r.qualificationId}`, { count: r.count });
    await request('PATCH', `/shifts/${editId}`, body);
    for (const r of changes.raisedOrAdded) await request('PUT', `/shifts/${editId}/requirements/${r.qualificationId}`, { count: r.count });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: FieldErrors = {};
    if (fields.departmentId === '') next.department = 'Choose a department.';
    if (typeof times === 'string') next.times = times;
    const headcount = parseHeadcount(fields.headcount);
    if (typeof headcount === 'string') next.headcount = headcount;
    const requirements = parseRequirements(fields.requirements, typeof headcount === 'number' ? headcount : undefined);
    if (typeof requirements === 'string') next.requirements = requirements;
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0 || typeof times === 'string' || typeof headcount === 'string' || typeof requirements === 'string') return;
    setSaving(true);
    try {
      await save(times, headcount, requirements);
      const what = `${SHIFT_TYPE_LABELS[fields.type]} shift on ${formatDate(fields.date)}`;
      navigate(backTo, { state: { notice: editId === null ? `${what} was added.` : `${what} was saved.` } });
    } catch (error) {
      const message = apiMessage(error, 'The server could not save the shift. Try again in a moment.');
      // Some steps of an edit may have been saved already, so the form shows what is stored now.
      setFormError(editId === null ? message : `${message} Reload the page to see what was saved.`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await request('DELETE', `/shifts/${editId}`);
      navigate(backTo, { state: { notice: `${SHIFT_TYPE_LABELS[fields.type]} shift on ${formatDate(fields.date)} was deleted.` } });
    } catch (error) {
      setFormError(apiMessage(error, 'The server could not delete the shift. Try again in a moment.'));
      setSaving(false);
    }
  }

  if (badId) {
    return (
      <>
        <h1>{title}</h1>
        <p className="form-error" role="alert">
          This shift does not exist.
        </p>
        <Link to="/shifts">Back to shifts</Link>
      </>
    );
  }
  if (loading) {
    return (
      <p className="page-status" role="status">
        Loading…
      </p>
    );
  }
  if (loadError) {
    return (
      <>
        <h1>{title}</h1>
        <p className="form-error" role="alert">
          {loadError}
        </p>
        <Link to="/shifts">Back to shifts</Link>
      </>
    );
  }

  const describe = (key: keyof FieldErrors) => (errors[key] ? `${formId}-${key}-error` : undefined);
  const errorText = (key: keyof FieldErrors) =>
    errors[key] && (
      <p className="field-error" id={`${formId}-${key}-error`}>
        {errors[key]}
      </p>
    );

  return (
    <>
      <p>
        <Link to={backTo}>← Shifts</Link>
      </p>
      <h1>{title}</h1>
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      <form className="panel form-grid" onSubmit={handleSubmit} noValidate aria-label={title}>
        <div className="field">
          <label htmlFor={`${formId}-department`}>Department</label>
          <select
            id={`${formId}-department`}
            value={fields.departmentId}
            onChange={(event) => set('departmentId', event.target.value)}
            disabled={editId !== null}
            aria-invalid={errors.department ? true : undefined}
            aria-describedby={editId !== null ? `${formId}-department-fixed` : describe('department')}
          >
            <option value="">Choose…</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          {editId !== null && (
            <p className="hint-inline" id={`${formId}-department-fixed`}>
              The department of a shift cannot change.
            </p>
          )}
          {errorText('department')}
        </div>
        <div className="field">
          <label htmlFor={`${formId}-type`}>Type</label>
          <select id={`${formId}-type`} value={fields.type} onChange={(event) => changeType(event.target.value as ShiftType)}>
            {(Object.keys(SHIFT_TYPE_LABELS) as ShiftType[]).map((type) => (
              <option key={type} value={type}>
                {SHIFT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="field wide" aria-describedby={[`${formId}-times-summary`, describe('times')].filter(Boolean).join(' ')}>
          <legend>Time (Helsinki)</legend>
          <div className="inline wrap">
            <label>
              Date
              <input type="date" value={fields.date} onChange={(event) => set('date', event.target.value)} aria-invalid={errors.times ? true : undefined} />
            </label>
            <label>
              Start
              <input type="time" value={fields.start} onChange={(event) => set('start', event.target.value)} aria-invalid={errors.times ? true : undefined} />
            </label>
            <label>
              End
              <input type="time" value={fields.end} onChange={(event) => set('end', event.target.value)} aria-invalid={errors.times ? true : undefined} />
            </label>
          </div>
          <p className="hint-inline" id={`${formId}-times-summary`} aria-live="polite">
            {typeof times === 'string'
              ? ''
              : `Ends ${formatDate(times.endDate)} at ${fields.end}. Length ${formatDuration(times.minutes)}.`}
          </p>
          {errorText('times')}
        </fieldset>
        <div className="field">
          <label htmlFor={`${formId}-headcount`}>People needed</label>
          <input
            id={`${formId}-headcount`}
            className="short"
            inputMode="numeric"
            value={fields.headcount}
            onChange={(event) => set('headcount', event.target.value)}
            aria-invalid={errors.headcount ? true : undefined}
            aria-describedby={describe('headcount')}
          />
          {errorText('headcount')}
        </div>
        <fieldset className="field wide" aria-describedby={describe('requirements')}>
          <legend>Required qualifications</legend>
          {fields.requirements.length === 0 && <p className="hint-inline">None. Anyone in the department can work this shift.</p>}
          {fields.requirements.map((row, index) => (
            <div className="inline requirement" key={index}>
              <select
                value={row.qualificationId}
                onChange={(event) => setRequirement(index, { qualificationId: event.target.value })}
                aria-label={`Qualification ${index + 1}`}
              >
                <option value="">Choose…</option>
                {qualifications.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.code} {q.name}
                  </option>
                ))}
              </select>
              <label>
                at least
                <input
                  className="short"
                  inputMode="numeric"
                  value={row.count}
                  onChange={(event) => setRequirement(index, { count: event.target.value })}
                  aria-label={`People with qualification ${index + 1}`}
                />
              </label>
              <button
                type="button"
                className="secondary"
                onClick={() => set('requirements', fields.requirements.filter((_, i) => i !== index))}
                aria-label={`Remove qualification ${index + 1}`}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="secondary"
            onClick={() => set('requirements', [...fields.requirements, { qualificationId: '', count: '1' }])}
          >
            Add qualification
          </button>
          {errorText('requirements')}
        </fieldset>
        <div className="actions wide">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Saving…' : editId === null ? 'Add shift' : 'Save changes'}
          </button>
          <Link to={backTo}>Cancel</Link>
        </div>
      </form>
      {editId !== null && (
        <section className="panel" aria-labelledby={`${formId}-delete`}>
          <h2 id={`${formId}-delete`}>Delete shift</h2>
          {confirmDelete ? (
            <div className="actions">
              <span>Delete this shift and its assignments?</span>
              <button type="button" className="danger" onClick={handleDelete} disabled={saving}>
                Yes, delete
              </button>
              <button type="button" className="secondary" onClick={() => setConfirmDelete(false)}>
                Keep it
              </button>
            </div>
          ) : (
            <button type="button" className="secondary" onClick={() => setConfirmDelete(true)}>
              Delete shift
            </button>
          )}
        </section>
      )}
    </>
  );
}
