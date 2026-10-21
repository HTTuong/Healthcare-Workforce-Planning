import { SetMetadata } from '@nestjs/common';
import type { RoleName } from './auth.types.js';

export const ROLES_KEY = 'roles';

// Lists the roles allowed to call an endpoint. A method level decorator overrides a class level one.
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);