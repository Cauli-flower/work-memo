#!/usr/bin/env python3
"""生成工作备忘的 PWA 图标（靛蓝底 + 白色清单勾选）。改图标后重跑即可。
依赖 Pillow：python3 make_icons.py"""
from PIL import Image, ImageDraw

BG = (66, 99, 235, 255)       # 靛蓝 #4263eb
BG2 = (49, 76, 199, 255)      # 深一点的靛蓝，做斜向渐变
CARD = (255, 255, 255, 255)
CHECK = (66, 99, 235, 255)
LINE = (255, 255, 255, 70)


def rounded(size, radius_ratio=0.22, fill=BG):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(size * radius_ratio)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=fill)
    return img


def gradient_bg(size):
    """简单斜向渐变。"""
    base = Image.new("RGBA", (size, size), BG)
    top = Image.new("RGBA", (size, size), BG2)
    mask = Image.new("L", (size, size))
    md = ImageDraw.Draw(mask)
    for y in range(size):
        md.line([(0, y), (size, y)], fill=int(255 * y / size))
    base.paste(top, (0, 0), mask)
    return base


def draw_icon(size, maskable=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    # 背景：渐变 + 圆角（maskable 用整方块铺满，安全区在中央）
    grad = gradient_bg(size)
    radius = int(size * (0.30 if maskable else 0.22))
    bgmask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(bgmask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    if maskable:
        bgmask = Image.new("L", (size, size), 255)  # 铺满，留给系统裁切
    img.paste(grad, (0, 0), bgmask)

    d = ImageDraw.Draw(img)
    # 内容安全区
    inset = size * (0.26 if maskable else 0.20)
    x0, y0 = inset, inset
    x1, y1 = size - inset, size - inset
    w = x1 - x0
    h = y1 - y0

    rows = 3
    gap = h / rows
    box = gap * 0.46
    for i in range(rows):
        cy = y0 + gap * (i + 0.5)
        # 复选框
        bx0 = x0
        by0 = cy - box / 2
        br = box * 0.28
        d.rounded_rectangle([bx0, by0, bx0 + box, by0 + box], radius=br, fill=CARD)
        # 勾
        pad = box * 0.22
        p1 = (bx0 + pad, by0 + box * 0.52)
        p2 = (bx0 + box * 0.42, by0 + box - pad)
        p3 = (bx0 + box - pad, by0 + pad)
        d.line([p1, p2, p3], fill=CHECK, width=max(2, int(box * 0.16)), joint="curve")
        # 文字线
        lx0 = bx0 + box + w * 0.10
        lw = (i == rows - 1) and (x1 - lx0) * 0.6 or (x1 - lx0)
        lh = box * 0.20
        d.rounded_rectangle([lx0, cy - lh / 2, lx0 + lw, cy + lh / 2], radius=lh / 2, fill=CARD)
    return img


def main():
    specs = [
        ("icons/icon-180.png", 180, False),
        ("icons/icon-192.png", 192, False),
        ("icons/icon-512.png", 512, False),
        ("icons/icon-512-maskable.png", 512, True),
    ]
    for path, size, maskable in specs:
        draw_icon(size, maskable).save(path)
        print("wrote", path)


if __name__ == "__main__":
    main()
