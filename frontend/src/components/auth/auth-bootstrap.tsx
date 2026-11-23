import { useQuery } from '@tanstack/react-query'
import { useEffect, type ReactNode } from 'react'
import { apiFetch } from '../../api/client'
import { useAuthStore } from '../../stores/auth-store'
import type { User } from '../../types/api'

export function AuthBootstrap({ children }: { children: ReactNode }) {
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)
  const clearSession = useAuthStore((state) => state.clearSession)

  const query = useQuery({
    queryKey: ['auth', 'me', token],
    queryFn: () => apiFetch<User>('/auth/me', { token }),
    enabled: !!token,
    retry: false,
  })

  useEffect(() => {
    if (query.data) setUser(query.data)
  }, [query.data, setUser])

  if (query.isError && !query.data) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-4 text-sm text-stone-600">
        <span>暂时无法确认登录状态</span>
        <button className="text-accent" onClick={() => void query.refetch()}>重试</button>
        <button className="text-accent" onClick={clearSession}>返回登录</button>
      </div>
    )
  }
  if (!query.data || user !== query.data) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-stone-500">
        正在恢复登录状态...
      </div>
    )
  }

  return <>{children}</>
}
