import { useAuth } from './auth-context';
import { can, type PermissionName } from './permissions';

/** Whether the signed in user has the permission. False while nobody is signed in. */
export function useCan(permission: PermissionName): boolean {
  const { state } = useAuth();
  return state.status === 'signed-in' && can(state.user.role, permission);
}
