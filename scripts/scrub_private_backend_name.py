#!/usr/bin/env python3
"""Remove private implementation names from public website source and generated files."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRIVATE_NAME = "Repti" + "Trax"
TEXT_SUFFIXES = {
    ".css",
    ".html",
    ".js",
    ".json",
    ".md",
    ".py",
    ".txt",
    ".xml",
    ".yaml",
    ".yml",
}


def replacements() -> list[tuple[str, str]]:
    name = PRIVATE_NAME
    return [
        (f"Apply live {name} behavior", "Apply live storefront behavior"),
        (f"Your purchase has been recorded in {name}.", "Your order has been received and recorded."),
        (f"same live {name} inventory and cart", "same live store inventory and cart"),
        (f"same {name} inventory and cart", "same live store inventory and cart"),
        (f"live {name} storefront cart", "live storefront cart"),
        (f"live {name} inventory", "live store inventory"),
        (f"live {name} bindings", "live storefront bindings"),
        (f"{name}-controlled", "store-controlled"),
        (f"{name} reports", "Our inventory system reports"),
        (f"{name} storefront", "storefront"),
        (f"{name} inventory", "store inventory"),
        (f"{name} bindings", "storefront bindings"),
        (name, "our inventory system"),
        ("Apply live our inventory system behavior", "Apply live storefront behavior"),
    ]


def text_files() -> list[Path]:
    files: list[Path] = []
    for path in ROOT.rglob("*"):
        if not path.is_file() or ".git" in path.parts:
            continue
        if path.suffix.lower() in TEXT_SUFFIXES or path.name in {"CNAME", "robots.txt"}:
            files.append(path)
    return files


def scrub() -> int:
    changed = 0
    for path in text_files():
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        updated = text
        for old, new in replacements():
            updated = re.sub(re.escape(old), new, updated, flags=re.IGNORECASE)
        if updated != text:
            path.write_text(updated, encoding="utf-8")
            changed += 1
    return changed


def validate() -> None:
    remaining: list[str] = []
    needle = PRIVATE_NAME.casefold()
    for path in text_files():
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if needle in text.casefold():
            remaining.append(str(path.relative_to(ROOT)))
    if remaining:
        raise RuntimeError("Private backend name remains in: " + ", ".join(remaining))


def main() -> None:
    changed = scrub()
    validate()
    print(f"Scrubbed private implementation naming from {changed} public source files.")


if __name__ == "__main__":
    main()
