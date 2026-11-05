import { type FormEvent, useId, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/auth-context';
import { usePageTitle } from '../layout/usePageTitle';

interface FieldErrors {
  email?: string;
  password?: string;
}

/** The messages the user sees. The API gives one message for every wrong login, so the UI does too. */
export function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return error.message;
    if (error.status === 401) return 'Email or password is incorrect.';
    if (error.status >= 500) return 'The server could not sign you in. Try again in a moment.';
    return error.message;
  }
  return 'Something went wrong. Try again.';
}

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (email.trim() === '') errors.email = 'Enter your email address.';
  else if (!/^[^\s@]+@[^\s@]+$/.test(email.trim())) errors.email = 'Enter an email address like name@example.com.';
  if (password === '') errors.password = 'Enter your password.';
  return errors;
}

export function LoginPage() {
  const { state, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const id = useId();
  usePageTitle('Sign in');

  if (state.status === 'signed-in') return <Navigate to={from} replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validate(email, password);
    setFieldErrors(errors);
    setFormError(null);
    if (errors.email || errors.password) return;
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (error) {
      setFormError(loginErrorMessage(error));
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  }

  const notice = state.status === 'signed-out' && state.notice === 'expired' && !formError;

  return (
    <main className="login">
      <section className="login-card" aria-labelledby={`${id}-title`}>
        <p className="brand">Healthcare Workforce Planning</p>
        <h1 id={`${id}-title`}>Sign in</h1>
        {notice && (
          <p className="notice" role="status">
            Your session has ended. Sign in again.
          </p>
        )}
        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}
        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor={`${id}-email`}>Email</label>
            <input
              id={`${id}-email`}
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? `${id}-email-error` : undefined}
              disabled={submitting}
            />
            {fieldErrors.email && (
              <p className="field-error" id={`${id}-email-error`}>
                {fieldErrors.email}
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor={`${id}-password`}>Password</label>
            <input
              id={`${id}-password`}
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={fieldErrors.password ? `${id}-password-error` : undefined}
              disabled={submitting}
            />
            {fieldErrors.password && (
              <p className="field-error" id={`${id}-password-error`}>
                {fieldErrors.password}
              </p>
            )}
          </div>
          <button type="submit" className="primary" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="hint">Accounts are created by an administrator.</p>
      </section>
    </main>
  );
}
