import { test as setup } from '@playwright/test';
import { ApiClient } from '../../api/ApiClient';
import { credentials, TEST_USERS } from '../../factories/users';
import { env } from '../../utils/env';

// Runs once before the api and e2e projects. It brings the account of every role to a known state, so a test never
// depends on what an earlier run or a person left behind.
setup('test accounts exist with a known role, state and password', async ({ request }) => {
  const admin = await ApiClient.signIn(request, env.adminEmail, env.adminPassword);
  const existing = await admin.employees.list();
  for (const user of Object.values(TEST_USERS)) {
    const found = existing.find((employee) => employee.email === user.email);
    const body = { firstName: user.firstName, lastName: user.lastName, role: user.role };
    const employee = found
      ? await admin.employees.update(found.id, { ...body, active: true })
      : await admin.employees.create({ ...body, email: user.email });
    await admin.employees.setPassword(employee.id, credentials(user.role).password);
  }
});
