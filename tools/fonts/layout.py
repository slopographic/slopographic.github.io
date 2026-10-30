"""GSUB editing for the font build: read an upstream feature's substitutions, drop features, add new single
substitution and ligature features (with a UI name for stylistic sets) to every script and language.
Used by ops.py and build.py. Tests: tests/node/brand-font.test.mjs (the features of the built files).
"""
from fontTools.otlLib.builder import buildLigatureSubstSubtable, buildSingleSubstSubtable
from fontTools.ttLib.tables import otTables as ot


def _gsub(font):
    return font['GSUB'].table


def _subtables(lookup):
    for st in lookup.SubTable:
        yield (st.ExtSubTable, st.ExtSubTable.LookupType) if lookup.LookupType == 7 else (st, lookup.LookupType)


def feature_mapping(font, tag):
    """{glyph: alternate} from every single substitution under the feature tag (all scripts)."""
    g, out = _gsub(font), {}
    for fr in g.FeatureList.FeatureRecord:
        if fr.FeatureTag != tag:
            continue
        for i in fr.Feature.LookupListIndex:
            for st, kind in _subtables(g.LookupList.Lookup[i]):
                if kind == 1:
                    for a, b in st.mapping.items():
                        out.setdefault(a, b)
    return out


def ligatures_with(font, glyphs):
    """The ligature glyphs of the font's current features that contain any of glyphs (fi holds an i)."""
    g, out = _gsub(font), []
    for fr in g.FeatureList.FeatureRecord:
        for i in fr.Feature.LookupListIndex:
            for st, kind in _subtables(g.LookupList.Lookup[i]):
                if kind != 4:
                    continue
                for first, ligs in st.ligatures.items():
                    for lg in ligs:
                        if ({first, *lg.Component} & set(glyphs)) and lg.LigGlyph not in out:
                            out.append(lg.LigGlyph)
    return out


def _langsys(g):
    for sr in g.ScriptList.ScriptRecord:
        s = sr.Script
        if s.DefaultLangSys:
            yield s.DefaultLangSys
        for lr in s.LangSysRecord:
            yield lr.LangSys


def drop_features(font, keep):
    """Removes every feature record whose tag is not in keep (the lookups stay until the subsetter prunes them)."""
    g = _gsub(font)
    old = g.FeatureList.FeatureRecord
    new_index, kept = {}, []
    for i, fr in enumerate(old):
        if fr.FeatureTag in keep:
            new_index[i] = len(kept)
            kept.append(fr)
    g.FeatureList.FeatureRecord, g.FeatureList.FeatureCount = kept, len(kept)
    for ls in _langsys(g):
        ls.FeatureIndex = [new_index[i] for i in ls.FeatureIndex if i in new_index]
        ls.FeatureCount = len(ls.FeatureIndex)
        if ls.ReqFeatureIndex != 0xFFFF:
            ls.ReqFeatureIndex = new_index.get(ls.ReqFeatureIndex, 0xFFFF)
    if getattr(g, 'FeatureVariations', None):
        for rec in g.FeatureVariations.FeatureVariationRecord:
            subs = rec.FeatureTableSubstitution.SubstitutionRecord
            rec.FeatureTableSubstitution.SubstitutionRecord = [s for s in subs if s.FeatureIndex in new_index]
            for s in rec.FeatureTableSubstitution.SubstitutionRecord:
                s.FeatureIndex = new_index[s.FeatureIndex]
            rec.FeatureTableSubstitution.SubstitutionCount = len(rec.FeatureTableSubstitution.SubstitutionRecord)


def _lookup(kind, subtable):
    lk = ot.Lookup()
    lk.LookupType, lk.LookupFlag, lk.SubTable, lk.SubTableCount = kind, 0, [subtable], 1
    return lk


def add_feature(font, tag, kind, data, ui_name=None):
    """Adds a feature with one lookup: kind 'single' ({glyph: alternate}) or 'liga' ({(g1, g2, ...): ligature}).
    A stylistic set gets its UI name in the name table. The feature is added to every script and language."""
    g = _gsub(font)
    if kind == 'single':
        lk = _lookup(1, buildSingleSubstSubtable(data))
    else:
        lk = _lookup(4, buildLigatureSubstSubtable(data))
    g.LookupList.Lookup.append(lk)
    g.LookupList.LookupCount = len(g.LookupList.Lookup)
    feat = ot.Feature()
    feat.LookupListIndex, feat.LookupCount = [g.LookupList.LookupCount - 1], 1
    feat.FeatureParams = None
    if ui_name:
        p = ot.FeatureParamsStylisticSet()
        p.Version = 0
        p.UINameID = font['name'].addMultilingualName({'en': ui_name}, ttFont=font, mac=False, minNameID=256)
        feat.FeatureParams = p
    fr = ot.FeatureRecord()
    fr.FeatureTag, fr.Feature = tag, feat
    recs = g.FeatureList.FeatureRecord
    recs.append(fr)
    # feature records are sorted by tag; keep every language system pointing at the same records
    order = sorted(range(len(recs)), key=lambda i: recs[i].FeatureTag)
    pos = {old: new for new, old in enumerate(order)}
    g.FeatureList.FeatureRecord = [recs[i] for i in order]
    g.FeatureList.FeatureCount = len(recs)
    added = pos[len(recs) - 1]
    for ls in _langsys(g):
        ls.FeatureIndex = sorted([pos[i] for i in ls.FeatureIndex] + [added])
        ls.FeatureCount = len(ls.FeatureIndex)
        if ls.ReqFeatureIndex != 0xFFFF:
            ls.ReqFeatureIndex = pos[ls.ReqFeatureIndex]
    if getattr(g, 'FeatureVariations', None):
        for rec in g.FeatureVariations.FeatureVariationRecord:
            for s in rec.FeatureTableSubstitution.SubstitutionRecord:
                s.FeatureIndex = pos[s.FeatureIndex]


def tags(font):
    return sorted({fr.FeatureTag for t in ('GSUB', 'GPOS') if t in font for fr in font[t].table.FeatureList.FeatureRecord})
