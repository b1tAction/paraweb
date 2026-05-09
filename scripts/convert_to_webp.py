#!/usr/bin/env python3
"""Convert large PNG images in public/assets to WebP format for bandwidth optimization.

Automatically handles 16-bit to 8-bit color depth reduction (e.g. cover.png).
Generated WebP files are placed alongside the original PNGs.

Usage:
    python scripts/convert_to_webp.py [--quality Q] [--min-size KB]

Options:
    --quality Q    WebP quality for background images (default: 80)
    --min-size KB  Minimum PNG file size in KB to convert (default: 200)
"""

import argparse
import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Error: Pillow is required. Install with: pip install Pillow")
    sys.exit(1)

# Background images that need higher compression
BACKGROUND_IMAGES = {"cover.png", "waiting.png"}


def convert_png_to_webp(png_path: Path, quality: int) -> Path | None:
    """Convert a PNG file to WebP, handling 16-bit depth reduction."""
    webp_path = png_path.with_suffix(".webp")

    try:
        img = Image.open(png_path)

        # Reduce 16-bit/channel images to 8-bit/channel
        # 16-bit RGB mode is "I;16" or "RGB" with 16-bit data
        if img.mode == "I;16":
            img = img.convert("RGB")
        elif img.mode == "RGBA;16" or img.mode == "I;16;RGBA":
            img = img.convert("RGBA")
        # Some PIL versions report 16-bit as "RGB" with info
        # Check if image has more than 8 bits per channel
        if hasattr(img, "info") and img.info.get("bit_depth", 8) > 8:
            if img.mode == "RGBA":
                img = img.convert("RGBA")  # re-quantize
            else:
                img = img.convert("RGB")

        # Ensure mode is 8-bit compatible for WebP
        if img.mode not in ("RGB", "RGBA", "L", "LA", "P"):
            img = img.convert("RGBA")

        img.save(webp_path, "WEBP", quality=quality, method=4)

        original_size = png_path.stat().st_size
        webp_size = webp_path.stat().st_size
        reduction = (1 - webp_size / original_size) * 100

        print(
            f"  Converted: {png_path.name} ({original_size / 1024:.0f}KB) "
            f"-> {webp_path.name} ({webp_size / 1024:.0f}KB) "
            f"[{reduction:.1f}% reduction]"
        )

        return webp_path

    except Exception as e:
        print(f"  Error converting {png_path}: {e}")
        return None


def find_png_files(assets_dir: Path, min_size_kb: int) -> list[Path]:
    """Find PNG files larger than min_size_kb in the assets directory."""
    min_size_bytes = min_size_kb * 1024
    png_files = []

    for png_path in assets_dir.rglob("*.png"):
        # Skip .import files (Godot metadata)
        if png_path.suffix == ".png" and png_path.name.endswith(".png.import"):
            continue
        if png_path.stat().st_size >= min_size_bytes:
            png_files.append(png_path)

    # Sort by size descending (convert largest first for visibility)
    png_files.sort(key=lambda p: p.stat().st_size, reverse=True)
    return png_files


def main():
    parser = argparse.ArgumentParser(
        description="Convert large PNG images to WebP format."
    )
    parser.add_argument(
        "--quality",
        type=int,
        default=80,
        help="WebP quality for background images (default: 80)",
    )
    parser.add_argument(
        "--other-quality",
        type=int,
        default=85,
        help="WebP quality for other images (default: 85)",
    )
    parser.add_argument(
        "--min-size",
        type=int,
        default=200,
        help="Minimum PNG file size in KB to convert (default: 200)",
    )

    args = parser.parse_args()

    # Resolve assets directory relative to project root
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent
    assets_dir = project_root / "public" / "assets"

    if not assets_dir.is_dir():
        print(f"Error: assets directory not found: {assets_dir}")
        sys.exit(1)

    png_files = find_png_files(assets_dir, args.min_size)

    if not png_files:
        print("No PNG files found exceeding the minimum size threshold.")
        return

    print(f"Found {len(png_files)} PNG files >= {args.min_size}KB to convert:")
    converted = 0
    total_original = 0
    total_webp = 0

    for png_path in png_files:
        # Use higher compression for background images
        is_background = png_path.name in BACKGROUND_IMAGES
        quality = args.quality if is_background else args.other_quality

        total_original += png_path.stat().st_size
        result = convert_png_to_webp(png_path, quality)
        if result:
            total_webp += result.stat().st_size
            converted += 1

    if converted > 0:
        total_reduction = (1 - total_webp / total_original) * 100
        print(f"\nSummary: {converted} files converted")
        print(
            f"  Total original: {total_original / 1024 / 1024:.1f}MB"
        )
        print(
            f"  Total WebP: {total_webp / 1024 / 1024:.1f}MB"
        )
        print(
            f"  Overall reduction: {total_reduction:.1f}%"
        )


if __name__ == "__main__":
    main()