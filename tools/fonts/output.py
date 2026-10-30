"""What a built family writes: WOFF2 subsets (the site's latin and latin-ext split), full TTFs for the download, the
size-adjusted local fallbacks, OFL.txt, FONTLOG.txt and the zip. Used by build.py.
Tests: tests/node/brand-font.test.mjs (the files and faces.json), tests/fonts/brand-font.test.html (they load).
"""
import io
import re
import zipfile
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

# The subsets and unicode ranges of shared/fonts/fonts.css (Google Fonts' latin and latin-ext); the latin subset also
# carries the spec's Private Use Area marks (pua_range), and no other Private Use Area glyph of the upstream font.
SUBSETS = {
    'latin': 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, '
             'U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
    'latin-ext': 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, '
                 'U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF',
}
# Fonts already on the device that a fallback is scaled from, and the repository's metric twins of them (Arial: Arimo,
# Times New Roman: Tinos, Courier New: Cousine), which the scaling is measured on.
LOCAL = {
    'sans': (['Arial', 'ArialMT', 'Liberation Sans', 'LiberationSans', 'Arimo Regular', 'Arimo-Regular', 'Roboto'],
             ['Arial Bold', 'Arial-BoldMT', 'Liberation Sans Bold', 'LiberationSans-Bold', 'Arimo Bold', 'Arimo-Bold', 'Roboto Bold'],
             'arimo/ttf/Arimo'),
    'serif': (['Times New Roman', 'TimesNewRomanPSMT', 'Liberation Serif', 'LiberationSerif', 'Tinos Regular', 'Tinos-Regular'],
              ['Times New Roman Bold', 'TimesNewRomanPS-BoldMT', 'Liberation Serif Bold', 'LiberationSerif-Bold', 'Tinos Bold', 'Tinos-Bold'],
              'tinos/ttf/Tinos'),
    'mono': (['Courier New', 'CourierNewPSMT', 'Liberation Mono', 'LiberationMono', 'Cousine Regular', 'Cousine-Regular'],
             ['Courier New Bold', 'CourierNewPS-BoldMT', 'Liberation Mono Bold', 'LiberationMono-Bold', 'Cousine Bold', 'Cousine-Bold'],
             'cousine/ttf/Cousine'),
}
SAMPLE = 'The quick brown fox jumps over the lazy dog. Hamburgefonstiv 0123456789 åäö ÅÄÖ'
# What a fallback stands in for where a swap shows most: the homepage hero, its title at 700 and its paragraph at 400 (both
# tones, every language table). A fallback scaled on that text keeps the hero's line breaks when the web font arrives
# (tests/node/cls.test.mjs); an average over SAMPLE missed the bold title by 2 to 3 per cent, a line at phone width.
HERO = {400: ('plain.hero.sub', 'hero.sub'), 700: ('plain.hero.title', 'hero.lead', 'hero.accent')}


def codepoints(ranges):
    out = []
    for part in ranges.split(','):
        a, _, b = part.strip()[2:].partition('-')
        out += range(int(a, 16), int(b or a, 16) + 1)
    return out


def _subset(data, unicodes, features, flavor):
    """data: the face as TTF bytes (each subset starts from a fresh copy)."""
    f = TTFont(io.BytesIO(data))
    o = subset.Options()
    o.layout_features = features
    o.flavor = flavor
    o.glyph_names = False
    o.notdef_outline = True
    o.hinting = True
    o.name_IDs = ['*']
    o.name_languages = [0x409]
    o.drop_tables += ['DSIG']
    s = subset.Subsetter(o)
    s.populate(unicodes=unicodes)
    s.subset(f)
    f.flavor = flavor
    f.recalcTimestamp = False
    b = io.BytesIO()
    f.save(b)
    return b.getvalue()


def ranges(pua):
    """{subset: unicode-range}: the latin range gets the spec's marks (hex code points)."""
    out = dict(SUBSETS)
    if pua:
        out['latin'] += ', ' + ', '.join(f'U+{c}' for c in sorted(pua))
    return out


def woff2_subsets(data, features, pua):
    """{subset: bytes} for the site's two unicode ranges."""
    return {name: _subset(data, codepoints(r), features, 'woff2') for name, r in ranges(pua).items()}


def full_ttf(data, features, pua):
    """The download copy: both ranges in one TTF."""
    r = ranges(pua)
    return _subset(data, codepoints(r['latin'] + ', ' + r['latin-ext']), features, None)


def hero_text(repo, weight):
    """The hero's text at a weight, from every language table (shared/i18n/*.js), with SAMPLE."""
    keys = '|'.join(re.escape(k) for k in HERO[weight])
    pat = re.compile(r"'(?:" + keys + r")':\s*'((?:[^'\\]|\\.)*)'")
    out = [SAMPLE]
    for f in sorted(Path(repo, 'shared', 'i18n').glob('*.js')):
        out += [m.group(1).replace("\\'", "'") for m in pat.finditer(f.read_text(encoding='utf-8'))]
    return ' '.join(out)


def _width(font, text, location=None, only=None):
    """The advance of the text in em (characters in `only` alone, when given: the ones both fonts have)."""
    gs = font.getGlyphSet(location=location) if location else font.getGlyphSet()
    cmap = font.getBestCmap()
    return sum(gs[cmap[ord(c)]].width for c in text if ord(c) in cmap and (only is None or c in only)) / font['head'].unitsPerEm


def fallbacks(font, family, category, repo):
    """Two @font-face descriptions (regular and bold) of a local font scaled to take the room of `family`: size-adjust
    is the web font's advance over the local one's on the hero's text at that weight (HERO), the overrides are the web
    font's line metrics over it."""
    local_regular, local_bold, twin = LOCAL.get(category, LOCAL['sans'])
    hhea, upm = font['hhea'], font['head'].unitsPerEm
    out = []
    for weight, names, twin_style, rng in ((400, local_regular, 'Regular', '100 549'), (700, local_bold, 'Bold', '550 1000')):
        loc = {'wght': weight} if 'fvar' in font and any(a.axisTag == 'wght' for a in font['fvar'].axes) else None
        local, text = TTFont(f'{repo}/shared/fonts/{twin}-{twin_style}.ttf'), hero_text(repo, weight)
        both = set(chr(c) for c in font.getBestCmap()) & set(chr(c) for c in local.getBestCmap())
        ratio = _width(font, text, loc, both) / _width(local, text, None, both)
        out.append({
            'family': f'{family} Fallback', 'weight': rng, 'local': names,
            'sizeAdjust': f'{ratio * 100:.2f}%', 'ascentOverride': f'{hhea.ascent / upm / ratio * 100:.2f}%',
            'descentOverride': f'{abs(hhea.descent) / upm / ratio * 100:.2f}%', 'lineGapOverride': f'{hhea.lineGap / upm / ratio * 100:.2f}%',
        })
    return out


def ofl_text(spec, sources):
    """OFL.txt: every upstream copyright line, the spec's own, then the licence text (from the first source)."""
    heads, body = [], None
    for text in sources:
        head, sep, rest = text.partition('-----------------------------------------------------------')
        for line in head.strip().splitlines():
            if line.startswith('Copyright') and line not in heads:
                heads.append(line)
        body = body or sep + rest
    heads.append(spec['copyright'])
    return '\n'.join(heads) + '\n\nThis Font Software is licensed under the SIL Open Font License, Version 1.1.\n' \
        'This license is copied below, and is also available with a FAQ at:\nhttps://openfontlicense.org\n\n\n' + body.lstrip('\n')


def fontlog(spec, roles):
    """FONTLOG.txt: what the family is, where each style comes from and what was changed."""
    lines = [f'FONTLOG for the {spec["family"]} font family', '', 'Basic Font Information', '----------------------', '',
             spec['about'], '', f'Version {spec["version"]}. Licensed under the SIL Open Font License 1.1 (OFL.txt).', '',
             'Styles and their sources', '------------------------', '']
    for r in roles:
        lines.append(f'- {r["name"]}: modified from {r["upstream"]} ({r["upstreamCopyright"]}).')
        lines += [f'    {c}' for c in r['changes']]
    lines += ['', 'Changelog', '---------', '']
    lines += [f'- {c}' for c in spec.get('changelog', [])]
    lines += ['', 'Acknowledgements', '----------------', '', 'The upstream designers: ' + '; '.join(sorted({r['upstreamDesigner'] for r in roles})) + '.', '']
    return '\n'.join(lines)


def write_zip(path, members):
    """A zip with fixed timestamps (members: [(name, bytes)]), so a rebuild gives the same bytes."""
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, data in members:
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, data)
