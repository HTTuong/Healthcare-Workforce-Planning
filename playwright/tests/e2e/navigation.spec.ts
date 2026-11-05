import { expect, test } from '../../fixtures/test';
import type { Role } from '../../api/types';
import { AppShell } from '../../pages/AppShell';

// The navigation each role sees (apps/frontend/src/auth/permissions.ts). The full page matrix by role is group G.
const NAV: Record<Role, string[]> = {
  ADMIN: ['Home', 'Schedules', 'Availability', 'Employees', 'Shifts'],
  PLANNER: ['Home', 'Schedules', 'Availability', 'Employees', 'Shifts'],
  MANAGER: ['Home', 'Schedules', 'Availability', 'Employees', 'Shifts'],
  EMPLOYEE: ['Home', 'Schedules', 'Availability']
};

test.describe('navigation by role', { tag: '@smoke' }, () => {
  for (const [role, links] of Object.entries(NAV) as Array<[Role, string[]]>) {
    test(`${role} sees ${links.join(', ')}`, async ({ signInAs }) => {
      const shell = new AppShell(await signInAs(role));
      expect(await shell.navLinks()).toEqual(links);
    });
  }
});
