"""The design changes a font spec asks for, applied to one source font (variable or static).

defaults   make upstream alternates the default (the cmap points at them); returns the reverse maps for "undo" sets
tittle     the dots of i and j redrawn (drop, square, circle), at every master
ligature   a ligature glyph built from the letters of a word, with optional drips hanging from some of them
pua        static marks (logo, mascot) drawn from the spec's drawings, mapped to Private Use Area code points
Layout (GSUB features and their names) is in layout.py. Used by build.py. Tests: tests/node/brand-font.test.mjs.
"""
import math

from shapes import TITTLES, drawing, drip, shear
from varglyph import at_masters, bounds, copy_glyph, set_glyph
from layout import feature_mapping, ligatures_with


def cmap_tables(font):
    return [t for t in font['cmap'].tables if t.isUnicode()]


def remap(font, mapping):
    """Points every cmap entry whose glyph is in mapping at its replacement."""
    for t in cmap_tables(font):
        for u, g in list(t.cmap.items()):
            if g in mapping:
                t.cmap[u] = mapping[g]


def defaults(font, tags):
    """Bakes the single substitutions of upstream features (cv11, tnum, ss03...) into the cmap. Returns
    {tag: {alternate: original}} for the stylistic sets that switch a default back."""
    undo = {}
    for tag in tags:
        m = feature_mapping(font, tag)
        if not m:
            raise ValueError(f'the source has no single substitutions under {tag}')
        remap(font, m)
        undo[tag] = {b: a for a, b in m.items()}
    return undo


def _xheight(font):
    os2 = font['OS/2']
    return getattr(os2, 'sxHeight', 0) or font['head'].unitsPerEm * 0.5


def _slant(font):
    return font['post'].italicAngle or 0


def tittle(font, shape, chars='ij', keep=True):
    """Redraws the dot of each char's default glyph, and of the ligatures that hold one (fi, ffi). With keep, the old
    glyph is kept as <name>.dot0 and the map {new: old} is returned (for a set that brings the round dots back)."""
    make, xh, slant = TITTLES[shape], _xheight(font), _slant(font)
    cmap, back = font.getBestCmap(), {}
    targets = [cmap[ord(ch)] for ch in chars if ord(ch) in cmap]
    for g in targets + ligatures_with(font, targets):
        if keep:
            copy_glyph(font, g, g + '.dot0')
            back[g] = g + '.dot0'

        def redo(r, loc, g=g):
            out = []
            for c in r.outline(g, loc):
                x0, y0, x1, y1 = bounds([c])
                if y0 > xh * 0.8:                 # the dot: a contour that starts above the x-height
                    cy = (y0 + y1) / 2
                    upright = shear(c, -slant, cy) if slant else c
                    ux0, _, ux1, _ = bounds([upright])
                    c = make(ux0, y0, ux1, y1)
                    c = shear(c, slant, cy) if slant else c
                out.append(c)
            return out, r.advance(g, loc)
        set_glyph(font, g, *at_masters(font, redo))
    return back


def _span(contours, y):
    """The first filled span [x0, x1] of an outline on the horizontal line y (flattened, nonzero winding)."""
    xs = []
    for c in contours:
        pts = _flatten(c)
        for (ax, ay), (bx, by) in zip(pts, pts[1:] + pts[:1]):
            if (ay <= y < by) or (by <= y < ay):
                xs.append((ax + (y - ay) * (bx - ax) / (by - ay), 1 if by > ay else -1))
    xs.sort()
    wind, start = 0, None
    for x, d in xs:
        before = wind
        wind += d
        if before == 0 and wind != 0:
            start = x
        elif before != 0 and wind == 0:
            return start, x
    return None


def _flatten(c, steps=8):
    """A contour of on and off-curve points as a polygon (implied on-curve points between off-curve pairs)."""
    n, out = len(c), []
    on = [i for i, p in enumerate(c) if p[2] is not None]
    if not on:
        return [(x, y) for x, y, _ in c]
    k = on[0]
    seq = c[k:] + c[:k] + [c[k]]
    prev = (seq[0][0], seq[0][1])
    out.append(prev)
    offs = []
    for x, y, s in seq[1:]:
        if s is None:
            offs.append((x, y))
            continue
        if not offs:
            out.append((x, y))
        else:
            ctrl = offs
            pts = [prev]
            for a, b in zip(ctrl, ctrl[1:]):
                pts += [a, ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)]
            pts += [ctrl[-1], (x, y)]
            for i in range(0, len(pts) - 2, 2):
                p0, p1, p2 = pts[i], pts[i + 1], pts[i + 2]
                for t in range(1, steps + 1):
                    t /= steps
                    out.append(((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
                                (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]))
        prev, offs = (x, y), []
    return out[:-1]


def ligature(font, name, text, drips=(), stem_glyph='l'):
    """Adds glyph `name`: the default glyphs of text side by side at every master (advances summed, so the word keeps its
    width), and a drip below each letter listed in drips ({"at": index, "length": share of the descender, "align":
    "stem" | "center"}). The drips are as wide as the stem of stem_glyph at that master."""
    cmap = font.getBestCmap()
    glyphs = [cmap[ord(ch)] for ch in text]
    stem_g = cmap.get(ord(stem_glyph), glyphs[0])
    xh, slant = _xheight(font), _slant(font)
    desc = abs(font['hhea'].descent) or font['head'].unitsPerEm * 0.25

    def make(r, loc):
        out, x, boxes = [], 0, []
        for g in glyphs:
            cs = r.outline(g, loc)
            out += [[(px + x, py, s) for px, py, s in c] for c in cs]
            boxes.append((x, cs))
            x += r.advance(g, loc)
        span = _span(r.outline(stem_g, loc), xh / 2) or (0, xh * 0.1)
        stem = span[1] - span[0]
        for d in drips:
            dx, cs = boxes[d['at']]
            if d.get('align', 'stem') == 'stem':
                s = _span(cs, xh * 0.25) or span
                cx = dx + (s[0] + s[1]) / 2
            else:
                b = bounds(cs)
                cx = dx + (b[0] + b[2]) / 2
            c = drip(cx, stem * d.get('top', 0.5), stem * d.get('width', 1), desc * d.get('length', 0.6), d.get('neck', 0.5), d.get('bulb', 0.62))
            out.append(shear(c, slant, 0) if slant else c)
        return out, x
    set_glyph(font, name, *at_masters(font, make))
    return glyphs


def pua(font, glyph_name, code, spec):
    """Adds a static mark at the code point (hex string), as tall as the capitals."""
    os2 = font['OS/2']
    cap = getattr(os2, 'sCapHeight', 0) or font['head'].unitsPerEm * 0.7
    side = round(font['head'].unitsPerEm * 0.06)
    glyph, adv = drawing(spec, cap * spec.get('scale', 1.12), -cap * spec.get('drop', 0.06), side)
    order = font.getGlyphOrder()
    if glyph_name not in order:
        font.setGlyphOrder(order + [glyph_name])
        font['glyf'].glyphOrder = font.getGlyphOrder()
    glyph.recalcBounds(font['glyf'])
    font['glyf'][glyph_name] = glyph
    if font['post'].isFixedPitch:                      # a monospaced font: the mark takes whole cells
        cell = font['hmtx'][font.getBestCmap()[ord('0')]][0]
        adv = cell * max(1, math.ceil(adv / cell))
    font['hmtx'][glyph_name] = (adv, getattr(glyph, 'xMin', 0))
    if 'gvar' in font:
        font['gvar'].variations[glyph_name] = []
    for t in cmap_tables(font):
        if t.format in (4, 12) or t.format == 0 and int(code, 16) < 256:
            t.cmap[int(code, 16)] = glyph_name
