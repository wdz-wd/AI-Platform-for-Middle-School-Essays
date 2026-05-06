import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../api/client'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { getTaskStatusMeta } from '../../lib/status'
import { formatDate } from '../../lib/utils'
import type { TaskItem } from '../../types/api'

export function TasksPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [deletingTask, setDeletingTask] = useState<TaskItem | null>(null)
  const [deleteConfirmTitle, setDeleteConfirmTitle] = useState('')
  const query = useQuery({
    queryKey: ['tasks'],
    queryFn: () => apiFetch<TaskItem[]>('/tasks'),
  })
  const deleteTaskMutation = useMutation({
    mutationFn: () =>
      deletingTask
        ? apiFetch(`/tasks/${deletingTask.id}`, { method: 'DELETE' })
        : Promise.resolve(),
    onSuccess: async () => {
      setDeletingTask(null)
      setDeleteConfirmTitle('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['archive'] }),
      ])
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-stone-400">
            Task Center
          </p>
          <h1 className="mt-2 text-3xl font-black text-ink">作文任务</h1>
          <p className="mt-2 text-sm text-stone-500">
            先创建任务，再上传作文题和学生作文。
          </p>
        </div>
        <Button onClick={() => navigate('/tasks/new')}>新建批改任务</Button>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-stone-50 text-left text-stone-500">
              <tr>
                <th className="px-5 py-4 font-medium">任务名称</th>
                <th className="px-5 py-4 font-medium">班级</th>
                <th className="px-5 py-4 font-medium">状态</th>
                <th className="px-5 py-4 font-medium">完成情况</th>
                <th className="px-5 py-4 font-medium">创建时间</th>
                <th className="px-5 py-4 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {query.data?.map((task) => {
                const taskClasses = task.classes?.length ? task.classes : [task.class]
                const className =
                  taskClasses.length > 1
                    ? `${taskClasses[0].name}等`
                    : taskClasses[0]?.name
                return (
                  <tr key={task.id} className="border-t border-stone-100">
                  <td className="px-5 py-4 font-medium text-ink">{task.title}</td>
                  <td className="px-5 py-4 text-stone-600">{className}</td>
                  <td className="px-5 py-4">
                    <Badge tone={getTaskStatusMeta(task.status).tone}>
                      {getTaskStatusMeta(task.status).label}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-stone-600">
                    {task.doneCount}/{task.totalCount}，失败 {task.failedCount}
                  </td>
                  <td className="px-5 py-4 text-stone-600">
                    {formatDate(task.createdAt)}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <button
                        className="font-semibold text-accent"
                        onClick={() => navigate(`/tasks/${task.id}`)}
                        type="button"
                      >
                        打开任务
                      </button>
                      <button
                        className="font-semibold text-rose-600"
                        onClick={() => {
                          setDeletingTask(task)
                          setDeleteConfirmTitle('')
                        }}
                        type="button"
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!query.data?.length && !query.isLoading ? (
          <div className="px-5 py-10 text-center text-sm text-stone-500">
            还没有作文任务。
          </div>
        ) : null}
      </Card>

      {deletingTask
        ? createPortal(
            <div
              className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-slate-950/45 p-4"
              onMouseDown={() => setDeletingTask(null)}
            >
              <div
                className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-rose-600">删除作文任务</p>
                    <h2 className="mt-1 text-2xl font-black text-ink">
                      {deletingTask.title}
                    </h2>
                  </div>
                  <button
                    className="rounded-full p-2 text-stone-400 transition hover:bg-stone-100 hover:text-ink"
                    type="button"
                    onClick={() => setDeletingTask(null)}
                  >
                    <X className="size-5" />
                  </button>
                </div>
                <p className="mt-5 text-sm leading-6 text-stone-600">
                  是否确定删除该任务？任务下的作文也会被删除。
                </p>
                <label className="mt-4 block text-sm font-medium text-stone-600">
                  输入任务名确认删除
                  <Input
                    className="mt-2"
                    value={deleteConfirmTitle}
                    onChange={(event) => setDeleteConfirmTitle(event.target.value)}
                  />
                </label>
                {deleteTaskMutation.isError ? (
                  <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {(deleteTaskMutation.error as Error).message}
                  </p>
                ) : null}
                <div className="mt-6 flex justify-end gap-3">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setDeletingTask(null)
                      setDeleteConfirmTitle('')
                    }}
                  >
                    取消
                  </Button>
                  <Button
                    disabled={
                      deleteTaskMutation.isPending ||
                      deleteConfirmTitle.trim() !== deletingTask.title
                    }
                    variant="danger"
                    onClick={() => deleteTaskMutation.mutate()}
                  >
                    确认删除
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
