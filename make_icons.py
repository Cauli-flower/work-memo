#!/usr/bin/env python3
"""生成工作备忘的 PWA 图标。

风格：靛蓝渐变底（带左上柔光）+ 一张带柔和阴影的白色备忘卡片，
卡片上是任务行——前两行为「已完成」(靛蓝实心勾选框 + 白勾，和 App 内一致)，
末行为「待办」(白底靛蓝描边勾选框)。高倍超采样后缩小，边缘顺滑。

依赖 Pillow：python3 make_icons.py
"""
from PIL import Image, ImageDraw, ImageFilter

# —— 配色（与 app.css 一致）——
BG_TL = (85, 112, 242)     # 左上较亮的靛蓝
BG_BR = (47, 71, 199)      # 右下较深的靛蓝
BRAND = (66, 99, 235)      # #4263eb 品牌靛蓝（实心勾选框）
WHITE = (255, 255, 255)
LINE = (199, 205, 222)     # 卡片上的文字线（浅灰）
SS = 4                     # 超采样倍数


def _gradient(w):
    """对角线渐变：左上 BG_TL → 右下 BG_BR。先画小图再放大，平滑又快。"""
    n = 64
    small = Image.new("RGB", (n, n))
    px = small.load()
    for y in range(n):
        for x in range(n):
            t = (x + y) / (2 * (n - 1))
            px[x, y] = tuple(round(BG_TL[i] + (BG_BR[i] - BG_TL[i]) * t) for i in range(3))
    return small.resize((w, w), Image.BILINEAR).convert("RGBA")


def _rounded_mask(w, radius):
    m = Image.new("L", (w, w), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w - 1, w - 1], radius=radius, fill=255)
    return m


def _check(d, box, x0, y0, color, width):
    """在 [x0,y0]~+box 的方框内画一个对勾。"""
    pad = box * 0.24
    p1 = (x0 + pad, y0 + box * 0.54)
    p2 = (x0 + box * 0.42, y0 + box - pad * 0.9)
    p3 = (x0 + box - pad * 0.85, y0 + pad)
    d.line([p1, p2, p3], fill=color, width=width, joint="curve")


def draw_icon(size, maskable=False):
    w = size * SS
    img = Image.new("RGBA", (w, w), (0, 0, 0, 0))

    # 背景：渐变 + 圆角（maskable 铺满整方块，交给系统裁切）
    grad = _gradient(w)
    if maskable:
        img.paste(grad, (0, 0))
        bg_mask = None
    else:
        bg_mask = _rounded_mask(w, int(w * 0.225))
        img.paste(grad, (0, 0), bg_mask)

    # 左上柔光，增加立体感
    gloss = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    gd = ImageDraw.Draw(gloss)
    gd.ellipse([-w * 0.25, -w * 0.35, w * 0.75, w * 0.55], fill=(255, 255, 255, 60))
    gloss = gloss.filter(ImageFilter.GaussianBlur(w * 0.06))
    if bg_mask is not None:
        gloss.putalpha(Image.composite(gloss.getchannel("A"), Image.new("L", (w, w), 0), bg_mask))
    img = Image.alpha_composite(img, gloss)

    # 备忘卡片几何
    margin = w * (0.225 if maskable else 0.16)
    cx0, cy0, cx1, cy1 = margin, margin, w - margin, w - margin
    cw = cx1 - cx0
    card_r = cw * 0.17

    # 卡片阴影
    shadow = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    off = w * 0.012
    sd.rounded_rectangle([cx0, cy0 + off, cx1, cy1 + off], radius=card_r, fill=(28, 34, 80, 95))
    shadow = shadow.filter(ImageFilter.GaussianBlur(w * 0.022))
    img = Image.alpha_composite(img, shadow)

    # 卡片本体
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([cx0, cy0, cx1, cy1], radius=card_r, fill=WHITE + (255,))

    # 卡片内容：三行任务
    pad = cw * 0.13
    ix0, iy0, ix1 = cx0 + pad, cy0 + pad, cx1 - pad
    iw = ix1 - ix0
    ih = (cy1 - pad) - iy0
    rows = 3
    gap = ih / rows
    box = gap * 0.52
    box_r = box * 0.30
    for i in range(rows):
        cy = iy0 + gap * (i + 0.5)
        by0 = cy - box / 2
        done = i < rows - 1
        if done:
            # 已完成：靛蓝实心 + 白勾
            d.rounded_rectangle([ix0, by0, ix0 + box, by0 + box], radius=box_r, fill=BRAND + (255,))
            _check(d, box, ix0, by0, WHITE + (255,), max(2, int(box * 0.15)))
        else:
            # 待办：白底靛蓝描边
            d.rounded_rectangle([ix0, by0, ix0 + box, by0 + box], radius=box_r,
                                outline=BRAND + (255,), width=max(2, int(box * 0.10)))
        # 文字线
        lx0 = ix0 + box + iw * 0.09
        lw = (ix1 - lx0) * (0.62 if i == rows - 1 else 1.0)
        lh = box * 0.26
        d.rounded_rectangle([lx0, cy - lh / 2, lx0 + lw, cy + lh / 2], radius=lh / 2, fill=LINE + (255,))

    return img.resize((size, size), Image.LANCZOS)


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
