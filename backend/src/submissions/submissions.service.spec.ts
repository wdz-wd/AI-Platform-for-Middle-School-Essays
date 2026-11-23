import { UserRole } from '@prisma/client';
import { SubmissionsService } from './submissions.service';

describe('SubmissionsService student candidates', () => {
  it('retries a failed essay without clearing its saved remote checkpoint', async () => {
    const prisma = { submission: { update: jest.fn().mockResolvedValue({}) } };
    const jobs = { enqueueSubmissionOcr: jest.fn() };
    const service = new SubmissionsService(
      prisma as never,
      {} as never,
      jobs as never,
    );
    jest
      .spyOn(service, 'getById')
      .mockResolvedValue({ id: 'failed', status: 'FAILED' } as never);
    await service.retryOcr('failed', {
      id: 'teacher',
      role: UserRole.TEACHER,
    } as never);
    expect(prisma.submission.update).toHaveBeenCalledWith({
      where: { id: 'failed' },
      data: {
        status: 'TEXT_EXTRACTING',
        ocrRetryCount: 0,
        ocrNextRetryAt: null,
        ocrLastError: null,
      },
    });
    expect(jobs.enqueueSubmissionOcr).toHaveBeenCalledWith('failed');
  });

  it('deduplicates retry clicks for an essay already being recognized', async () => {
    const jobs = { enqueueSubmissionOcr: jest.fn() };
    const service = new SubmissionsService(
      {} as never,
      {} as never,
      jobs as never,
    );
    jest
      .spyOn(service, 'getById')
      .mockResolvedValue({ status: 'TEXT_EXTRACTING' } as never);
    await service.retryOcr('active', {} as never);
    expect(jobs.enqueueSubmissionOcr).not.toHaveBeenCalled();
  });
  it('searches every class selected by the task and keeps same-name students separate', async () => {
    const prisma = { student: { findMany: jest.fn() } };
    const service = new SubmissionsService(
      prisma as never,
      {} as never,
      {} as never,
    );
    jest.spyOn(service, 'getById').mockResolvedValue({
      ocrHeaderName: '刘诗琳',
      task: {
        classes: [
          { id: 'class-a', name: '七年级一班' },
          { id: 'class-b', name: '七年级二班' },
        ],
      },
    } as never);
    prisma.student.findMany.mockResolvedValue([
      {
        id: 'student-a',
        name: '刘诗琳',
        studentNo: '001',
        classId: 'class-a',
        class: { id: 'class-a', name: '七年级一班' },
      },
      {
        id: 'student-b',
        name: '刘诗琳',
        studentNo: '002',
        classId: 'class-b',
        class: { id: 'class-b', name: '七年级二班' },
      },
    ]);

    const result = await service.getStudentCandidates('submission-1', {
      id: 'teacher-1',
      username: 'teacher',
      displayName: '教师',
      role: UserRole.TEACHER,
    });

    expect(prisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { classId: { in: ['class-a', 'class-b'] }, status: 'ACTIVE' },
      }),
    );
    expect(result.candidates.map((candidate) => candidate.id)).toEqual([
      'student-a',
      'student-b',
    ]);
  });
});
