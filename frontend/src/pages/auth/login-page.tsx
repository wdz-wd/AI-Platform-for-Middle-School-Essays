import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import {
  BookOpenText,
  ChartNoAxesColumn,
  Database,
  Eye,
  EyeOff,
  LockKeyhole,
  MessageCircleMore,
  Sparkles,
  UserRound,
  Zap,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { apiFetch } from '../../api/client'
import { Button } from '../../components/ui/button'
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
  const [rememberMe, setRememberMe] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
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

  const features = useMemo(
    () => [
      {
        title: 'AI智能批改',
        desc: '多维度分析',
        icon: Sparkles,
        tone: 'blue',
      },
      {
        title: '数据可视化',
        desc: '学情全掌握',
        icon: ChartNoAxesColumn,
        tone: 'teal',
      },
      {
        title: '教学资源库',
        desc: '优质资源共享',
        icon: Database,
        tone: 'violet',
      },
      {
        title: '高效便捷',
        desc: '减负增效',
        icon: Zap,
        tone: 'amber',
      },
    ],
    [],
  )

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#edf3ff]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(255,255,255,0.98),rgba(255,255,255,0.45)_24%,transparent_50%),radial-gradient(circle_at_78%_18%,rgba(255,255,255,0.86),transparent_30%),linear-gradient(180deg,#eef4ff_0%,#eef4ff_35%,#f4f7ff_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_72%,rgba(37,99,235,0.08),transparent_28%),radial-gradient(circle_at_64%_58%,rgba(96,165,250,0.08),transparent_26%)]" />
      <div className="absolute -bottom-12 left-[7%] h-[240px] w-[430px] rounded-[999px] bg-[radial-gradient(circle_at_center,rgba(191,219,254,0.55),rgba(191,219,254,0.16)_52%,transparent_72%)] blur-2xl" />
      <div className="absolute bottom-0 left-0 right-0 h-[220px] bg-[radial-gradient(ellipse_at_bottom,rgba(191,219,254,0.24),transparent_70%)]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1580px] flex-col px-8 py-8 lg:px-14 lg:py-10 xl:px-20">
        <div className="flex items-center gap-3 text-ink">
          <div className="rounded-2xl bg-white/90 p-3 text-accent shadow-[0_10px_30px_rgba(37,99,235,0.12)]">
            <BookOpenText className="size-6" />
          </div>
          <div>
            <p className="text-[20px] font-black tracking-[0.01em] text-[#17305f] lg:text-[24px]">
              作文智批平台
            </p>
          </div>
        </div>

        <div className="grid flex-1 items-center gap-12 lg:grid-cols-[1.02fr_0.86fr] lg:gap-14 xl:gap-16">
          <section className="relative mx-auto flex h-full w-full max-w-[780px] flex-col justify-center pt-8 lg:pt-0">
            <div className="max-w-[520px]">
              <h1 className="text-[42px] font-black leading-[1.28] tracking-tight text-[#172b59] lg:text-[54px]">
                AI赋能教学
                <br />
                让写作教学更高效
              </h1>
              <p className="mt-6 text-[17px] leading-9 text-[#486187]">
                智能批改、精准评价、数据分析
                <br />
                助力教师减负增效，全面提升学生写作能力
              </p>
            </div>

            <div className="relative mt-8 max-w-[760px]">
              <div className="pointer-events-none absolute left-[4%] top-[16%] rounded-2xl bg-white/82 px-4 py-2 text-sm font-semibold text-accent shadow-[0_12px_30px_rgba(37,99,235,0.12)]">
                精准评价
              </div>
              <div className="pointer-events-none absolute right-[15%] top-[8%] rounded-2xl bg-white/82 px-4 py-2 text-sm font-semibold text-accent shadow-[0_12px_30px_rgba(37,99,235,0.12)]">
                智能批改
              </div>
              <div className="pointer-events-none absolute bottom-[20%] right-[11%] rounded-2xl bg-white/82 px-4 py-2 text-sm font-semibold text-accent shadow-[0_12px_30px_rgba(37,99,235,0.12)]">
                学情分析
              </div>
              <img
                alt="登录页插画"
                className="mx-auto w-full max-w-[740px] object-contain drop-shadow-[0_22px_50px_rgba(147,197,253,0.28)]"
                src="/登录页.png"
              />
            </div>

            <div className="mt-4 grid w-full max-w-[760px] gap-4 rounded-[28px] border border-white/70 bg-white/55 p-5 shadow-[0_24px_60px_rgba(148,163,184,0.12)] backdrop-blur-sm sm:grid-cols-4">
              {features.map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.title} className="flex items-center gap-4 sm:flex-col sm:items-start sm:gap-3">
                    <span
                      className={[
                        'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-[0_14px_28px_rgba(37,99,235,0.18)]',
                        item.tone === 'blue' && 'bg-gradient-to-br from-[#4f8dff] to-[#2563eb]',
                        item.tone === 'teal' && 'bg-gradient-to-br from-[#34d4c3] to-[#14b8a6]',
                        item.tone === 'violet' && 'bg-gradient-to-br from-[#7c6cff] to-[#6366f1]',
                        item.tone === 'amber' && 'bg-gradient-to-br from-[#ffba57] to-[#f59e0b]',
                      ].join(' ')}
                    >
                      <Icon className="size-5" />
                    </span>
                    <div>
                      <p className="text-[15px] font-bold text-[#1f3360]">{item.title}</p>
                      <p className="mt-1 text-sm text-[#6c7fa4]">{item.desc}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="flex items-center justify-center lg:justify-end">
            <div className="w-full max-w-[560px] rounded-[34px] border border-white/75 bg-white/88 p-8 shadow-[0_30px_80px_rgba(148,163,184,0.18)] backdrop-blur-md lg:p-10">
              <div className="text-center">
                <h2 className="text-[44px] font-black tracking-tight text-[#1a2f63]">
                  教师登录
                </h2>
                <p className="mt-4 text-xl text-[#5b6f96]">欢迎使用作文智批平台</p>
              </div>

              <form
                className="mt-10 space-y-6"
                onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
              >
                <div>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-5 top-1/2 size-5 -translate-y-1/2 text-[#6c7fa4]" />
                    <Input
                      className="h-14 rounded-2xl border-[#d8e3f6] bg-white pl-14 pr-4 text-base shadow-none placeholder:text-[#9aa9c7] focus:border-[#8bb2ff] focus:ring-[#dbeafe]"
                      placeholder="请输入手机号/账号"
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
                      className="h-14 rounded-2xl border-[#d8e3f6] bg-white pl-14 pr-14 text-base shadow-none placeholder:text-[#9aa9c7] focus:border-[#8bb2ff] focus:ring-[#dbeafe]"
                      placeholder="请输入密码"
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

                <div className="flex items-center justify-between gap-4 text-[15px]">
                  <label className="flex cursor-pointer items-center gap-2 text-[#53698f]">
                    <input
                      checked={rememberMe}
                      className="h-4 w-4 rounded border-stone-300 accent-accent"
                      type="checkbox"
                      onChange={(event) => setRememberMe(event.target.checked)}
                    />
                    记住我
                  </label>
                  <button
                    className="font-medium text-[#6c7fa4] transition hover:text-accent"
                    type="button"
                  >
                    忘记密码?
                  </button>
                </div>

                <Button
                  className="h-14 w-full rounded-2xl text-xl font-bold shadow-[0_14px_34px_rgba(37,99,235,0.28)]"
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

              <div className="mt-10">
                <div className="flex items-center gap-4 text-sm text-[#7f8eab]">
                  <span className="h-px flex-1 bg-[#e2e8f5]" />
                  <span>其他登录方式</span>
                  <span className="h-px flex-1 bg-[#e2e8f5]" />
                </div>

                <div className="mt-8 flex justify-center">
                  <button
                    className="flex flex-col items-center gap-3 text-[#5a6c93] transition hover:text-accent"
                    type="button"
                  >
                    <span className="flex h-16 w-16 items-center justify-center rounded-full border border-[#dfe7f5] bg-white shadow-sm">
                      <MessageCircleMore className="size-8 text-[#1fb75a]" />
                    </span>
                    <span className="text-base font-medium">微信登录</span>
                  </button>
                </div>
              </div>

              <div className="mt-10 rounded-[24px] border border-[#eef3fb] bg-[#f8fbff] px-5 py-4">
                <p className="text-sm font-semibold text-[#1f3360]">开发环境默认账号</p>
                <div className="mt-2 space-y-1.5 text-sm text-[#62779b]">
                  <p>admin / Admin@123456</p>
                  <p>teacher / Teacher@123456</p>
                </div>
              </div>

              <p className="mt-8 text-center text-sm leading-7 text-[#7c8dab]">
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
