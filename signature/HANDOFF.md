# signature: handoff

## SlopCmd and the assistant (`js/ai-commands.js`)
The page now loads `shared/commands/commands.js` (Ctrl+K) and `shared/hub.js` (Slop Drive). `app.js` starts SlopCmd and loads
the commands on demand. `signature.ai.*`, hidden, none destructive: `new_signature` (every form field and the style),
`set_fields`, `set_style` (template, accent, font, image_size, round), `add_links` (by network), `add_picture` (Slop Drive or a
same-origin picture, kept inside the signature like the device picture; a web address of another site is used as a link),
`export_signature` (HTML page or text, to Slop Drive and/or a download). Each change fills the form (`form.fill`) and redraws
(`app.render`); problems the model finds are in the result. This is an email signature maker: there is no drawn signature,
so there is no drawing command. Test: `tests/signature/ai-commands.test.html`.
