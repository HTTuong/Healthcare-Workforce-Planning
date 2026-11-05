import { type FormEvent, useCallback, useEffect, useId, useState } from 'react';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/auth-context';
import { usePageTitle } from '../layout/usePageTitle';
import { todayLocal, toOffsetString } from '../time/helsinki';
import { describeRange, fieldsOf, findOverlap, type RangeFields, rangeInstants } from './availability-form';
import { type Availability, AVAILABILITY_HELP, AVAILABILITY_LABELS, type AvailabilityType } from './types';

interface Fields extends RangeFields {
  type: AvailabilityType;
}

function emptyFields(): Fields {
  const today = todayLocal();
  return { type: 'AVAILABLE', wholeDays: false, startDate: today, startTime: '08:00', endDate: today, endTime: '16:00' };
}

function apiMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.status > 0 && error.status < 500) return error.message;
  if (error instanceof ApiError && error.status === 0) return error.message;
  return fallback;
}

/**
 * Every role declares its own availability here (BR-A03): when it would like to work, when it cannot, and leave.
 * The planner and the scheduling engine read it (BR-H02, BR-S01).
 */
export function AvailabilityPage() {
  const { state, request } = useAuth();
  const me = state.status === 'signed-in' ? state.user.sub : null;
  const formId = useId();
  usePageTitle('My availability');
  const [records, setRecords] = useState<Availability[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [fields, setFields] = useState<Fields>(emptyFields);
  const [editing, setEditing] = useState<Availability | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  // When the list was loaded, which decides what counts as past.
  const [loadedAt, setLoadedAt] = useState(() => new Date());

  const fetchRecords = useCallback(() => {
    if (me === null) return;
    request<Availability[]>('GET', `/availabilities?employeeId=${me}`)
      .then((found) => {
        setRecords(found);
        setLoadedAt(new Date());
        setLoadError(null);
      })
      .catch((error: unknown) => setLoadError(apiMessage(error, 'Your availability could not be loaded.')));
  }, [me, request]);

  useEffect(fetchRecords, [fetchRecords]);

  if (me === null) return null;
  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => setFields((current) => ({ ...current, [key]: value }));

  function startEdit(record: Availability) {
    setEditing(record);
    setFields({ type: record.type, ...fieldsOf(record) });
    setFormError(null);
    setNotice(null);
  }

  function cancelEdit() {
    setEditing(null);
    setFields(emptyFields());
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    const range = rangeInstants(fields);
    if (typeof range === 'string') {
      setFormError(range);
      return;
    }
    // The API refuses overlaps too (409). Checking here first names the entry in the way.
    const clash = findOverlap(records ?? [], range.startsAt, range.endsAt, editing?.id);
    if (clash) {
      setFormError(
        `This overlaps your ${AVAILABILITY_LABELS[clash.type].toLowerCase()} entry for ${describeRange(new Date(clash.startsAt), new Date(clash.endsAt))}. Change or delete that entry first.`
      );
      return;
    }
    const body = { type: fields.type, startsAt: toOffsetString(range.startsAt), endsAt: toOffsetString(range.endsAt) };
    setFormError(null);
    setSaving(true);
    try {
      if (editing) await request('PATCH', `/availabilities/${editing.id}`, body);
      else await request('POST', '/availabilities', { ...body, employeeId: me });
      setNotice(`${AVAILABILITY_LABELS[fields.type]}: ${describeRange(range.startsAt, range.endsAt)} was saved.`);
      setEditing(null);
      setFields(emptyFields());
      fetchRecords();
    } catch (error) {
      setFormError(apiMessage(error, 'The server could not save your availability. Try again in a moment.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(record: Availability) {
    setNotice(null);
    try {
      await request('DELETE', `/availabilities/${record.id}`);
      setConfirmDelete(null);
      if (editing?.id === record.id) cancelEdit();
      setNotice(`${AVAILABILITY_LABELS[record.type]}: ${describeRange(new Date(record.startsAt), new Date(record.endsAt))} was deleted.`);
      fetchRecords();
    } catch (error) {
      setFormError(apiMessage(error, 'The server could not delete the entry. Try again in a moment.'));
    }
  }

  const shown = (records ?? []).filter((record) => showPast || new Date(record.endsAt) > loadedAt);
  const title = editing ? 'Change entry' : 'Add an entry';

  return (
    <>
      <h1>My availability</h1>
      <p className="lead">Tell the planner when you would like to work, when you cannot, and when you are on leave. Times are Helsinki time.</p>
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      <form className="panel" onSubmit={handleSubmit} noValidate aria-labelledby={`${formId}-title`}>
        <h2 id={`${formId}-title`}>{title}</h2>
        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}
        <fieldset className="field">
          <legend>Type</legend>
          <div className="choices">
            {(Object.keys(AVAILABILITY_LABELS) as AvailabilityType[]).map((type) => (
              <div key={type} className="choice">
                <input
                  id={`${formId}-${type}`}
                  type="radio"
                  name={`${formId}-type`}
                  value={type}
                  checked={fields.type === type}
                  onChange={() => set('type', type)}
                  aria-describedby={`${formId}-${type}-help`}
                />
                <div>
                  <label htmlFor={`${formId}-${type}`}>
                    <strong>{AVAILABILITY_LABELS[type]}</strong>
                  </label>
                  <div className="muted choice-help" id={`${formId}-${type}-help`}>
                    {AVAILABILITY_HELP[type]}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label className="checkbox">
            <input type="checkbox" checked={fields.wholeDays} onChange={(event) => set('wholeDays', event.target.checked)} />
            Whole days
          </label>
        </div>
        <div className="inline wrap field">
          <label>
            From
            <input type="date" value={fields.startDate} onChange={(event) => set('startDate', event.target.value)} />
          </label>
          {!fields.wholeDays && (
            <label>
              From time
              <input type="time" value={fields.startTime} onChange={(event) => set('startTime', event.target.value)} />
            </label>
          )}
          <label>
            {fields.wholeDays ? 'To (last day)' : 'To'}
            <input type="date" value={fields.endDate} onChange={(event) => set('endDate', event.target.value)} />
          </label>
          {!fields.wholeDays && (
            <label>
              To time
              <input type="time" value={fields.endTime} onChange={(event) => set('endTime', event.target.value)} />
            </label>
          )}
        </div>
        <div className="actions">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add entry'}
          </button>
          {editing && (
            <button type="button" className="secondary" onClick={cancelEdit}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="page-header entries-header">
        <h2>{showPast ? 'All entries' : 'Upcoming entries'}</h2>
        <label className="checkbox">
          <input type="checkbox" checked={showPast} onChange={(event) => setShowPast(event.target.checked)} />
          Show past entries
        </label>
      </div>
      {loadError && (
        <div className="form-error" role="alert">
          <p>{loadError}</p>
          <button type="button" className="secondary" onClick={fetchRecords}>
            Try again
          </button>
        </div>
      )}
      {records === null && !loadError && (
        <p className="page-status" role="status">
          Loading…
        </p>
      )}
      {records !== null && shown.length === 0 && <p className="page-status">No entries yet.</p>}
      {shown.length > 0 && (
        <ul className="entries" aria-label="Availability entries">
          {shown.map((record) => {
            const text = describeRange(new Date(record.startsAt), new Date(record.endsAt));
            const label = `${AVAILABILITY_LABELS[record.type]} ${text}`;
            return (
              <li key={record.id} className={editing?.id === record.id ? 'entry editing' : 'entry'}>
                <span className={`kind ${record.type.toLowerCase()}`}>{AVAILABILITY_LABELS[record.type]}</span>
                <span className="entry-text">{text}</span>
                <span className="entry-actions">
                  {confirmDelete === record.id ? (
                    <>
                      <button type="button" className="danger" onClick={() => handleDelete(record)} aria-label={`Yes, delete ${label}`}>
                        Yes, delete
                      </button>
                      <button type="button" className="secondary" onClick={() => setConfirmDelete(null)}>
                        Keep
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="secondary" onClick={() => startEdit(record)} aria-label={`Change ${label}`}>
                        Change
                      </button>
                      <button type="button" className="secondary" onClick={() => setConfirmDelete(record.id)} aria-label={`Delete ${label}`}>
                        Delete
                      </button>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
