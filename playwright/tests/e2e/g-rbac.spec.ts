import type { Role } from '../../api/types';
import { expect, test } from '../../fixtures/test';

// Group G in the browser: each role sees the navigation of its permissions, and a page it may not use is closed
// without asking the API for its data. The API refuses those calls anyway (tests/api/g-rbac.spec.ts).

const NAV: Record<Role, string[]> = {
  ADMIN: ['Home', 'Schedules', 'Availability', 'Employees', 'Shifts'],
  PLANNER: ['Home', 'Schedules', 'Availability', 'Employees', 'Shifts'],
  MANAGER: ['Home', 'Schedules', 'Availability', 'Employees', 'Shifts'],
  EMPLOYEE: ['Home', 'Schedules', 'Availability']
};
const CLOSED: Record<Role, string[]> = {
  ADMIN: [],
  PLANNER: ['/employees/new'],
  MANAGER: ['/employees/new', '/shifts/new', '/schedules/new'],
  EMPLOYEE: ['/employees', '/employees/new', '/shifts', '/shifts/new', '/schedules/new']
};

test.describe('G: role based access (UI)', { tag: '@groupG' }, () => {
  for (const role of ['ADMIN', 'PLANNER', 'MANAGER', 'EMPLOYEE'] as const) {
    test(`T33-T36 ${role} sees its navigation, and its closed pages ask the API for nothing`, { tag: '@T36' }, async ({ signInAs }) => {
      const page = await signInAs(role, '/');
      await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveText(NAV[role]);
      for (const path of CLOSED[role]) {
        const asked: string[] = [];
        const listen = (request: { url: () => string }) => {
          const url = new URL(request.url());
          if (url.pathname.startsWith('/api/') && url.pathname !== '/api/auth/me') asked.push(url.pathname);
        };
        page.on('request', listen);
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 }), path).toHaveText('No access');
        page.off('request', listen);
        expect(asked, `${role} on ${path}`).toEqual([]);
      }
    });
  }
});
