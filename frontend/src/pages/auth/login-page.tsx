import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BookOpenText,
  Eye,
  EyeOff,
  LockKeyhole,
  UserRound,
} from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { apiFetch } from '../../api/client'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { useAuthStore } from '../../stores/auth-store'
import type { LoginSession } from '../../types/api'

const schema = z.object({
  username: z.string().min(1, '请输入用户名'),
  password: z.string().min(6, '密码至少 6 位'),
})

type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const setSession = useAuthStore((state) => state.setSession)
  const [showPassword, setShowPassword] = useState(false)
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: '',
      password: '',
    },
  })

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      apiFetch<LoginSession>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ ...values, username: values.username.trim() }),
      }),
    onSuccess: (result) => {
      queryClient.clear()
      setSession({ token: result.accessToken, user: result.user })
      const from = (location.state as { from?: string } | undefined)?.from
      navigate(result.user.mustChangePassword ? '/change-password' : (from ?? '/tasks'), { replace: true })
    },
  })

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#edf3ff]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(255,255,255,0.98),rgba(255,255,255,0.45)_24%,transparent_50%),radial-gradient(circle_at_78%_18%,rgba(255,255,255,0.86),transparent_30%),linear-gradient(180deg,#eef4ff_0%,#eef4ff_35%,#f4f7ff_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_72%,rgba(37,99,235,0.08),transparent_28%),radial-gradient(circle_at_64%_58%,rgba(96,165,250,0.08),transparent_26%)]" />
      <div className="absolute -bottom-12 left-[7%] h-[240px] w-[430px] rounded-[999px] bg-[radial-gradient(circle_at_center,rgba(191,219,254,0.55),rgba(191,219,254,0.16)_52%,transparent_72%)] blur-2xl" />
      <div className="absolute bottom-0 left-0 right-0 h-[220px] bg-[radial-gradient(ellipse_at_bottom,rgba(191,219,254,0.24),transparent_70%)]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1580px] flex-col px-8 py-6 lg:px-14 lg:py-7 xl:px-20">
        <div className="flex items-center gap-3 text-ink">
          <div className="rounded-xl bg-white/90 p-3 text-accent shadow-[0_10px_30px_rgba(37,99,235,0.12)]">
            <BookOpenText className="size-6" />
          </div>
          <div>
            <p className="text-[20px] font-black tracking-[0.01em] text-[#17305f] lg:text-[24px]">
              作文智批平台
            </p>
          </div>
        </div>

        <div className="grid flex-1 items-center gap-8 lg:grid-cols-[1.02fr_0.86fr] lg:gap-12 xl:gap-14">
          <section className="relative mx-auto flex h-full w-full max-w-[780px] flex-col justify-center pt-4 lg:pt-0">
            <div className="max-w-[520px]">
              <h1 className="text-[42px] font-black leading-[1.28] tracking-tight text-[#172b59] lg:text-[54px]">
                AI赋能教学
                <br />
                让写作教学更高效
              </h1>
            </div>

            <div className="relative mt-6 max-w-[760px]">
              <div className="pointer-events-none absolute left-[4%] top-[16%] rounded-xl bg-white/82 px-4 py-2 text-sm font-semibold text-accent shadow-[0_12px_30px_rgba(37,99,235,0.12)]">
                精准评价
              </div>
              <div className="pointer-events-none absolute right-[15%] top-[8%] rounded-xl bg-white/82 px-4 py-2 text-sm font-semibold text-accent shadow-[0_12px_30px_rgba(37,99,235,0.12)]">
                智能批改
              </div>
              <div className="pointer-events-none absolute bottom-[20%] right-[11%] rounded-xl bg-white/82 px-4 py-2 text-sm font-semibold text-accent shadow-[0_12px_30px_rgba(37,99,235,0.12)]">
                学情分析
              </div>
              <img
                alt="登录页插画"
                className="mx-auto w-full max-w-[700px] object-contain drop-shadow-[0_20px_44px_rgba(147,197,253,0.24)]"
                src="/登录页.png"
              />
            </div>
          </section>

          <section className="flex items-center justify-center lg:justify-end">
            <div className="w-full max-w-[560px] rounded-xl border border-white/75 bg-white/88 p-7 shadow-[0_30px_80px_rgba(148,163,184,0.18)] backdrop-blur-md lg:p-8">
              <div className="text-center">
                <h2 className="text-[44px] font-black tracking-tight text-[#1a2f63]">
                  教师登录
                </h2>
              </div>

              <form
                className="mt-8 space-y-5"
                onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
              >
                <div>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-5 top-1/2 size-5 -translate-y-1/2 text-[#6c7fa4]" />
                    <Input
                      className="h-14 rounded-xl border-[#d8e3f6] bg-white pl-14 pr-4 text-base shadow-none placeholder:text-[#9aa9c7] focus:border-[#8bb2ff] focus:ring-[#dbeafe]"
                      placeholder="请输入手机号/账号"
                      autoComplete="username"
                      {...form.register('username')}
                    />
                  </div>
                  <p className="mt-2 text-xs text-rose-600">
                    {form.formState.errors.username?.message}
                  </p>
                </div>

                <div>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-5 top-1/2 size-5 -translate-y-1/2 text-[#6c7fa4]" />
                    <Input
                      className="h-14 rounded-xl border-[#d8e3f6] bg-white pl-14 pr-14 text-base shadow-none placeholder:text-[#9aa9c7] focus:border-[#8bb2ff] focus:ring-[#dbeafe]"
                      placeholder="请输入密码"
                      autoComplete="current-password"
                      type={showPassword ? 'text' : 'password'}
                      {...form.register('password')}
                    />
                    <button
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-[#7b8fb5] transition hover:text-accent"
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                    >
                      {showPassword ? (
                        <EyeOff className="size-5" />
                      ) : (
                        <Eye className="size-5" />
                      )}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-rose-600">
                    {form.formState.errors.password?.message}
                  </p>
                </div>

                <p className="text-right text-sm text-[#53698f]">忘记密码请联系管理员</p>

                <Button
                  className="h-13 w-full rounded-xl text-lg font-bold"
                  disabled={mutation.isPending}
                >
                  {mutation.isPending ? '登录中...' : '登录'}
                </Button>

                {mutation.isError ? (
                  <p className="text-sm text-rose-600">
                    {(mutation.error as Error).message || '登录失败'}
                  </p>
                ) : null}
              </form>

              <p className="mt-6 text-center text-sm leading-7 text-[#7c8dab]">
                使用本平台即表示您同意
                <span className="font-semibold text-accent">《用户协议》</span>
                和
                <span className="font-semibold text-accent">《隐私政策》</span>
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
