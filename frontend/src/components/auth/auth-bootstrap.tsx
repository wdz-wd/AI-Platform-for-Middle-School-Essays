import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
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
    enabled: !!token && !user,
    retry: false,
  })

  if (query.isError) {
    clearSession()
    return null
  }

  if (query.data && !user) {
    setUser(query.data)
  }

  if (!!token && !user && query.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-stone-500">
        正在恢复登录状态...
      </div>
    )
  }

  return <>{children}</>
}
