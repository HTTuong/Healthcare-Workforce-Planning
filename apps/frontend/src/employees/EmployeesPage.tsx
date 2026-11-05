import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../auth/auth-context';
import { can } from '../auth/permissions';
import { ROLE_LABELS, type Role } from '../auth/types';
import { usePageTitle } from '../layout/usePageTitle';
import { formatContract } from './contract';
import type { Department, Employee } from './types';

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; employees: Employee[]; departments: Department[] };

/** Every employee, with search and role filter. Admins also get the create and edit links. */
export function EmployeesPage() {
  const { state, request } = useAuth();
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice;
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [showInactive, setShowInactive] = useState(true);
  usePageTitle('Employees');

  const fetchAll = useCallback(() => {
    Promise.all([request<Employee[]>('GET', '/employees'), request<Department[]>('GET', '/departments')])
      .then(([employees, departments]) => setLoad({ status: 'ready', employees, departments }))
      .catch((error: unknown) =>
        setLoad({ status: 'error', message: error instanceof Error ? error.message : 'The employees could not be loaded.' })
      );
  }, [request]);

  useEffect(fetchAll, [fetchAll]);

  const rows = useMemo(() => {
    if (load.status !== 'ready') return [];
    const term = search.trim().toLowerCase();
    return load.employees.filter(
      (employee) =>
        (role === '' || employee.role === role) &&
        (showInactive || employee.active) &&
        (term === '' || `${employee.firstName} ${employee.lastName} ${employee.email}`.toLowerCase().includes(term))
    );
  }, [load, search, role, showInactive]);

  if (state.status !== 'signed-in') return null;
  const manage = can(state.user.role, 'employees.manage');
  const departmentName = (id: number | null) =>
    id === null ? '-' : (load.status === 'ready' && load.departments.find((d) => d.id === id)?.name) || `#${id}`;

  return (
    <>
      <div className="page-header">
        <h1>Employees</h1>
        {manage && (
          <Link className="button primary" to="/employees/new">
            New employee
          </Link>
        )}
      </div>
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      <div className="filters">
        <label>
          Search
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or email" />
        </label>
        <label>
          Role
          <select value={role} onChange={(event) => setRole(event.target.value as Role | '')}>
            <option value="">All roles</option>
            {(Object.keys(ROLE_LABELS) as Role[]).map((value) => (
              <option key={value} value={value}>
                {ROLE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
          Show inactive
        </label>
      </div>

      {load.status === 'loading' && (
        <p className="page-status" role="status">
          Loading employees…
        </p>
      )}
      {load.status === 'error' && (
        <div className="form-error" role="alert">
          <p>{load.message}</p>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setLoad({ status: 'loading' });
              fetchAll();
            }}
          >
            Try again
          </button>
        </div>
      )}
      {load.status === 'ready' && (
        <>
          <p className="count">
            {rows.length} of {load.employees.length} employees
          </p>
          {rows.length === 0 ? (
            <p className="page-status">No employees match the filters.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Email</th>
                    <th scope="col">Role</th>
                    <th scope="col">Department</th>
                    <th scope="col">Contract per week</th>
                    <th scope="col">Status</th>
                    {manage && (
                      <th scope="col">
                        <span className="visually-hidden">Actions</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((employee) => (
                    <tr key={employee.id}>
                      <td>
                        {employee.firstName} {employee.lastName}
                      </td>
                      <td>{employee.email}</td>
                      <td>{ROLE_LABELS[employee.role]}</td>
                      <td>{departmentName(employee.departmentId)}</td>
                      <td>{formatContract(employee.contractMinutesPerWeek)}</td>
                      <td>
                        <span className={employee.active ? 'status active' : 'status inactive'}>
                          {employee.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      {manage && (
                        <td>
                          <Link to={`/employees/${employee.id}/edit`} aria-label={`Edit ${employee.firstName} ${employee.lastName}`}>
                            Edit
                          </Link>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
