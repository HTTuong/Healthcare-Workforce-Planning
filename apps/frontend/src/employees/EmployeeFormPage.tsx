import { type FormEvent, useEffect, useId, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/auth-context';
import { ROLE_LABELS, type Role } from '../auth/types';
import { DEFAULT_CONTRACT_MINUTES, joinContract, splitContract } from './contract';
import { SetPasswordForm } from './SetPasswordForm';
import type { Department, Employee, EmployeeBody } from './types';

// Same rule as the API (apps/backend/src/employees/employees.service.ts), so the user hears about it before sending.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Fields {
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  departmentId: string;
  hours: string;
  minutes: string;
  active: boolean;
}

type FieldErrors = Partial<Record<'firstName' | 'lastName' | 'email' | 'contract', string>>;

const EMPTY: Fields = {
  firstName: '',
  lastName: '',
  email: '',
  role: 'EMPLOYEE',
  departmentId: '',
  ...splitContract(DEFAULT_CONTRACT_MINUTES),
  active: true
};

function fieldsOf(employee: Employee): Fields {
  return {
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    role: employee.role,
    departmentId: employee.departmentId === null ? '' : String(employee.departmentId),
    ...splitContract(employee.contractMinutesPerWeek),
    active: employee.active
  };
}

function validate(fields: Fields): { errors: FieldErrors; minutes?: number } {
  const errors: FieldErrors = {};
  if (fields.firstName.trim() === '') errors.firstName = 'Enter a first name.';
  if (fields.lastName.trim() === '') errors.lastName = 'Enter a last name.';
  if (fields.email.trim() === '') errors.email = 'Enter an email address.';
  else if (!EMAIL_PATTERN.test(fields.email.trim())) errors.email = 'Enter an email address like name@example.com.';
  const minutes = joinContract(fields.hours, fields.minutes);
  if (typeof minutes === 'string') errors.contract = minutes;
  return { errors, minutes: typeof minutes === 'number' ? minutes : undefined };
}

function saveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return error.message;
    if (error.status >= 500) return 'The server could not save the employee. Try again in a moment.';
    return error.message;
  }
  return 'Something went wrong. Try again.';
}

/** Create an employee (/employees/new) or edit one (/employees/:id/edit). Admin only. */
export function EmployeeFormPage() {
  const { id: idParam } = useParams();
  const editId = idParam === undefined ? null : Number(idParam);
  const { state, request } = useAuth();
  const navigate = useNavigate();
  const formId = useId();
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const employee = editId === null ? Promise.resolve(null) : request<Employee>('GET', `/employees/${editId}`);
    Promise.all([request<Department[]>('GET', '/departments'), employee])
      .then(([foundDepartments, found]) => {
        if (!active) return;
        setDepartments(foundDepartments);
        if (found) setFields(fieldsOf(found));
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadError(error instanceof ApiError && error.status === 404 ? 'This employee does not exist.' : saveErrorMessage(error));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [editId, request]);

  if (state.status !== 'signed-in') return null;
  // An admin who demoted or deactivated their own account would lock themselves out at the next request.
  const isSelf = editId !== null && editId === state.user.sub;

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => setFields((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const checked = validate(fields);
    setErrors(checked.errors);
    setFormError(null);
    if (Object.keys(checked.errors).length > 0 || checked.minutes === undefined) return;
    const body: EmployeeBody = {
      firstName: fields.firstName.trim(),
      lastName: fields.lastName.trim(),
      email: fields.email.trim(),
      role: fields.role,
      departmentId: fields.departmentId === '' ? null : Number(fields.departmentId),
      contractMinutesPerWeek: checked.minutes
    };
    if (editId !== null) body.active = fields.active;
    if (isSelf) {
      delete (body as Partial<EmployeeBody>).role;
      delete body.active;
    }
    setSaving(true);
    try {
      const saved =
        editId === null
          ? await request<Employee>('POST', '/employees', body)
          : await request<Employee>('PATCH', `/employees/${editId}`, body);
      const name = `${saved.firstName} ${saved.lastName}`;
      navigate('/employees', {
        state: { notice: editId === null ? `${name} was added. Set a password so they can sign in.` : `Changes to ${name} were saved.` }
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) setErrors({ email: error.message });
      else setFormError(saveErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const title = editId === null ? 'New employee' : 'Edit employee';
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
        <Link to="/employees">Back to employees</Link>
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
        <Link to="/employees">← Employees</Link>
      </p>
      <h1>{title}</h1>
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      <form className="panel form-grid" onSubmit={handleSubmit} noValidate aria-label={title}>
        <div className="field">
          <label htmlFor={`${formId}-first`}>First name</label>
          <input
            id={`${formId}-first`}
            value={fields.firstName}
            onChange={(event) => set('firstName', event.target.value)}
            aria-invalid={errors.firstName ? true : undefined}
            aria-describedby={describe('firstName')}
          />
          {errorText('firstName')}
        </div>
        <div className="field">
          <label htmlFor={`${formId}-last`}>Last name</label>
          <input
            id={`${formId}-last`}
            value={fields.lastName}
            onChange={(event) => set('lastName', event.target.value)}
            aria-invalid={errors.lastName ? true : undefined}
            aria-describedby={describe('lastName')}
          />
          {errorText('lastName')}
        </div>
        <div className="field wide">
          <label htmlFor={`${formId}-email`}>Email</label>
          <input
            id={`${formId}-email`}
            type="email"
            value={fields.email}
            onChange={(event) => set('email', event.target.value)}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={describe('email')}
          />
          {errorText('email')}
        </div>
        <div className="field">
          <label htmlFor={`${formId}-role`}>Role</label>
          <select
            id={`${formId}-role`}
            value={fields.role}
            onChange={(event) => set('role', event.target.value as Role)}
            disabled={isSelf}
            aria-describedby={isSelf ? `${formId}-self` : undefined}
          >
            {(Object.keys(ROLE_LABELS) as Role[]).map((value) => (
              <option key={value} value={value}>
                {ROLE_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${formId}-department`}>Department</label>
          <select id={`${formId}-department`} value={fields.departmentId} onChange={(event) => set('departmentId', event.target.value)}>
            <option value="">No department</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="field wide" aria-describedby={describe('contract')}>
          <legend>Contract per week</legend>
          <div className="inline">
            <label>
              <input
                className="short"
                inputMode="numeric"
                value={fields.hours}
                onChange={(event) => set('hours', event.target.value)}
                aria-invalid={errors.contract ? true : undefined}
              />{' '}
              hours
            </label>
            <label>
              <input
                className="short"
                inputMode="numeric"
                value={fields.minutes}
                onChange={(event) => set('minutes', event.target.value)}
                aria-invalid={errors.contract ? true : undefined}
              />{' '}
              minutes
            </label>
          </div>
          {errorText('contract')}
        </fieldset>
        {editId !== null && (
          <div className="field wide">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={fields.active}
                onChange={(event) => set('active', event.target.checked)}
                disabled={isSelf}
                aria-describedby={isSelf ? `${formId}-self` : undefined}
              />
              Active (an inactive employee cannot sign in and is not scheduled)
            </label>
          </div>
        )}
        {isSelf && (
          <p className="hint wide" id={`${formId}-self`}>
            You cannot change your own role or deactivate your own account.
          </p>
        )}
        <div className="actions wide">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Saving…' : editId === null ? 'Add employee' : 'Save changes'}
          </button>
          <Link to="/employees">Cancel</Link>
        </div>
      </form>
      {editId !== null && <SetPasswordForm employeeId={editId} />}
    </>
  );
}
