import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiFetch, uploadFetch } from '../../api/client'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { getCurrentAcademicYear, isCurrentAcademicYear } from '../../lib/academic-year'
import type { ClassItem, StudentItem } from '../../types/api'

type StudentForm = {
  classId: string
  name: string
  studentNo: string
  gender: string
}

type ImportStudentsResult = {
  total: number
  created: number
  skipped: number
}

export function StudentsPage() {
  const queryClient = useQueryClient()
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const [filters, setFilters] = useState({
    classId: '',
    name: '',
    studentNo: '',
    gender: '',
  })
  const [editingStudent, setEditingStudent] = useState<StudentItem | null>(null)
  const [editForm, setEditForm] = useState<StudentForm>({
    classId: '',
    name: '',
    studentNo: '',
    gender: '',
  })
  const [deletingStudent, setDeletingStudent] = useState<StudentItem | null>(null)
  const [importFeedback, setImportFeedback] = useState<{
    tone: 'success' | 'error'
    message: string
  } | null>(null)

  const invalidateStudentRelatedQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['students'] }),
      queryClient.invalidateQueries({ queryKey: ['classes'] }),
      queryClient.invalidateQueries({ queryKey: ['archive'] }),
      queryClient.invalidateQueries({ queryKey: ['submission'] }),
      queryClient.invalidateQueries({ queryKey: ['task'] }),
    ])
  }

  const classesQuery = useQuery({
    queryKey: ['classes'],
    queryFn: () => apiFetch<ClassItem[]>('/classes'),
  })
  const currentAcademicYear = getCurrentAcademicYear()
  const currentClasses = useMemo(
    () => (classesQuery.data ?? []).filter((item) => isCurrentAcademicYear(item.academicYear)),
    [classesQuery.data],
  )
  const currentClassIds = useMemo(
    () => new Set(currentClasses.map((item) => item.id)),
    [currentClasses],
  )

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
      await invalidateStudentRelatedQueries()
    },
  })

  const importMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData()
      formData.append('classId', filters.classId)
      formData.append('file', file)
      return uploadFetch<ImportStudentsResult>('/students/import', formData)
    },
    onSuccess: async (result) => {
      setImportFeedback({
        tone: 'success',
        message: `导入完成：新增 ${result.created} 人，跳过 ${result.skipped} 人`,
      })
      await invalidateStudentRelatedQueries()
    },
    onError: (error) => {
      setImportFeedback({
        tone: 'error',
        message: (error as Error).message,
      })
    },
    onSettled: () => {
      if (importInputRef.current) {
        importInputRef.current.value = ''
      }
    },
  })

  const updateMutation = useMutation({
    mutationFn: () =>
      editingStudent
        ? apiFetch(`/students/${editingStudent.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              classId: editForm.classId,
              name: editForm.name.trim(),
              studentNo: editForm.studentNo.trim(),
              gender: editForm.gender.trim(),
            }),
          })
        : Promise.resolve(),
    onSuccess: async () => {
      setEditingStudent(null)
      await invalidateStudentRelatedQueries()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () =>
      deletingStudent
        ? apiFetch(`/students/${deletingStudent.id}`, { method: 'DELETE' })
        : Promise.resolve(),
    onSuccess: async () => {
      setDeletingStudent(null)
      await invalidateStudentRelatedQueries()
    },
  })

  const canCreate = useMemo(
    () => !!filters.classId && !!filters.name.trim(),
    [filters.classId, filters.name],
  )
  const canSaveEdit = !!editForm.classId && !!editForm.name.trim()
  const visibleStudents = useMemo(() => {
    const students = studentsQuery.data ?? []
    if (filters.classId) return students
    return students.filter((item) => currentClassIds.has(item.classId))
  }, [currentClassIds, filters.classId, studentsQuery.data])

  const openEditDialog = (student: StudentItem) => {
    setEditingStudent(student)
    setEditForm({
      classId: student.classId,
      name: student.name,
      studentNo: student.studentNo ?? '',
      gender: student.gender ?? '',
    })
  }

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
          {currentClasses.map((item) => (
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
        <select
          className="h-11 rounded-xl border border-stone-300 bg-white px-3 text-sm outline-none focus:border-accent"
          value={filters.gender}
          onChange={(event) =>
            setFilters((current) => ({ ...current, gender: event.target.value }))
          }
        >
          <option value="">选择性别</option>
          <option value="男">男</option>
          <option value="女">女</option>
        </select>
        <div className="flex flex-wrap gap-2 lg:flex-nowrap">
          <Button
            disabled={!canCreate || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            添加学生
          </Button>
          <input
            ref={importInputRef}
            accept=".xlsx"
            className="sr-only"
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) {
                importMutation.mutate(file)
              }
            }}
          />
          <Button
            disabled={!filters.classId || importMutation.isPending}
            variant="secondary"
            onClick={() => importInputRef.current?.click()}
          >
            {importMutation.isPending ? '导入中...' : '模板导入'}
          </Button>
        </div>
      </Card>
      {importFeedback ? (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            importFeedback.tone === 'success'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-rose-50 text-rose-700'
          }`}
        >
          {importFeedback.message}
        </div>
      ) : null}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-stone-50 text-left text-stone-500">
              <tr>
                <th className="px-5 py-4 font-medium">姓名</th>
                <th className="px-5 py-4 font-medium">学号</th>
                <th className="px-5 py-4 font-medium">性别</th>
                <th className="px-5 py-4 font-medium">班级</th>
                <th className="w-[150px] px-5 py-4 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleStudents.map((item) => (
                <tr key={item.id} className="border-t border-stone-100">
                  <td className="px-5 py-4 font-medium text-ink">{item.name}</td>
                  <td className="px-5 py-4 text-stone-600">{item.studentNo ?? '-'}</td>
                  <td className="px-5 py-4 text-stone-600">{item.gender ?? '-'}</td>
                  <td className="px-5 py-4 text-stone-600">{item.class?.name ?? '-'}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-5">
                      <button
                        className="font-semibold text-accent"
                        type="button"
                        onClick={() => openEditDialog(item)}
                      >
                        编辑
                      </button>
                      <button
                        className="font-semibold text-rose-600"
                        type="button"
                        onClick={() => setDeletingStudent(item)}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!studentsQuery.isLoading && visibleStudents.length === 0 ? (
                <tr>
                  <td className="px-5 py-10 text-center text-stone-500" colSpan={5}>
                    当前学年（{currentAcademicYear}）暂无学生记录
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {editingStudent
        ? createPortal(
            <div
              className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-slate-950/45 p-4"
              onMouseDown={() => setEditingStudent(null)}
            >
              <div
                className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-accent">编辑学生</p>
                    <h2 className="mt-1 text-2xl font-black text-ink">
                      {editingStudent.name}
                    </h2>
                  </div>
                  <button
                    className="rounded-full p-2 text-stone-400 transition hover:bg-stone-100 hover:text-ink"
                    type="button"
                    onClick={() => setEditingStudent(null)}
                  >
                    <X className="size-5" />
                  </button>
                </div>

                <div className="mt-6 grid gap-4">
                  <label className="grid gap-2 text-sm font-medium text-stone-600">
                    班级
                    <select
                      className="h-11 rounded-xl border border-stone-300 bg-white px-3 text-sm outline-none focus:border-accent"
                      value={editForm.classId}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          classId: event.target.value,
                        }))
                      }
                    >
                      <option value="">请选择班级</option>
                      {currentClasses.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-stone-600">
                    姓名
                    <Input
                      value={editForm.name}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-2 text-sm font-medium text-stone-600">
                      学号
                      <Input
                        placeholder="学号"
                        value={editForm.studentNo}
                        onChange={(event) =>
                          setEditForm((current) => ({
                            ...current,
                            studentNo: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-stone-600">
                      性别
                      <select
                        className="h-11 rounded-xl border border-stone-300 bg-white px-3 text-sm outline-none focus:border-accent"
                        value={editForm.gender}
                        onChange={(event) =>
                          setEditForm((current) => ({
                            ...current,
                            gender: event.target.value,
                          }))
                        }
                      >
                        <option value="">选择性别</option>
                        <option value="男">男</option>
                        <option value="女">女</option>
                      </select>
                    </label>
                  </div>
                </div>

                {updateMutation.isError ? (
                  <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {(updateMutation.error as Error).message}
                  </p>
                ) : null}

                <div className="mt-6 flex justify-end gap-3">
                  <Button variant="secondary" onClick={() => setEditingStudent(null)}>
                    取消
                  </Button>
                  <Button
                    disabled={!canSaveEdit || updateMutation.isPending}
                    onClick={() => updateMutation.mutate()}
                  >
                    保存修改
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {deletingStudent
        ? createPortal(
            <div
              className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-slate-950/45 p-4"
              onMouseDown={() => setDeletingStudent(null)}
            >
              <div
                className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-rose-600">删除学生</p>
                    <h2 className="mt-1 text-2xl font-black text-ink">
                      {deletingStudent.name}
                    </h2>
                  </div>
                  <button
                    className="rounded-full p-2 text-stone-400 transition hover:bg-stone-100 hover:text-ink"
                    type="button"
                    onClick={() => setDeletingStudent(null)}
                  >
                    <X className="size-5" />
                  </button>
                </div>

                <p className="mt-5 text-sm leading-6 text-stone-600">
                  是否确定删除，此操作不可恢复
                </p>

                {deleteMutation.isError ? (
                  <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {(deleteMutation.error as Error).message}
                  </p>
                ) : null}

                <div className="mt-6 flex justify-end gap-3">
                  <Button variant="secondary" onClick={() => setDeletingStudent(null)}>
                    取消
                  </Button>
                  <Button
                    disabled={deleteMutation.isPending}
                    variant="danger"
                    onClick={() => deleteMutation.mutate()}
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
