/* Fuzzy search ranking and recents. */
(function () {
  const { describe, it, expect } = SlopTest;
  const S = () => SlopCmd._parts.search;
  const ids = (list) => list.map((c) => c.id);
  describe('fuzzy search', () => {
    it('scores prefixes over word starts over substrings over subsequences', () => {
      const s = S().score;
      expect(s('tex', 'Text tool')).toBeGreaterThan(s('tex', 'Context menu'));
      expect(s('tool', 'Text tool')).toBeGreaterThan(s('ool', 'Text tool'));
      expect(s('tt', 'Text tool')).toBeGreaterThan(0);
      expect(s('nl', 'New label')).toBeGreaterThan(s('nl', 'Inline'));
      expect(s('zz', 'Text tool')).toBe(-1);
      expect(s('save', 'Save')).toBeGreaterThan(s('save', 'Save as…'));
    });
    it('ranks title matches above keyword, group and id matches; every word must match', () => {
      T.fresh();
      T.spy({ id: 'tool.text', title: 'Text tool', group: 'Tools', keywords: ['type', 'font'] });
      T.spy({ id: 'file.export', title: 'Export PNG', group: 'File', keywords: ['image', 'text'] });
      T.spy({ id: 'view.textures', title: 'Show grid', group: 'Textures' });
      const r = ids(SlopCmd.search('text'));
      expect(r.indexOf('tool.text')).toBe(0);
      expect(r.indexOf('file.export')).toBeGreaterThan(0);
      expect(r).toContain('view.textures');
      expect(ids(SlopCmd.search('font'))[0]).toBe('tool.text');
      expect(ids(SlopCmd.search('export png'))).toEqual(['file.export']);
      expect(ids(SlopCmd.search('export zzz'))).toEqual([]);
      expect(ids(SlopCmd.search('expng'))[0]).toBe('file.export');
    });
    it('puts disabled commands after enabled ones', () => {
      T.fresh();
      T.spy({ id: 't.paste', title: 'Paste', when: () => false });
      T.spy({ id: 't.paste2', title: 'Paste special' });
      const r = SlopCmd.search('paste');
      expect(ids(r)).toEqual(['t.paste2', 't.paste']);
      expect(r[1].enabled).toBe(false);
    });
    it('boosts recently and frequently used commands', () => {
      T.fresh();
      T.spy({ id: 't.zoomin', title: 'Zoom in' });
      T.spy({ id: 't.zoomout', title: 'Zoom out' });
      expect(ids(SlopCmd.search('zoom'))[0]).toBe('t.zoomin');
      SlopCmd.run('t.zoomout'); SlopCmd.run('t.zoomout');
      expect(ids(SlopCmd.search('zoom'))[0]).toBe('t.zoomout');
      expect(SlopCmd.frecency('t.zoomout')).toBeGreaterThan(SlopCmd.frecency('t.zoomin'));
    });
    it('lists Go to entries for other apps when searching', () => {
      T.fresh('label');
      const flat = (q) => S().results(q).flatMap((s) => s.items);
      expect(flat('vector').some((x) => x.id === 'go.vector')).toBe(true);
      expect(flat('sloplabel').some((x) => x.id === 'go.label')).toBe(false);
      let url = '';
      S().navigate = (u) => { url = u; };
      S().goTo(flat('vector').find((x) => x.id === 'go.vector').go);
      expect(url).toMatch(/\/slopvector\/$/);
    });
    it('adds results from providers (e.g. files) under their own heading', () => {
      T.fresh();
      let ran = 0;
      const off = SlopCmd.addProvider({ id: 'files', title: 'Files', search: (q) => (q.length > 1 ? [{ id: 'file.1', title: 'quarterly report.txt', run: () => ran++ }] : []) });
      const sec = S().results('quarterly').find((s) => s.title === 'Files');
      expect(sec.items[0].title).toBe('quarterly report.txt');
      sec.items[0].provided();
      expect(ran).toBe(1);
      off();
      expect(S().results('quarterly').some((s) => s.title === 'Files')).toBe(false);
    });
  });
  describe('recents', () => {
    it('remembers the latest runs per app, newest first, and persists them', () => {
      const app = T.fresh();
      T.spy({ id: 't.a', title: 'Alpha' }); T.spy({ id: 't.b', title: 'Beta' }); T.spy({ id: 't.c', title: 'Gamma' });
      SlopCmd.run('t.a'); SlopCmd.run('t.c', { source: 'palette' });
      expect(SlopCmd.recent()).toEqual(['t.c', 't.a']);
      expect(JSON.parse(localStorage.getItem('slop.cmd.recent.' + app))['t.c'][0]).toBe(1);
      SlopCmd.run('t.b', { record: false });
      expect(SlopCmd.recent()).toEqual(['t.c', 't.a']);
      const sec = S().results('');
      expect(sec[0].title).toBe('Recent');
      expect(ids(sec[0].items)).toEqual(['t.c', 't.a']);
      SlopCmd.init({ app: 'other-' + app });
      expect(SlopCmd.recent()).toEqual([]);
      SlopCmd.init({ app });
      expect(SlopCmd.recent()).toEqual(['t.c', 't.a']);
    });
    it('does not count the palette and shortcut editor themselves', () => {
      T.fresh();
      SlopCmd.run('cmd.keymap');
      SlopCmd.close();
      document.querySelectorAll('.sui-dlg .sui-x').forEach((x) => x.click());
      expect(SlopCmd.recent()).toEqual([]);
    });
  });
})();
