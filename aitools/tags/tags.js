/* Auto tags page: a photo in, suggested tags out (MobileNetV3, ImageNet labels, in the inference worker). The person
 * accepts or edits them. Saving writes meta.tags on the photo's Slop Drive record through shared/tags (SlopTags).
 * An uploaded photo is put in Slop Drive only when the tags are saved, never just to get suggestions. */
(function () {
  'use strict';
  const T = window.SlopAITools, $ = (id) => document.getElementById(id), TAGS = window.SlopTags;
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
  let photo = null;          // { blob, name, driveId } for the picture on the page
  let suggestions = [];

  /** Suggestions as toggle buttons: a tap adds the tag to the text box, or removes it. */
  function renderSuggestions() {
    const box = $('sugg'); box.replaceChildren();
    for (const s of suggestions) {
      const b = document.createElement('button'), tag = TAGS.norm(s.label), on = TAGS.parse($('tagText').value).includes(tag);
      b.type = 'button'; b.textContent = `${tag} ${Math.round(s.p * 100)}%`; b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.addEventListener('click', () => {
        const cur = TAGS.parse($('tagText').value);
        $('tagText').value = (cur.includes(tag) ? TAGS.withoutTag(cur, tag) : TAGS.withAdded(cur, [tag])).join(', ');
        renderSuggestions();
      });
      box.append(b);
    }
  }
  function showPhoto(blob, name, driveId, text) {
    photo = { blob, name, driveId };
    const img = $('pic');
    if (img.src && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
    img.src = URL.createObjectURL(blob); img.hidden = false;
    suggestions = []; renderSuggestions();
    $('run').disabled = false; $('save').disabled = false;
    $('msg').textContent = text;
  }
  async function suggest() {
    if (!photo) return;
    $('run').disabled = true; $('msg').textContent = t('aitools.tags.reading');
    try {
      await T.ensure('mobilenetv3-l100', (s) => ($('msg').textContent = s));
      const img = await T.image(photo.blob);
      const r = await T.call('classify', { bitmap: img.bitmap, w: img.w, h: img.h }, { transfer: [img.bitmap] });
      suggestions = r.tags.filter((tag) => tag.p >= 0.02);
      renderSuggestions();
      $('msg').textContent = suggestions.length ? t('aitools.tags.tap') : t('aitools.tags.none');
    } catch (e) { $('msg').textContent = t('aitools.tags.failed', { error: e.message }); }
    finally { $('run').disabled = false; }
  }
  /** Saves the tags: onto the Drive record of a picked photo, or a new Drive record for an upload. */
  async function save() {
    if (!photo) return;
    const H = window.SlopHub;
    if (!H) { $('msg').textContent = t('aitools.tags.no_drive'); return; }
    const tags = TAGS.parse($('tagText').value);
    try {
      if (photo.driveId) {
        const rec = await H.get(photo.driveId);
        await H.update(photo.driveId, { meta: Object.assign({}, rec.meta || {}, { tags }) }, { touch: false });
      } else {
        photo.driveId = await T.toDrive(photo.name, photo.blob, 'ai-tags', { tags });
      }
      $('msg').textContent = t('aitools.tags.saved', { n: tags.length, name: photo.name });
    } catch (e) { $('msg').textContent = t('aitools.tags.save_failed', { error: e.message }); }
  }
  function pick(f) {
    if (!f || !/^image\//.test(f.type)) { $('msg').textContent = t('aitools.page.choose_image'); return; }
    $('tagText').value = '';
    showPhoto(f, f.name, null, t('aitools.tags.press'));
  }
  /** A photo from Slop Drive (the picker, ?drive=<id>): its tags so far are in the box, and Save updates that record. */
  function fromDrive(f, rec) {
    $('tagText').value = TAGS.of(rec).join(', ');
    showPhoto(f, f.name, rec.id, t('aitools.tags.from_drive', { name: f.name }));
  }
  // the one way in (aitools/intake.js): a drop on the box, choose a file, pick a photo from Slop Drive, a paste, ?drive=<id>
  const intake = T.intake('ai-tags', {
    accept: { types: ['image/*'], exts: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif'], noun: 'aitools.page.an_image' }, drive: '#pickDrive',
    read: (f, ctx) => (ctx.drive ? fromDrive(f, ctx.drive.record) : pick(f)),
  });
  $('run').addEventListener('click', suggest);
  $('save').addEventListener('click', save);
  T.gate('tags', () => { $('ui').hidden = false; intake.launch(); });
})();
