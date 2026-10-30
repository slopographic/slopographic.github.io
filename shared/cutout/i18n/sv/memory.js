/* SlopCutout, svenska: vad en enhet som AI-bakgrundsborttagningen inte kan köras på (för lite minne, eller en webbläsare där ONNX Runtime fallerar) får veta (shared/cutout/cutout.js
 * lowMemoryText). Regler: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('sv', {
  'cutoutmem.low_memory': 'Enheten har för lite minne, så AI-bakgrundsborttagningen kan inte köras här.',
  'cutoutmem.manual': 'Enheten har för lite minne, så AI-bakgrundsborttagningen kan inte köras här. Pensla Ta bort över bakgrunden (och Behåll över motivet) för att klippa ut för hand.',
  'cutoutmem.smaller': 'Enheten har för lite minne: modellen Snabb användes i stället.',
  'cutoutmem.unavailable': 'AI-bakgrundsborttagningen kan inte köras i den här webbläsaren.',
  'cutoutmem.manual_unavailable': 'AI-bakgrundsborttagningen kan inte köras i den här webbläsaren. Pensla Ta bort över bakgrunden (och Behåll över motivet) för att klippa ut för hand.',
});
