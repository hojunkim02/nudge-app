#!/usr/bin/env python3
"""Generate Nudge app icons (PNG) inspired by the 'Nudge' book cover:
a warm orange field with a simple white nudge arrow."""
import zlib, struct, math
import numpy as np

ORANGE = (247, 103, 41)
WHITE = (255, 255, 255)


def write_png(path, rgb):
    h, w = rgb.shape[:2]
    raw = b"".join(b"\x00" + rgb[y].tobytes() for y in range(h))
    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def rounded_rect_mask(size, radius):
    yy, xx = np.mgrid[0:size, 0:size]
    cx = np.clip(xx, radius, size - 1 - radius)
    cy = np.clip(yy, radius, size - 1 - radius)
    d2 = (xx - cx) ** 2 + (yy - cy) ** 2
    return d2 <= radius * radius


def arrow_mask(size):
    """A rightward nudge arrow: shaft + head, drawn on a unit grid."""
    S = 8  # supersample factor
    n = size * S
    yy, xx = np.mgrid[0:n, 0:n].astype(float)
    u = xx / n  # 0..1
    v = yy / n
    m = np.zeros((n, n), bool)
    # shaft: horizontal bar from 0.18 to 0.62, half-height 0.09
    m |= (u >= 0.18) & (u <= 0.62) & (np.abs(v - 0.5) <= 0.09)
    # head: triangle tip at (0.84, 0.5), base at u=0.62, half-height 0.24
    tip_u, base_u, half_h = 0.86, 0.62, 0.25
    m |= (u >= base_u) & (u <= tip_u) & (np.abs(v - 0.5) <= half_h * (tip_u - u) / (tip_u - base_u))
    # small nudge dot trailing behind
    du = np.sqrt((u - 0.06) ** 2 + (v - 0.5) ** 2)
    m |= du <= 0.05
    # downsample
    m = m.reshape(size, S, size, S).mean(axis=(1, 3))
    return m > 0.5


def make_icon(size, maskable=False, radius_ratio=0.2237):
    rgb = np.zeros((size, size, 3), np.uint8)
    rgb[:] = ORANGE
    rr = rounded_rect_mask(size, int(size * radius_ratio))
    rgb[~rr] = 255  # transparent-ish corners rendered white (maskable fills fully)
    if not maskable:
        am = arrow_mask(size)
        rgb[am] = WHITE
    return rgb


def make_favicon(size):
    # full-bleed orange circle with white arrow
    rgb = np.zeros((size, size, 3), np.uint8)
    rgb[:] = (255, 255, 255)
    yy, xx = np.mgrid[0:size, 0:size].astype(float)
    d = np.sqrt((xx - size / 2 + 0.5) ** 2 + (yy - size / 2 + 0.5) ** 2)
    circ = d <= size / 2
    rgb[circ] = ORANGE
    am = arrow_mask(size)
    rgb[am & circ] = WHITE
    return rgb


if __name__ == "__main__":
    import os
    os.makedirs(os.path.dirname(os.path.abspath(__file__)), exist_ok=True)
    base = os.path.dirname(os.path.abspath(__file__))
    for s in (192, 512):
        write_png(os.path.join(base, f"icon-{s}.png"), make_icon(s))
    write_png(os.path.join(base, "maskable-512.png"), make_icon(512, maskable=True))
    write_png(os.path.join(base, "apple-touch-icon.png"), make_icon(180, maskable=False, radius_ratio=0.225))
    write_png(os.path.join(base, "favicon.png"), make_favicon(64))
    print("icons written")
