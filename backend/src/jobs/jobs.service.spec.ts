import { JobsService } from './jobs.service';

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn().mockResolvedValue(Buffer.from('essay image')),
}));

describe('JobsService OCR student binding', () => {
  const prisma = {
    student: { findMany: jest.fn() },
    submission: { updateMany: jest.fn(), findMany: jest.fn() },
  };
  const service = new JobsService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const bind = (submission: object, name: string) =>
    (
      service as unknown as {
        bindTopStudentCandidate: (
          submission: object,
          name: string,
        ) => Promise<void>;
      }
    ).bindTopStudentCandidate(submission, name);

  beforeEach(() => {
    prisma.student.findMany.mockReset();
    prisma.submission.updateMany.mockReset();
    prisma.submission.findMany.mockReset();
  });

  it('matches across every selected task class and preserves the binding race guard', async () => {
    prisma.student.findMany.mockResolvedValue([
      { id: 'student-1', name: '张小明', classId: 'class-b' },
    ]);
    await bind(
      {
        id: 'submission-1',
        studentId: null,
        classId: 'class-b',
        task: {
          classId: 'class-a',
          classes: [{ classId: 'class-a' }, { classId: 'class-b' }],
        },
      },
      '张小明',
    );

    expect(prisma.student.findMany).toHaveBeenCalledWith({
      where: { classId: { in: ['class-a', 'class-b'] }, status: 'ACTIVE' },
      select: { id: true, name: true, classId: true },
    });
    expect(prisma.submission.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'submission-1',
        studentId: null,
        classId: 'class-b',
        deletedAt: null,
      },
      data: { studentId: 'student-1', classId: 'class-b' },
    });
  });

  it('leaves a manually bound student untouched', async () => {
    await bind(
      {
        id: 'submission-2',
        studentId: 'student-2',
        classId: 'class-a',
        task: { classId: 'class-a', classes: [{ classId: 'class-a' }] },
      },
      '张小明',
    );
    expect(prisma.student.findMany).not.toHaveBeenCalled();
    expect(prisma.submission.updateMany).not.toHaveBeenCalled();
  });

  it('chooses the same first candidate for tied duplicate names regardless of database order', async () => {
    prisma.student.findMany.mockResolvedValue([
      { id: 'student-2', name: '张小明', classId: 'class-b' },
      { id: 'student-1', name: '张小明', classId: 'class-a' },
    ]);
    await bind(
      {
        id: 'submission-3',
        studentId: null,
        classId: null,
        task: {
          classId: 'class-a',
          classes: [{ classId: 'class-a' }, { classId: 'class-b' }],
        },
      },
      '张小明',
    );
    expect(prisma.submission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { studentId: 'student-1', classId: 'class-a' },
      }),
    );
  });

  it.each([
    ['周雅', 'zhao', 'class-a'],
    ['张诗琳', 'chen', 'class-b'],
  ])(
    'automatically binds the highest ranked fuzzy candidate for %s',
    async (name, id, classId) => {
      prisma.student.findMany.mockResolvedValue([
        { id: 'chen', name: '刘诗琳', classId: 'class-b' },
        { id: 'zhao', name: '周文佳', classId: 'class-a' },
      ]);
      await bind(
        {
          id: 'submission-fuzzy',
          studentId: null,
          classId: 'class-b',
          task: {
            classId: 'class-a',
            classes: [{ classId: 'class-a' }, { classId: 'class-b' }],
          },
        },
        name,
      );
      expect(prisma.submission.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'submission-fuzzy',
          studentId: null,
          classId: 'class-b',
          deletedAt: null,
        },
        data: { studentId: id, classId },
      });
    },
  );

  it.each(['', '周文佳'])(
    'leaves the student empty when there is no eligible candidate for %s',
    async (name) => {
      prisma.student.findMany.mockResolvedValue([
        { id: 'student-1', name: '张小明', classId: 'class-a' },
      ]);
      await bind(
        {
          id: 'submission-no-match',
          studentId: null,
          classId: null,
          task: { classId: 'class-a', classes: [{ classId: 'class-a' }] },
        },
        name,
      );
      expect(prisma.submission.updateMany).not.toHaveBeenCalled();
    },
  );

  it('fills existing unbound records from saved header names without repeating OCR', async () => {
    const task = { classId: 'class-a', classes: [{ classId: 'class-a' }] };
    prisma.submission.findMany
      .mockResolvedValueOnce([
        {
          id: 'old-a',
          studentId: null,
          classId: null,
          ocrHeaderName: '周雅',
          task,
        },
        {
          id: 'old-b',
          studentId: null,
          classId: null,
          ocrHeaderName: '张诗琳',
          task,
        },
      ])
      .mockResolvedValueOnce([]);
    prisma.student.findMany.mockResolvedValue([
      { id: 'zhao', name: '周文佳', classId: 'class-a' },
      { id: 'chen', name: '刘诗琳', classId: 'class-a' },
    ]);
    await (
      service as unknown as {
        bindPreviouslyUnboundStudents: () => Promise<void>;
      }
    ).bindPreviouslyUnboundStudents();
    expect(prisma.submission.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.submission.findMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      task: { deletedAt: null },
      studentId: null,
      ocrHeaderName: { not: null },
      status: { not: 'TEXT_EXTRACTING' },
    });
    expect(prisma.submission.findMany.mock.calls[1][0].where.id).toEqual({
      gt: 'old-b',
    });
  });
});

describe('JobsService OCR-to-binding integration', () => {
  it.each([
    { ocrHeaderName: '张诗琳', ocrRawText: '作文标题\n正文中没有页眉姓名' },
    { ocrHeaderName: undefined, ocrRawText: '姓名：张诗琳\n正文' },
  ])(
    'binds from crop results or full-page results before enqueueing review: %j',
    async (names) => {
      const submission = {
        id: 'submission-ocr',
        taskId: 'task',
        studentId: null,
        classId: null,
        text: null,
        task: { classId: 'class-a', classes: [{ classId: 'class-a' }] },
        files: [{ filePath: 'essay.jpg', fileType: 'JPG' }],
      };
      const db = {
        student: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { id: 'chen', name: '刘诗琳', classId: 'class-a' },
            ]),
        },
        submission: {
          findFirst: jest.fn().mockResolvedValue(submission),
          update: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        submissionText: { upsert: jest.fn().mockResolvedValue({}) },
        essayTask: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      const extraction = {
        extractText: jest.fn().mockResolvedValue({
          text: '这是一篇识别完整并可以进入批阅阶段的作文正文。'.repeat(5),
          source: 'PADDLE_OCR',
          ...names,
        }),
      };
      const service = new JobsService(
        db as never,
        {} as never,
        { toAbsolutePath: () => 'essay.jpg' } as never,
        extraction as never,
      );
      const enqueue = jest
        .spyOn(service, 'enqueueSubmissionReview')
        .mockImplementation(() => undefined);
      await (
        service as unknown as {
          processSubmissionOcr: (id: string) => Promise<void>;
        }
      ).processSubmissionOcr(submission.id);
      expect(db.submission.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { studentId: 'chen', classId: 'class-a' },
        }),
      );
      expect(db.submission.update).toHaveBeenLastCalledWith({
        where: { id: submission.id },
        data: {
          status: 'TEXT_READY',
          ocrHeaderName: '张诗琳',
          ocrRetryCount: 0,
          ocrNextRetryAt: null,
          ocrLastError: null,
        },
      });
      expect(enqueue).toHaveBeenCalledWith(submission.id);
      expect(db.submission.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        enqueue.mock.invocationCallOrder[0],
      );
    },
  );
});
