-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "recurrenceId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "recurrenceId" TEXT;

-- CreateIndex
CREATE INDEX "Event_recurrenceId_idx" ON "Event"("recurrenceId");

-- CreateIndex
CREATE INDEX "Task_recurrenceId_idx" ON "Task"("recurrenceId");
