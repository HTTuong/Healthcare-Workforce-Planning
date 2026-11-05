import { Outlet } from 'react-router';
import { usePageTitle } from '../layout/usePageTitle';
import type { PermissionName } from './permissions';
import { useCan } from './useCan';

function NoAccess() {
  usePageTitle('No access');
  return (
    <section>
      <h1>No access</h1>
      <p>Your role cannot open this page.</p>
    </section>
  );
}

/** Shows the page only with the permission. Others see a plain message instead of a broken page full of 403s. */
export function RequirePermission({ permission }: { permission: PermissionName }) {
  return useCan(permission) ? <Outlet /> : <NoAccess />;
}
