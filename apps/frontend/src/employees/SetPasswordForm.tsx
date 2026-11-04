import { type FormEvent, useId, useState } from 'react';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/auth-context';

// The API's limits for PUT /auth/password/:employeeId.
const MIN_LENGTH = 12;
const MAX_LENGTH = 128;

/** An admin sets the password of an employee, for example after creating the account. */
export function SetPasswordForm({ employeeId }: { employeeId: number }) {
  const { request } = useAuth();
  const id = useId();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDone(false);
    if (password.length < MIN_LENGTH || password.length > MAX_LENGTH) {
      setError(`A password has ${MIN_LENGTH} to ${MAX_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('The two passwords are not the same.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await request('PUT', `/auth/password/${employeeId}`, { password });
      setPassword('');
      setConfirm('');
      setDone(true);
    } catch (caught) {
      setError(caught instanceof ApiError && caught.status !== 0 && caught.status < 500 ? caught.message : 'The password could not be set. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="panel" onSubmit={handleSubmit} noValidate aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Set password</h2>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="success" role="status">
          The password was set. Give it to the employee in a safe way.
        </p>
      )}
      <div className="field">
        <label htmlFor={`${id}-new`}>New password</label>
        <input id={`${id}-new`} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-confirm`}>Repeat the password</label>
        <input id={`${id}-confirm`} type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
      </div>
      <button type="submit" className="secondary" disabled={saving}>
        {saving ? 'Setting…' : 'Set password'}
      </button>
    </form>
  );
}
