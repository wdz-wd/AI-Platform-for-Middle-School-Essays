import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch } from '../../api/client'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { useAuthStore } from '../../stores/auth-store'
import type { ClassItem } from '../../types/api'

function toAcademicYear(startYear: string) {
  if (!startYear) return ''
  const year = Number(startYear)
  if (!Number.isFinite(year)) return ''
  return `${year}-${year + 1}`
}

export function ClassesPage() {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const [form, setForm] = useState({ name: '', grade: '', academicStartYear: '' })
  const [isYearPickerOpen, setIsYearPickerOpen] = useState(false)
  const [yearPageEnd, setYearPageEnd] = useState(() => new Date().getFullYear() + 1)
  const yearPickerRef = useRef<HTMLDivElement | null>(null)
  const academicYear = toAcademicYear(form.academicStartYear)
  const academicYearOptions = useMemo(() => {
    return Array.from({ length: 6 }, (_, index) => yearPageEnd - 5 + index)
  }, [yearPageEnd])

  const classesQuery = useQuery({
    queryKey: ['classes'],
    queryFn: () => apiFetch<ClassItem[]>('/classes'),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch('/classes', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          grade: form.grade,
          academicYear,
        }),
      }),
    onSuccess: async () => {
      setForm({ name: '', grade: '', academicStartYear: '' })
      await queryClient.invalidateQueries({ queryKey: ['classes'] })
    },
  })

  useEffect(() => {
    if (!isYearPickerOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!yearPickerRef.current?.contains(event.target as Node)) {
        setIsYearPickerOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isYearPickerOpen])

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
          <select
            className="h-11 rounded-xl border border-stone-300 bg-white px-3 text-sm outline-none focus:border-accent"
            value={form.grade}
            onChange={(event) =>
              setForm((current) => ({ ...current, grade: event.target.value }))
            }
          >
            <option value="">选择年级</option>
            <option value="七年级">七年级</option>
            <option value="八年级">八年级</option>
            <option value="九年级">九年级</option>
          </select>
          <div className="relative" ref={yearPickerRef}>
            <button
              className="h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-left text-sm outline-none transition hover:border-accent focus:border-accent"
              type="button"
              onClick={() => setIsYearPickerOpen((current) => !current)}
            >
              <span className="text-ink">{academicYear || '选择起始学年'}</span>
            </button>
            {isYearPickerOpen ? (
              <div className="absolute left-0 top-[calc(100%+8px)] z-30 w-full min-w-[260px] rounded-2xl border border-stone-200 bg-white p-3 shadow-xl">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <button
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-stone-500 transition hover:bg-stone-100 hover:text-ink"
                    type="button"
                    onClick={() => setYearPageEnd((current) => current - 6)}
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <p className="text-sm font-semibold text-stone-600">
                    {academicYearOptions[0]} - {academicYearOptions[5]}
                  </p>
                  <button
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-stone-500 transition hover:bg-stone-100 hover:text-ink"
                    type="button"
                    onClick={() => setYearPageEnd((current) => current + 6)}
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {academicYearOptions.map((year) => {
                    const value = String(year)
                    const selected = form.academicStartYear === value
                    return (
                      <button
                        key={year}
                        className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                          selected
                            ? 'border-blue-500 bg-blue-50 text-accent'
                            : 'border-stone-200 bg-white text-stone-600 hover:border-blue-200 hover:bg-blue-50'
                        }`}
                        type="button"
                        onClick={() => {
                          setForm((current) => ({
                            ...current,
                            academicStartYear: value,
                          }))
                          setIsYearPickerOpen(false)
                        }}
                      >
                        {year}-{year + 1}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </div>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
