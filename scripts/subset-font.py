#!/usr/bin/env python3
"""
Subset Zpix font to GB2312 character set for web optimization.

Generates two output files:
  - zpix-subset.woff2 (primary, ~270KB, WOFF2 compressed)
  - zpix-subset.ttf   (fallback, ~2MB, for browsers without WOFF2 support)

The original zpix.ttf is preserved in public/assets/font/ for lazy-loading
as a full-character-set fallback via the FontFace API.

Usage:
  python3 scripts/subset-font.py
"""

import os
import subprocess
import sys

# Paths relative to project root
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INPUT_FONT = os.path.join(PROJECT_ROOT, "public", "assets", "font", "zpix.ttf")
OUTPUT_WOFF2 = os.path.join(PROJECT_ROOT, "public", "assets", "font", "zpix-subset.woff2")
OUTPUT_TTF = os.path.join(PROJECT_ROOT, "public", "assets", "font", "zpix-subset.ttf")
CHARS_FILE = os.path.join(PROJECT_ROOT, "scripts", "_gb2312_chars.txt")


def generate_gb2312_charset(filepath: str) -> None:
    """Generate a text file containing all GB2312 characters + ASCII + punctuation."""
    chars = set()

    # GB2312 Level 1 (most common 3755 chars) and Level 2 (3008 less common chars)
    for hi in range(0xB0, 0xF8):
        for lo in range(0xA1, 0xFF):
            try:
                ch = bytes([hi, lo]).decode("gb2312")
                chars.add(ch)
            except Exception:
                pass

    # GB2312 symbols and punctuation (A1-A9 zones)
    for hi in range(0xA1, 0xA9):
        for lo in range(0xA1, 0xFF):
            try:
                ch = bytes([hi, lo]).decode("gb2312")
                chars.add(ch)
            except Exception:
                pass

    # Basic ASCII (space through ~)
    for code in range(32, 127):
        chars.add(chr(code))

    # Essential Unicode punctuation not covered by GB2312 zones
    extras = "！？（），。：；、—…《》【】·～￥"
    for ch in extras:
        chars.add(ch)

    sorted_chars = sorted(chars)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write("".join(sorted_chars))

    print(f"Generated charset file: {filepath}")
    print(f"Total unique characters: {len(sorted_chars)}")


def run_pyftsubset(input_font: str, output_font: str, chars_file: str, flavor: str | None = None) -> None:
    """Run pyftsubset to generate a font subset."""
    cmd = [
        "pyftsubset",
        input_font,
        f"--text-file={chars_file}",
        f"--output-file={output_font}",
        "--layout-features=*",
        "--name-IDs=*",
        "--hinting",
    ]
    if flavor:
        cmd.append(f"--flavor={flavor}")

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"ERROR: pyftsubset failed with return code {result.returncode}")
        print(f"stderr: {result.stderr}")
        sys.exit(1)

    size = os.path.getsize(output_font)
    size_str = f"{size / 1024 / 1024:.2f} MB" if size > 1024 * 1024 else f"{size / 1024:.2f} KB"
    original_size = os.path.getsize(input_font)
    reduction = (1 - size / original_size) * 100
    print(f"Generated: {output_font} ({size_str}, reduction: {reduction:.1f}%)")


def main() -> None:
    if not os.path.exists(INPUT_FONT):
        print(f"ERROR: Input font not found: {INPUT_FONT}")
        sys.exit(1)

    print(f"Input font: {INPUT_FONT} ({os.path.getsize(INPUT_FONT) / 1024 / 1024:.2f} MB)")

    # Step 1: Generate GB2312 charset file
    generate_gb2312_charset(CHARS_FILE)

    # Step 2: Generate TTF subset (fallback for non-WOFF2 browsers)
    run_pyftsubset(INPUT_FONT, OUTPUT_TTF, CHARS_FILE, flavor=None)

    # Step 3: Generate WOFF2 subset (primary format)
    run_pyftsubset(INPUT_FONT, OUTPUT_WOFF2, CHARS_FILE, flavor="woff2")

    print("\nDone! Font subset files generated:")
    print(f"  WOFF2: {OUTPUT_WOFF2}")
    print(f"  TTF:   {OUTPUT_TTF}")
    print(f"  Original (kept for lazy-load fallback): {INPUT_FONT}")

    # Clean up temp charset file
    if os.path.exists(CHARS_FILE):
        os.remove(CHARS_FILE)
        print(f"  Cleaned up temp charset file: {CHARS_FILE}")


if __name__ == "__main__":
    main()