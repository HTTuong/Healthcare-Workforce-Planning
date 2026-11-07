import type { Department, Employee, Schedule, ScheduleStatus } from '../../api/types';
import { expect, test } from '../../fixtures/test';
import type { Factories } from '../../factories';
import { addDays } from '../../utils/helsinki';
import { WEEK } from '../../utils/test-week';

// Group F, the approval workflow (BR-W01 to BR-W04). The expected table below is written from docs/business-rules.md,
// not taken from schedule-workflow.ts, and every status is tried with every action.

type Action = 'generate' | 'submit' | 'approve' | 'reject' | 'publish' | 'add' | 'remove' | 'delete';
const STATUSES: ScheduleStatus[] = ['DRAFT', 'OPTIMIZED', 'REVIEW', 'APPROVED', 'PUBLISHED'];
const ACTIONS: Action[] = ['generate', 'submit', 'approve', 'reject', 'publish', 'add', 'remove', 'delete'];

/** Where each action is allowed and where it leads. Editing (add, remove, delete) only in DRAFT and OPTIMIZED (BR-W01). */
const ALLOWED: Record<Action, Partial<Record<ScheduleStatus, ScheduleStatus | 'GONE'>>> = {
  generate: { DRAFT: 'OPTIMIZED' },
  submit: { OPTIMIZED: 'REVIEW' },
  approve: { REVIEW: 'APPROVED' },
  reject: { REVIEW: 'DRAFT' },
  publish: { APPROVED: 'PUBLISHED' },
  add: { DRAFT: 'DRAFT', OPTIMIZED: 'DRAFT' },
  remove: { DRAFT: 'DRAFT', OPTIMIZED: 'DRAFT' },
  delete: { DRAFT: 'GONE', OPTIMIZED: 'GONE' }
};

/** The buttons each role should be offered, by status: planners plan, managers approve, an admin does both. */
const OFFERED: Record<'PLANNER' | 'MANAGER' | 'ADMIN', Record<ScheduleStatus, string[]>> = {
  PLANNER: { DRAFT: ['generate', 'edit'], OPTIMIZED: ['edit', 'submit'], REVIEW: [], APPROVED: [], PUBLISHED: [] },
  MANAGER: { DRAFT: [], OPTIMIZED: [], REVIEW: ['approve', 'reject'], APPROVED: ['publish'], PUBLISHED: [] },
  ADMIN: { DRAFT: ['generate', 'edit'], OPTIMIZED: ['edit', 'submit'], REVIEW: ['approve', 'reject'], APPROVED: ['publish'], PUBLISHED: [] }
};

interface Ward {
  department: Department;
  nurses: Employee[];
}

/** A ward whose weeks can each be scheduled without any violation: one morning a week, two nurses. */
async function ward(factories: Factories, weeks: number): Promise<Ward> {
  const department = await factories.departments.create();
  for (let w = 0; w < weeks; w++) await factories.shifts.create({ department, date: addDays(WEEK.monday, 7 * w) });
  const nurses = [await factories.employees.createEligibleEmployee({ department }), await factories.employees.createEligibleEmployee({ department })];
  return { department, nurses };
}

async function scheduleIn(factories: Factories, w: Ward, status: ScheduleStatus, week: number): Promise<Schedule> {
  const options = { department: w.department, start: addDays(WEEK.monday, 7 * week) };
  switch (status) {
    case 'DRAFT':
      return factories.schedules.create(options);
    case 'OPTIMIZED':
      return (await factories.schedules.createGenerated(options)).schedule;
    case 'REVIEW':
      return (await factories.schedules.createInReview(options)).schedule;
    case 'APPROVED':
      return (await factories.schedules.createApproved(options)).schedule;
    case 'PUBLISHED':
      return (await factories.schedules.createPublished(options)).schedule;
  }
}

test.describe('F: approval workflow (API)', { tag: '@groupF' }, () => {
  for (const status of STATUSES) {
    test(`T29-T31 every action on a ${status} schedule is allowed or refused as BR-W01 to BR-W03 say`, { tag: ['@T29', '@T30', '@T31'] }, async ({ api, factories }) => {
      const w = await ward(factories, ACTIONS.length);
      for (const [week, action] of ACTIONS.entries()) {
        const schedule = await scheduleIn(factories, w, status, week);
        const shiftId = (await api.PLANNER.get(`/shifts?departmentId=${w.department.id}`).then((r) => r.json()) as Array<{ id: number; startsAt: string }>)
          .find((s) => s.startsAt.startsWith(addDays(WEEK.monday, 7 * week)))!.id;
        const current = await api.ADMIN.schedules.get(schedule.id);
        const assigned = current.assignments!.find((a) => a.shiftId === shiftId);
        const free = w.nurses.find((n) => n.id !== assigned?.employeeId)!;
        const planner = action === 'approve' || action === 'reject' || action === 'publish' ? api.MANAGER : api.PLANNER;
        // remove needs an assignment: a DRAFT has none, so it gets one first, by hand, which keeps it a DRAFT.
        let removeId = assigned?.id;
        if (action === 'remove' && removeId === undefined && status === 'DRAFT') removeId = (await api.PLANNER.schedules.assign(schedule.id, shiftId, free.id)).id;
        const response = await {
          generate: () => planner.post(`/schedules/${schedule.id}/generate`),
          submit: () => planner.post(`/schedules/${schedule.id}/submit`),
          approve: () => planner.post(`/schedules/${schedule.id}/approve`),
          reject: () => planner.post(`/schedules/${schedule.id}/reject`),
          publish: () => planner.post(`/schedules/${schedule.id}/publish`),
          add: () => planner.post(`/schedules/${schedule.id}/assignments`, { shiftId, employeeId: free.id }),
          remove: () => planner.delete(`/schedules/${schedule.id}/assignments/${removeId ?? 2147483647}`),
          delete: () => planner.delete(`/schedules/${schedule.id}`)
        }[action]();

        const next = ALLOWED[action][status];
        const label = `${action} on ${status}`;
        if (next === undefined) {
          expect(response.status(), label).toBe(409);
          expect((await api.ADMIN.schedules.get(schedule.id)).status, `${label} leaves the status`).toBe(status);
        } else if (next === 'GONE') {
          expect(response.status(), label).toBe(204);
          expect((await api.ADMIN.get(`/schedules/${schedule.id}`)).status(), label).toBe(404);
        } else {
          expect(response.status(), label).toBeLessThan(300);
          expect((await api.ADMIN.schedules.get(schedule.id)).status, label).toBe(next);
        }
      }
    });
  }

  test('T29 each role is offered exactly the actions it may take in each status', { tag: '@T29' }, async ({ api, factories }) => {
    const w = await ward(factories, STATUSES.length);
    for (const [week, status] of STATUSES.entries()) {
      const schedule = await scheduleIn(factories, w, status, week);
      for (const role of ['PLANNER', 'MANAGER', 'ADMIN'] as const) {
        expect((await api[role].schedules.get(schedule.id)).actions!.sort(), `${role} on ${status}`).toEqual([...OFFERED[role][status]].sort());
      }
    }
  });

  test('T29 a planner cannot approve or publish, a manager cannot generate or submit (403)', { tag: '@T29' }, async ({ api, factories }) => {
    const w = await ward(factories, 2);
    const optimized = await scheduleIn(factories, w, 'OPTIMIZED', 0);
    const review = await scheduleIn(factories, w, 'REVIEW', 1);
    expect((await api.MANAGER.post(`/schedules/${optimized.id}/submit`)).status()).toBe(403);
    expect((await api.MANAGER.post(`/schedules/${optimized.id}/assignments`, { shiftId: 1, employeeId: 1 })).status()).toBe(403);
    expect((await api.PLANNER.post(`/schedules/${review.id}/approve`)).status()).toBe(403);
    expect((await api.PLANNER.post(`/schedules/${review.id}/reject`)).status()).toBe(403);
    expect((await api.EMPLOYEE.post(`/schedules/${review.id}/approve`)).status()).toBe(403);
    expect((await api.ADMIN.schedules.get(review.id)).status).toBe('REVIEW');
  });

  test('T31 parallel publishing: of 6 requests at the same moment exactly one succeeds, on each of 4 schedules', { tag: '@T31' }, async ({ api, factories }) => {
    const w = await ward(factories, 4);
    for (let week = 0; week < 4; week++) {
      const approved = await scheduleIn(factories, w, 'APPROVED', week);
      const clients = [api.MANAGER, api.ADMIN, api.MANAGER, api.ADMIN, api.MANAGER, api.ADMIN];
      const results = await Promise.all(clients.map((client) => client.post(`/schedules/${approved.id}/publish`)));
      expect(results.map((r) => r.status()).sort(), `week ${week}`).toEqual([200, 409, 409, 409, 409, 409]);
      expect((await api.ADMIN.schedules.get(approved.id)).status).toBe('PUBLISHED');
    }
  });

  test('T31 approve and send back at the same moment: exactly one wins and the status matches it', { tag: '@T31' }, async ({ api, factories }) => {
    const w = await ward(factories, 1);
    const review = await scheduleIn(factories, w, 'REVIEW', 0);
    const [approve, reject] = await Promise.all([api.MANAGER.post(`/schedules/${review.id}/approve`), api.ADMIN.post(`/schedules/${review.id}/reject`)]);
    expect([approve.status(), reject.status()].sort()).toEqual([200, 409]);
    expect((await api.ADMIN.schedules.get(review.id)).status).toBe(approve.status() === 200 ? 'APPROVED' : 'DRAFT');
  });

  test('PINNED four-eyes: an admin can submit and approve the same schedule alone (open question in architecture.md)', { tag: '@T31' }, async ({ api, factories }) => {
    // Records today's behavior on purpose. When approval by someone other than the submitter is required, this test
    // fails and changes to expect 409 together with the fix.
    const w = await ward(factories, 1);
    const optimized = await scheduleIn(factories, w, 'OPTIMIZED', 0);
    await api.ADMIN.schedules.step(optimized.id, 'submit');
    expect((await api.ADMIN.post(`/schedules/${optimized.id}/approve`)).status()).toBe(200);
  });

  test('T32 a published schedule is seen by its ward and by staff from elsewhere on it, each with only their own shifts (BR-W04)', { tag: '@T32' }, async ({ api, factories, signInAsEmployee }) => {
    const [ward, elsewhere] = [await factories.departments.create(), await factories.departments.create()];
    const shifts = [await factories.shifts.create({ department: ward, date: WEEK.monday }), await factories.shifts.create({ department: ward, date: WEEK.tuesday })];
    const nurse = await factories.employees.createEligibleEmployee({ department: ward });
    const colleague = await factories.employees.createEligibleEmployee({ department: ward });
    const float = await factories.employees.createEligibleEmployee({ department: elsewhere });
    const stranger = await factories.employees.createEligibleEmployee({ department: elsewhere });
    // The float nurse joins by hand on Tuesday, the engine fills Monday.
    const draft = await factories.schedules.create({ department: ward, start: WEEK.monday });
    await api.PLANNER.schedules.assign(draft.id, shifts[1]!.id, float.id);
    await api.PLANNER.schedules.generate(draft.id);
    await api.PLANNER.schedules.step(draft.id, 'submit');
    const id = draft.id;
    const as = { nurse: await signInAsEmployee(nurse), colleague: await signInAsEmployee(colleague), float: await signInAsEmployee(float), stranger: await signInAsEmployee(stranger) };

    // Before publishing nobody but staff sees it: not in review, not approved.
    for (const client of Object.values(as)) expect((await client.get(`/schedules/${id}`)).status()).toBe(404);
    await api.MANAGER.schedules.step(id, 'approve');
    for (const client of Object.values(as)) expect((await client.get(`/schedules/${id}`)).status()).toBe(404);

    await api.MANAGER.schedules.step(id, 'publish');
    const monday = (await api.PLANNER.schedules.get(id)).assignments!.find((a) => a.shiftId === shifts[0]!.id)!;
    const seen = async (client: typeof as.nurse) => (await client.schedules.get(id)).assignments!.map((a) => [a.shiftId, a.employeeId]);
    const own = (employee: Employee) => (monday.employeeId === employee.id ? [[shifts[0]!.id, employee.id]] : []);
    expect(await seen(as.nurse)).toEqual(own(nurse));
    expect(await seen(as.colleague)).toEqual(own(colleague));
    expect(await seen(as.float)).toEqual([[shifts[1]!.id, float.id]]);
    expect((await as.stranger.get(`/schedules/${id}`)).status()).toBe(404);
    expect((await as.float.schedules.get(id)).actions).toEqual([]);
    // Their list holds the schedule, and only published ones.
    const list = (await (await as.colleague.get('/schedules')).json()) as Schedule[];
    expect(list.map((s) => s.id)).toContain(id);
    expect(list.every((s) => s.status === 'PUBLISHED')).toBe(true);
  });
});
