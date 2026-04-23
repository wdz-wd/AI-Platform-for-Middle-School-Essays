export type UserRole = 'ADMIN' | 'TEACHER'

export type User = {
  id: string
  username: string
  displayName: string
  role: UserRole
}

export type ClassItem = {
  id: string
  name: string
  grade?: string | null
  academicYear?: string | null
  teacher?: {
    id: string
    displayName: string
    username: string
  } | null
  _count?: {
    students: number
    essayTasks: number
  }
}

export type StudentItem = {
  id: string
  classId: string
  name: string
  studentNo?: string | null
  gender?: string | null
  status: string
  class?: {
    id: string
    name: string
    grade?: string | null
  }
}

export type TaskStatus =
  | 'CREATED'
  | 'PROCESSING'
  | 'PARTIAL_DONE'
  | 'DONE'
  | 'FAILED'

export type SubmissionStatus =
  | 'UPLOADED'
  | 'TEXT_EXTRACTING'
  | 'TEXT_PENDING_CORRECTION'
  | 'TEXT_READY'
  | 'AI_PROCESSING'
  | 'AI_DONE'
  | 'REVIEWED'
  | 'FAILED'

export type TopicGuidance = {
  summary: string
  ideas: string
  structure: string
  classroomTips: string
}

export type TaskItem = {
  id: string
  title: string
  note?: string | null
  topicText?: string | null
  topicGuidance?: TopicGuidance | null
  status: TaskStatus
  totalCount: number
  doneCount: number
  failedCount: number
  createdAt: string
  class: {
    id: string
    name: string
    grade?: string | null
  }
}

export type TaskDetail = TaskItem & {
  topicFiles: Array<{
    id: string
    fileName: string
    publicUrl: string
    createdAt: string
  }>
  submissions: Array<{
    id: string
    detectedName?: string | null
    detectedClass?: string | null
    status: SubmissionStatus
    createdAt: string
    student?: {
      id: string
      name: string
      studentNo?: string | null
    } | null
    files: Array<{
      id: string
      fileName: string
      publicUrl: string
      fileType: string
    }>
    text?: {
      ocrText?: string | null
      correctedText?: string | null
    } | null
    review?: {
      aiSummary?: string | null
      aiStrengths?: string | null
      aiIssues?: string | null
      aiSuggestions?: string | null
      aiRewriteExample?: string | null
      finalComment?: string | null
    } | null
  }>
}

export type SubmissionDetail = {
  id: string
  detectedName?: string | null
  status: SubmissionStatus
  student?: StudentItem | null
  files: Array<{
    id: string
    fileName: string
    publicUrl: string
    fileType: string
  }>
  text?: {
    ocrText?: string | null
    correctedText?: string | null
  } | null
  review?: {
    aiSummary?: string | null
    aiStrengths?: string | null
    aiIssues?: string | null
    aiSuggestions?: string | null
    aiRewriteExample?: string | null
    teacherComment?: string | null
    finalComment?: string | null
  } | null
  task: {
    id: string
    title: string
    topicText?: string | null
    class: {
      id: string
      name: string
    }
    submissions: Array<{
      id: string
      detectedName?: string | null
      status: SubmissionStatus
    }>
  }
}

export type ArchiveItem = {
  id: string
  detectedName?: string | null
  status: SubmissionStatus
  createdAt: string
  task: {
    id: string
    title: string
  }
  student?: {
    id: string
    name: string
    studentNo?: string | null
  } | null
  review?: {
    finalComment?: string | null
    aiSummary?: string | null
  } | null
}

export type SubmissionPrintData = {
  submissionId: string
  studentName: string
  className: string
  taskTitle: string
  topicText?: string | null
  finalComment: string
  sections: {
    summary: string
    strengths: string
    issues: string
    suggestions: string
    rewriteExample: string
  }
}

export type TaskPrintData = {
  taskId: string
  taskTitle: string
  className: string
  items: Array<{
    submissionId: string
    studentName: string
    finalComment: string
    sections: SubmissionPrintData['sections']
  }>
}
