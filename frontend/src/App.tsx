import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AuthBootstrap } from './components/auth/auth-bootstrap'
import { RequireAuth } from './components/auth/require-auth'
import { AppShell } from './components/layout/app-shell'
import { ArchivePage } from './pages/archive/archive-page'
import { LoginPage } from './pages/auth/login-page'
import { ChangePasswordPage } from './pages/auth/change-password-page'
import { ClassesPage } from './pages/classes/classes-page'
import { PrintSubmissionPage } from './pages/print/print-submission-page'
import { PrintTaskPage } from './pages/print/print-task-page'
import { StudentsPage } from './pages/students/students-page'
import { SubmissionPage } from './pages/submissions/submission-page'
import { NewTaskPage } from './pages/tasks/new-task-page'
import { TaskDetailPage } from './pages/tasks/task-detail-page'
import { TasksPage } from './pages/tasks/tasks-page'
import { TeachersPage } from './pages/teachers/teachers-page'
import { useAuthStore } from './stores/auth-store'

function AccountLayout() {
  const user = useAuthStore((state) => state.user)
  const { pathname } = useLocation()
  if (user?.mustChangePassword) {
    return pathname === '/change-password'
      ? <Outlet />
      : <Navigate replace to="/change-password" />
  }
  if (pathname.startsWith('/print/')) return <Outlet />
  return <AppShell><Outlet /></AppShell>
}

function TeachersRoute() {
  const role = useAuthStore((state) => state.user?.role)
  return role === 'ADMIN' ? <TeachersPage /> : <Navigate replace to="/tasks" />
}

function ProtectedApp() {
  return (
    <RequireAuth>
      <AuthBootstrap>
        <AccountLayout />
      </AuthBootstrap>
    </RequireAuth>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedApp />}>
        <Route path="/print/submissions/:id" element={<PrintSubmissionPage />} />
        <Route path="/print/tasks/:id" element={<PrintTaskPage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route path="/teachers" element={<TeachersRoute />} />
        <Route index element={<Navigate replace to="/tasks" />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/tasks/new" element={<NewTaskPage />} />
        <Route path="/tasks/:id" element={<TaskDetailPage />} />
        <Route path="/submissions/:id" element={<SubmissionPage />} />
        <Route path="/classes" element={<ClassesPage />} />
        <Route path="/students" element={<StudentsPage />} />
        <Route path="/archive" element={<ArchivePage />} />
      </Route>
    </Routes>
  )
}

export default App
