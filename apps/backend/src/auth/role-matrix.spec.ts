import { RequestMethod } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { AppController } from '../app.controller.js';
import { AvailabilitiesController } from '../availabilities/availabilities.controller.js';
import { DepartmentsController } from '../departments/departments.controller.js';
import { EmployeesController } from '../employees/employees.controller.js';
import { QualificationsController } from '../qualifications/qualifications.controller.js';
import { ShiftsController } from '../shifts/shifts.controller.js';
import { StaffingRequirementsController } from '../staffing-requirements/staffing-requirements.controller.js';
import { AuthController } from './auth.controller.js';
import type { RoleName } from './auth.types.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { ANY_ROLE, SCHEDULING_ROLES, STAFF_ROLES } from './role-sets.js';
import { ROLES_KEY } from './roles.decorator.js';

const controllers = [
  AppController,
  AuthController,
  DepartmentsController,
  StaffingRequirementsController,
  QualificationsController,
  EmployeesController,
  ShiftsController,
  AvailabilitiesController
];

const reflector = new Reflector();

// Reads the real decorators of every controller and returns "METHOD /path" -> allowed roles.
function readRoutes(): Record<string, string> {
  const routes: Record<string, string> = {};
  for (const controller of controllers) {
    const base = reflector.get<string>('path', controller);
    for (const name of Object.getOwnPropertyNames(controller.prototype)) {
      const handler = (controller.prototype as unknown as Record<string, () => void>)[name];
      if (name === 'constructor' || typeof handler !== 'function') continue;
      const method = reflector.get<number | undefined>('method', handler);
      if (method === undefined) continue;
      const segments = [base, reflector.get<string>('path', handler)].filter((part) => part && part !== '/');
      const route = `${RequestMethod[method]} /${segments.join('/')}`;
      const targets = [handler, controller];
      const isPublic = reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets);
      const roles = reflector.getAllAndOverride<RoleName[] | undefined>(ROLES_KEY, targets);
      routes[route] = isPublic ? 'PUBLIC' : roles ? roles.join(',') : 'UNDECLARED';
    }
  }
  return routes;
}

const ANY = ANY_ROLE.join(',');
const STAFF = STAFF_ROLES.join(',');
const SCHEDULING = SCHEDULING_ROLES.join(',');
const staffing = '/departments/:departmentId/staffing-requirements';

// The permission table from architecture.md, written once as data. A new route must be added here.
const expected: Record<string, string> = {
  'GET /': 'PUBLIC',
  'POST /auth/login': 'PUBLIC',
  'GET /auth/me': ANY,
  'PUT /auth/password/:employeeId': 'ADMIN',
  'GET /departments': ANY,
  'GET /departments/:id': ANY,
  'POST /departments': 'ADMIN',
  'PATCH /departments/:id': 'ADMIN',
  'DELETE /departments/:id': 'ADMIN',
  [`GET ${staffing}`]: STAFF,
  [`PUT ${staffing}/:shiftType`]: SCHEDULING,
  [`DELETE ${staffing}/:shiftType`]: SCHEDULING,
  'GET /qualifications': ANY,
  'POST /qualifications': 'ADMIN',
  'GET /employees': STAFF,
  'GET /employees/:id': STAFF,
  'POST /employees': 'ADMIN',
  'PATCH /employees/:id': 'ADMIN',
  'PUT /employees/:id/qualifications/:qualificationId': 'ADMIN',
  'DELETE /employees/:id/qualifications/:qualificationId': 'ADMIN',
  'GET /shifts': STAFF,
  'GET /shifts/:id': STAFF,
  'POST /shifts': SCHEDULING,
  'PATCH /shifts/:id': SCHEDULING,
  'DELETE /shifts/:id': SCHEDULING,
  'PUT /shifts/:id/requirements/:qualificationId': SCHEDULING,
  'DELETE /shifts/:id/requirements/:qualificationId': SCHEDULING,
  'GET /availabilities': ANY,
  'POST /availabilities': ANY,
  'PATCH /availabilities/:id': ANY,
  'DELETE /availabilities/:id': ANY
};

describe('role matrix', () => {
  it('declares a policy for every route, so none is closed by accident or open by mistake', () => {
    const undeclared = Object.entries(readRoutes()).filter(([, policy]) => policy === 'UNDECLARED');
    expect(undeclared).toEqual([]);
  });

  it('matches the permission table exactly', () => {
    expect(readRoutes()).toEqual(expected);
  });
});
