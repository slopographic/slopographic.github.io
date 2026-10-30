/* The Authenticator's rules: which phrases read as machine-written, how much each weighs, and the score tiers.
 * Pure (no DOM): SlopDetect.analyze(text) -> { score 0-100, tier, tally {label: count}, spans [{start, end, label}], words }.
 * Also runs under Node: require('./detector/rules.js') returns the same object. */
(function (root) {
  'use strict';
  const S = (root.SlopDetect = root.SlopDetect || {});

  /** A 32-bit hash of a string (the certificate's serial number). */
  function hashString(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }

  const VOCAB = ['delve', 'delves', 'delving', 'tapestry', 'testament', 'realm', 'landscape', 'multifaceted', 'intricate', 'pivotal', 'robust', 'seamless', 'seamlessly', 'elevate', 'unlock', 'unleash', 'harness', 'harnessing', 'foster', 'fostering', 'embark', 'vibrant', 'bustling', 'cutting-edge', 'ever-evolving', 'synergy', 'synergies', 'leverage', 'paradigm', 'holistic', 'transformative', 'meticulous', 'meticulously', 'nuanced', 'showcase', 'showcasing', 'boasts', 'resonate', 'resonates', 'beacon', 'symphony', 'labyrinth', 'navigate', 'navigating', 'underscore', 'underscores', 'commendable', 'invaluable', 'unparalleled', 'game-changer', 'game-changing', 'empower', 'empowering', 'streamline', 'revolutionize', 'journey'];

  const RULES = [
    { label: 'Slop vocabulary', w: 3, re: new RegExp(`\\b(${VOCAB.join('|')})\\b`, 'gi') },
    { label: '“In today’s fast-paced world”', w: 10, re: /in today['’]s (fast[- ]paced|digital|ever[- ]evolving|modern)[^.,]*/gi },
    { label: '“It’s important to note”', w: 7, re: /it['’]?s (important|worth|crucial) (to note|noting|to remember)|it is (important|worth) (to note|noting)/gi },
    { label: '“In conclusion”', w: 5, re: /\bin (conclusion|summary)\b/gi },
    { label: 'Email opener', w: 9, re: /i hope (this|that) (email|message|note) finds you well/gi },
    { label: 'Chatbot tell', w: 10, re: /as an ai( language model)?|certainly!|great question!?|i hope this helps|let me know if you['’]d like/gi },
    { label: '“Let’s dive in”', w: 6, re: /let['’]s (dive|delve) in(to)?|dive (deep )?into/gi },
    { label: '“Not just X, it’s Y”', w: 8, re: /\b(is|are|was|it['’]s)\s+not\s+(just|only|merely)\b[^.!?\n]{1,60}?(it['’]s|they['’]re|but)\b/gi },
    { label: '“Whether you’re a…”', w: 5, re: /whether you['’]re an? [^,]{1,40}(,| or)/gi },
    { label: '“Unlock the power”', w: 7, re: /unlock(ing)? (the|your) (full )?(power|potential|secrets?)/gi },
    { label: '“Plays a pivotal role”', w: 6, re: /plays? an? (crucial|pivotal|vital|key|significant) role/gi },
    { label: '“Rich tapestry”', w: 8, re: /rich tapestry|a testament to|stands? as a (testament|beacon)/gi },
    { label: 'LinkedIn broetry', w: 6, re: /let that sink in|read that again|agree\?|thoughts\?|here['’]s the thing|that hit different|i['’]m (humbled|thrilled|excited|honou?red) to (announce|share)/gi },
    { label: 'Engagement bait', w: 8, re: /type ['‘’"]?amen|why don['’]t pictures like this ever trend|scroll past if|nobody (liked|wished)|repost (to|if)|smash that like/gi },
    { label: 'Em dash', w: 2, re: /—/g },
    { label: 'Slop emoji', w: 1.5, re: /🚀|✨|🔥|💡|🙌|💯|📈|🧠|👇|🎯|🙏|♻️|🌟/gu },
    { label: 'Hashtag', w: 1, re: /(^|\s)#[A-Za-z]\w+/g },
    { label: '【LISTING BRACKETS】', w: 5, re: /【[^】]*】/g },
  ];

  const TIERS = [
    { max: 12, name: 'Artisanal Human Prose', emoji: '🧑‍🌾', blurb: 'Hand-typed, small-batch, possibly with typos. Treasure it.' },
    { max: 30, name: 'Slightly Moist', emoji: '💧', blurb: 'A light glaze of slop. Could be a human who reads too much LinkedIn.' },
    { max: 55, name: 'Slop-Adjacent', emoji: '🥣', blurb: 'Something in here was microwaved. Proceed with a spoon.' },
    { max: 80, name: 'Certified Slop', emoji: '✅', blurb: 'This text has delved. Multiple tells detected.' },
    { max: 101, name: 'Industrial-Grade Slop', emoji: '🏭', blurb: 'Produced at scale in a content refinery. Do not ingest.' },
  ];

  function analyze(text) {
    const hits = [];
    const tally = {};
    let total = 0;
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(text))) {
        if (!m[0].length) { rule.re.lastIndex++; continue; }
        const lead = rule.label === 'Hashtag' ? m[1].length : 0;
        hits.push({ start: m.index + lead, end: m.index + m[0].length, label: rule.label });
        tally[rule.label] = (tally[rule.label] || 0) + 1;
        total += rule.w;
      }
    }
    // Broetry: lots of one-sentence paragraphs.
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const short = lines.filter((l) => l.length < 70).length;
    if (lines.length >= 6 && short / lines.length > 0.7) {
      tally['One-line paragraphs'] = 1;
      total += 8;
    }
    const words = (text.match(/\S+/g) || []).length;
    const score = words ? Math.round(100 * (1 - Math.exp((-total * 10) / (words + 40)))) : 0;
    const tier = TIERS.find((t) => score < t.max);

    // Merge overlapping highlight spans, keeping the first label.
    hits.sort((a, b) => a.start - b.start || b.end - a.end);
    const spans = [];
    for (const h of hits) {
      const last = spans[spans.length - 1];
      if (last && h.start < last.end) {
        if (h.end > last.end) last.end = h.end;
      } else spans.push({ ...h });
    }
    return { score, tier, tally, spans, words };
  }

  Object.assign(S, { analyze, TIERS, RULES, hashString });
  if (typeof module !== 'undefined' && module.exports) module.exports = S;
})(typeof window !== 'undefined' ? window : globalThis);
