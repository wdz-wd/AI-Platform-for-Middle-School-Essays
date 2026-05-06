import { ReviewScorePill } from '../../components/review/score-display'
import type { ReviewScore, SubmissionPrintData } from '../../types/api'

type PrintReviewSections = SubmissionPrintData['sections']

type PrintReviewContentProps = {
  studentName: string
  className: string
  taskTitle: string
  teacherFinalComment?: string
  score: ReviewScore
  sections: PrintReviewSections
  pageBreak?: boolean
}

export function PrintReviewContent({
  studentName,
  className,
  taskTitle,
  teacherFinalComment,
  score,
  sections,
  pageBreak = false,
}: PrintReviewContentProps) {
  return (
    <article
      className={
        pageBreak
          ? 'break-after-page pb-8 last:break-after-auto print:break-after-page print:last:break-after-auto'
          : undefined
      }
    >
      <header className="border-b border-stone-300 pb-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-black text-stone-900">作文点评单</h1>
            <p className="mt-3 text-sm text-stone-500">
              {className} · {studentName}
            </p>
            <p className="mt-2 font-semibold text-stone-800">{taskTitle}</p>
          </div>
          <ReviewScorePill
            className="rounded-lg px-4 py-3 [&_p:last-child]:text-5xl"
            label={null}
            score={score}
            showMax={false}
          />
        </div>
      </header>

      <main className="space-y-6 pt-8">
        {teacherFinalComment?.trim() ? (
          <section>
            <h2 className="font-bold text-stone-900">最终评语</h2>
            <p className="mt-2 whitespace-pre-wrap">{teacherFinalComment}</p>
          </section>
        ) : null}
        <section>
          <h2 className="font-bold text-stone-900">结构化点评</h2>
          <div className="mt-2 space-y-4">
            <p className="whitespace-pre-wrap">
              <strong>总体评价：</strong>
              {sections.summary}
            </p>
            <p className="whitespace-pre-wrap">
              <strong>亮点概述：</strong>
              {sections.strengths}
            </p>
            <p className="whitespace-pre-wrap">
              <strong>主要问题：</strong>
              {sections.issues}
            </p>
            <p className="whitespace-pre-wrap">
              <strong>修改建议：</strong>
              {sections.suggestions}
            </p>
            <p className="whitespace-pre-wrap">
              <strong>参考修改：</strong>
              {sections.rewriteExample}
            </p>
          </div>
        </section>
      </main>
    </article>
  )
}
