#!/usr/bin/env python3
"""Generate ESP Flash Download Tool icon using only stdlib (zlib + struct for PNG)."""
import struct
import zlib
import math
import os

def create_png(width, height, pixels):
    """Create PNG from RGBA pixel data."""
    def chunk(chunk_type, data):
        c = chunk_type + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    raw = b''
    for y in range(height):
        raw += b'\x00'  # filter none
        for x in range(width):
            r, g, b, a = pixels[y * width + x]
            raw += struct.pack('BBBB', r, g, b, a)

    header = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    return header + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')


def lerp(a, b, t):
    return a + (b - a) * max(0, min(1, t))


def point_in_polygon(px, py, polygon):
    """Ray casting algorithm."""
    n = len(polygon)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def draw_icon(size):
    """Draw an ESP chip + lightning bolt icon."""
    pixels = [(0, 0, 0, 0)] * (size * size)
    cx, cy = size / 2, size / 2
    r = size * 0.44  # background circle radius

    # Colors
    bg_outer = (20, 25, 40)
    bg_inner = (35, 50, 80)
    chip_body = (45, 50, 65)
    chip_top = (60, 68, 85)
    pin_color = (160, 175, 200)
    accent = (10, 132, 255)
    bolt_top = (60, 180, 255)
    bolt_bot = (255, 180, 40)

    # Chip dimensions
    chip_half = size * 0.24
    pin_len = size * 0.07
    pin_w = size * 0.022
    num_pins = 4
    pin_gap = chip_half * 2 / (num_pins + 1)

    # Lightning bolt polygon (normalized coords, centered at 0,0)
    bolt_scale = size * 0.18
    bolt_points = [
        (0.1, -1.0),
        (0.5, -1.0),
        (0.05, -0.1),
        (0.45, -0.1),
        (-0.1, 1.0),
        (-0.1, 0.15),
        (-0.45, 0.15),
    ]

    for y in range(size):
        for x in range(size):
            px, py = x + 0.5, y + 0.5
            dx, dy = px - cx, py - cy
            dist = math.sqrt(dx * dx + dy * dy)

            if dist > r + 1:
                continue

            # Radial gradient background
            t = dist / r
            bg_r = int(lerp(bg_inner[0], bg_outer[0], t))
            bg_g = int(lerp(bg_inner[1], bg_outer[1], t))
            bg_b = int(lerp(bg_inner[2], bg_outer[2], t))

            # Anti-alias edge
            alpha = 255
            if dist > r - 1.2:
                alpha = int(max(0, min(255, (r - dist) / 1.2 * 255)))

            color = (bg_r, bg_g, bg_b, alpha)

            # Chip body (rounded rect)
            chip_x = abs(px - cx)
            chip_y = abs(py - cy)
            corner_r = size * 0.035
            in_chip = False

            if chip_x <= chip_half and chip_y <= chip_half:
                cx2 = chip_x - (chip_half - corner_r)
                cy2 = chip_y - (chip_half - corner_r)
                if cx2 > 0 and cy2 > 0:
                    in_chip = math.sqrt(cx2**2 + cy2**2) <= corner_r
                else:
                    in_chip = True

            if in_chip:
                ct = (py - (cy - chip_half)) / (2 * chip_half)
                cr = int(lerp(chip_top[0], chip_body[0], ct))
                cg = int(lerp(chip_top[1], chip_body[1], ct))
                cb = int(lerp(chip_top[2], chip_body[2], ct))
                color = (cr, cg, cb, alpha)

            # Pins
            is_pin = False
            for i in range(num_pins):
                offset = -chip_half + (i + 1) * pin_gap

                # Top
                pcx_t = cx + offset
                if abs(px - pcx_t) <= pin_w and (cy - chip_half - pin_len) <= py <= (cy - chip_half):
                    is_pin = True
                # Bottom
                if abs(px - pcx_t) <= pin_w and (cy + chip_half) <= py <= (cy + chip_half + pin_len):
                    is_pin = True
                # Left
                pcy_l = cy + offset
                if abs(py - pcy_l) <= pin_w and (cx - chip_half - pin_len) <= px <= (cx - chip_half):
                    is_pin = True
                # Right
                if abs(py - pcy_l) <= pin_w and (cx + chip_half) <= px <= (cx + chip_half + pin_len):
                    is_pin = True

            if is_pin:
                color = (*pin_color, alpha)

            # Lightning bolt
            bx = (px - cx) / bolt_scale
            by = (py - cy) / bolt_scale
            if point_in_polygon(bx, by, bolt_points) and in_chip:
                bt = (by + 1.0) / 2.0
                br = int(lerp(bolt_top[0], bolt_bot[0], bt))
                bgg = int(lerp(bolt_top[1], bolt_bot[1], bt))
                bb = int(lerp(bolt_top[2], bolt_bot[2], bt))
                color = (br, bgg, bb, alpha)

            # Subtle accent ring
            ring_r = size * 0.40
            ring_w = size * 0.012
            ring_dist = abs(dist - ring_r)
            if ring_dist < ring_w and dist <= r:
                ring_t = 1.0 - ring_dist / ring_w
                cr2 = int(lerp(color[0], accent[0], ring_t * 0.6))
                cg2 = int(lerp(color[1], accent[1], ring_t * 0.6))
                cb2 = int(lerp(color[2], accent[2], ring_t * 0.6))
                color = (cr2, cg2, cb2, alpha)

            pixels[y * size + x] = color

    return pixels


def main():
    icons_dir = os.path.join(os.path.dirname(__file__), '..', 'src-tauri', 'icons')
    os.makedirs(icons_dir, exist_ok=True)

    sizes = {
        'icon.png': 512,
        '128x128@2x.png': 256,
        '128x128.png': 128,
        '32x32.png': 32,
    }

    for filename, size in sizes.items():
        print(f"Generating {filename} ({size}x{size})...")
        pixels = draw_icon(size)
        png_data = create_png(size, size, pixels)
        path = os.path.join(icons_dir, filename)
        with open(path, 'wb') as f:
            f.write(png_data)

    print("Done! Icons generated.")


if __name__ == '__main__':
    main()
