"""One face of a brand family: an upstream OFL font, its axes limited, the spec's design changes, its layout features
and its new names. Used by build.py. Tests: tests/node/brand-font.test.mjs (the built files).
"""
import io

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.varLib.hvar import add_HVAR

import layout
import ops
from naming import check_names, rename

DATE = 3_900_000_000          # head.created and head.modified (seconds since 1904): fixed, so a rebuild is byte-identical


def _reload(font):
    b = io.BytesIO()
    font.save(b)
    b.seek(0)
    return loaded(TTFont(b, lazy=False))


def loaded(font):
    """Every table decompiled, so glyphs can be added (a lazily read gvar counts the old glyph order)."""
    for tag in font.keys():
        if tag != 'GlyphOrder':
            font[tag]
    return font


def limit_axes(font, axes):
    """Limits (a [min, max] range) or pins (a number) the variation axes, then reloads the font."""
    if 'fvar' not in font or not axes:
        return font
    limits = {t: (tuple(v) if isinstance(v, list) else v) for t, v in axes.items()}
    return _reload(instancer.instantiateVariableFont(font, limits, updateFontNames=False))


def default_weight(font):
    if 'fvar' in font:
        for a in font['fvar'].axes:
            if a.axisTag == 'wght':
                return int(a.defaultValue)
    return font['OS/2'].usWeightClass


def make_face(path, spec, role, italic, source):
    """Returns (font, features) for one style of a role: features is [{tag, name}] of what the face offers."""
    font = limit_axes(loaded(TTFont(path, lazy=False)), role.get('axes'))
    font.recalcTimestamp = False
    feats = []
    sets = role.get('ss', [])
    borrowed = {s['tag']: {} for s in sets if s.get('from')}
    for s in sets:
        for tag in s.get('from', []):
            borrowed[s['tag']].update(layout.feature_mapping(font, tag))
    undo = ops.defaults(font, role.get('defaults', []))
    mine = {s['tag'] for s in sets} | {lg['tag'] for lg in role.get('ligatures', [])}
    layout.drop_features(font, set(role['features']) - mine)
    if role.get('tittle'):
        undo['tittle'] = ops.tittle(font, role['tittle'], keep=any(s.get('undo') == 'tittle' for s in sets))
    for s in sets:
        mapping = undo[s['undo']] if s.get('undo') else borrowed[s['tag']]   # {glyph: the glyph the set shows}
        mapping = {a: b for a, b in mapping.items() if a in font.getGlyphOrder() and b in font.getGlyphOrder()}
        if mapping:
            layout.add_feature(font, s['tag'], 'single', mapping, s['name'])
            feats.append({'tag': s['tag'], 'name': s['name']})
    gdef = font['GDEF'].table if 'GDEF' in font else None
    for i, lg in enumerate(role.get('ligatures', [])):
        pairs = {}
        for j, text in enumerate(lg['texts']):
            name = f'lig{i}.{j}'
            glyphs = ops.ligature(font, name, text, lg.get('drips', []), lg.get('stem', 'l'))
            pairs[tuple(glyphs)] = name
            if gdef and gdef.GlyphClassDef:
                gdef.GlyphClassDef.classDefs[name] = 2
        layout.add_feature(font, lg['tag'], 'liga', pairs)
        feats.append({'tag': lg['tag'], 'name': lg['name'], 'texts': lg['texts']})
    for key in role.get('pua', []):
        mark = spec['pua'][key]
        ops.pua(font, f'pua.{key}', mark['code'], spec['drawings'][mark['drawing']])
        if gdef and gdef.GlyphClassDef:
            gdef.GlyphClassDef.classDefs[f'pua.{key}'] = 1
    if 'HVAR' in font:
        del font['HVAR']
        add_HVAR(font)
    psname = rename(font, spec, dict(role, upstreamDesigner=source['designer']), {'italic': italic, 'weight': default_weight(font)}, source['copyright'])
    problems = check_names(font, source['family'], spec.get('forbid', []))
    if problems:
        raise ValueError(f'{role["name"]}: ' + '; '.join(problems))
    font['head'].created = font['head'].modified = DATE
    font = _reload(font)
    font.recalcTimestamp = False
    return font, feats, psname
