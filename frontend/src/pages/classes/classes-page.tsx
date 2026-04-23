import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { apiFetch } from '../../api/client'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { useAuthStore } from '../../stores/auth-store'
import type { ClassItem } from '../../types/api'

export function ClassesPage() {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const [form, setForm] = useState({ name: '', grade: '', academicYear: '' })
  const classesQuery = useQuery({
    queryKey: ['classes'],
    queryFn: () => apiFetch<ClassItem[]>('/classes'),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch('/classes', {
        method: 'POST',
        body: JSON.stringify(form),
      }),
    onSuccess: async () => {
      setForm({ name: '', grade: '', academicYear: '' })
      await queryClient.invalidateQueries({ queryKey: ['classes'] })
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-stone-400">
          Class Management
        </p>
        <h1 className="mt-2 text-3xl font-black text-ink">班级管理</h1>
      </div>

      {user?.role === 'ADMIN' ? (
        <Card className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto]">
          <Input
            placeholder="班级名称"
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
          />
          <Input
            placeholder="年级"
            value={form.grade}
            onChange={(event) =>
              setForm((current) => ({ ...current, grade: event.target.value }))
            }
          />
          <Input
            placeholder="学年"
            value={form.academicYear}
            onChange={(event) =>
              setForm((current) => ({ ...current, academicYear: event.target.value }))
            }
          />
          <Button
            disabled={!form.name || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            新建班级
          </Button>
        </Card>
      ) : null}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-stone-50 text-left text-stone-500">
              <tr>
                <th className="px-5 py-4 font-medium">班级名称</th>
                <th className="px-5 py-4 font-medium">年级</th>
                <th className="px-5 py-4 font-medium">学年</th>
                <th className="px-5 py-4 font-medium">学生数</th>
                <th className="px-5 py-4 font-medium">任务数</th>
              </tr>
            </thead>
            <tbody>
              {classesQuery.data?.map((item) => (
                <tr key={item.id} className="border-t border-stone-100">
                  <td className="px-5 py-4 font-medium text-ink">{item.name}</td>
                  <td className="px-5 py-4 text-stone-600">{item.grade ?? '-'}</td>
                  <td className="px-5 py-4 text-stone-600">{item.academicYear ?? '-'}</td>
                  <td className="px-5 py-4 text-stone-600">
                    {item._count?.students ?? 0}
                  </td>
                  <td className="px-5 py-4 text-stone-600">
                    {item._count?.essayTasks ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
