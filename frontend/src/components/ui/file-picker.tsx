import { UploadCloud } from 'lucide-react'
import * as React from 'react'
import { cn } from '../../lib/utils'

type FilePickerProps = {
  accept?: string
  multiple?: boolean
  label: string
  hint?: string
  value?: File | FileList | null
  onChange: (files: FileList | null) => void
}

export function FilePicker({
  accept,
  multiple,
  label,
  hint,
  value,
  onChange,
}: FilePickerProps) {
  const inputId = React.useId()
  const summary = getFileSummary(value)

  return (
    <div className="space-y-2">
      <input
        id={inputId}
        accept={accept}
        className="sr-only"
        multiple={multiple}
        type="file"
        onChange={(event) => onChange(event.target.files)}
      />
      <label
        className={cn(
          'group flex cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-4 transition',
          'hover:border-accent hover:bg-teal-50/60',
        )}
        htmlFor={inputId}
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white text-accent shadow-sm transition group-hover:scale-105">
          <UploadCloud className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{label}</span>
          <span className="mt-1 block truncate text-xs text-stone-500">
            {summary || hint || '支持 jpg、png、pdf'}
          </span>
        </span>
        <span className="rounded-xl bg-accent px-3 py-2 text-xs font-bold text-white shadow-sm">
          选择文件
        </span>
      </label>
    </div>
  )
}

function getFileSummary(value?: File | FileList | null) {
  if (!value) {
    return ''
  }

  if (value instanceof File) {
    return value.name
  }

  const files = Array.from(value)
  if (files.length === 0) {
    return ''
  }

  if (files.length === 1) {
    return files[0].name
  }

  return `已选择 ${files.length} 个文件`
}
