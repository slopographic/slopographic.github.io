/* SlopCut commands with arguments (SE.ai, js/ai/core.js): clips on the timeline. Add, move, trim, split, delete,
   duplicate, speed, volume and fades, mute a track, transform, picture in picture, colour. Each is one undo step
   through SE.change and the timeline core (core/edit.js). */
(function () {
  'use strict';
  const SE = window.SE, M = SE.model, E = SE.edit, AI = SE.ai, U = SE.util, SV = window.SlopVideo;
  const CLIP = { name: 'clip', type: 'string', maxLength: 60, default: 'selected', description: 'clip id from list_clips, or "selected"' };
  const sel = () => ({ clip: SE.app.primary() ? SE.app.primary().id : 'selected' });
  const at = () => ({ time: AI.t(AI.now()) });
  const said = (verb, p, ids) => `${verb} ${ids.length} clip${ids.length === 1 ? '' : 's'}: ${ids.map((id) => { const c = M.clip(p, id); return c ? `${id} on ${AI.trackName(p, c.track)} ${AI.t(c.start)}–${AI.t(M.end(c))} s` : id; }).join('; ')}.`;

  AI.def([
    { id: 'cut.list', tool: 'list_clips', title: 'List tracks and clips', group: 'Timeline', readOnly: true, args: [],
      description: 'The sequence (size, fps, length), the tracks, every clip with its id, track, start, end, source in and out, and the bin media with ids. Read this before editing.',
      run: () => AI.state() },
    { id: 'cut.addClip', tool: 'add_clip', title: 'Add media to the timeline…', group: 'Timeline',
      description: 'Put a media item (bin id or name, or a Slop Drive file id or name: it is imported first) on a track at a time. Video with sound gets a linked audio clip. What it lands on is overwritten.',
      args: [{ name: 'media', type: 'string', required: true, maxLength: 200, description: 'bin media id or name, or Slop Drive file id or name' },
        { name: 'track', type: 'string', maxLength: 10, default: 'V1', description: 'V1, V2… (pictures) or A1, A2… (sound only)' },
        { name: 'start', type: 'number', min: 0, max: 86400, description: 'timeline seconds; default the end of that track' },
        { name: 'in', type: 'number', min: 0, max: 86400, default: 0, description: 'source start in seconds' },
        { name: 'out', type: 'number', min: 0, max: 86400, description: 'source end in seconds (default the end of the media, 5 s for a picture)' }],
      run: async (a) => {
        const meta = await AI.media(a.media);
        return SE.change('Add clip', (p) => {
          const tk = AI.track(p, a.track, meta.kind === 'audio' ? 'audio' : 'video');
          const start = a.start != null ? AI.frame(a.start) : M.clipsOn(p, tk).reduce((x, c) => Math.max(x, M.end(c)), 0);
          const ids = E.addMedia(p, meta, tk, start);
          if (!ids.length) throw new Error(`${meta.name} has nothing to put on ${AI.trackName(p, tk)} (a picture or silent video on a sound track?).`);
          const len = isFinite(meta.dur) ? meta.dur : 5, out = a.out != null ? Math.min(a.out, len) : len, inn = Math.min(a.in || 0, Math.max(0, out - 1 / p.fps));
          for (const id of ids) { const c = M.clip(p, id); c.in = inn; c.dur = Math.max(1 / p.fps, out - inn); E.clearRange(p, c.track, c.start, M.end(c), new Set(ids)); }
          SE.app.select(ids);
          return said('Added', p, ids);
        });
      } },
    { id: 'cut.move', tool: 'move_clip', title: 'Move clip…', group: 'Clip', prefill: sel,
      description: 'Move a clip (and its linked sound) to a new start time and/or another track of the same kind. It overwrites what it lands on.',
      args: [CLIP, { name: 'start', type: 'number', min: 0, max: 86400, description: 'new start in timeline seconds' },
        { name: 'track', type: 'string', maxLength: 10, description: 'V1, V2… or A1… (same kind as the clip)' }],
      run: (a) => {
        const c = AI.clip(a.clip), id = c.id;
        return SE.change('Move clip', (p) => {
          const c0 = M.clip(p, id), kind = M.track(p, c0.track).kind, list = kind === 'video' ? M.videoTracks(p) : M.audioTracks(p);
          const to = a.track ? AI.track(p, a.track, kind) : c0.track, dTrack = list.findIndex((t) => t.id === to) - list.findIndex((t) => t.id === c0.track);
          if (M.track(p, to).kind !== kind) throw new Error(`A ${kind} clip stays on a ${kind} track.`);
          if (!E.move(p, [id], (a.start != null ? AI.frame(a.start) : c0.start) - c0.start, dTrack, kind)) throw new Error('The clip could not move there (a locked track?).');
          return said('Moved', p, [id]);
        });
      } },
    { id: 'cut.trim', tool: 'trim_clip', title: 'Trim clip…', group: 'Clip', prefill: sel,
      description: 'Set where a clip starts and/or ends on the timeline (its edges; the source moves with them). ripple: later clips move to close or open the gap. Use set_source_range to pick source in/out instead.',
      args: [CLIP, { name: 'start', type: 'number', min: 0, max: 86400, description: 'new start edge, timeline seconds' },
        { name: 'end', type: 'number', min: 0, max: 86400, description: 'new end edge, timeline seconds' },
        { name: 'ripple', type: 'boolean', default: false, description: 'move later clips too' }],
      run: (a) => {
        const id = AI.clip(a.clip).id;
        if (a.start == null && a.end == null) throw new Error('Give start or end (timeline seconds).');
        return SE.change(a.ripple ? 'Ripple trim' : 'Trim', (p) => {
          if (a.start != null) E.trim(p, id, 'in', AI.frame(a.start), { ripple: a.ripple });
          if (a.end != null) E.trim(p, id, 'out', AI.frame(a.end), { ripple: a.ripple });
          return said('Trimmed', p, [id]);
        });
      } },
    { id: 'cut.sourceRange', tool: 'set_source_range', title: 'Set clip source in and out…', group: 'Clip', prefill: sel,
      description: 'Choose which part of the source a clip plays: in and out are seconds in the media. The clip keeps its start; its length follows (later clips are not moved).',
      args: [CLIP, { name: 'in', type: 'number', min: 0, max: 86400, required: true, description: 'source seconds' },
        { name: 'out', type: 'number', min: 0, max: 86400, required: true, description: 'source seconds, after in' }],
      run: (a) => {
        const id = AI.clip(a.clip).id;
        if (!(a.out > a.in)) throw new Error('out must be after in.');
        return SE.change('Source range', (p) => {
          for (const x of M.linked(p, M.clip(p, id))) { const len = M.srcLen(p, x); x.in = Math.min(a.in, isFinite(len) ? len : a.in); x.dur = Math.max(1 / p.fps, (Math.min(a.out, isFinite(len) ? len : a.out) - x.in) / x.speed); E.clearRange(p, x.track, x.start, M.end(x), E.group(p, [id])); }
          return said('Set the source of', p, [id]);
        });
      } },
    { id: 'cut.split', tool: 'split_clip', title: 'Split at a time…', group: 'Edit', prefill: () => Object.assign(at(), { clip: '' }),
      description: 'Cut clips in two at a timeline time: one clip (and its linked sound), or every clip under that time on unlocked tracks.',
      args: [{ name: 'time', type: 'number', min: 0, max: 86400, required: true, description: 'timeline seconds' },
        { name: 'clip', type: 'string', maxLength: 60, description: 'clip id; empty = every track' }],
      run: (a) => {
        const ids = a.clip ? [AI.clip(a.clip).id] : null, t = AI.frame(a.time);
        const out = SE.change('Split', (p) => { const r = E.split(p, t, ids); return r.length ? r : false; });
        if (out === false) throw new Error(`No clip is under ${t} s to split.`);
        return `Split at ${t} s. New clips: ${out.join(', ')}.`;
      } },
    { id: 'cut.delete', tool: 'delete_clips', title: 'Delete clips…', group: 'Edit', destructive: true, prefill: () => ({ clips: SE.app.selectedIds().join(',') }),
      description: 'Remove clips (and their linked sound) from the timeline. ripple closes the gap. The media stays in the bin.',
      args: [{ name: 'clips', type: 'string', required: true, maxLength: 4000, description: 'clip ids, comma separated, "selected" or "all"' },
        { name: 'ripple', type: 'boolean', default: false, description: 'close the gap' }],
      run: (a) => { const ids = AI.clips(a.clips); const n = SE.change(a.ripple ? 'Ripple delete' : 'Delete', (p) => E.remove(p, ids, { ripple: a.ripple })); SE.app.select([]); return `Deleted ${n} clip${n === 1 ? '' : 's'}.`; } },
    { id: 'cut.duplicate', tool: 'duplicate_clip', title: 'Duplicate clip…', group: 'Edit', prefill: sel,
      description: 'Copy a clip (with its linked sound) to a time on the same track, by default right after it.',
      args: [CLIP, { name: 'start', type: 'number', min: 0, max: 86400, description: 'timeline seconds; default its end' }],
      run: (a) => {
        const c = AI.clip(a.clip);
        return SE.change('Duplicate', (p) => {
          const g = E.group(p, [c.id]), src = p.clips.filter((x) => g.has(x.id)), t0 = Math.min(...src.map((x) => x.start));
          const to = a.start != null ? AI.frame(a.start) : Math.max(...src.map(M.end)), link = U.uid('l'), ids = [];
          for (const x of src) { const n = Object.assign(JSON.parse(JSON.stringify(x)), { id: U.uid('c'), start: U.round(to + x.start - t0, 6), link: x.link ? link : null }); p.clips.push(n); ids.push(n.id); }
          for (const id of ids) { const n = M.clip(p, id); E.clearRange(p, n.track, n.start, M.end(n), new Set(ids)); }
          SE.app.select(ids);
          return said('Duplicated as', p, ids);
        });
      } },
    { id: 'cut.speed', tool: 'set_speed', title: 'Set clip speed…', group: 'Clip', prefill: () => Object.assign(sel(), { speed: SE.app.primary() ? SE.app.primary().speed : 1 }),
      description: 'Playback speed of a clip and its linked sound (1 = normal, 0.5 = slow motion, 2 = twice as fast). Later clips ripple. Playing backwards is not supported.',
      args: [CLIP, { name: 'speed', type: 'number', min: 0.1, max: 16, default: 1, description: 'times normal speed' }],
      run: (a) => { const id = AI.clip(a.clip).id; return SE.change('Speed', (p) => { E.setSpeed(p, id, a.speed); return said(`Set speed ${a.speed}× on`, p, [id]); }); } },
    { id: 'cut.volume', tool: 'set_volume', title: 'Set volume and fades…', group: 'Clip', prefill: sel,
      description: 'Volume (1 = as recorded, 0 = silent, up to 2) and fade in/out in seconds. On a video clip it changes its linked sound; fades also fade the picture.',
      args: [CLIP, { name: 'volume', type: 'number', min: 0, max: 2, description: 'gain' }, { name: 'fade_in', type: 'number', min: 0, max: 30, description: 'seconds' },
        { name: 'fade_out', type: 'number', min: 0, max: 30, description: 'seconds' }, { name: 'mute', type: 'boolean', description: 'silence this clip (volume 0)' }],
      run: (a) => {
        const id = AI.clip(a.clip).id;
        return SE.change('Volume', (p) => {
          for (const x of M.linked(p, M.clip(p, id))) {
            const half = x.dur / 2;
            if (x.kind === 'audio') { if (a.volume != null) x.vol = a.volume; if (a.mute) x.vol = 0; if (a.fade_in != null) x.afIn = Math.min(a.fade_in, half); if (a.fade_out != null) x.afOut = Math.min(a.fade_out, half); }
            else { if (a.fade_in != null) x.fadeIn = Math.min(a.fade_in, half); if (a.fade_out != null) x.fadeOut = Math.min(a.fade_out, half); }
          }
          return said('Set the sound of', p, [id]);
        });
      } },
    { id: 'cut.track', tool: 'set_track', title: 'Mute, solo, hide or lock a track…', group: 'Timeline', prefill: () => ({ track: 'A1' }),
      description: 'Track switches: mute and solo (sound tracks), hide (picture tracks), lock (no edits).',
      args: [{ name: 'track', type: 'string', required: true, maxLength: 10, description: 'V1… or A1…' }, { name: 'mute', type: 'boolean' }, { name: 'solo', type: 'boolean' }, { name: 'hide', type: 'boolean' }, { name: 'lock', type: 'boolean' }],
      run: (a) => SE.change('Track', (p) => { const t = M.track(p, AI.track(p, a.track)); for (const k of ['mute', 'solo', 'hide', 'lock']) if (a[k] != null) t[k] = a[k]; return `${t.name}: ${['mute', 'solo', 'hide', 'lock'].filter((k) => t[k]).join(', ') || 'all switches off'}.`; }) },
    { id: 'cut.transform', tool: 'set_transform', title: 'Position, scale, crop…', group: 'Clip', prefill: sel,
      description: 'Place a picture clip: x and y in pixels from the frame centre, scale (1 = fitted to the frame, up to 1000 = 100 000 %), rotation in degrees, opacity 0–1, crop of each side as a fraction 0–0.9. fit_frame fills or fits the frame in one step.',
      args: [CLIP, ...['x', 'y'].map((n) => ({ name: n, type: 'number', min: -20000, max: 20000 })), { name: 'scale', type: 'number', min: SE.fit.SCALE.min, max: SE.fit.SCALE.max }, { name: 'rotation', type: 'number', min: -3600, max: 3600 },
        { name: 'opacity', type: 'number', min: 0, max: 1 }, ...['crop_left', 'crop_top', 'crop_right', 'crop_bottom'].map((n) => ({ name: n, type: 'number', min: 0, max: 0.9 }))],
      run: (a) => {
        const id = AI.clip(a.clip).id, MAP = { x: 'x', y: 'y', scale: 'scale', rotation: 'rot', opacity: 'opacity', crop_left: 'cropL', crop_top: 'cropT', crop_right: 'cropR', crop_bottom: 'cropB' };
        return SE.change('Transform', (p) => { const c = M.clip(p, id); for (const [k, f] of Object.entries(MAP)) if (a[k] != null) c[f] = a[k]; return said('Placed', p, [id]); });
      } },
    { id: 'cut.fitFrame', tool: 'fit_frame', title: 'Fill or fit the frame…', group: 'Clip', prefill: () => ({ clips: SE.app.selectedIds().join(',') || 'selected' }),
      description: 'Scale and centre picture clips so the visible (cropped) picture covers the whole frame with no gaps (fill, aspect kept, edges cut) or fits inside it (fit). Resets rotation.',
      args: [{ name: 'clips', type: 'string', maxLength: 4000, default: 'selected', description: 'clip ids, "selected" or "all"' }, { name: 'mode', type: 'enum', values: ['fill', 'fit'], default: 'fill' }],
      run: (a) => {
        const ids = AI.clips(a.clips).filter((id) => { const c = M.clip(SE.doc, id); return c && c.kind !== 'audio' && c.kind !== 'effect'; });
        if (!ids.length) throw new Error('None of those clips has a picture.');
        return SE.change(a.mode === 'fit' ? 'Fit frame' : 'Fill frame', (p) => { for (const id of ids) { const c = M.clip(p, id); SE.fit.clip(p, c, c.media && M.media(p, c.media), a.mode); } return said(a.mode === 'fit' ? 'Fitted' : 'Filled the frame with', p, ids); });
      } },
    { id: 'cut.select', tool: 'select_clips', title: 'Select clips…', group: 'Edit',
      description: 'Select clips on the timeline (later commands with clip "selected" act on them). mode: replace the selection, add to it or remove from it.',
      args: [{ name: 'clips', type: 'string', maxLength: 4000, required: true, description: 'clip ids from list_clips, or "all"' }, { name: 'mode', type: 'enum', values: ['replace', 'add', 'remove'], default: 'replace' }],
      run: (a) => {
        const ids = AI.clips(a.clips), cur = new Set(a.mode === 'replace' ? [] : SE.app.selectedIds());
        for (const id of ids) { if (a.mode === 'remove') cur.delete(id); else cur.add(id); }
        SE.app.select([...cur]);
        return `${cur.size} clip${cur.size === 1 ? '' : 's'} selected${cur.size ? ': ' + [...cur].join(', ') : ''}.`;
      } },
    { id: 'cut.selectAll', tool: 'select_all', title: 'Select every clip', group: 'Edit', args: [],
      description: 'Select every clip on the timeline.',
      run: () => { SE.app.select(SE.doc.clips.map((c) => c.id)); return `${SE.app.sel.size} clips selected.`; } },
    { id: 'cut.pip', tool: 'picture_in_picture', title: 'Picture in picture…', group: 'Clip', prefill: sel,
      description: 'Shrink a clip into a corner over the clips below it (put it on V2 or higher). corner: tl, tr, bl, br or c.',
      args: [CLIP, { name: 'corner', type: 'enum', values: ['tl', 'tr', 'bl', 'br', 'c'], default: 'br' }, { name: 'scale', type: 'number', min: 0.1, max: 1, default: 0.33, description: 'size as a fraction of the frame' },
        { name: 'margin', type: 'number', min: 0, max: 0.3, default: 0.04, description: 'fraction of the shorter side' }],
      run: (a) => { const id = AI.clip(a.clip).id; return SE.change('Picture in picture', (p) => { Object.assign(M.clip(p, id), SV.edl.corner({ w: p.w, h: p.h }, a.corner, a.scale, a.margin)); return said(`Put in the ${a.corner} corner`, p, [id]); }); } },
    { id: 'cut.colour', tool: 'set_colour', title: 'Colour and looks…', group: 'Clip', prefill: () => ({ clips: SE.app.selectedIds().join(',') || 'selected' }),
      description: 'Colour of picture clips: brightness, contrast, saturation and temperature from -100 to 100 (0 = unchanged), or a look (Warm, Cool, Punchy, B&W, Faded, Night) as a start.',
      args: [{ name: 'clips', type: 'string', maxLength: 4000, default: 'selected', description: 'clip ids, "selected" or "all"' }, { name: 'look', type: 'enum', values: ['none'].concat(SE.effectsPanel.LOOKS.map((l) => l[0])) },
        ...['brightness', 'contrast', 'saturation', 'temperature'].map((n) => ({ name: n, type: 'number', min: -100, max: 100 }))],
      run: (a) => {
        const ids = AI.clips(a.clips), look = (SE.effectsPanel.LOOKS.find((l) => l[0] === a.look) || [0, null])[1];
        return SE.change('Colour', (p) => {
          let n = 0;
          for (const id of ids) {
            const c = M.clip(p, id); if (!c || c.kind === 'audio' || c.kind === 'effect') continue;
            if (a.look) Object.assign(c, { bright: 0, contrast: 0, sat: 0, temp: 0 }, look || {});
            for (const [k, f] of [['brightness', 'bright'], ['contrast', 'contrast'], ['saturation', 'sat'], ['temperature', 'temp']]) if (a[k] != null) c[f] = a[k];
            n++;
          }
          if (!n) throw new Error('None of these clips has a picture to colour.');
          return `Coloured ${n} clip${n === 1 ? '' : 's'}.`;
        });
      } },
  ]);
})();
