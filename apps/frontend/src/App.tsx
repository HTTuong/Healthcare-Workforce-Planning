import { Navigate, Route, Routes } from 'react-router';
import { AvailabilityPage } from './availability/AvailabilityPage';
import { RequireAuth } from './auth/RequireAuth';
import { RequirePermission } from './auth/RequirePermission';
import { EmployeeFormPage } from './employees/EmployeeFormPage';
import { EmployeesPage } from './employees/EmployeesPage';
import { AppLayout } from './layout/AppLayout';
import { ShiftFormPage } from './shifts/ShiftFormPage';
import { ShiftsPage } from './shifts/ShiftsPage';
import { HomePage } from './pages/HomePage';
import { ScheduleViewPage } from './schedules/ScheduleViewPage';
import { NewSchedulePage } from './schedules/NewSchedulePage';
import { SchedulesPage } from './schedules/SchedulesPage';
import { LoginPage } from './pages/LoginPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route element={<RequirePermission permission="availability.own" />}>
            <Route path="/availability" element={<AvailabilityPage />} />
          </Route>
          <Route element={<RequirePermission permission="schedules.read" />}>
            <Route path="/schedules" element={<SchedulesPage />} />
            <Route path="/schedules/:id" element={<ScheduleViewPage />} />
          </Route>
          <Route element={<RequirePermission permission="schedules.manage" />}>
            <Route path="/schedules/new" element={<NewSchedulePage />} />
          </Route>
          <Route element={<RequirePermission permission="employees.read" />}>
            <Route path="/employees" element={<EmployeesPage />} />
          </Route>
          <Route element={<RequirePermission permission="employees.manage" />}>
            <Route path="/employees/new" element={<EmployeeFormPage />} />
            <Route path="/employees/:id/edit" element={<EmployeeFormPage />} />
          </Route>
          <Route element={<RequirePermission permission="shifts.read" />}>
            <Route path="/shifts" element={<ShiftsPage />} />
          </Route>
          <Route element={<RequirePermission permission="shifts.manage" />}>
            <Route path="/shifts/new" element={<ShiftFormPage />} />
            <Route path="/shifts/:id/edit" element={<ShiftFormPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
