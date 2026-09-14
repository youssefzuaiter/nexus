import "server-only";
import { AppError } from "@/lib/api-response";
import * as courseRepository from "@/repositories/course-repository";

/**
 * A client-supplied courseId must be checked, exactly as a projectId is: the
 * database would otherwise happily attach one tenant's note to another
 * tenant's course on an id alone.
 */
export async function assertCourseOwned(
  userId: string,
  courseId: string | null | undefined,
): Promise<void> {
  if (!courseId) return;

  const course = await courseRepository.getCourseRow(userId, courseId);
  if (!course) {
    throw new AppError("RESOURCE_NOT_FOUND", "That course no longer exists.");
  }
}
