import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../api/client'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { formatDate } from '../../lib/utils'
import type { TaskItem } from '../../types/api'

function taskTone(status: TaskItem['status']) {
  if (status === 'DONE') return 'success'
  if (status === 'FAILED') return 'danger'
  if (status === 'PARTIAL_DONE' || status === 'PROCESSING') return 'warning'
  return 'neutral'
}

export function TasksPage() {
  const navigate = useNavigate()
  const query = useQuery({
    queryKey: ['tasks'],
    queryFn: () => apiFetch<TaskItem[]>('/tasks'),
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
              {query.data?.map((task) => (
                <tr key={task.id} className="border-t border-stone-100">
                  <td className="px-5 py-4 font-medium text-ink">{task.title}</td>
                  <td className="px-5 py-4 text-stone-600">{task.class.name}</td>
                  <td className="px-5 py-4">
                    <Badge tone={taskTone(task.status)}>{task.status}</Badge>
                  </td>
                  <td className="px-5 py-4 text-stone-600">
                    {task.doneCount}/{task.totalCount}，失败 {task.failedCount}
                  </td>
                  <td className="px-5 py-4 text-stone-600">
                    {formatDate(task.createdAt)}
                  </td>
                  <td className="px-5 py-4">
                    <button
                      className="font-semibold text-accent"
                      onClick={() => navigate(`/tasks/${task.id}`)}
                      type="button"
                    >
                      打开任务
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!query.data?.length && !query.isLoading ? (
          <div className="px-5 py-10 text-center text-sm text-stone-500">
            还没有作文任务。
          </div>
        ) : null}
      </Card>
    </div>
  )
}
