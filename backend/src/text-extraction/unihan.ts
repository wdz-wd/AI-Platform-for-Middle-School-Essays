import {
  UNIHAN_PACKED_BASE64,
  UNIHAN_RECORD_COUNT,
} from './unihan-data.generated';

type RadicalStroke = { radical: number; strokes: number };

// Each sorted record is a 4-byte Unicode code point, 1-byte radical and
// 1-byte total stroke count. Binary search avoids constructing a large map.
let data: Buffer | null = null;

export function getUnihanRadicalStroke(char: string): RadicalStroke | null {
  const point = char.codePointAt(0);
  if (point === undefined) return null;
  data ??= Buffer.from(UNIHAN_PACKED_BASE64, 'base64');

  let low = 0;
  let high = UNIHAN_RECORD_COUNT - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const offset = mid * 6;
    const current = data.readUInt32LE(offset);
    if (current === point) {
      return {
        radical: data.readUInt8(offset + 4),
        strokes: data.readUInt8(offset + 5),
      };
    }
    if (current < point) low = mid + 1;
    else high = mid - 1;
  }
  return null;
}

// Unihan describes dictionary structure; this is only a weak glyph clue.
export function unihanGlyphSimilarity(left: string, right: string) {
  if (left === right) return 1;
  const a = getUnihanRadicalStroke(left);
  const b = getUnihanRadicalStroke(right);
  if (!a || !b) return 0;

  const strokeCloseness = Math.max(0, 1 - Math.abs(a.strokes - b.strokes) / 8);
  return a.radical === b.radical
    ? 0.55 + 0.25 * strokeCloseness
    : 0.1 * strokeCloseness;
}
