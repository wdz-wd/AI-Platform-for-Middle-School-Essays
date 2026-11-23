import { unihanGlyphSimilarity } from './unihan';

type StudentCandidate = {
  id: string;
  name: string;
  classId: string;
};

function normalizeName(value: string) {
  return value
    .replace(/\s/g, '')
    .replace(/[_＿—－-]/g, '')
    .replace(/[：:，,。.；;]+$/u, '');
}

function isPossibleName(value: string) {
  return (
    /^[\p{Script=Han}·]{2,6}$/u.test(value) &&
    !/年级|班级|姓名|学号|成绩|作文|活页|日期/u.test(value)
  );
}

// 只看作文纸页眉，不从正文提取作者姓名。
export function extractOcrHeaderNames(rawText: string): string[] {
  const lines = rawText
    .replace(/\\(?:underline|text|mathrm|textbf)\s*\{/gu, '')
    .replace(/[{}$]/g, '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6);
  const headerNames: string[] = [];

  for (const line of lines.slice(0, 5)) {
    const marker = /姓\s*名\s*[:：]?/u.exec(line);
    if (!marker) continue;
    const afterMarker = line.slice(marker.index + marker[0].length);
    const value = normalizeName(
      afterMarker.split(/学\s*号|班\s*级|年\s*级|日期|\d{2,}/u)[0],
    );
    if (isPossibleName(value) && !headerNames.includes(value)) {
      headerNames.push(value);
    }
  }

  const markerIndex = lines.findIndex(
    (line, index) =>
      index > 0 &&
      index <= 3 &&
      /学\s*号|班\s*级|作文活页|年.*月.*日/u.test(line),
  );
  if (markerIndex > 0 && !/姓\s*名/u.test(lines[markerIndex - 1])) {
    const value = normalizeName(lines[markerIndex - 1]);
    if (isPossibleName(value) && !headerNames.includes(value)) {
      headerNames.push(value);
    }
  }

  return headerNames;
}

export function extractOcrHeaderName(rawText: string): string | null {
  const names = extractOcrHeaderNames(rawText);
  return names.length === 1 ? names[0] : null;
}

export function matchStudentFromOcrHeader<T extends StudentCandidate>(
  rawText: string,
  students: T[],
): T | null {
  const name = extractOcrHeaderName(rawText);
  if (!name) return null;

  const matches = students.filter(
    (student) => name === normalizeName(student.name),
  );
  return matches.length === 1 ? matches[0] : null;
}

function nameDistance(ocrName: string, studentName: string) {
  const left = Array.from(ocrName);
  const right = Array.from(studentName);
  const costs = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0),
  );
  for (let i = 0; i <= left.length; i++) costs[i][0] = i;
  for (let j = 0; j <= right.length; j++) costs[0][j] = j;

  for (let i = 1; i <= left.length; i++) {
    for (let j = 1; j <= right.length; j++) {
      const substitution =
        left[i - 1] === right[j - 1]
          ? 0
          : (i === 1 && j === 1 ? 1.2 : 1) *
            (1 - 0.35 * unihanGlyphSimilarity(left[i - 1], right[j - 1]));
      costs[i][j] = Math.min(
        costs[i - 1][j] + 1,
        costs[i][j - 1] + 1,
        costs[i - 1][j - 1] + substitution,
      );
    }
  }
  return costs[left.length][right.length];
}

export function rankStudentCandidates<T extends StudentCandidate>(
  ocrName: string | null | undefined,
  students: T[],
  limit = 5,
): Array<{ student: T; score: number; reason: string }> {
  const name = normalizeName(ocrName ?? '');
  if (!isPossibleName(name)) return [];

  return students
    .map((student) => {
      const rosterName = normalizeName(student.name);
      if (!isPossibleName(rosterName)) return null;
      const left = Array.from(name);
      const right = Array.from(rosterName);
      const length = Math.max(left.length, right.length);
      const score = Math.max(
        0,
        Math.min(
          100,
          Math.round(100 * (1 - nameDistance(name, rosterName) / length)),
        ),
      );
      const samePositions = left.filter(
        (char, index) => char === right[index],
      ).length;
      const visualClue = left.some(
        (char, index) =>
          right[index] &&
          char !== right[index] &&
          unihanGlyphSimilarity(char, right[index]) >= 0.55,
      );
      const reason =
        score === 100
          ? '姓名完全一致'
          : `${left.length < right.length ? '识别姓名可能不完整，' : ''}同位置相同 ${samePositions} 字${visualClue ? '，差异字部首和笔画接近' : ''}`;
      return { student, score, reason, samePositions };
    })
    .filter(
      (item): item is NonNullable<typeof item> =>
        !!item && item.score >= 25 && item.samePositions >= 1,
    )
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.samePositions - a.samePositions ||
        a.student.name.localeCompare(b.student.name, 'zh-Hans') ||
        a.student.id.localeCompare(b.student.id),
    )
    .slice(0, limit)
    .map(({ student, score, reason }) => ({ student, score, reason }));
}
