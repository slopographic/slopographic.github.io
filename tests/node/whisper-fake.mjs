// A tiny fake Whisper for the decoding tests: a 1517-token vocabulary with the same layout as the real one (text, then
// end-of-text and the specials, then 1501 timestamps), and runners that answer from a script instead of a network.
export const S = { eot: 10, sot: 11, transcribe: 13, noSpeech: 14, noTimestamps: 15, ts0: 16, sotPrev: 9, langs: [{ code: 'en', id: 12 }], multilingual: true };
export const V = S.ts0 + 1501;
export const ts = (seconds) => S.ts0 + Math.round(seconds / 0.02);
export const ctx = (over = {}) => ({ S, suppress: [], beginSuppress: [], maxInitialTs: 50, decodeText: (t) => t.map((x) => 'w' + x).join(' '), ...over });

/** A row of logits where `tok` stands out (value 10, the rest 0) and `extra` lists more [token, value] pairs. */
export function row(tok, extra = []) {
  const r = new Float32Array(V);
  if (tok != null) r[tok] = 10;
  for (const [t, v] of extra) r[t] = v;
  return r;
}

/** makeRunner for whisper-decode.js: script(seq, attempt, prompt) -> the row after seq (the tokens sampled so far).
 *  noSpeech: the logit of <|nospeech|> at the start position. Records every prompt it is given. */
export function scripted(script, { noSpeech = -10 } = {}) {
  const prompts = [];
  let attempt = 0;
  const make = () => {
    const a = attempt++;
    let seq = [], prompt = null;
    return {
      begin: async (p) => {
        prompt = p.slice(); prompts.push(prompt);
        const first = new Float32Array(V); first[S.noSpeech] = noSpeech;
        return { rows: () => first, last: script(seq, a, prompt) };
      },
      next: async (t) => { seq = seq.concat([t]); return script(seq, a, prompt); },
    };
  };
  make.prompts = prompts;
  make.attempts = () => attempt;
  return make;
}

/** A script that says the given tokens one after another, then end-of-text. */
export const says = (tokens) => (seq) => row(seq.length < tokens.length ? tokens[seq.length] : S.eot);
