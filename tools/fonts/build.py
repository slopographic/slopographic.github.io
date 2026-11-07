#!/usr/bin/env python3
"""Builds a brand font family from a font spec (a JSON file; shared/fonts/HANDOFF.md, "Brand family" describes it).

    python3 tools/fonts/build.py <spec.json> <out dir> [--cache=<dir>] [--roles=sans,mono (a quick look at some roles)]

Every role of the spec (sans, serif, mono, cond...) starts from an upstream OFL font in sources.json (downloaded at a
pinned commit, SHA-256 checked, cached), gets its axes limited, the spec's design changes (ops.py), its layout features
(layout.py) and its own names (naming.py), and is written as WOFF2 subsets in the site's latin and latin-ext ranges.
The out dir then holds the WOFF2 files, faces.json (the manifest the CSS, the font picker and the specimen page read),
OFL.txt, FONTLOG.txt and <slug>-fonts.zip (full TTFs and both texts). Everything is deterministic: a rebuild of the
same spec gives the same bytes. Python 3.10+ with tools/fonts/requirements.txt.
Tests: tests/node/brand-font.test.mjs, tests/fonts/brand-font.test.html.
"""
import hashlib
import io
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
REPO = HERE.parent.parent

from assemble import make_face  # noqa: E402
import output  # noqa: E402

RFN = re.compile(r'Reserved Font Names?\s*["“]', re.I)


def mark_only(spec):
    """The spec rules of tools/fonts/spec-rules.mjs: only a plain brand mark ("kind": "mark") goes into a font, and nothing
    named after a mascot (the spec's "mascots"). A mascot is all-rights-reserved art; a glyph in an OFL font is OFL."""
    names = [n.lower() for n in spec.get('mascots', [])]
    hit = lambda s: any(n in s.lower() or (len(s) > 2 and s.lower() in n) for n in names)
    for key, e in spec.get('pua', {}).items():
        if e.get('kind') != 'mark':
            raise SystemExit(f'pua.{key}: only a brand mark goes into a font ("kind": "mark"); a mascot never does')
        for s in (key, e.get('name', ''), e.get('drawing', '')):
            if hit(s):
                raise SystemExit(f'pua.{key}: "{s}" is a mascot, which never goes into a font')
    for key in spec.get('drawings', {}):
        if hit(key):
            raise SystemExit(f'drawings.{key}: a mascot drawing has no place in a font spec')


def fetch(base, entry, cache):
    """The bytes of a source file, from the cache or the pinned URL; refused when the SHA-256 differs."""
    cache.mkdir(parents=True, exist_ok=True)
    path = cache / entry['sha256']
    if not path.exists():
        with urllib.request.urlopen(base + entry['file'], timeout=120) as r:
            data = r.read()
        path.write_bytes(data)
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != entry['sha256']:
        path.unlink()
        raise SystemExit(f'{entry["file"]}: the SHA-256 does not match sources.json')
    return path, data


def changes(role, features):
    out = []
    if role.get('axes'):
        out.append('Axes: ' + ', '.join(f'{t} {v[0]}-{v[1]}' if isinstance(v, list) else f'{t} fixed at {v}' for t, v in role['axes'].items()) + '.')
    if role.get('defaults'):
        out.append('Upstream alternates made the default: ' + ', '.join(role['defaults']) + '.')
    if role.get('tittle'):
        out.append(f'The dots of i and j redrawn: {role["tittle"]}.')
    for f in features:
        out.append(f'{f["tag"]}: {f["name"]}' + (f' ({", ".join(f["texts"])})' if f.get('texts') else '') + '.')
    if role.get('pua'):
        out.append('Private Use Area marks: ' + ', '.join(role['pua']) + '.')
    out.append('Renamed (OFL 1.1); kerning, marks and the other kept features as upstream.')
    return out


def axis_range(font, tag):
    for a in font['fvar'].axes if 'fvar' in font else []:
        if a.axisTag == tag:
            return int(a.minValue), int(a.maxValue)
    return None


def build(spec_path, out, cache, only=None):
    spec = json.loads(Path(spec_path).read_text())
    mark_only(spec)
    for k, d in spec.get('drawings', {}).items():            # "@file.json": a drawing kept in its own file, next to the spec
        if isinstance(d, str) and d.startswith('@'):
            spec['drawings'][k] = json.loads((Path(spec_path).parent / d[1:]).read_text())
    sources = json.loads((HERE / 'sources.json').read_text())
    base, known = sources['base'], sources['fonts']
    out.mkdir(parents=True, exist_ok=True)
    for f in out.iterdir():
        if f.is_file():
            f.unlink()
    manifest = {'family': spec['family'], 'version': spec['version'], 'licence': 'OFL-1.1', 'copyright': spec['copyright'],
                'licenceFile': 'OFL.txt', 'fontlog': 'FONTLOG.txt', 'download': f'{spec["slug"]}-fonts.zip',
                'roles': {}, 'features': [], 'pua': [], 'faces': [], 'fallbacks': []}
    zip_members, licences, log_roles = [], [], []
    for key, role in spec['roles'].items():
        if only and key not in only:
            continue
        src = known[role['source']]
        _, ofl = fetch(base, src['ofl'], cache)
        ofl = ofl.decode('utf-8')
        if RFN.search(ofl.split('---')[0]):
            raise SystemExit(f'{role["source"]}: its licence names a Reserved Font Name; check it is not used')
        if src['family'].lower() in role['name'].lower():
            raise SystemExit(f'{role["name"]}: a modified font may not keep the upstream name {src["family"]}')
        licences.append(ofl)
        copyright_line = next(l for l in ofl.splitlines() if l.startswith('Copyright'))
        source = dict(src, copyright=copyright_line)
        styles = ['normal'] + (['italic'] if role.get('italic') else [])
        role_feats = []
        for style in styles:
            path, _ = fetch(base, src[style], cache)
            font, feats, psname = make_face(path, spec, role, style == 'italic', source)
            role_feats = feats
            b = io.BytesIO()
            font.save(b)
            data = b.getvalue()
            keep = role['features'] + [f['tag'] for f in feats]
            wght, wdth = axis_range(font, 'wght'), axis_range(font, 'wdth')
            pua = [spec['pua'][k]['code'] for k in role.get('pua', [])]
            for sub, woff in output.woff2_subsets(data, keep, pua).items():
                name = f'{key}-{style}-{sub}.woff2'          # the same names in every build: pages can preload them
                (out / name).write_bytes(woff)
                face = {'family': role['name'], 'role': key, 'style': style,
                        'weight': f'{wght[0]} {wght[1]}' if wght else str(font['OS/2'].usWeightClass),
                        'file': name, 'subset': sub, 'unicodeRange': output.ranges(pua)[sub], 'bytes': len(woff)}
                if wdth:
                    face['stretch'] = f'{wdth[0]}% {wdth[1]}%'
                manifest['faces'].append(face)
            zip_members.append((f'{spec["family"]}/TTF/{psname}.ttf', output.full_ttf(data, keep, pua)))
            if style == 'normal' and not role.get('fallback'):
                manifest['fallbacks'] += output.fallbacks(font, role['name'], role.get('category', src['category']), REPO)
        manifest['roles'][key] = {'family': role['name'], 'category': role.get('category', src['category']),
                                  'fallback': role.get('fallback') or f'{role["name"]} Fallback', 'upstream': src['family'],
                                  'styles': styles}
        for f in role_feats:
            have = next((x for x in manifest['features'] if x['tag'] == f['tag'] and x['name'] == f['name']), None)
            if have:
                have['roles'].append(key)
            else:
                manifest['features'].append(dict(f, roles=[key]))
        log_roles.append({'name': role['name'], 'upstream': src['family'], 'upstreamCopyright': copyright_line,
                          'upstreamDesigner': src['designer'], 'changes': changes(role, role_feats)})
    for k, mark in spec.get('pua', {}).items():
        manifest['pua'].append({'code': mark['code'], 'name': mark['name'], 'kind': mark['kind'], 'roles': [r for r, v in spec['roles'].items() if k in v.get('pua', [])]})
    ofl_txt, log = output.ofl_text(spec, licences), output.fontlog(spec, log_roles)
    (out / 'OFL.txt').write_text(ofl_txt)
    (out / 'FONTLOG.txt').write_text(log)
    zip_members += [(f'{spec["family"]}/OFL.txt', ofl_txt.encode()), (f'{spec["family"]}/FONTLOG.txt', log.encode())]
    output.write_zip(out / manifest['download'], zip_members)
    (out / 'faces.json').write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + '\n')
    return manifest


def main(argv):
    args = [a for a in argv if not a.startswith('--')]
    opts = dict(a[2:].split('=', 1) for a in argv if a.startswith('--') and '=' in a)
    if len(args) != 2:
        raise SystemExit(__doc__)
    cache = Path(opts.get('cache') or os.environ.get('FONT_BUILD_CACHE') or Path.home() / '.cache' / 'font-build')
    m = build(args[0], Path(args[1]), cache, opts['roles'].split(',') if opts.get('roles') else None)
    for f in m['faces']:
        print(f'{f["file"]}: {f["bytes"]} bytes')


if __name__ == '__main__':
    main(sys.argv[1:])
