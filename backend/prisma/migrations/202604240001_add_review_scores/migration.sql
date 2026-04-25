ALTER TABLE "Review"
ADD COLUMN "scoreTotal" INTEGER,
ADD COLUMN "scoreLevel" TEXT,
ADD COLUMN "scoreContent" INTEGER,
ADD COLUMN "scoreStructure" INTEGER,
ADD COLUMN "scoreExpression" INTEGER,
ADD COLUMN "scoreBase" INTEGER,
ADD COLUMN "scoreDevelopment" INTEGER,
ADD COLUMN "scoreDeduction" INTEGER,
ADD COLUMN "scoreDevelopmentReason" TEXT,
ADD COLUMN "scoreDeductionReason" TEXT,
ADD COLUMN "scoreManualReviewHint" TEXT;
