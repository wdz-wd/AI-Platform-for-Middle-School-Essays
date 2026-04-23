import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthBootstrap } from './components/auth/auth-bootstrap'
import { RequireAuth } from './components/auth/require-auth'
import { AppShell } from './components/layout/app-shell'
import { ArchivePage } from './pages/archive/archive-page'
import { LoginPage } from './pages/auth/login-page'
import { ClassesPage } from './pages/classes/classes-page'
import { PrintSubmissionPage } from './pages/print/print-submission-page'
import { PrintTaskPage } from './pages/print/print-task-page'
import { StudentsPage } from './pages/students/students-page'
import { SubmissionPage } from './pages/submissions/submission-page'
import { NewTaskPage } from './pages/tasks/new-task-page'
import { TaskDetailPage } from './pages/tasks/task-detail-page'
import { TasksPage } from './pages/tasks/tasks-page'

function ProtectedApp() {
  return (
    <RequireAuth>
      <AuthBootstrap>
        <AppShell>
          <Outlet />
        </AppShell>
      </AuthBootstrap>
    </RequireAuth>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/print/submissions/:id" element={<PrintSubmissionPage />} />
      <Route path="/print/tasks/:id" element={<PrintTaskPage />} />
      <Route element={<ProtectedApp />}>
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
