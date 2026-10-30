/* SlopIsolate macros (shared/macros): the model and the look (background, colour, blur, shadow, crop) you set become a
 * macro step, the command co.look, whose arguments are Remove background's own options (shared/ops/isolate.js, argsOf),
 * mapped with the same toLook / fromLook. A slider drag is one step. Play sets them on the image on screen. In Slop
 * Workflows the macro runs without SlopIsolate's window: its steps are folded into Remove background's options and that
 * one operation runs (shared/ops/macros.js). ES module, loaded after the app's classic scripts. */
import { ISOLATE_OPS, toLook, fromLook } from '../../../shared/ops/isolate.js';
import { argsOf } from '../../../shared/ops/registry.js';

const g = globalThis, CO = g.CO, S = CO && CO.state, H = CO && CO.history, SM = g.SlopMacros;
const OP = ISOLATE_OPS.find((o) => o.id === 'slopisolate.remove-bg');

/** The co.look arguments of an image (or of the defaults when none is open). */
export const lookArgs = (it) => fromLook(it || S.defaults, (it && it.model) || S.model);

/** co.look: one undo step on the image on screen (and the defaults for the next ones); a new model runs it again. */
function setLook(a) {
  const it = S.current(), look = toLook(a);
  const into = (t) => { Object.assign(t.bg, look.bg); Object.assign(t.shadow, look.shadow); Object.assign(t.crop, look.crop); };
  into(S.defaults);
  const newModel = !!a.model && a.model !== S.model;
  if (newModel) { S.model = a.model; CO.util.store.set('model', a.model); }
  if (!it) return 'Set the look for the next images.';
  const before = H.snapLook(it);
  into(it);
  S.rememberLook(it);
  H.pushLook(it, before, 'cutout.undo.macro');
  // the model is the app's (an image of its own model follows it again): the images it changes run again
  if (a.model && it.model && it.model !== a.model) it.model = null;
  if (newModel || (a.model && it.modelUsed && it.modelUsed !== a.model)) CO.process.followModel(); else CO.emit('look', it);
  if (CO.panel && CO.panel.refresh) CO.panel.refresh();
  return `Set the look of ${it.name || 'the image'}.`;
}

if (CO && SM && g.SlopCmd && OP) {
  // the title is the person's (the macro's step), in the chosen language; the description is the assistant's (API, English)
  const look = () => g.SlopCmd.register([{ id: 'co.look', title: CO.util.t('cutout.cmd.look'), group: CO.util.t('menu.edit'), hidden: true, args: argsOf(OP), run: (a) => setLook(a || {}),
    description: 'Set the background (see-through, a colour or the photo blurred), shadow, crop and model, as Remove background does.' }]);
  look();
  CO.util.onLang(look);
  // what the panel changes (kit.js look edits, the model) is noted as that one command
  CO.lookArgs = lookArgs;   // the assistant's state (ui/ai-commands.js) reads the look as co.look's arguments
  CO.macroLook = (it) => SM.note('co.look', lookArgs(it), CO.util.t('cutout.macro.look_note'), { merge: true });
  SM.init({ app: 'slopisolate', label: 'SlopIsolate' });
}
