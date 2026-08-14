#!/usr/bin/env python3
from __future__ import annotations

import base64
import hashlib
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


def fetch_chunk(name: str) -> str:
    url = (
        "https://raw.githubusercontent.com/RREReptiles/rrereptiles.github.io/"
        f"{SOURCE_BRANCH}/care-guides/downloads/western-hognose/{name}"
    )
    with urllib.request.urlopen(url, timeout=30) as response:
        return response.read().decode("ascii").strip()


def main() -> None:
    chunks: list[str] = []
    for index in range(14):
        if index == 5:
            names = ["part-05a.b64", "part-05b.b64", "part-05c0.b64", "part-05c1.b64", "part-05c2.b64"]
        elif index == 6:
            names = ["part-06a0.b64", "part-06a1.b64", "part-06a2.b64", "part-06b.b64", "part-06c.b64"]
        else:
            names = [f"part-{index:02d}.b64"]
        chunks.extend(fetch_chunk(name) for name in names)

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

    WORKFLOW.unlink(missing_ok=True)
    SELF.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
