-- Add nullable selected class on submissions.
ALTER TABLE "Submission" ADD COLUMN "classId" TEXT;

-- Backfill existing submissions from their task's legacy class.
UPDATE "Submission" AS s
SET "classId" = t."classId"
FROM "EssayTask" AS t
WHERE s."taskId" = t."id";

-- Create many-to-many task class links while keeping EssayTask.classId as a legacy/default class.
CREATE TABLE "EssayTaskClass" (
    "taskId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EssayTaskClass_pkey" PRIMARY KEY ("taskId","classId")
);

INSERT INTO "EssayTaskClass" ("taskId", "classId")
SELECT "id", "classId"
FROM "EssayTask"
ON CONFLICT DO NOTHING;

ALTER TABLE "Submission" ADD CONSTRAINT "Submission_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EssayTaskClass" ADD CONSTRAINT "EssayTaskClass_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "EssayTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EssayTaskClass" ADD CONSTRAINT "EssayTaskClass_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;
