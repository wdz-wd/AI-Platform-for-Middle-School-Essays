import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, uploadFetch } from '../../api/client'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { FilePicker } from '../../components/ui/file-picker'
import { Input } from '../../components/ui/input'
import { Textarea } from '../../components/ui/textarea'
import { getCurrentAcademicYear, isCurrentAcademicYear } from '../../lib/academic-year'
import type { ClassItem, TaskItem } from '../../types/api'

export function NewTaskPage() {
  const navigate = useNavigate()
  const classesQuery = useQuery({
    queryKey: ['classes'],
    queryFn: () => apiFetch<ClassItem[]>('/classes'),
  })
  const [form, setForm] = useState({
    classIds: [] as string[],
    title: '',
    note: '',
    topicText: '',
  })
  const [topicFile, setTopicFile] = useState<File | null>(null)
  const [classSelectOpen, setClassSelectOpen] = useState(false)
  const classSelectRef = useRef<HTMLDivElement | null>(null)
  const currentAcademicYear = getCurrentAcademicYear()
  const currentClasses =
    classesQuery.data?.filter((item) => isCurrentAcademicYear(item.academicYear)) ?? []
  const selectedClasses =
    currentClasses.filter((item) => form.classIds.includes(item.id)) ?? []

  const mutation = useMutation({
    mutationFn: async () => {
      const task = await apiFetch<TaskItem>('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          classIds: selectedClasses.map((item) => item.id),
        }),
      })

      if (topicFile) {
        const formData = new FormData()
        formData.append('file', topicFile)
        if (form.topicText.trim()) {
          formData.append('topicText', form.topicText.trim())
        }
        await uploadFetch(`/tasks/${task.id}/topic-files`, formData)
      }

      return task
    },
    onSuccess: (task) => navigate(`/tasks/${task.id}`),
  })

  useEffect(() => {
    if (!classSelectOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!classSelectRef.current?.contains(event.target as Node)) {
        setClassSelectOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [classSelectOpen])

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
          <div className="relative" ref={classSelectRef}>
            <button
              className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-stone-300 bg-white px-3 py-2 text-left text-sm outline-none transition focus:border-accent"
              type="button"
              onClick={() => setClassSelectOpen((open) => !open)}
            >
              <span className="flex flex-wrap gap-2">
                {selectedClasses.length ? (
                  selectedClasses.map((item) => (
                    <span
                      key={item.id}
                      className="rounded-full bg-blue-50 px-3 py-1 font-semibold text-accent"
                    >
                      {item.name}
                    </span>
                  ))
                ) : (
                  <span className="text-stone-400">请选择班级</span>
                )}
              </span>
              <span className="text-stone-400">{classSelectOpen ? '收起' : '展开'}</span>
            </button>
            {classSelectOpen ? (
              <div className="absolute left-0 right-0 z-20 mt-2 max-h-72 overflow-y-auto rounded-xl border border-stone-200 bg-white p-2 shadow-lg">
                {currentClasses.map((item) => {
                  const checked = form.classIds.includes(item.id)
                  return (
                    <label
                      key={item.id}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50"
                    >
                      <input
                        checked={checked}
                        className="size-4 accent-blue-600"
                        type="checkbox"
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            classIds: event.target.checked
                              ? [...current.classIds, item.id]
                              : current.classIds.filter(
                                  (classId) => classId !== item.id,
                                ),
                          }))
                        }
                      />
                      <span>{item.name}</span>
                    </label>
                  )
                })}
                {!currentClasses.length ? (
                  <p className="px-3 py-2 text-sm text-stone-500">
                    当前学年（{currentAcademicYear}）暂无可选班级
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
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
            placeholder="这里填写作文题目、题干和材料内容。"
            value={form.topicText}
            onChange={(event) =>
              setForm((current) => ({ ...current, topicText: event.target.value }))
            }
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-stone-600">
            题面附件（选填）
          </label>
          <FilePicker
            accept=".jpg,.jpeg,.png,.pdf"
            hint="可上传题面截图或 PDF，主要用于留存原题文件"
            label="选择题面附件"
            value={topicFile}
            onChange={(files) => setTopicFile(files?.[0] ?? null)}
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
            disabled={!selectedClasses.length || !form.title || mutation.isPending}
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
