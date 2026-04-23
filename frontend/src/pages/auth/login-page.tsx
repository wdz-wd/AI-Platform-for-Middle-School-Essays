import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { PenSquare } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { apiFetch } from '../../api/client'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { useAuthStore } from '../../stores/auth-store'
import type { User } from '../../types/api'

const schema = z.object({
  username: z.string().min(1, '请输入用户名'),
  password: z.string().min(6, '密码至少 6 位'),
})

type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const setSession = useAuthStore((state) => state.setSession)
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: 'teacher',
      password: 'Teacher@123456',
    },
  })

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      apiFetch<{ accessToken: string; user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(values),
      }),
    onSuccess: (result) => {
      setSession({ token: result.accessToken, user: result.user })
      navigate((location.state as { from?: string } | undefined)?.from ?? '/tasks', {
        replace: true,
      })
    },
  })

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[32px] border border-stone-200 bg-white shadow-panel lg:grid-cols-[1.2fr_0.8fr]">
        <div className="relative overflow-hidden bg-gradient-to-br from-amber-100 via-paper to-teal-50 p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(15,118,110,0.16),transparent_32%)]" />
          <div className="relative">
            <div className="inline-flex rounded-full bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">
              Teacher Workflow
            </div>
            <h1 className="mt-8 max-w-xl text-4xl font-black leading-tight text-ink">
              把作文批改流程，压缩成老师每天都能直接使用的操作台。
            </h1>
            <p className="mt-6 max-w-lg text-base leading-8 text-stone-600">
              上传作文题与学生作文，系统完成文本提取和结构化点评，教师只需要逐篇调整终稿并打印。
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {['任务上传', 'AI 分段批语', '逐篇审核打印'].map((item) => (
                <Card key={item} className="bg-white/80 p-4">
                  <p className="text-sm font-semibold text-ink">{item}</p>
                </Card>
              ))}
            </div>
          </div>
        </div>
        <div className="p-8 lg:p-10">
          <div className="mb-8 flex items-center gap-3">
            <div className="rounded-2xl bg-accent/10 p-3 text-accent">
              <PenSquare className="size-6" />
            </div>
            <div>
              <p className="text-sm text-stone-500">作文批改平台 MVP</p>
              <h2 className="text-2xl font-bold text-ink">账号登录</h2>
            </div>
          </div>

          <form
            className="space-y-5"
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          >
            <div>
              <label className="mb-2 block text-sm font-medium text-stone-600">
                用户名
              </label>
              <Input {...form.register('username')} />
              <p className="mt-2 text-xs text-rose-600">
                {form.formState.errors.username?.message}
              </p>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-stone-600">
                密码
              </label>
              <Input type="password" {...form.register('password')} />
              <p className="mt-2 text-xs text-rose-600">
                {form.formState.errors.password?.message}
              </p>
            </div>
            <Button className="h-11 w-full" disabled={mutation.isPending}>
              {mutation.isPending ? '登录中...' : '登录'}
            </Button>
            {mutation.isError ? (
              <p className="text-sm text-rose-600">
                {(mutation.error as Error).message || '登录失败'}
              </p>
            ) : null}
          </form>

          <Card className="mt-8 bg-stone-50">
            <p className="text-sm font-semibold text-ink">开发环境默认账号</p>
            <div className="mt-3 space-y-2 text-sm text-stone-600">
              <p>admin / Admin@123456</p>
              <p>teacher / Teacher@123456</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
