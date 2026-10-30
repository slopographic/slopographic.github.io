"""Names for a built font: the name table, fvar instance names, OS/2 and head style bits.

OFL 1.1: a modified version may not use a Reserved Font Name, keeps the upstream copyright notices and stays under the
OFL. rename() writes the new family names, keeps every upstream copyright line in ID 0 next to the spec's own, and
leaves no upstream family name in any other record (check_names() proves it). Used by build.py.
Tests: tests/node/brand-font.test.mjs (the name tables of the built files).
"""
import re

KEEP_IDS = {0, 13, 14}                   # copyright, licence description, licence URL
WEIGHTS = {100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold',
           800: 'ExtraBold', 900: 'Black'}
OFL_DESC = 'SIL Open Font License 1.1'      # short: the web files carry every byte; OFL.txt has the whole text
OFL_URL = 'https://openfontlicense.org'


def ps(s):
    return re.sub(r'[^A-Za-z0-9]', '', s)


def set_name(font, nid, text):
    font['name'].setName(text, nid, 3, 1, 0x409)


def rename(font, spec, role, style, upstream_copyright):
    """style: {'italic': bool, 'weight': default weight}. Family names follow the spec's role name."""
    family = role['name']
    italic = style['italic']
    variable = 'fvar' in font
    weight = style['weight']
    sub = ('Italic' if italic else 'Regular') if variable or weight == 400 else (WEIGHTS[weight] + (' Italic' if italic else ''))
    legacy_family = family if (variable or weight in (400, 700)) else f'{family} {WEIGHTS[weight]}'
    legacy_sub = sub if (variable or weight in (400, 700)) else ('Italic' if italic else 'Regular')
    psname = f'{ps(family)}-{ps(sub)}'
    version = spec['version']
    name = font['name']
    stat_ids = _referenced_ids(font)
    for rec in list(name.names):
        if rec.nameID not in KEEP_IDS and rec.nameID not in stat_ids:
            name.removeNames(nameID=rec.nameID)
    name.removeNames(platformID=1)                       # Windows names only, like the upstream web fonts
    set_name(font, 0, f'{upstream_copyright}; {spec["copyright"]}')
    set_name(font, 1, legacy_family)
    set_name(font, 2, legacy_sub)
    set_name(font, 3, f'{version};{spec["vendor"]};{psname}')
    set_name(font, 4, f'{family} {sub}' if sub != 'Regular' else family)
    set_name(font, 5, f'Version {version}')
    set_name(font, 6, psname)
    set_name(font, 8, spec['designer'])               # the credits of the upstream designers are in FONTLOG.txt
    set_name(font, 13, OFL_DESC)
    set_name(font, 14, OFL_URL)
    if legacy_family != family or variable:
        set_name(font, 16, family)
        set_name(font, 17, sub)
    if variable:
        set_name(font, 25, ps(family) + ('Italic' if italic else ''))
        for inst in font['fvar'].instances:
            sub_name = name.getDebugName(inst.subfamilyNameID) or 'Regular'
            if inst.postscriptNameID not in (None, 0xFFFF):
                inst.postscriptNameID = name.addName(f'{ps(family)}-{ps(sub_name)}', platforms=((3, 1, 0x409),), minNameID=256)
    os2 = font['OS/2']
    os2.achVendID = spec['vendor'][:4].ljust(4)
    os2.usWeightClass = weight
    bold = weight == 700 and not variable
    sel = os2.fsSelection & ~0b1100001                    # italic, bold and regular bits; the others stay as upstream set them
    if italic:
        sel |= 1
    if bold:
        sel |= 0b100000
    if not italic and not bold:
        sel |= 0b1000000
    os2.fsSelection = sel
    font['head'].macStyle = (2 if italic else 0) | (1 if bold else 0)
    font['head'].fontRevision = float(version)
    return psname


def _referenced_ids(font):
    """Name IDs used by STAT, fvar and GSUB feature names (rewritten separately; kept here)."""
    ids = set()
    if 'fvar' in font:
        for a in font['fvar'].axes:
            ids.add(a.axisNameID)
        for i in font['fvar'].instances:
            ids.add(i.subfamilyNameID)
    if 'STAT' in font:
        st = font['STAT'].table
        for a in st.DesignAxisRecord.Axis if st.DesignAxisRecord else []:
            ids.add(a.AxisNameID)
        for v in st.AxisValueArray.AxisValue if st.AxisValueArray else []:
            ids.add(v.ValueNameID)
        ids.add(st.ElidedFallbackNameID)
    if 'GSUB' in font:
        for fr in font['GSUB'].table.FeatureList.FeatureRecord:
            p = fr.Feature.FeatureParams
            if p is not None and hasattr(p, 'UINameID'):
                ids.add(p.UINameID)
    return ids - {1, 2, 3, 4, 5, 6, 16, 17}


def check_names(font, upstream, forbidden):
    """Problems: a name record outside the copyright that still holds the upstream family name, or any record that holds
    a forbidden word (another brand's)."""
    out = []
    for rec in font['name'].names:
        text = rec.toUnicode().lower()
        if rec.nameID != 0 and upstream.lower() in text:
            out.append(f'name {rec.nameID}: "{rec.toUnicode()}" keeps the upstream name {upstream}')
        out += [f'name {rec.nameID}: "{rec.toUnicode()}" holds "{w}"' for w in forbidden if w.lower() in text]
    return out
