"""Shapes for the font build: parametric outlines with a fixed point structure (so they can vary between masters) and
static drawings made with boolean operations (the Private Use Area marks).

Parametric shapes return one contour, [(x, y, segmentType)], clockwise (TrueType's direction for outer contours), with
quadratic curves: segmentType 'line' or 'qcurve' for on-curve points, None for off-curve ones.
drawing() reads a spec drawing: {"box": [x, y, w, h], "ops": [[mode, shape, ...], ...]} in SVG coordinates (y down),
mode "add" or "sub", shapes circle cx cy r | ellipse cx cy rx ry | rect x y w h [r] | path d | stroke d width.
Used by ops.py. Tests: the built fonts (tests/node/brand-font.test.mjs) and build.py --check.
"""
import math

import pathops
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.svgLib.path import parse_path

K = 1 / math.cos(math.pi / 8)          # an off-curve point between two on-curve points 45 degrees apart


def _arc(cx, cy, r, a0, a1, steps):
    """Points of an arc from angle a0 to a1 (degrees, clockwise when a1 < a0), on and off curve, without the start."""
    out = []
    for i in range(1, steps + 1):
        mid = math.radians(a0 + (a1 - a0) * (i - 0.5) / steps)
        end = math.radians(a0 + (a1 - a0) * i / steps)
        out.append((cx + r * K * math.cos(mid), cy + r * K * math.sin(mid), None))
        out.append((cx + r * math.cos(end), cy + r * math.sin(end), 'qcurve'))
    return out


def shear(contour, slant, cy):
    """Slants a contour by the italic angle (degrees) around the height cy."""
    t = math.tan(math.radians(-slant))
    return [(x + (y - cy) * t, y, s) for x, y, s in contour]


def drop(x0, y0, x1, y1, point=0.55):
    """A drop fitted to a dot's box: the round bottom fills the box, the tip rises `point` x the box height above it."""
    w, h = x1 - x0, y1 - y0
    r = min(w, h) / 2
    cx, cy = (x0 + x1) / 2, y0 + r
    ty = y1 + h * point
    mid = cy + (ty - cy) * 0.42
    pts = [(cx, ty, 'qcurve'), (cx + r, mid, None), (cx + r, cy, 'qcurve')]
    pts += _arc(cx, cy, r, 0, -180, 4)[:-1]
    pts += [(cx - r, cy, 'qcurve'), (cx - r, mid, None)]
    return pts


def square(x0, y0, x1, y1, scale=0.96):
    """A sharp square of the dot's size, centred on it."""
    s = min(x1 - x0, y1 - y0) * scale / 2
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return [(cx - s, cy + s, 'line'), (cx + s, cy + s, 'line'), (cx + s, cy - s, 'line'), (cx - s, cy - s, 'line')]


def circle(x0, y0, x1, y1, scale=1.0):
    """A true circle of the dot's size, centred on it."""
    r = min(x1 - x0, y1 - y0) * scale / 2
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    pts = _arc(cx, cy, r, 90, -270, 8)
    return pts[-1:] + pts[:-1]


TITTLES = {'drop': drop, 'square': square, 'circle': circle}


def drip(cx, top, stem, length, neck=0.5, bulb=0.62):
    """A drip hanging from a letter's stroke: as wide as the stem down to the baseline, narrowing to a neck (`neck` x
    stem) and ending in a round bulb (radius `bulb` x stem) whose lowest point is `length` below the baseline."""
    h, n, r = stem / 2, stem * neck / 2, stem * bulb
    by = -length + r
    pts = [(cx - h, top, 'line'), (cx + h, top, 'line'), (cx + h, 0, 'line'), (cx + h, -length * 0.16, None),
           (cx + n, -length * 0.36, 'qcurve'), (cx + n, by + r * 1.25, 'line'), (cx + r, by + r * 0.85, None), (cx + r, by, 'qcurve')]
    pts += _arc(cx, by, r, 0, -180, 4)[:-1]
    pts += [(cx - r, by, 'qcurve'), (cx - r, by + r * 0.85, None), (cx - n, by + r * 1.25, 'qcurve'), (cx - n, -length * 0.36, 'line'),
            (cx - h, -length * 0.16, None), (cx - h, 0, 'qcurve')]
    return pts


def _shape_path(op):
    """One drawing op as a pathops Path (SVG coordinates)."""
    p = pathops.Path()
    pen = p.getPen()
    kind, args = op[1], op[2:]
    if kind == 'circle':
        cx, cy, r = args
        args, kind = (cx, cy, r, r), 'ellipse'
    if kind == 'ellipse':
        cx, cy, rx, ry = args
        parse_path(f'M{cx - rx} {cy}a{rx} {ry} 0 1 0 {2 * rx} 0a{rx} {ry} 0 1 0 {-2 * rx} 0z', pen)
    elif kind == 'rect':
        x, y, w, h = args[:4]
        r = min(args[4] if len(args) > 4 else 0, w / 2, h / 2)
        if r:
            parse_path(f'M{x + r} {y}H{x + w - r}a{r} {r} 0 0 1 {r} {r}V{y + h - r}a{r} {r} 0 0 1 {-r} {r}H{x + r}'
                       f'a{r} {r} 0 0 1 {-r} {-r}V{y + r}a{r} {r} 0 0 1 {r} {-r}z', pen)
        else:
            parse_path(f'M{x} {y}h{w}v{h}h{-w}z', pen)
    elif kind == 'path':
        parse_path(args[0], pen)
    elif kind == 'stroke':
        parse_path(args[0], pen)
        p.stroke(args[1], pathops.LineCap.ROUND_CAP, pathops.LineJoin.ROUND_JOIN, 4)
        p.convertConicsToQuads()
    else:
        raise ValueError(f'unknown drawing shape {kind}')
    return p


def drawing(spec, height, bottom, side):
    """A static glyph from a spec drawing: the box scaled to `height` font units with its bottom at `bottom`, and `side`
    units of space left and right. Returns (glyph, advance)."""
    bx, by, bw, bh = spec['box']
    acc = pathops.Path()
    for op in spec['ops']:
        shape = _shape_path(op)
        if op[0] == 'add':
            acc = pathops.op(acc, shape, pathops.PathOp.UNION)
        elif op[0] == 'sub':
            acc = pathops.op(acc, shape, pathops.PathOp.DIFFERENCE)
        else:
            raise ValueError(f'unknown drawing mode {op[0]}')
    acc.simplify()
    s = height / bh
    ttpen = TTGlyphPen(None)
    # SVG y runs down: flip it, then put the box on the requested bottom line.
    pen = Cu2QuPen(TransformPen(ttpen, (s, 0, 0, -s, side - bx * s, bottom + (by + bh) * s)), 2.0, reverse_direction=True)
    acc.draw(pen)
    return ttpen.glyph(), round(bw * s + 2 * side)
