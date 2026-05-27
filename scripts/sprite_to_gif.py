#!/usr/bin/env python3
"""Convert a horizontal sprite sheet PNG to an animated GIF.

Supports Phaser-style sprite sheets with optional spacing between frames.

Usage:
    python sprite_to_gif.py <png_path> [options]

Options:
    --frame-width W    Frame width in pixels (default: 96)
    --frame-height H   Frame height in pixels (default: 96)
    --spacing S        Spacing between frames in pixels (default: 0)
    --duration D       Duration per frame in ms (default: 100)
    --loop N           Loop count, 0 = infinite (default: 0)
    --reverse          Reverse frame order (play backwards)
    --start-frame S    Start frame index (default: 0)
    --end-frame E      End frame index, exclusive (default: all frames)
    --output PATH      Output GIF path (default: same dir, same name, .gif extension)

Example:
    python sprite_to_gif.py public/assets/figures/wizard_black/Idle.png --spacing 32
    python sprite_to_gif.py public/assets/effects/Lightning-bolt.png --frame-width 72 --frame-height 72
"""

import argparse
import os
import sys

from PIL import Image


def sprite_sheet_to_gif(
    png_path: str,
    frame_width: int,
    frame_height: int,
    spacing: int,
    duration: int,
    loop: int,
    reverse: bool,
    start_frame: int,
    end_frame: int | None,
    output_path: str | None,
) -> str:
    """Slice a horizontal sprite sheet and save as animated GIF."""

    sheet = Image.open(png_path)

    # Validate dimensions
    if sheet.width < frame_width or sheet.height < frame_height:
        print(
            f"Error: image size ({sheet.width}x{sheet.height}) is smaller than "
            f"frame size ({frame_width}x{frame_height})"
        )
        sys.exit(1)

    stride = frame_width + spacing

    # Calculate total frames: number of positions where a full frame fits
    # Frame i starts at x = i * stride, ends at x = i * stride + frame_width
    # So total_frames = max i where i * stride + frame_width <= sheet.width
    total_frames = (sheet.width - frame_width) // stride + 1

    if total_frames <= 0:
        print(
            f"Error: image size ({sheet.width}x{sheet.height}) is too small "
            f"for frame size ({frame_width}x{frame_height}) with stride ({stride})"
        )
        sys.exit(1)

    if end_frame is None:
        end_frame = total_frames

    if start_frame < 0 or start_frame >= total_frames:
        print(f"Error: start-frame {start_frame} out of range (0-{total_frames - 1})")
        sys.exit(1)

    if end_frame > total_frames:
        print(f"Error: end-frame {end_frame} out of range (max {total_frames})")
        sys.exit(1)

    if start_frame >= end_frame:
        print(f"Error: start-frame ({start_frame}) must be less than end-frame ({end_frame})")
        sys.exit(1)

    # Slice frames
    frames: list[Image.Image] = []
    for i in range(start_frame, end_frame):
        x = i * stride
        frame = sheet.crop((x, 0, x + frame_width, frame_height))
        frames.append(frame)

    if reverse:
        frames.reverse()

    # Determine output path
    if output_path is None:
        base = os.path.splitext(png_path)[0]
        output_path = base + ".gif"

    # Convert RGBA to palette mode with transparency for GIF
    has_alpha = frames[0].mode == "RGBA"

    if has_alpha:
        processed_frames: list[Image.Image] = []

        # Pillow's RGBA→P conversion with Image.ADAPTIVE handles transparency well
        # by assigning a dedicated palette index for fully transparent pixels.
        # We threshold alpha first to ensure clean binary transparency.
        for frame in frames:
            alpha = frame.split()[-1]
            # Make alpha binary: 0 or 255
            clean_alpha = Image.eval(alpha, lambda a: 0 if a < 128 else 255)
            # Reconstruct RGBA with clean alpha
            r, g, b = frame.convert("RGB").split()
            clean_rgba = Image.merge("RGBA", (r, g, b, clean_alpha))

            # Convert to palette mode; Pillow maps alpha=0 to transparency
            p_frame = clean_rgba.convert("P", palette=Image.ADAPTIVE, colors=256)
            processed_frames.append(p_frame)
    else:
        # Already palette mode or RGB — just convert to P if needed
        processed_frames: list[Image.Image] = []
        for frame in frames:
            if frame.mode != "P":
                frame = frame.convert("P", method=Image.Quantize.MEDIANCUT, colors=256)
            processed_frames.append(frame)

    # Save animated GIF
    processed_frames[0].save(
        output_path,
        save_all=True,
        append_images=processed_frames[1:],
        duration=duration,
        loop=loop,
        disposal=2,  # Clear frame before rendering next (prevents ghosting)
    )

    print(
        f"Saved {len(processed_frames)} frames ({start_frame}-{end_frame - 1}) "
        f"to {output_path}"
    )
    print(
        f"Frame size: {frame_width}x{frame_height}, "
        f"Spacing: {spacing}, Duration: {duration}ms, Loop: {loop}"
    )

    return output_path


def main():
    parser = argparse.ArgumentParser(
        description="Convert a horizontal sprite sheet PNG to an animated GIF."
    )
    parser.add_argument("png_path", help="Path to the sprite sheet PNG file")
    parser.add_argument(
        "--frame-width", type=int, default=96, help="Frame width in pixels (default: 96)"
    )
    parser.add_argument(
        "--frame-height", type=int, default=96, help="Frame height in pixels (default: 96)"
    )
    parser.add_argument(
        "--spacing", type=int, default=0, help="Spacing between frames in pixels (default: 0)"
    )
    parser.add_argument(
        "--duration", type=int, default=100, help="Duration per frame in ms (default: 100)"
    )
    parser.add_argument(
        "--loop", type=int, default=0, help="Loop count, 0 = infinite (default: 0)"
    )
    parser.add_argument(
        "--reverse", action="store_true", help="Reverse frame order (play backwards)"
    )
    parser.add_argument(
        "--start-frame", type=int, default=0, help="Start frame index (default: 0)"
    )
    parser.add_argument(
        "--end-frame", type=int, default=None, help="End frame index, exclusive (default: all)"
    )
    parser.add_argument(
        "--output", type=str, default=None, help="Output GIF path (default: auto)"
    )

    args = parser.parse_args()

    if not os.path.isfile(args.png_path):
        print(f"Error: file not found: {args.png_path}")
        sys.exit(1)

    sprite_sheet_to_gif(
        png_path=args.png_path,
        frame_width=args.frame_width,
        frame_height=args.frame_height,
        spacing=args.spacing,
        duration=args.duration,
        loop=args.loop,
        reverse=args.reverse,
        start_frame=args.start_frame,
        end_frame=args.end_frame,
        output_path=args.output,
    )


if __name__ == "__main__":
    main()