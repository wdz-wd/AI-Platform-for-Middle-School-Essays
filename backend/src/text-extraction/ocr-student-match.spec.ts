import {
  extractOcrHeaderName,
  matchStudentFromOcrHeader,
  rankStudentCandidates,
} from './ocr-student-match';
import { getUnihanRadicalStroke } from './unihan';

const students = [
  { id: '1', name: '张小明', classId: 'a' },
  { id: '2', name: '李小红', classId: 'a' },
];

describe('matchStudentFromOcrHeader', () => {
  it('does not interpret a blank grade/class header as a student name', () => {
    expect(
      extractOcrHeaderName('___年级___班\n8K 作文活页\n姓名 ___\n作文标题'),
    ).toBeNull();
  });
  it('matches a bare name before the worksheet header', () => {
    expect(
      matchStudentFromOcrHeader(
        '张小明\n学号 年 月 日\n续写我的人生\n正文',
        students,
      )?.id,
    ).toBe('1');
  });

  it('matches an explicitly labelled name', () => {
    expect(
      matchStudentFromOcrHeader(
        '8K作文活页\n姓名：李小红 学号：12\n作文标题',
        students,
      )?.id,
    ).toBe('2');
  });

  it('does not match a name mentioned only in the essay', () => {
    expect(
      matchStudentFromOcrHeader('我的同桌\n张小明帮助过我。', students),
    ).toBeNull();
  });

  it('does not choose between students with the same name', () => {
    expect(
      matchStudentFromOcrHeader('张小明\n学号 年 月 日\n正文', [
        ...students,
        { id: '3', name: '张小明', classId: 'b' },
      ]),
    ).toBeNull();
  });

  it('does not guess a name from unlabelled body text', () => {
    expect(
      matchStudentFromOcrHeader('张小明\n人生是一篇续章。', students),
    ).toBeNull();
  });

  it('extracts a labelled name after the year and class', () => {
    expect(
      extractOcrHeaderName('8K作文活页\n8年级2班 姓名：周文佳 学号____\n正文'),
    ).toBe('周文佳');
  });

  it('extracts names wrapped in PaddleOCR math markup', () => {
    expect(
      extractOcrHeaderName(
        '8年级2班\n姓名 $ \\underline{\\text{周雅}} $\n8K 作文活页',
      ),
    ).toBe('周雅');
    expect(
      extractOcrHeaderName('8K\n姓名 $ \\underline{\\text{张诗琳}} $'),
    ).toBe('张诗琳');
  });

  it('ranks a similar radical higher without automatically binding', () => {
    const roster = [
      { id: 'a', name: '周文佳', classId: 'class-a' },
      { id: 'b', name: '周文彤', classId: 'class-b' },
    ];
    expect(matchStudentFromOcrHeader('姓名：周文住\n正文', roster)).toBeNull();
    const ranked = rankStudentCandidates('周文住', roster);
    expect(ranked[0].student.id).toBe('a');
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    expect(ranked[0].reason).toContain('部首和笔画接近');
  });

  it('keeps duplicate names from different classes for teacher selection', () => {
    const ranked = rankStudentCandidates('刘诗琳', [
      { id: 'a', name: '刘诗琳', classId: 'class-a' },
      { id: 'b', name: '刘诗琳', classId: 'class-b' },
    ]);
    expect(ranked.map((item) => item.student.id)).toEqual(['a', 'b']);
    expect(ranked.every((item) => item.score === 100)).toBe(true);
  });

  it('ranks the intended students first for incomplete and misread names', () => {
    const roster = [
      { id: 'zhao', name: '周文佳', classId: 'class-a' },
      { id: 'chen', name: '刘诗琳', classId: 'class-a' },
    ];
    expect(rankStudentCandidates('周雅', roster)[0].student.id).toBe('zhao');
    expect(rankStudentCandidates('周雅', roster)[0].reason).toContain(
      '可能不完整',
    );
    expect(rankStudentCandidates('张诗琳', roster)[0].student.id).toBe('chen');
  });

  it('does not invent candidates without a plausible header name', () => {
    expect(rankStudentCandidates(null, students)).toEqual([]);
  });
});

describe('Unihan data', () => {
  it('loads the radical and stroke record used by matching', () => {
    expect(getUnihanRadicalStroke('赵')).toEqual({ radical: 156, strokes: 9 });
  });
});
