import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../api/client'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { PageTitle } from '../../components/ui/page-title'
import { Input } from '../../components/ui/input'
import { useAuthStore } from '../../stores/auth-store'
import type { LoginSession } from '../../types/api'

export function ChangePasswordPage() {
  const user = useAuthStore((state) => state.user)
  const setSession = useAuthStore((state) => state.setSession)
  const clearSession = useAuthStore((state) => state.clearSession)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [formError, setFormError] = useState('')
  const required = user?.mustChangePassword
  const changePassword = useMutation({
    mutationFn: () => apiFetch<LoginSession>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
    onSuccess: (result) => {
      queryClient.clear()
      setSession({ token: result.accessToken, user: result.user })
      navigate('/tasks', { replace: true })
    },
  })

  return (
    <div className={required ? 'grid min-h-screen place-items-center px-4' : 'space-y-6'}>
      {!required ? <PageTitle>修改密码</PageTitle> : null}
      <Card className="w-full max-w-md space-y-5">
        {required ? <PageTitle>设置新密码</PageTitle> : null}
        <form className="space-y-4" onSubmit={(event) => {
          event.preventDefault()
          changePassword.reset()
          if (newPassword !== confirmation) {
            setFormError('两次输入的新密码不一致')
            return
          }
          setFormError('')
          changePassword.mutate()
        }}>
          <label className="block space-y-1.5 text-sm">
            <span>{required ? '初始密码' : '当前密码'}</span>
            <Input required type="password" autoComplete="current-password"
              value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span>新密码</span>
            <Input required minLength={10} maxLength={72} type="password" autoComplete="new-password"
              value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
            <span className="text-xs text-stone-500">至少 10 位</span>
          </label>
          <label className="block space-y-1.5 text-sm">
            <span>确认新密码</span>
            <Input required type="password" autoComplete="new-password"
              value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
          </label>
          {formError || changePassword.error ? (
            <p role="alert" className="text-sm text-rose-600">{formError || changePassword.error?.message}</p>
          ) : null}
          <div className="flex items-center gap-2">
            <Button disabled={changePassword.isPending}>{changePassword.isPending ? '保存中…' : '保存密码'}</Button>
            {required ? (
              <Button type="button" variant="ghost" onClick={() => {
                queryClient.clear()
                clearSession()
                navigate('/login', { replace: true })
              }}>返回登录</Button>
            ) : null}
          </div>
        </form>
      </Card>
    </div>
  )
}
