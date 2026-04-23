import {
  BookOpenText,
  ChevronsLeft,
  ChevronsRight,
  FolderArchive,
  LayoutDashboard,
  LogOut,
  School,
  Users,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/auth-store'
import { cn } from '../../lib/utils'

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
  const [collapsed, setCollapsed] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const sidebarWidth = collapsed ? 76 : 232

  return (
    <div className="min-h-screen bg-transparent">
      <div
        className="min-h-screen transition-[padding] duration-300 lg:pl-[var(--sidebar-offset)]"
        style={{ '--sidebar-offset': `${sidebarWidth}px` } as React.CSSProperties}
      >
        <aside
          className={cn(
            'border-stone-200 bg-white/95 p-4 shadow-panel backdrop-blur transition-[width] duration-300 lg:fixed lg:left-0 lg:top-0 lg:z-30 lg:flex lg:h-screen lg:flex-col lg:border-r',
            collapsed ? 'lg:w-[76px]' : 'lg:w-[232px]',
          )}
        >
          <div className="mb-8">
            <div
              className={cn(
                'flex items-center',
                collapsed ? 'justify-center' : 'justify-between gap-3',
              )}
            >
              <div
                className={cn(
                  'flex items-center gap-3',
                  collapsed && 'justify-center',
                )}
              >
                <div
                  className="rounded-2xl bg-amber-100 p-3 text-amber-700"
                  title="作文批改平台"
                >
                  <BookOpenText className="size-6" />
                </div>
                {!collapsed ? (
                  <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-stone-400">
                      Essay MVP
                    </p>
                    <h1 className="text-xl font-bold text-ink">作文批改平台</h1>
                  </div>
                ) : null}
              </div>
              <button
                className={cn(
                  'rounded-xl p-2 text-stone-500 transition hover:bg-stone-100 hover:text-ink',
                  collapsed && 'mt-4',
                )}
                title={collapsed ? '展开侧边栏' : '收起侧边栏'}
                type="button"
                onClick={() => {
                  setCollapsed((current) => !current)
                  setAccountOpen(false)
                }}
              >
                {collapsed ? (
                  <ChevronsRight className="size-4" />
                ) : (
                  <ChevronsLeft className="size-4" />
                )}
              </button>
            </div>
          </div>

          <nav className="space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                title={item.label}
                className={({ isActive }) =>
                  cn(
                    'flex items-center rounded-2xl text-sm font-medium transition',
                    collapsed
                      ? 'justify-center px-0 py-3'
                      : 'gap-3 px-4 py-3',
                    isActive
                      ? 'bg-accent text-white'
                      : 'text-stone-600 hover:bg-stone-100 hover:text-ink',
                  )
                }
              >
                <item.icon className="size-4" />
                {!collapsed ? item.label : null}
              </NavLink>
            ))}
          </nav>

          <div className="relative mt-8 lg:mt-auto">
            {accountOpen ? (
              <div
                className={cn(
                  'absolute bottom-full mb-3 rounded-2xl border border-stone-200 bg-white p-2 shadow-panel',
                  collapsed ? 'left-0 w-40' : 'left-0 right-0',
                )}
              >
                <button
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
                  type="button"
                  onClick={() => {
                    clearSession()
                    navigate('/login')
                  }}
                >
                  <LogOut className="size-4" />
                  退出登录
                </button>
              </div>
            ) : null}
            <button
              className={cn(
                'flex w-full items-center rounded-2xl bg-stone-50 text-left transition hover:bg-stone-100',
                collapsed ? 'justify-center p-3' : 'gap-3 p-3',
              )}
              title={`${user?.displayName ?? '未登录'}，点击退出登录`}
              type="button"
              onClick={() => setAccountOpen((current) => !current)}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-sm font-black text-white">
                {(user?.displayName ?? user?.username ?? '?').slice(0, 1)}
              </span>
              {!collapsed ? (
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {user?.displayName ?? '未登录'}
                  </span>
                  <span className="mt-0.5 block text-xs text-stone-500">
                    {user?.role === 'ADMIN' ? '管理员' : '教师工作台'}
                  </span>
                </span>
              ) : null}
            </button>
          </div>
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
