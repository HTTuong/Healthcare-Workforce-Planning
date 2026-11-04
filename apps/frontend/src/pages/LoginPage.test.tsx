import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fakeApi, NOORA, sent } from '../test/fake-api';
import { renderApp } from '../test/render-app';

const TOKEN = 'header.payload.signature';
const signedIn = {
  'POST /api/auth/login': { status: 200, body: { accessToken: TOKEN } },
  'GET /api/auth/me': { status: 200, body: NOORA },
  'GET /api/departments/3': { status: 200, body: { id: 3, name: 'Ward 3B' } }
};

async function signIn(email: string, password: string) {
  const user = userEvent.setup();
  if (email) await user.type(screen.getByLabelText('Email'), email);
  if (password) await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  return user;
}

describe('login page', () => {
  it('signs in with the real API contract and shows who is signed in', async () => {
    const fetchMock = fakeApi(signedIn);
    renderApp('/login');
    await signIn('  Noora@Example.com ', 'Correct-Password-1');
    expect(await screen.findByRole('heading', { name: 'Welcome, Noora' })).toBeInTheDocument();
    expect(screen.getByText('Employee', { selector: '.role-badge' })).toBeInTheDocument();
    expect(await screen.findByText('Ward 3B')).toBeInTheDocument();
    expect(sent(fetchMock, 0).body).toEqual({ email: 'Noora@Example.com', password: 'Correct-Password-1' });
    expect(sent(fetchMock, 1).headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(sessionStorage.getItem('hwp.accessToken')).toBe(TOKEN);
  });

  it('asks for both fields without calling the API', async () => {
    const fetchMock = fakeApi({});
    renderApp('/login');
    await signIn('', '');
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Enter your email address.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an email without @ before calling the API', async () => {
    const fetchMock = fakeApi({});
    renderApp('/login');
    await signIn('noora.example.com', 'x');
    expect(screen.getByText('Enter an email address like name@example.com.')).toBeInTheDocument();
    expect(screen.queryByText('Enter your password.')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows one message for a wrong login, clears the password and stores nothing', async () => {
    fakeApi({ 'POST /api/auth/login': { status: 401, body: { statusCode: 401, message: 'Invalid email or password' } } });
    renderApp('/login');
    await signIn('noora@example.com', 'wrong-password');
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.getByLabelText('Email')).toHaveValue('noora@example.com');
    expect(sessionStorage.getItem('hwp.accessToken')).toBeNull();
  });

  it('explains a server that is down or failing', async () => {
    fakeApi({ 'POST /api/auth/login': { status: 500, body: { statusCode: 500, message: 'Internal server error' } } });
    renderApp('/login');
    await signIn('noora@example.com', 'x');
    expect(await screen.findByRole('alert')).toHaveTextContent('The server could not sign you in. Try again in a moment.');
  });

  it('disables the form while the request runs', async () => {
    let release!: () => void;
    fakeApi({
      ...signedIn,
      'POST /api/auth/login': () =>
        new Promise((resolve) => {
          release = () => resolve({ status: 200, body: { accessToken: TOKEN } });
        })
    });
    renderApp('/login');
    await signIn('noora@example.com', 'x');
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
    expect(screen.getByLabelText('Email')).toBeDisabled();
    release();
    expect(await screen.findByRole('heading', { name: 'Welcome, Noora' })).toBeInTheDocument();
  });

  it('sends a signed out visitor to the login page and back to the page they asked for', async () => {
    fakeApi(signedIn);
    renderApp('/');
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    await signIn('noora@example.com', 'x');
    expect(await screen.findByRole('heading', { name: 'Welcome, Noora' })).toBeInTheDocument();
  });
});

describe('session', () => {
  it('restores the session after a reload from the stored token', async () => {
    sessionStorage.setItem('hwp.accessToken', TOKEN);
    const fetchMock = fakeApi(signedIn);
    renderApp('/');
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(await screen.findByRole('heading', { name: 'Welcome, Noora' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).not.toContain('/api/auth/login');
  });

  it('drops a stored token that the API refuses and says the session ended', async () => {
    sessionStorage.setItem('hwp.accessToken', 'expired-token');
    fakeApi({ 'GET /api/auth/me': { status: 401, body: { message: 'This account is not active' } } });
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Your session has ended. Sign in again.');
    expect(sessionStorage.getItem('hwp.accessToken')).toBeNull();
  });

  it('keeps the token when the server cannot be reached on reload', async () => {
    sessionStorage.setItem('hwp.accessToken', TOKEN);
    fakeApi({ 'GET /api/auth/me': () => Promise.reject(new TypeError('Failed to fetch')) });
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(sessionStorage.getItem('hwp.accessToken')).toBe(TOKEN);
  });

  it('ends the session when a later request gets 401, for example after deactivation', async () => {
    fakeApi({ ...signedIn, 'GET /api/departments/3': { status: 401, body: { message: 'This account is not active' } } });
    renderApp('/login');
    await signIn('noora@example.com', 'x');
    expect(await screen.findByText('Your session has ended. Sign in again.')).toBeInTheDocument();
    expect(sessionStorage.getItem('hwp.accessToken')).toBeNull();
  });

  it('signs out and forgets the token', async () => {
    fakeApi(signedIn);
    renderApp('/login');
    const user = await signIn('noora@example.com', 'x');
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await waitFor(() => expect(sessionStorage.getItem('hwp.accessToken')).toBeNull());
  });

  it('sends a signed in user away from the login page', async () => {
    sessionStorage.setItem('hwp.accessToken', TOKEN);
    fakeApi(signedIn);
    renderApp('/login');
    expect(await screen.findByRole('heading', { name: 'Welcome, Noora' })).toBeInTheDocument();
  });

  it('shows "No department" for a user without one, without asking the API', async () => {
    const fetchMock = fakeApi({ ...signedIn, 'GET /api/auth/me': { status: 200, body: { ...NOORA, departmentId: null } } });
    renderApp('/login');
    await signIn('noora@example.com', 'x');
    expect(await screen.findByText('No department')).toBeInTheDocument();
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual(['/api/auth/login', '/api/auth/me']);
  });
});
