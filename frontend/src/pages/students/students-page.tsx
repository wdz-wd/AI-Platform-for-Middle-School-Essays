import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { apiFetch } from '../../api/client'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import type { ClassItem, StudentItem } from '../../types/api'

export function StudentsPage() {
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState({
    classId: '',
    name: '',
    studentNo: '',
    gender: '',
  })

  const classesQuery = useQuery({
    queryKey: ['classes'],
    queryFn: () => apiFetch<ClassItem[]>('/classes'),
  })

  const studentsQuery = useQuery({
    queryKey: ['students', filters.classId],
    queryFn: () =>
      apiFetch<StudentItem[]>(
        filters.classId ? `/students?classId=${filters.classId}` : '/students',
      ),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch('/students', {
        method: 'POST',
        body: JSON.stringify({
          classId: filters.classId,
          name: filters.name,
          studentNo: filters.studentNo,
          gender: filters.gender,
        }),
      }),
    onSuccess: async () => {
      setFilters((current) => ({
        ...current,
        name: '',
        studentNo: '',
        gender: '',
      }))
      await queryClient.invalidateQueries({ queryKey: ['students'] })
    },
  })

  const canCreate = useMemo(
    () => !!filters.classId && !!filters.name.trim(),
    [filters.classId, filters.name],
  )

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-stone-400">
          Student Management
        </p>
        <h1 className="mt-2 text-3xl font-black text-ink">学生管理</h1>
      </div>

      <Card className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr_1fr_auto]">
        <select
          className="h-11 rounded-xl border border-stone-300 bg-white px-3 text-sm outline-none"
          value={filters.classId}
          onChange={(event) =>
            setFilters((current) => ({ ...current, classId: event.target.value }))
          }
        >
          <option value="">请选择班级</option>
          {classesQuery.data?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <Input
          placeholder="学生姓名"
          value={filters.name}
          onChange={(event) =>
            setFilters((current) => ({ ...current, name: event.target.value }))
          }
        />
        <Input
          placeholder="学号"
          value={filters.studentNo}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              studentNo: event.target.value,
            }))
          }
        />
        <Input
          placeholder="性别"
          value={filters.gender}
          onChange={(event) =>
            setFilters((current) => ({ ...current, gender: event.target.value }))
          }
        />
        <Button disabled={!canCreate || createMutation.isPending} onClick={() => createMutation.mutate()}>
          添加学生
        </Button>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-stone-50 text-left text-stone-500">
              <tr>
                <th className="px-5 py-4 font-medium">姓名</th>
                <th className="px-5 py-4 font-medium">学号</th>
                <th className="px-5 py-4 font-medium">性别</th>
                <th className="px-5 py-4 font-medium">班级</th>
              </tr>
            </thead>
            <tbody>
              {studentsQuery.data?.map((item) => (
                <tr key={item.id} className="border-t border-stone-100">
                  <td className="px-5 py-4 font-medium text-ink">{item.name}</td>
                  <td className="px-5 py-4 text-stone-600">{item.studentNo ?? '-'}</td>
                  <td className="px-5 py-4 text-stone-600">{item.gender ?? '-'}</td>
                  <td className="px-5 py-4 text-stone-600">{item.class?.name ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
