# SPDX-License-Identifier: AGPL-3.0-or-later
"""Raster preview of our generated SVG subset; geometry and colors come from the assets."""
from pathlib import Path
import json
import re
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw, ImageFont, ImageColor

ROOT = Path(__file__).resolve().parents[1]
CATALOG = json.loads((ROOT / 'assets/medals/catalog.json').read_text(encoding='utf-8'))
FONT = 'C:/Windows/Fonts/msyh.ttc'
BOLD = 'C:/Windows/Fonts/msyhbd.ttc'
S = 4
CANVAS = (128 * S, 140 * S)


def medal(asset, size, dark=False):
    """Read actual paths, circles, text, and gradients; reject unsupported geometry."""
    svg = ET.parse(ROOT / 'assets/medals' / asset).getroot()
    gradients = {}
    for element in svg.iter():
        if element.tag.endswith('linearGradient'):
            stops = [(float(stop.attrib['offset'].rstrip('%')) / 100,
                      ImageColor.getrgb(stop.attrib['stop-color'])) for stop in element]
            pixels = []
            for y in range(CANVAS[1]):
                for x in range(CANVAS[0]):
                    position = min(1, max(0, (x / S * 128 + y / S * 140) / (128**2 + 140**2)))
                    left, right = stops[-2:]
                    for start, end in zip(stops, stops[1:]):
                        if start[0] <= position <= end[0]:
                            left, right = start, end
                            break
                    amount = (position - left[0]) / (right[0] - left[0])
                    pixels.append(tuple(round(a + (b - a) * amount) for a, b in zip(left[1], right[1])))
            gradient = Image.new('RGB', CANVAS)
            gradient.putdata(pixels)
            gradients['url(#' + element.attrib['id'] + ')'] = gradient
    result = Image.new('RGB', CANVAS, '#10151D' if dark else '#FFFFFF')

    def paint(color, mask, opacity):
        if color == 'none':
            return
        if opacity < 1:
            mask = mask.point(lambda value: round(value * opacity))
        layer = gradients[color] if color.startswith('url(') else Image.new('RGB', CANVAS, color)
        result.paste(layer, (0, 0), mask)

    def render(element, inherited):
        tag = element.tag.rsplit('}', 1)[-1]
        if tag == 'defs':
            return
        attributes = {**inherited, **element.attrib}
        if tag in ('svg', 'g'):
            for child in element:
                render(child, attributes)
            return
        fill = Image.new('L', CANVAS)
        stroke = Image.new('L', CANVAS)
        f, p = ImageDraw.Draw(fill), ImageDraw.Draw(stroke)
        width = round(float(attributes.get('stroke-width', '0')) * S)
        if tag == 'path':
            coordinates = [float(value) * S for value in re.findall(r'-?\d+(?:\.\d+)?', attributes['d'])]
            points = list(zip(coordinates[::2], coordinates[1::2]))
            f.polygon(points, fill=255)
            if width:
                p.line(points + [points[0]], fill=255, width=width, joint='curve')
        elif tag == 'circle':
            cx, cy, radius = (float(attributes[key]) * S for key in ('cx', 'cy', 'r'))
            f.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=255)
            if width:
                half = width / 2
                p.ellipse((cx - radius - half, cy - radius - half,
                           cx + radius + half, cy + radius + half), outline=255, width=width)
        elif tag == 'text':
            font = ImageFont.truetype(BOLD, round(float(attributes['font-size']) * S))
            f.text((float(attributes['x']) * S, float(attributes['y']) * S), element.text,
                   font=font, anchor='mm', fill=255)
        else:
            raise ValueError('Unsupported generated medal SVG element: ' + tag)
        opacity = float(attributes.get('opacity', '1'))
        paint(attributes.get('fill', 'none'), fill, opacity)
        paint(attributes.get('stroke', 'none'), stroke, opacity)

    render(svg, {})
    return result.resize((size, round(size * 140 / 128)), Image.Resampling.LANCZOS)


image = Image.new('RGB', (1440, 1508), '#F5F7FA')
d = ImageDraw.Draw(image)


def text(x, y, value, size, color='#182230', bold=False):
    d.text((x, y), value, font=ImageFont.truetype(BOLD if bold else FONT, size), fill=color)


def center(cx, y, value, size, color='#182230', bold=False):
    font = ImageFont.truetype(BOLD if bold else FONT, size)
    box = d.textbbox((0, 0), value, font=font)
    text(cx - (box[2] - box[0]) / 2, y, value, size, color, bold)


text(48, 28, '系列徽章 · 从普通到特殊', 34, bold=True)
text(48, 80, '等级徽章：Lv.2、4、8、16……翻倍获得；色阶渐进，枚数没有固定上限。', 21, '#5D6878')
for index, sample in enumerate(CATALOG['previewExamples']):
    x = 48 + (index % 4) * 342
    y = 142 + (index // 4) * 326
    d.rounded_rectangle((x, y, x + 318, y + 302), radius=24, fill='#FFFFFF', outline='#CFD7E3', width=1)
    image.paste(medal(sample['svg'], 136), (x + 91, y + 20))
    center(x + 159, y + 185, sample['color'], 24, bold=True)
    center(x + 159, y + 226, '第 ' + str(sample['ordinal']) + ' 枚 · Lv.' + str(sample['level']), 19, '#5D6878')
    center(x + 159, y + 266, '等级徽章', 15, '#5D6878')

text(48, 814, '独立颁发 · 不绑定等级', 25, bold=True)
text(48, 855, '类别与色阶分别配置；具体纪念活动和贡献审核条件由你审查。', 19, '#5D6878')
for index, sample in enumerate(CATALOG['specialExamples']):
    x, y = 48 + index * 684, 906
    d.rounded_rectangle((x, y, x + 660, y + 252), radius=24, fill='#FFFFFF', outline='#CFD7E3', width=1)
    image.paste(medal(sample['svg'], 142), (x + 30, y + 30))
    text(x + 202, y + 50, sample['name'], 27, bold=True)
    text(x + 202, y + 103, '活动 / 周年 / 特定事件' if index == 0 else '贡献证据 / 审核确认', 20, '#5D6878')
    text(x + 202, y + 153, sample['color'] + ' · 具体颁发条件待审', 18, '#5D6878')

d.rounded_rectangle((48, 1200, 1392, 1426), radius=24, fill='#10151D')
text(78, 1222, '深色与小尺寸', 19, '#B8C1CE')
for cx, sample in zip([380, 610, 840, 1070], CATALOG['darkExamples']):
    image.paste(medal(sample['svg'], 86, True), (cx - 43, 1240))
    center(cx, 1353, '第 ' + str(sample['ordinal']) + ' 枚', 17, '#F1F5F9')
text(78, 1390, '幻彩之后继续枚序，保持特殊材质；不循环回普通色。', 17, '#B8C1CE')
text(48, 1460, '全系列共用  /  图案已采纳 · 壹、贰、叁……汉字大写 · 预览不触发实际颁发', 18, '#5D6878')
target = ROOT / 'docs/evidence/medals/review.png'
target.parent.mkdir(parents=True, exist_ok=True)
image.save(target)
print(target)
