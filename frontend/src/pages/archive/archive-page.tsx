import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../api/client'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { formatDate } from '../../lib/utils'
import type { ArchiveItem, ClassItem, StudentItem } from '../../types/api'

export function ArchivePage() {
  const [filters, setFilters] = useState({
    classId: '',
    studentId: '',
    keyword: '',
  })
  const classesQuery = useQuery({
    queryKey: ['classes'],
    queryFn: () => apiFetch<ClassItem[]>('/classes'),
  })
  const studentsQuery = useQuery({
    queryKey: ['students', filters.classId, 'archive'],
    queryFn: () =>
      apiFetch<StudentItem[]>(
        filters.classId ? `/students?classId=${filters.classId}` : '/students',
      ),
  })
  const archiveQuery = useQuery({
    queryKey: ['archive', filters],
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.classId) params.set('classId', filters.classId)
      if (filters.studentId) params.set('studentId', filters.studentId)
      if (filters.keyword) params.set('keyword', filters.keyword)
      return apiFetch<ArchiveItem[]>(`/archive/submissions?${params.toString()}`)
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-stone-400">
          Archive
        </p>
        <h1 className="mt-2 text-3xl font-black text-ink">作文档案</h1>
      </div>

      <Card className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto]">
        <select
          className="h-11 rounded-xl border border-stone-300 bg-white px-3 text-sm outline-none"
          value={filters.classId}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              classId: event.target.value,
              studentId: '',
            }))
          }
        >
          <option value="">全部班级</option>
          {classesQuery.data?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          className="h-11 rounded-xl border border-stone-300 bg-white px-3 text-sm outline-none"
          value={filters.studentId}
          onChange={(event) =>
            setFilters((current) => ({ ...current, studentId: event.target.value }))
          }
        >
          <option value="">全部学生</option>
          {studentsQuery.data?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <Input
          placeholder="按姓名或评语关键词检索"
          value={filters.keyword}
          onChange={(event) =>
            setFilters((current) => ({ ...current, keyword: event.target.value }))
          }
        />
        <Button variant="secondary" onClick={() => archiveQuery.refetch()}>
          刷新
        </Button>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-stone-50 text-left text-stone-500">
              <tr>
                <th className="px-5 py-4 font-medium">学生</th>
                <th className="px-5 py-4 font-medium">任务</th>
                <th className="px-5 py-4 font-medium">状态</th>
                <th className="px-5 py-4 font-medium">终稿摘要</th>
                <th className="px-5 py-4 font-medium">时间</th>
                <th className="px-5 py-4 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {archiveQuery.data?.map((item) => (
                <tr key={item.id} className="border-t border-stone-100">
                  <td className="px-5 py-4 text-ink">
                    {item.student?.name ?? item.detectedName ?? '未绑定'}
                  </td>
                  <td className="px-5 py-4 text-stone-600">{item.task.title}</td>
                  <td className="px-5 py-4 text-stone-600">{item.status}</td>
                  <td className="max-w-sm px-5 py-4 text-stone-600">
                    {item.review?.finalComment ?? item.review?.aiSummary ?? '-'}
                  </td>
                  <td className="px-5 py-4 text-stone-600">
                    {formatDate(item.createdAt)}
                  </td>
                  <td className="px-5 py-4">
                    <Link className="font-semibold text-accent" to={`/submissions/${item.id}`}>
                      查看
                    </Link>
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
