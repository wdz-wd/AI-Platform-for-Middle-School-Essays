import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { apiFetch } from '../../api/client'
import type { TaskPrintData } from '../../types/api'

export function PrintTaskPage() {
  const { id = '' } = useParams()
  const query = useQuery({
    queryKey: ['print-task', id],
    queryFn: () => apiFetch<TaskPrintData>(`/tasks/${id}/print`),
  })

  useEffect(() => {
    if (query.data) {
      window.setTimeout(() => window.print(), 300)
    }
  }, [query.data])

  if (!query.data) {
    return <div className="p-8 text-sm text-stone-500">加载打印内容...</div>
  }

  return (
    <div className="mx-auto max-w-[900px] bg-white px-10 py-12 text-[15px] leading-8 text-stone-800 print:max-w-none print:px-6 print:py-8">
      <header className="border-b border-stone-300 pb-6">
        <h1 className="text-3xl font-black text-stone-900">{query.data.taskTitle}</h1>
        <p className="mt-3 text-sm text-stone-500">{query.data.className}</p>
      </header>

      <main className="space-y-10 pt-8">
        {query.data.items.map((item) => (
          <section
            key={item.submissionId}
            className="break-inside-avoid border-b border-dashed border-stone-300 pb-8 last:border-b-0"
          >
            <h2 className="text-xl font-bold text-stone-900">{item.studentName}</h2>
            <p className="mt-3 whitespace-pre-wrap">{item.finalComment}</p>
          </section>
        ))}
      </main>
    </div>
  )
}
