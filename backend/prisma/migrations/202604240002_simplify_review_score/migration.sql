ALTER TABLE "Review"
DROP COLUMN IF EXISTS "scoreLevel",
DROP COLUMN IF EXISTS "scoreContent",
DROP COLUMN IF EXISTS "scoreStructure",
DROP COLUMN IF EXISTS "scoreExpression",
DROP COLUMN IF EXISTS "scoreBase",
DROP COLUMN IF EXISTS "scoreDevelopment",
DROP COLUMN IF EXISTS "scoreDeduction",
DROP COLUMN IF EXISTS "scoreDevelopmentReason",
DROP COLUMN IF EXISTS "scoreDeductionReason",
DROP COLUMN IF EXISTS "scoreManualReviewHint";
