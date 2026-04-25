import type { SubmissionStatus, TaskStatus } from '../types/api'

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

const taskStatusMap: Record<TaskStatus, { label: string; tone: BadgeTone }> = {
  CREATED: { label: '待开始', tone: 'neutral' },
  PROCESSING: { label: '批改中', tone: 'warning' },
  PARTIAL_DONE: { label: '部分完成', tone: 'warning' },
  DONE: { label: '已完成', tone: 'success' },
  FAILED: { label: '失败', tone: 'danger' },
}

const submissionStatusMap: Record<
  SubmissionStatus,
  { label: string; tone: BadgeTone }
> = {
  UPLOADED: { label: '已上传', tone: 'neutral' },
  TEXT_EXTRACTING: { label: '识别中', tone: 'warning' },
  TEXT_PENDING_CORRECTION: { label: '待校核', tone: 'warning' },
  TEXT_READY: { label: '待评阅', tone: 'neutral' },
  AI_PROCESSING: { label: 'AI评阅中', tone: 'warning' },
  AI_DONE: { label: '已完成', tone: 'success' },
  REVIEWED: { label: '已审核', tone: 'info' },
  FAILED: { label: '失败', tone: 'danger' },
}

export function getTaskStatusMeta(status: TaskStatus) {
  return taskStatusMap[status]
}

export function getSubmissionStatusMeta(status: SubmissionStatus) {
  return submissionStatusMap[status]
}
