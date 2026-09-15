-- AlterTable
ALTER TABLE "User" ALTER COLUMN "name" SET DEFAULT 'New user';

-- AlterTable
ALTER TABLE "UserProfile" ALTER COLUMN "university" SET DEFAULT '',
ALTER COLUMN "program" SET DEFAULT '',
ALTER COLUMN "studentId" SET DEFAULT '';
