import { expect, test } from '../../fixtures/test';
import { ShiftFormPage } from '../../pages/ShiftFormPage';
import { WEEK } from '../../utils/test-week';

// Group C in the browser: a planner manages shifts through the form.

test.describe('C: shift management (UI)', { tag: '@groupC' }, () => {
  test('T12 a planner adds a night shift with a required qualification', { tag: '@T12' }, async ({ api, factories, signInAs }) => {
    const department = await factories.departments.create();
    const permit = await factories.qualifications.create();
    const page = await signInAs('PLANNER', `/shifts/new?department=${department.id}`);
    const form = new ShiftFormPage(page);
    await expect(form.department).toHaveValue(String(department.id));
    await form.type.selectOption('NIGHT');
    await expect(form.start).toHaveValue('22:00');
    await form.date.fill(WEEK.monday);
    await form.end.fill('07:30');
    await expect(form.summary).toHaveText('Ends Tue 4 Mar 2031 at 07:30. Length 9 h 30 min.');
    await form.headcount.fill('2');
    await form.addQualification.click();
    await form.requirement(1).qualification.selectOption({ label: `${permit.code} ${permit.name}` });
    await form.add.click();

    await expect(page.getByRole('status').filter({ hasText: 'was added' })).toHaveText('Night shift on Mon 3 Mar 2031 was added.');
    await expect(page.getByRole('link', { name: 'Edit Night shift on Mon 3 Mar 2031' })).toBeVisible();
    expect(await api.PLANNER.shifts.list(department.id)).toEqual([
      expect.objectContaining({
        type: 'NIGHT',
        startsAt: '2031-03-03T20:00:00.000Z',
        endsAt: '2031-03-04T05:30:00.000Z',
        requiredHeadcount: 2,
        requirements: [expect.objectContaining({ qualificationId: permit.id, count: 1 })]
      })
    ]);
  });

  test('T13 a planner raises the headcount of a shift and the list shows it', { tag: '@T13' }, async ({ api, factories, signInAs }) => {
    const department = await factories.departments.create();
    const shift = await factories.shifts.create({ department, date: WEEK.tuesday, type: 'EVENING' });
    const page = await signInAs('PLANNER', `/shifts/${shift.id}/edit`);
    const form = new ShiftFormPage(page);
    await expect(form.department).toBeDisabled();
    await form.headcount.fill('4');
    await form.save.click();
    await expect(page.getByRole('status').filter({ hasText: 'was saved' })).toHaveText('Evening shift on Tue 4 Mar 2031 was saved.');
    expect(await api.PLANNER.shifts.get(shift.id)).toMatchObject({ requiredHeadcount: 4, startsAt: shift.startsAt, endsAt: shift.endsAt });
  });

  test('T14 deleting a shift of a published schedule is refused with the reason, and the shift stays (R-WF-02)', { tag: '@T14' }, async ({ api, factories, signInAs }) => {
    const department = await factories.departments.create();
    const shift = await factories.shifts.create({ department, date: WEEK.monday });
    await factories.employees.createEligibleEmployee({ department });
    const { schedule } = await factories.schedules.createPublished({ department, start: WEEK.monday });
    const page = await signInAs('PLANNER', `/shifts/${shift.id}/edit`);
    const form = new ShiftFormPage(page);
    await form.delete.click();
    await form.confirmDelete.click();
    await expect(form.alert).toHaveText(
      `Shift ${shift.id} is part of schedule ${schedule.id}, which is PUBLISHED. Only DRAFT and OPTIMIZED schedules can change (BR-W01)`
    );
    expect(await api.PLANNER.shifts.get(shift.id)).toMatchObject({ id: shift.id });
    expect((await api.PLANNER.schedules.get(schedule.id)).assignments).toHaveLength(1);
  });
});
