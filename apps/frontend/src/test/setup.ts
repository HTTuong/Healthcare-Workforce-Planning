import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  // The contract test runs in Node, where there is no browser storage.
  if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
});
