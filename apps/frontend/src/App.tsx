import { Navigate, Route, Routes } from 'react-router';
import { AvailabilityPage } from './availability/AvailabilityPage';
import { RequireAuth } from './auth/RequireAuth';
import { RequireRole } from './auth/RequireRole';
import { SCHEDULING_ROLES, STAFF_ROLES } from './auth/roles';
import { EmployeeFormPage } from './employees/EmployeeFormPage';
import { EmployeesPage } from './employees/EmployeesPage';
import { AppLayout } from './layout/AppLayout';
import { ShiftFormPage } from './shifts/ShiftFormPage';
import { ShiftsPage } from './shifts/ShiftsPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/availability" element={<AvailabilityPage />} />
          <Route element={<RequireRole roles={STAFF_ROLES} />}>
            <Route path="/employees" element={<EmployeesPage />} />
            <Route path="/shifts" element={<ShiftsPage />} />
          </Route>
          <Route element={<RequireRole roles={['ADMIN']} />}>
            <Route path="/employees/new" element={<EmployeeFormPage />} />
            <Route path="/employees/:id/edit" element={<EmployeeFormPage />} />
          </Route>
          <Route element={<RequireRole roles={SCHEDULING_ROLES} />}>
            <Route path="/shifts/new" element={<ShiftFormPage />} />
            <Route path="/shifts/:id/edit" element={<ShiftFormPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
