"""Generate the compact, offline Unihan radical/stroke index used by matching.

Usage: python backend/scripts/generate-unihan-data.py backend/unihan-source.zip
Source: https://www.unicode.org/Public/18.0.0/ucd/Unihan.zip
"""

import base64
import json
import re
import struct
import sys
import zipfile
from pathlib import Path


def main() -> None:
    source = Path(sys.argv[1])
    output = Path(__file__).resolve().parents[1] / "src/text-extraction/unihan-data.generated.ts"
    values: dict[int, dict[str, int]] = {}

    with zipfile.ZipFile(source) as archive:
        lines = archive.read("Unihan_IRGSources.txt").decode("utf-8").splitlines()

    for line in lines:
        if not line.startswith("U+"):
            continue
        code, field, raw = line.split("\t", 2)
        if field not in ("kRSUnicode", "kTotalStrokes"):
            continue
        point = int(code[2:], 16)
        if field == "kRSUnicode":
            match = re.match(r"(\d+)\.", raw)
            if match:
                values.setdefault(point, {})["radical"] = int(match.group(1))
        else:
            match = re.match(r"\d+", raw)
            if match:
                values.setdefault(point, {})["strokes"] = int(match.group())

    records = [
        (point, item["radical"], item["strokes"])
        for point, item in sorted(values.items())
        if "radical" in item
        and "strokes" in item
        and 1 <= item["radical"] <= 214
        and 0 <= item["strokes"] <= 255
    ]
    packed = b"".join(struct.pack("<IBB", *record) for record in records)
    encoded = base64.b64encode(packed).decode("ascii")
    chunks = [encoded[index : index + 120] for index in range(0, len(encoded), 120)]
    license_notice = """/*
 * Generated from Unicode 18.0.0 Unihan_IRGSources.txt (kRSUnicode, kTotalStrokes).
 * https://www.unicode.org/Public/18.0.0/ucd/Unihan.zip
 * Records are sorted by code point, packed as uint32 LE + uint8 + uint8.
 *
 * UNICODE LICENSE V3 — COPYRIGHT AND PERMISSION NOTICE
 * Copyright © 1991-2026 Unicode, Inc.
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of the data files or software to deal in them without restriction, including
 * use, copy, modification, merging, publishing, distribution, and sale, provided
 * that this copyright and permission notice appear with all copies or in the
 * associated documentation.
 * THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
 * Complete license included in backend/UNICODE-LICENSE.txt.
 * Original license: https://www.unicode.org/license.txt
 */
"""
    full_license = (Path(__file__).resolve().parents[1] / "UNICODE-LICENSE.txt").read_text(
        encoding="utf-8"
    )
    output.write_text(
        license_notice
        + "export const UNIHAN_LICENSE = "
        + json.dumps(full_license, ensure_ascii=False)
        + ";\n"
        + "export const UNIHAN_RECORD_COUNT = "
        + str(len(records))
        + ";\n"
        + "export const UNIHAN_PACKED_BASE64 = [\n"
        + "\n".join(f"  '{chunk}'," for chunk in chunks)
        + "\n].join('');\n",
        encoding="utf-8",
    )
    print(f"Generated {len(records)} Unihan records in {output}")


if __name__ == "__main__":
    main()
