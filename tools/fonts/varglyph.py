"""Glyphs in a variable (or static) TrueType font, read and written at every master.

A new or changed glyph is described by its outline at each master location: the default and the peak of every
variation region (support) the font uses. outline_at() reads any glyph there, decomposed; set_glyph() writes a simple
glyph from one outline per master and solves the gvar deltas that reproduce each one, so a glyph made from other
glyphs follows the weight and width axes like they do. Static fonts have one master (the default).
Used by ops.py. Tests: tests/node/brand-font.test.mjs (the built files) and the build itself (build.py --check).
"""
from fontTools.pens.recordingPen import DecomposingRecordingPointPen
from fontTools.pens.ttGlyphPen import TTGlyphPointPen
from fontTools.ttLib.tables.TupleVariation import TupleVariation
from fontTools.varLib.models import supportScalar

DEFAULT = ()


def key(loc):
    """A hashable form of a normalized location ({} is the default)."""
    return tuple(sorted((t, v) for t, v in loc.items() if v))


def supports(font):
    """Every region of the font's gvar, as {axis: (start, peak, end)} dicts, in a stable order."""
    if 'gvar' not in font:
        return []
    seen = {}
    for vs in font['gvar'].variations.values():
        for v in vs:
            seen.setdefault(tuple(sorted(v.axes.items())), dict(v.axes))
    return [seen[k] for k in sorted(seen)]


def masters(font):
    """The default location and the peak of every support: the locations a glyph is described at."""
    out = [{}]
    for s in supports(font):
        out.append({t: p for t, (_, p, _) in s.items()})
    return out


class Reader:
    """Reads decomposed outlines and advances at normalized locations (glyph sets are cached per location)."""

    def __init__(self, font):
        self.font, self.sets = font, {}

    def glyphset(self, loc):
        k = key(loc)
        if k not in self.sets:
            self.sets[k] = self.font.getGlyphSet(location=dict(loc), normalized=True) if k else self.font.getGlyphSet()
        return self.sets[k]

    def outline(self, name, loc):
        """[[(x, y, segmentType)], ...]: the glyph's contours at loc, components decomposed."""
        gs = self.glyphset(loc)
        pen = DecomposingRecordingPointPen(gs)
        gs[name].drawPoints(pen)
        contours, cur = [], None
        for op, args, kw in pen.value:
            if op == 'beginPath':
                cur = []
            elif op == 'addPoint':
                (x, y), seg = args[0], args[1] if len(args) > 1 else kw.get('segmentType')
                cur.append((x, y, seg))
            elif op == 'endPath':
                contours.append(cur)
        return contours

    def advance(self, name, loc):
        return self.glyphset(loc)[name].width


def bounds(contours):
    xs = [p[0] for c in contours for p in c]
    ys = [p[1] for c in contours for p in c]
    return (min(xs), min(ys), max(xs), max(ys)) if xs else (0, 0, 0, 0)


def _solve(rows, cols):
    """Gaussian elimination: rows[k] = scalars of every support at master k; cols[k] = the target offsets. Returns the
    delta of each support (lists of floats)."""
    n = len(rows)
    a = [list(r) + [list(c)] for r, c in zip(rows, cols)]
    for i in range(n):
        piv = max(range(i, n), key=lambda r: abs(a[r][i]))
        if abs(a[piv][i]) < 1e-9:
            raise ValueError('the masters do not determine the deltas')
        a[i], a[piv] = a[piv], a[i]
        for r in range(n):
            if r != i and a[r][i]:
                f = a[r][i] / a[i][i]
                a[r] = [x - f * y for x, y in zip(a[r][:n], a[i][:n])] + [[x - f * y for x, y in zip(a[r][n], a[i][n])]]
    return [[v / a[i][i] for v in a[i][n]] for i in range(n)]


def set_glyph(font, name, outlines, advances):
    """Writes glyph `name` (added to the glyph order when new) from {key(loc): contours} and {key(loc): advance} given
    at every location of masters(font). Every outline must have the same points in the same order."""
    order = font.getGlyphOrder()
    if name not in order:
        font.setGlyphOrder(order + [name])
        font['glyf'].glyphOrder = font.getGlyphOrder()
    base, adv = outlines[DEFAULT], advances[DEFAULT]
    pen = TTGlyphPointPen(None)
    for c in base:
        pen.beginPath()
        for x, y, seg in c:
            pen.addPoint((round(x), round(y)), seg)
        pen.endPath()
    glyph = pen.glyph()
    glyph.recalcBounds(font['glyf'])
    font['glyf'][name] = glyph
    xmin = glyph.xMin if base else 0
    font['hmtx'][name] = (round(adv), xmin)
    if 'gvar' not in font:
        return
    flat = lambda cs, a: [(x, y) for c in cs for x, y, _ in c] + [(0, 0), (a, 0), (0, 0), (0, 0)]
    ref = flat(base, adv)
    sups = supports(font)
    locs = masters(font)[1:]
    rows = [[supportScalar(loc, s) for s in sups] for loc in locs]
    cols = []
    for loc in locs:
        pts = flat(outlines[key(loc)], advances[key(loc)])
        if len(pts) != len(ref):
            raise ValueError(f'{name}: the outline at {loc} has {len(pts)} points, the default {len(ref)}')
        cols.append([v for (x, y), (x0, y0) in zip(pts, ref) for v in (x - x0, y - y0)])
    deltas = _solve(rows, cols) if locs else []
    end_pts = list(glyph.endPtsOfContours) if base else []
    orig = [(round(x), round(y)) for x, y in ref]
    variations = []
    for s, d in zip(sups, deltas):
        coords = [(round(d[2 * i]), round(d[2 * i + 1])) for i in range(len(ref))]
        if not any(x or y for x, y in coords):
            continue
        tv = TupleVariation(dict(s), coords)
        if base:
            tv.optimize(orig, end_pts, tolerance=0.5)
        variations.append(tv)
    font['gvar'].variations[name] = variations


def copy_glyph(font, src, dest):
    """A copy of a glyph under a new name (outline or components, metrics and variations)."""
    import copy
    order = font.getGlyphOrder()
    if dest not in order:
        font.setGlyphOrder(order + [dest])
        font['glyf'].glyphOrder = font.getGlyphOrder()
    font['glyf'][dest] = copy.deepcopy(font['glyf'][src])
    font['hmtx'][dest] = font['hmtx'][src]
    if 'gvar' in font:
        font['gvar'].variations[dest] = copy.deepcopy(font['gvar'].variations.get(src, []))


def at_masters(font, make):
    """Calls make(reader, loc) at every master and returns ({key: contours}, {key: advance}) for set_glyph()."""
    r = Reader(font)
    outs, advs = {}, {}
    for loc in masters(font):
        contours, adv = make(r, loc)
        outs[key(loc)], advs[key(loc)] = contours, adv
    return outs, advs
