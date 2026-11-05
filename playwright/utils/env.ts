// Settings come from the environment, or from playwright/.env (see .env.example). Missing secrets stop the run at
// once with a clear message, instead of failing later as a 401 in some test.

import { join } from 'node:path';

try {
  process.loadEnvFile(join(__dirname, '..', '.env'));
} catch {
  // No .env file: the environment alone is used.
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Copy playwright/.env.example to playwright/.env and fill it in.`);
  return value;
}

export const env = {
  apiUrl: process.env.API_URL ?? 'http://localhost:3000',
  uiUrl: process.env.UI_URL ?? 'http://localhost:5173',
  get adminEmail() {
    return required('ADMIN_EMAIL');
  },
  get adminPassword() {
    return required('ADMIN_PASSWORD');
  },
  testPassword: process.env.E2E_PASSWORD ?? 'E2e-Password-123!'
};
