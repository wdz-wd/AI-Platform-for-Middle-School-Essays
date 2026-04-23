import {
  BookOpenText,
  FolderArchive,
  LayoutDashboard,
  School,
  Users,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/auth-store'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'

const navItems = [
  { to: '/tasks', label: '作文任务', icon: LayoutDashboard },
  { to: '/archive', label: '作文档案', icon: FolderArchive },
  { to: '/classes', label: '班级管理', icon: School },
  { to: '/students', label: '学生管理', icon: Users },
]

export function AppShell({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user)
  const clearSession = useAuthStore((state) => state.clearSession)
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-transparent">
      <div className="min-h-screen lg:pl-[304px]">
        <aside className="border-stone-200 bg-white/95 p-6 shadow-panel backdrop-blur lg:fixed lg:left-0 lg:top-0 lg:z-30 lg:h-screen lg:w-[280px] lg:border-r">
          <div className="mb-8">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
                <BookOpenText className="size-6" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-stone-400">
                  Essay MVP
                </p>
                <h1 className="text-xl font-bold text-ink">作文批改平台</h1>
              </div>
            </div>
            <div className="mt-6 rounded-2xl bg-stone-50 p-4">
              <p className="text-sm font-semibold text-ink">
                {user?.displayName ?? '未登录'}
              </p>
              <p className="mt-1 text-xs text-stone-500">
                {user?.role === 'ADMIN' ? '管理员' : '教师工作台'}
              </p>
            </div>
          </div>

          <nav className="space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition',
                    isActive
                      ? 'bg-accent text-white'
                      : 'text-stone-600 hover:bg-stone-100 hover:text-ink',
                  )
                }
              >
                <item.icon className="size-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <Button
            className="mt-8 w-full"
            variant="secondary"
            onClick={() => {
              clearSession()
              navigate('/login')
            }}
          >
            退出登录
          </Button>
        </aside>

        <div className="p-4">
          <main className="mx-auto min-h-[calc(100vh-2rem)] max-w-[1600px] rounded-[28px] border border-stone-200 bg-white/80 p-6 shadow-panel backdrop-blur">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
