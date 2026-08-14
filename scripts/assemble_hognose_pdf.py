#!/usr/bin/env python3
from __future__ import annotations

import base64
import hashlib
import shutil
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GUIDE = ROOT / "care-guides" / "western-hognose-snake.html"
PDF = ROOT / "care-guides" / "Western_Hognose_Care_Guide.pdf"
WORKFLOW = ROOT / ".github" / "workflows" / "assemble-hognose-pdf.yml"
SELF = Path(__file__).resolve()
SOURCE_BRANCH = "agent/western-hognose-pdf"
EXPECTED_SIZE = 90660
EXPECTED_SHA256 = "6440465b44534c456ee1ecbd3e6716fcccb4c2e54667bef8eade63391f1663ab"


def main() -> None:
    chunks: list[str] = []
    for index in range(14):
        url = (
            "https://raw.githubusercontent.com/RREReptiles/rrereptiles.github.io/"
            f"{SOURCE_BRANCH}/care-guides/downloads/western-hognose/part-{index:02d}.b64"
        )
        with urllib.request.urlopen(url, timeout=30) as response:
            chunks.append(response.read().decode("ascii").strip())

    payload = base64.b64decode("".join(chunks), validate=True)
    digest = hashlib.sha256(payload).hexdigest()
    if len(payload) != EXPECTED_SIZE or digest != EXPECTED_SHA256:
        raise RuntimeError(
            f"Western Hognose PDF integrity check failed: size={len(payload)}, sha256={digest}"
        )

    PDF.write_bytes(payload)

    html = GUIDE.read_text(encoding="utf-8")
    if "Western_Hognose_Care_Guide.pdf" not in html:
        old = '''      <div class="actions">\n        <a class="btn btn-outline" href="/#care">View All Care Guides</a>\n      </div>'''
        new = '''      <div class="actions">\n        <a class="btn btn-primary" href="Western_Hognose_Care_Guide.pdf" download>Download Full Care Guide</a>\n        <a class="btn btn-outline" href="/#care">View All Care Guides</a>\n      </div>'''
        if old not in html:
            raise RuntimeError("Could not locate Western Hognose care-guide action buttons.")
        GUIDE.write_text(html.replace(old, new, 1), encoding="utf-8")

    # Leave only the actual site changes in the branch.
    WORKFLOW.unlink(missing_ok=True)
    SELF.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
