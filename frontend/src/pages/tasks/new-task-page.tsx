import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../api/client'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Textarea } from '../../components/ui/textarea'
import type { ClassItem, TaskItem } from '../../types/api'

export function NewTaskPage() {
  const navigate = useNavigate()
  const classesQuery = useQuery({
    queryKey: ['classes'],
    queryFn: () => apiFetch<ClassItem[]>('/classes'),
  })
  const [form, setForm] = useState({
    classId: '',
    title: '',
    note: '',
    topicText: '',
  })

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<TaskItem>('/tasks', {
        method: 'POST',
        body: JSON.stringify(form),
      }),
    onSuccess: (task) => navigate(`/tasks/${task.id}`),
  })

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-stone-400">
          Create Task
        </p>
        <h1 className="mt-2 text-3xl font-black text-ink">新建作文批改任务</h1>
      </div>

      <Card className="space-y-5">
        <div>
          <label className="mb-2 block text-sm font-medium text-stone-600">
            班级
          </label>
          <select
            className="h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm outline-none focus:border-accent"
            value={form.classId}
            onChange={(event) =>
              setForm((current) => ({ ...current, classId: event.target.value }))
            }
          >
            <option value="">请选择班级</option>
            {classesQuery.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-stone-600">
            任务名称
          </label>
          <Input
            placeholder="例如：期中考试、第一次月考、周末作文训练"
            value={form.title}
            onChange={(event) =>
              setForm((current) => ({ ...current, title: event.target.value }))
            }
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-stone-600">
            作文题目与材料
          </label>
          <Textarea
            placeholder="这里填写真正的作文题目、题干和材料内容。题目讲解思路会基于这里生成，而不是基于任务名称。"
            value={form.topicText}
            onChange={(event) =>
              setForm((current) => ({ ...current, topicText: event.target.value }))
            }
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-stone-600">
            备注
          </label>
          <Textarea
            placeholder="可选。记录本次作文批改的补充说明。"
            value={form.note}
            onChange={(event) =>
              setForm((current) => ({ ...current, note: event.target.value }))
            }
          />
        </div>
        <div className="flex justify-end">
          <Button
            disabled={!form.classId || !form.title || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? '创建中...' : '创建任务'}
          </Button>
        </div>
        {mutation.isError ? (
          <p className="text-sm text-rose-600">
            {(mutation.error as Error).message}
          </p>
        ) : null}
      </Card>
    </div>
  )
}
