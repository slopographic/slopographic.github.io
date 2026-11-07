/* Slop Slides: transitions and object animations in the real editor. Present runs on an injected clock (present.clock),
   so each frame is driven by tick(ms) and nothing waits on real time. */
(function () {
  'use strict';
  const { describe, it, expect } = SlopTest;
  const NAMES = ['none', 'fade', 'push-left', 'push-right', 'push-up', 'push-down', 'wipe', 'zoom-in', 'zoom-out', 'cube'];

  /** A clock the test moves by hand: schedule() queues the frame callback, tick(ms) advances time and runs it once. */
  function fakeClock() {
    let t = 0, cbs = [];
    return {
      now: () => t,
      schedule(cb) { cbs.push(cb); return () => { cbs = cbs.filter((c) => c !== cb); }; },
      tick(ms) { t += ms; const run = cbs; cbs = []; run.forEach((cb) => cb()); },
    };
  }
  /** Three slides: plain, the one under test (its transition is set per case), plain. */
  function deck(w, s1Transition) {
    const SS = w.SS, d = SS.model.newDeck({ empty: true });
    SS.model.addSlide(d, 'blank');
    const mid = SS.model.addSlide(d, 'blank');
    if (s1Transition) mid.transition = s1Transition;
    SS.model.addSlide(d, 'blank');
    return d;
  }
  /** Shape helper: a rectangle with id and animations. */
  function box(w, id, anims) {
    return w.SS.objects.make('shape', { id, x: 100, y: 100, w: 200, h: 100, name: id, anims: anims || [] });
  }
  const visible = (w) => w.SS.presentView.visible();
  const $ = (w, sel) => w.document.querySelector(sel);
  const buttonNamed = (w, text) => Array.from(w.document.querySelectorAll('#inspector button')).filter((b) => b.textContent.trim() === text)[0];

  let w;
  describe('present: transitions', () => {
    it('opens an editor with a clock the test can move', async () => {
      w = await ST.open('../../slides/');
      expect(typeof w.SS.present.start).toBe('function');
      expect(typeof w.SS.anim.plan).toBe('function');
    });
    it('the transition at progress 0 shows only the outgoing slide, and at 1 only the incoming, for every transition', () => {
      const clock = fakeClock();
      w.SS.present.clock = clock;
      w.SS.app.load(deck(w, { name: 'none', duration: 1 }), {});
      NAMES.forEach((name) => {
        w.SS.app.deck.slides[1].transition = { name, duration: 1 };
        w.SS.app.go(0);
        w.SS.present.start();
        w.SS.present.step(1);
        if (name === 'none') {
          expect(visible(w)).toEqual(['to']);
        } else {
          expect(visible(w)).toEqual(['from']);
          clock.tick(500);
          expect(visible(w)).toEqual(['from', 'to']);
          clock.tick(500);
          expect(visible(w)).toEqual(['to']);
        }
        w.SS.present.stop();
        expect(w.SS.present.on).toBe(false);
      });
    });
    it('the outgoing side at progress 0 is the slide as it stands (no transform, full opacity)', () => {
      const clock = fakeClock();
      w.SS.present.clock = clock;
      w.SS.app.load(deck(w, { name: 'push-left', duration: 1 }), {});
      w.SS.app.go(0);
      w.SS.present.start();
      w.SS.present.step(1);
      const from = w.document.querySelector('.present-from');
      expect(from.style.transform).toBe('');
      expect(from.style.opacity).toBe('');
      w.SS.present.stop();
    });
    it('keyboard next plays a transition, Escape ends the show', () => {
      const clock = fakeClock();
      w.SS.present.clock = clock;
      w.SS.app.load(deck(w, { name: 'fade', duration: 0.5 }), {});
      w.SS.app.go(0);
      w.SS.present.start();
      ST.key(w, 'ArrowRight');
      expect(w.SS.present.current()).toBe(1);
      expect(visible(w)).toEqual(['from']);
      clock.tick(600);
      expect(visible(w)).toEqual(['to']);
      ST.key(w, 'Escape');
      expect(w.SS.present.on).toBe(false);
    });
    it('"Play animations" off gives cuts: no transition, and each click moves on', () => {
      w.SS.present.clock = fakeClock();
      w.SS.app.load(deck(w, { name: 'fade', duration: 1 }), {});
      w.SS.present.animsOn = false;
      w.SS.app.go(0);
      w.SS.present.start();
      w.SS.present.advance();
      expect(w.SS.present.current()).toBe(1);
      expect(visible(w)).toEqual(['to']);
      w.SS.present.stop();
      w.SS.present.animsOn = true;
    });
  });

  describe('present: builds', () => {
    it('a click plays the next build before the next slide: build, finish, then slide', () => {
      const clock = fakeClock();
      w.SS.present.clock = clock;
      const d = deck(w);
      d.slides[0].objects.push(box(w, 'b1', [w.SS.anim.make('pop', 'click'), w.SS.anim.make('fade-in', 'click')]));
      w.SS.app.load(d, {});
      w.SS.app.go(0);
      w.SS.present.start();
      expect(w.SS.present.status()).toEqual({ slide: 0, build: 0, builds: 2, playing: false });
      w.SS.present.advance();
      expect(w.SS.present.status().build).toBe(1);
      expect(w.SS.present.status().playing).toBe(true);
      expect(w.SS.present.current()).toBe(0);
      w.SS.present.advance();
      expect(w.SS.present.status().playing).toBe(false);
      expect(w.SS.present.current()).toBe(0);
      w.SS.present.advance();
      expect(w.SS.present.status().build).toBe(2);
      expect(w.SS.present.status().playing).toBe(true);
      w.SS.present.advance();
      expect(w.SS.present.status()).toEqual({ slide: 0, build: 2, builds: 2, playing: false });
      expect(w.SS.present.current()).toBe(0);
      w.SS.present.advance();
      expect(w.SS.present.current()).toBe(1);
      w.SS.present.stop();
      ST.close(w);
    });
    it('a build that plays by the clock finishes on its own and the click then waits for the next one', () => {
      const clock = fakeClock();
      w.SS.present.clock = clock;
      const d = deck(w);
      d.slides[0].objects.push(box(w, 'b2', [w.SS.anim.make('pop', 'click')]));
      w.SS.app.load(d, {});
      w.SS.app.go(0);
      w.SS.present.start();
      w.SS.present.advance();
      clock.tick(300);
      expect(w.SS.present.status().playing).toBe(true);
      clock.tick(300);
      expect(w.SS.present.status().playing).toBe(false);
      expect(w.SS.present.current()).toBe(0);
      w.SS.present.advance();
      expect(w.SS.present.current()).toBe(1);
      w.SS.present.stop();
    });
    it('an automatic build plays when the slide opens', () => {
      const clock = fakeClock();
      w.SS.present.clock = clock;
      const d = deck(w);
      d.slides[0].objects.push(box(w, 'b3', [w.SS.anim.make('fade-in', 'with')]));
      w.SS.app.load(d, {});
      w.SS.app.go(0);
      w.SS.present.start();
      expect(w.SS.present.status().playing).toBe(true);
      clock.tick(500);
      expect(w.SS.present.status().playing).toBe(false);
      w.SS.present.stop();
    });
  });

  describe('inspector: transition and animation panels', () => {
    let e;
    it('opens a fresh editor for the panels', async () => {
      e = await ST.open('../../slides/');
      e.SS.app.load(deck(e), {});
      e.SS.app.go(0);
      expect(e.document.querySelector('select[aria-label="Transition"]')).toBeTruthy();
    });
    it('the transition panel stores the chosen name and duration in the slide JSON', async () => {
      e.SS.app.go(1);
      const sel = $(e, 'select[aria-label="Transition"]');
      sel.value = 'wipe';
      sel.dispatchEvent(new e.Event('change'));
      const dur = $(e, 'input[aria-label="Transition duration in seconds"]');
      dur.value = '1.5';
      dur.dispatchEvent(new e.Event('change'));
      expect(e.SS.app.deck.slides[1].transition).toEqual({ name: 'wipe', duration: 1.5 });
      const json = JSON.parse(await e.SS.native.toBlob(e.SS.app.deck).text());
      expect(json.version).toBe(2);
      expect(json.slides[1].transition).toEqual({ name: 'wipe', duration: 1.5 });
    });
    it('the duration is held between 0.2 and 3 seconds', () => {
      const dur = $(e, 'input[aria-label="Transition duration in seconds"]');
      dur.value = '9';
      dur.dispatchEvent(new e.Event('change'));
      expect(e.SS.app.slide().transition.duration).toBe(3);
      expect($(e, 'input[aria-label="Transition duration in seconds"]').value).toBe('3');
    });
    it('Apply to all slides copies the transition to every slide, as one undo step', () => {
      buttonNamed(e, 'Apply to all slides').click();
      expect(e.SS.app.deck.slides.every((s) => s.transition.name === 'wipe' && s.transition.duration === 3)).toBe(true);
      e.SS.app.undo();
      expect(e.SS.app.deck.slides[0].transition.name).toBe('none');
      expect(e.SS.app.deck.slides[1].transition.name).toBe('wipe');
    });
    it('the animation panel adds, reorders and deletes an object\'s animations', () => {
      e.SS.app.go(0);
      const o = box(e, 'panel-box');
      e.SS.app.slide().objects.push(o);
      e.SS.app.select([o.id]);
      const pick = (label) => $(e, `select[aria-label="${label}"]`);
      pick('Preset to add').value = 'spin-in';
      pick('Trigger for the new animation').value = 'click';
      buttonNamed(e, 'Add animation').click();
      pick('Preset to add').value = 'pop';
      pick('Trigger for the new animation').value = 'with';
      buttonNamed(e, 'Add animation').click();
      let live = e.SS.app.slide().objects.filter((x) => x.id === o.id)[0];
      expect(live.anims.map((a) => a.preset)).toEqual(['spin-in', 'pop']);
      expect(live.anims[0].trigger).toBe('click');
      e.document.querySelector('button[aria-label="Move animation down"]').click();
      live = e.SS.app.slide().objects.filter((x) => x.id === o.id)[0];
      expect(live.anims.map((a) => a.preset)).toEqual(['pop', 'spin-in']);
      e.document.querySelector('button[aria-label="Delete animation"]').click();
      live = e.SS.app.slide().objects.filter((x) => x.id === o.id)[0];
      expect(live.anims.map((a) => a.preset)).toEqual(['spin-in']);
    });
    it('the delay and duration fields write the delay and the time scale', () => {
      const live = () => e.SS.app.slide().objects.filter((x) => x.id === 'panel-box')[0];
      const at = $(e, 'input[aria-label="Delay in seconds"]');
      at.value = '0.5';
      at.dispatchEvent(new e.Event('change'));
      const dur = $(e, 'input[aria-label="Duration in seconds"]');
      dur.value = '1.2';
      dur.dispatchEvent(new e.Event('change'));
      expect(live().anims[0].at).toBe(0.5);
      expect(live().anims[0].timeScale).toBeCloseTo(1.2 / 0.6);
    });
    it('the Present switch is in the inspector and is not saved in the deck', () => {
      const box2 = $(e, 'input[aria-label="Play animations and transitions"]');
      expect(box2.checked).toBe(true);
      box2.checked = false;
      box2.dispatchEvent(new e.Event('change'));
      expect(e.SS.present.animsOn).toBe(false);
      expect(JSON.stringify(e.SS.app.deck).indexOf('animsOn')).toBe(-1);
      e.SS.present.animsOn = true;
      ST.close(e);
    });
  });
})();
