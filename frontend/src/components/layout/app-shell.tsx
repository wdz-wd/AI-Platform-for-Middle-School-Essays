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
  const sidebarWidth = collapsed ? 76 : 252

  return (
    <div className="min-h-screen bg-transparent">
      <div
        className="min-h-screen transition-[padding] duration-300 lg:pl-[var(--sidebar-offset)]"
        style={{ '--sidebar-offset': `${sidebarWidth}px` } as React.CSSProperties}
      >
        <aside
          className={cn(
            'border-stone-200 bg-white p-4 shadow-panel transition-[width] duration-300 lg:fixed lg:left-0 lg:top-0 lg:z-30 lg:flex lg:h-screen lg:flex-col lg:border-r',
            collapsed ? 'lg:w-[76px]' : 'lg:w-[252px]',
          )}
        >
          <div className="mb-8">
            <div
              className={cn(
                'flex items-center',
                collapsed ? 'justify-center' : 'gap-3',
              )}
            >
              <div
                className={cn(
                  'flex items-center gap-3',
                  collapsed && 'justify-center',
                )}
              >
                <div
                  className="rounded-xl bg-blue-50 p-3 text-accent"
                  title="作文智批平台"
                >
                  <BookOpenText className="size-6" />
                </div>
                {!collapsed ? (
                  <div>
                    <h1 className="whitespace-nowrap text-xl font-bold text-ink">
                      作文智批平台
                    </h1>
                  </div>
                ) : null}
              </div>
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
                    'flex items-center rounded-xl text-sm font-medium transition',
                    collapsed
                      ? 'justify-center px-0 py-3'
                      : 'gap-3 px-4 py-3',
                    isActive
                      ? 'bg-blue-50 text-accent'
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
            <button
              className={cn(
                'rounded-xl p-2 text-stone-500 transition hover:bg-stone-100 hover:text-ink',
                collapsed
                  ? 'mx-auto mb-3 flex items-center justify-center'
                  : 'absolute right-2 top-1/2 z-10 -translate-y-1/2',
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
            {accountOpen ? (
              <div
                className={cn(
                  'absolute bottom-full mb-3 rounded-xl border border-stone-200 bg-white p-2 shadow-panel',
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
                'flex w-full items-center rounded-xl bg-stone-50 text-left transition hover:bg-stone-100',
                collapsed ? 'justify-center p-3' : 'gap-3 py-3 pl-3 pr-11',
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

        <div className="p-2 lg:p-3">
          <main className="mx-auto min-h-[calc(100vh-3rem)] max-w-[1600px]">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
