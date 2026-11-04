// The access token lives in sessionStorage: it survives a page reload but not closing the tab, and it is not sent
// with every request like a cookie. The trade-off is that a script injected into the page could read it, so the UI
// must never render untrusted HTML. Storage can be unavailable (private mode, blocked site data), so every access
// is guarded and the app then simply keeps the user signed in until the page reloads.

const KEY = 'hwp.accessToken';
let memoryToken: string | null = null;

export function getToken(): string | null {
  try {
    // When storage works it is the only source, so clearing it (or a test that clears it) signs the user out.
    return sessionStorage.getItem(KEY);
  } catch {
    return memoryToken;
  }
}

export function setToken(token: string): void {
  memoryToken = token;
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    // Kept in memory only.
  }
}

export function clearToken(): void {
  memoryToken = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
}
