export const ROLE_NAMES = ['ADMIN', 'PLANNER', 'MANAGER', 'EMPLOYEE'] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

// What we keep from a verified token. Any other claim is ignored.
export interface AuthUser {
  sub: number;
  role: RoleName;
}

// The only parts of the HTTP request the guards need, so unit tests can use plain objects.
export interface AuthRequest {
  headers: { authorization?: string };
  user?: AuthUser;
}