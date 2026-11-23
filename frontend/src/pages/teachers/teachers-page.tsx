import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { apiFetch } from '../../api/client'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { PageTitle } from '../../components/ui/page-title'
import { Input } from '../../components/ui/input'
import type { ClassItem, TeacherAccount, TeacherCredentials } from '../../types/api'

export function TeachersPage() {
  const queryClient = useQueryClient()
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [classIds, setClassIds] = useState<string[]>([])
  const [credentials, setCredentials] = useState<TeacherCredentials | null>(null)
  const [copyMessage, setCopyMessage] = useState('')
  const copyField = useRef<HTMLTextAreaElement | null>(null)
  const teachers = useQuery({
    queryKey: ['teachers'],
    queryFn: () => apiFetch<TeacherAccount[]>('/teachers'),
  })
  const classes = useQuery({
    queryKey: ['classes'],
    queryFn: () => apiFetch<ClassItem[]>('/classes'),
  })
  const assignableClasses = classes.data?.filter((item) => !item.teacher) ?? []
  const refreshLists = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['teachers'] }),
    queryClient.invalidateQueries({ queryKey: ['classes'] }),
  ])
  const showCredentials = (result: TeacherCredentials) => {
    setCopyMessage('')
    setCredentials(result)
  }
  const createTeacher = useMutation({
    mutationFn: () => apiFetch<TeacherCredentials>('/teachers', {
      method: 'POST',
      body: JSON.stringify({ displayName: displayName.trim(), username: username.trim(), classIds }),
    }),
    onSuccess: (result) => {
      setDisplayName('')
      setUsername('')
      setClassIds([])
      showCredentials(result)
      void refreshLists()
    },
    onError: () => {
      setClassIds([])
      void refreshLists()
    },
  })
  const resetPassword = useMutation({
    mutationFn: (id: string) => apiFetch<TeacherCredentials>(`/teachers/${id}/reset-password`, { method: 'POST' }),
    onSuccess: (result) => {
      showCredentials(result)
      void refreshLists()
    },
  })
  const updateStatus = useMutation({
    mutationFn: (teacher: TeacherAccount) => apiFetch<TeacherAccount>(`/teachers/${teacher.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: teacher.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' }),
    }),
    onSuccess: () => { void refreshLists() },
  })
  const busy = createTeacher.isPending || resetPassword.isPending || updateStatus.isPending
  const accountText = credentials
    ? `教师姓名：${credentials.user.displayName}\n登录账号：${credentials.user.username}\n初始密码：${credentials.initialPassword}\n请在登录后修改初始密码。`
    : ''

  async function copyCredentials() {
    try {
      await navigator.clipboard.writeText(accountText)
      setCopyMessage('已复制')
    } catch {
      copyField.current?.focus()
      copyField.current?.select()
      setCopyMessage('内容已选中，请按 Ctrl+C 复制。')
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle>教师账号</PageTitle>
      {credentials ? (
        <Card className="space-y-3 border-blue-200">
          <h2 className="text-base font-semibold text-ink">账号信息</h2>
          <p className="text-sm text-stone-600">初始密码仅在这里显示，请私下交给老师。</p>
          <textarea ref={copyField} readOnly aria-label="教师账号和初始密码" rows={4} value={accountText}
            className="w-full max-w-lg rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm" />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => void copyCredentials()}>复制账号信息</Button>
            <Button type="button" variant="ghost" onClick={() => {
              setCredentials(null)
              setCopyMessage('')
              createTeacher.reset()
              resetPassword.reset()
            }}>关闭</Button>
            <span aria-live="polite" className="text-sm text-stone-600">{copyMessage}</span>
          </div>
        </Card>
      ) : null}
      <Card>
        <form className="space-y-4" onSubmit={(event) => {
          event.preventDefault()
          createTeacher.mutate()
        }}>
          <h2 className="text-lg font-semibold text-ink">新增教师</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5 text-sm">
              <span>教师姓名</span>
              <Input required maxLength={40} value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span>登录账号</span>
              <Input required maxLength={40} autoComplete="off" placeholder="可使用教师工号"
                value={username} onChange={(event) => setUsername(event.target.value)} />
            </label>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">任教班级</legend>
            {assignableClasses.length ? (
              <div className="grid max-h-52 gap-2 overflow-auto sm:grid-cols-2 lg:grid-cols-3">
                {assignableClasses.map((item) => (
                  <label key={item.id} className="flex items-center gap-2 rounded-xl border border-stone-200 px-3 py-2 text-sm">
                    <input type="checkbox" checked={classIds.includes(item.id)} onChange={(event) => {
                      const checked = event.target.checked
                      setClassIds((current) => checked ? [...current, item.id] : current.filter((id) => id !== item.id))
                    }} />
                    <span>{item.name} <span className="text-stone-500">{item.academicYear}</span></span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-stone-500">
                {classes.isPending ? '正在加载班级…' : classes.isError ? '班级加载失败' : '暂无未分配的班级。'}
              </p>
            )}
            <p className="text-xs text-stone-500">可稍后在班级管理中分配，也可在那里更换已有负责老师。</p>
          </fieldset>
          {createTeacher.error ? <p role="alert" className="text-sm text-rose-600">{createTeacher.error.message}</p> : null}
          <Button disabled={busy || !!credentials || !username.trim() || !displayName.trim()}>
            {createTeacher.isPending ? '创建中…' : '创建账号'}
          </Button>
        </form>
      </Card>
      <Card className="overflow-x-auto p-0">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-stone-50 text-stone-500">
            <tr>
              {['姓名', '登录账号', '任教班级', '状态', '操作'].map((label) => (
                <th key={label} className="px-5 py-4 font-medium">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teachers.data?.map((teacher) => (
              <tr key={teacher.id} className="border-t border-stone-100">
                <td className="px-5 py-3 font-medium text-ink">{teacher.displayName}</td>
                <td className="px-5 py-3">{teacher.username}</td>
                <td className="px-5 py-3">{teacher.classes.map((item) => (
                  item.academicYear ? `${item.name}（${item.academicYear}）` : item.name
                )).join('、') || '未分配'}</td>
                <td className="whitespace-nowrap px-5 py-3">
                  {teacher.status !== 'ACTIVE' ? '已停用' : teacher.mustChangePassword ? '待改密码' : '已启用'}
                </td>
                <td className="whitespace-nowrap px-5 py-3">
                  <Button type="button" variant="ghost" disabled={busy || !!credentials} onClick={() => {
                    updateStatus.reset()
                    if (window.confirm(`重置 ${teacher.displayName} 的密码？原密码和已登录会话将失效。`)) {
                      resetPassword.mutate(teacher.id)
                    }
                  }}>重置密码</Button>
                  <Button type="button" variant="ghost" disabled={busy || !!credentials} onClick={() => {
                    resetPassword.reset()
                    if (teacher.status !== 'ACTIVE' || window.confirm(`停用 ${teacher.displayName} 的账号？`)) {
                      updateStatus.mutate(teacher)
                    }
                  }}>{teacher.status === 'ACTIVE' ? '停用' : '启用'}</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {teachers.isPending ? <p className="px-5 py-4 text-sm text-stone-500">正在加载教师账号…</p> : null}
        {teachers.data?.length === 0 ? <p className="px-5 py-4 text-sm text-stone-500">暂无教师账号。</p> : null}
        {teachers.error || resetPassword.error || updateStatus.error ? (
          <p role="alert" className="px-5 py-4 text-sm text-rose-600">
            {teachers.error?.message || resetPassword.error?.message || updateStatus.error?.message}
          </p>
        ) : null}
      </Card>
    </div>
  )
}
