/* SlopPatterns kinds: the table of kinds (id, group, secret, label), the regular expression of each, and its checks.
 * Load after patterns.js. Each regex has no nested quantifiers; a lookbehind keeps it from starting inside a run of
 * its own characters (so a 200 000 character run is read once). Priority (pri) settles an overlap: private key 100,
 * specific tokens 90, AWS secret, bearer and password in URL 85, secret assignment 80, card 75, URL 60, email 50,
 * IP 40, the rest 30. Key-shaped samples are never written out in full here (the push scanners are strict). */
(function (root) {
  'use strict';
  const S = root.SlopPatterns || (typeof require === 'function' ? require('./patterns.js') : null);
  if (!S || !S.define) throw new Error('SlopPatterns: load shared/patterns/patterns.js before patterns-kinds.js');
  const R = String.raw;
  const L = S.lib;
  const OCT = R`(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)`;
  const DASHES = '-----';
  const key = (id, group, secret, label, pri, source, more) => S.define(Object.assign({ id, group, secret, label, pri, source }, more));
  const valid = (fn) => (s, strict) => (!strict || fn(s) ? s.length : 0);

  // ---- checks ----
  const PLACEHOLDER = /^(?:change[-_ ]?(?:me|it)|x{4,}|\*+|•+|\.{3,}|-{3,}|_{3,}|<.*>|\$\{.*\}|\$\w+|\{\{.*\}\}|%\(.*\)s|%\w+%|null|nil|none|undefined|true|false|your[-_ ].*|example.*|placeholder|redacted|dummy|sample|secret|password|passwd|token|string|todo|tbd|(?:insert|enter|put)[-_ ].*|process\.env.*|os\.environ.*|env\..*|getenv.*)$/i;
  /** A value that is not a real secret: changeme, xxxx, ****, <...>, ${...}, {{...}}, null, your_..., example, a repeated character. */
  const isPlaceholder = (v) => PLACEHOLDER.test(v) || /^(.)\1*$/.test(v);

  function luhn(d) {
    let sum = 0, dbl = false;
    for (let i = d.length - 1; i >= 0; i--) {
      let n = d.charCodeAt(i) - 48;
      if (dbl) { n *= 2; if (n > 9) n -= 9; }
      sum += n;
      dbl = !dbl;
    }
    return sum % 10 === 0;
  }

  const IBAN_COUNTRIES = 'AD AE AL AT AZ BA BE BG BH BR BY CH CR CY CZ DE DK DO EE EG ES FI FO FR GB GE GI GL GR GT HR HU IE IL IQ IS IT JO KW KZ LB LC LI LT LU LV LY MC MD ME MK MR MT MU NL NO PK PL PS PT QA RO RS SA SC SD SE SI SK SM ST SV TL TN TR UA VA VG XK'.split(' ');
  function ibanOk(c) {
    if (c.length < 15 || c.length > 34 || IBAN_COUNTRIES.indexOf(c.slice(0, 2)) < 0) return false;
    const r = c.slice(4) + c.slice(0, 4);
    let rem = 0;
    for (let i = 0; i < r.length; i++) {
      const code = r.charCodeAt(i);
      rem = code >= 65 ? (rem * 100 + code - 55) % 97 : (rem * 10 + code - 48) % 97;
    }
    return rem === 1;
  }
  function checkIban(s, strict) {
    if (!strict) return s.length;
    if (ibanOk(s.replace(/ /g, ''))) return s.length;
    const i = s.lastIndexOf(' '); // "GB.. 1234 5678 12": the last group may belong to the next word
    return i > 0 && ibanOk(s.slice(0, i).replace(/ /g, '')) ? i : 0;
  }

  /** Trims trailing punctuation off a URL (a closing bracket only when it has no opener in the URL) and checks a host follows. */
  function checkUrl(s, strict) {
    let po = 0, pc = 0, bo = 0, bc = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c === 40) po++; else if (c === 41) pc++; else if (c === 91) bo++; else if (c === 93) bc++;
    }
    let n = s.length;
    while (n > 0) {
      const c = s[n - 1];
      if (c === ')' && pc > po) pc--;
      else if (c === ']' && bc > bo) bc--;
      else if (',.;:!?*>\'"'.indexOf(c) < 0) break;
      n--;
    }
    const at = s.indexOf('://') + 3;
    if (n <= at) return 0;
    return !strict || /^file/i.test(s) || /^[\w[\u0080-￿]/.test(s.slice(at, n)) ? n : 0;
  }

  /** An IPv6 candidate is a run of hex digits, colons and dots: trim stray trailing punctuation, then validate. */
  function checkIp6(s, strict) {
    if (s.length > 100) return 0;
    let n = s.length;
    if (!strict) { while (n > 0 && s[n - 1] === '.') n--; return n; }
    for (let k = 0; k < 4 && n > 1; k++, n--) {
      const c = s.slice(0, n);
      if (L.expand6(c) && /[0-9a-f]/i.test(c)) return n;
      if (c[n - 1] !== '.' && c[n - 1] !== ':') return 0;
    }
    return 0;
  }

  // ---- network ----
  key('ipv4', 'network', false, 'IPv4 address', 40, R`(?<!\w)(?<!\w\.)(?:${OCT}\.){3}${OCT}(?!\w)(?!\.\w)`);
  key('ipv6', 'network', false, 'IPv6 address', 40, R`(?<![\w:.])(?=[0-9a-f]{0,4}:)[0-9a-f:.]{2,}(?!\w)`, { flags: 'i', check: checkIp6 });
  key('mac', 'network', false, 'MAC address', 30, R`(?<![0-9a-z])(?<![0-9a-f][:-])[0-9a-f]{2}([:-])(?:[0-9a-f]{2}\1){4}[0-9a-f]{2}(?![0-9a-z])(?![:-][0-9a-f])`, { flags: 'i' });

  // ---- people, URLs and identifiers ----
  key('email', 'identity', false, 'Email address', 50, R`(?<![\w.%+-])[\w%+-][\w.%+-]*@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}(?![\w-])`,
    { flags: 'i', check: valid((s) => !/\.(?:png|jpe?g|gif|webp|svg|ico|css|m?js|json|html?|php)$/i.test(s)) });
  key('url', 'network', false, 'URL', 60, R`\b(?:https?|ftp|wss?|file|ssh|git):\/\/[^\s<>"'\x60\\{}|^]+`, { flags: 'i', check: checkUrl });
  key('uuid', 'id', false, 'UUID', 30, R`(?<![0-9a-z])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![0-9a-z])`, { flags: 'i' });

  // ---- keys, tokens and secrets ----
  key('jwt', 'secret', true, 'JSON Web Token', 90, R`(?<![\w-])eyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]{4,}`);
  key('aws_access_key', 'secret', true, 'AWS access key ID', 90, R`(?<![A-Za-z0-9])(?:AKIA|ASIA)[A-Z0-9]{16}(?![A-Za-z0-9])`);
  // 40 base64 characters; scan() also needs "aws" then "secret" earlier on the same line, regex() offers that whole shape.
  const AWS_CTX = /aws[^\n]{0,60}?secret[^\n]{0,60}$/i;
  key('aws_secret', 'secret', true, 'AWS secret key', 85, R`(?<![A-Za-z0-9/+])[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+=])`, {
    flags: 'i',
    find: R`aws[^\n]{0,60}?secret[^\n]{0,60}?(?<![A-Za-z0-9/+])[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+=])`,
    check: (s, strict, m, text, start) => (!strict || AWS_CTX.test(text.slice(Math.max(0, start - 130), start)) ? s.length : 0),
  });
  key('github_token', 'secret', true, 'GitHub token', 90, R`(?<!\w)(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_\w{22,})`);
  key('slack_token', 'secret', true, 'Slack token', 90, R`(?<![\w-])xox[abprs]-[0-9A-Za-z-]{10,}`);
  key('stripe_key', 'secret', true, 'Stripe key', 90, R`(?<!\w)(?:[sr]k_live|pk_live|sk_test)_[A-Za-z0-9]{16,}`);
  key('google_api_key', 'secret', true, 'Google API key', 90, R`(?<![\w-])AIza[\w-]{35}(?![\w-])`);
  key('private_key', 'secret', true, 'Private key', 100,
    DASHES + 'BEGIN [A-Z ]{0,30}PRIVATE KEY' + DASHES + R`(?:(?!` + DASHES + R`END )[\s\S]){0,19880}(?:` + DASHES + 'END [A-Z ]{0,30}PRIVATE KEY' + DASHES + ')?');
  key('bearer', 'secret', true, 'Bearer token', 85, R`(authorization[ \t]*[:=][ \t]*["']?)?\bbearer[ \t]+([\w.~+/=-]{16,4096})`, {
    flags: 'i',
    g: [2],
    check: (s, strict, m) => {
      let n = s.length;
      while (n > 0 && s[n - 1] === '.') n--;
      const t = s.slice(0, n);
      return !strict || (n >= 16 && (m[1] || /\d/.test(t)) && !isPlaceholder(t)) ? n : 0;
    },
  });
  key('basic_auth_url', 'secret', true, 'Password in URL', 85, R`(?<![a-z0-9+.-])[a-z][a-z0-9+.-]{1,15}:\/\/([^\s:@\/?#"'<>\[\]]{1,64}:[^\s@\/?#"'<>]{1,128})@`,
    { flags: 'i', g: [1], check: valid((s) => !isPlaceholder(s.slice(s.indexOf(':') + 1))) });
  const KW = R`(?:secret|password|passwd|token|api[_-]?key|access[_-]?key|(?<![a-z])(?:pwd|key))`;
  const VALUE = R`(?:"([^"\n\\]{8,256})"|'([^'\n\\]{8,256})'|([^\s"'\x60,;&<>(){}\[\]]{8,256}))`;
  key('secret_assignment', 'secret', true, 'Secret assignment', 80,
    KW + R`(?:[_-]?(?:key|secret|token|id|value|hash)){0,2}["'\]]{0,2}[ \t]*(?::=|=>|[:=](?!=))[ \t]*` + VALUE, {
      flags: 'i',
      g: [1, 2, 3],
      // Not a secret: a placeholder; a bare value that reads as a name (get_password, a.b.c); after a plain "key", a value with no digit.
      check: (s, strict, m) => (!strict || !(isPlaceholder(s) || (m[3] !== undefined && /^[a-z][a-z_.]*$/.test(s) && /[_.]/.test(s)) ||
        (/^key/i.test(m[0]) && !(/\d/.test(s) && /[a-z]/i.test(s)))) ? s.length : 0),
    });

  // ---- hashes and financial ----
  key('hash', 'id', false, 'Hash (MD5, SHA-1, SHA-256)', 30, R`(?<![0-9a-z])(?=[0-9a-f]{32})(?:[0-9a-f]{128}|[0-9a-f]{64}|[0-9a-f]{40}|[0-9a-f]{32})(?![0-9a-z])`,
    { flags: 'i', check: valid((s) => /[a-f]/i.test(s)) });
  key('credit_card', 'identity', true, 'Credit card number', 75,
    R`(?<![\d-])(?:\d{13,19}|\d{4}(?:[ -]\d{4}){2,4}(?:[ -]\d{1,3})?|\d{4}[ -]\d{6}[ -]\d{4,5})(?!\d)`, {
    check: valid((s) => {
      const d = s.replace(/[ -]/g, '');
      return d.length >= 13 && d.length <= 19 && /^[2-6]/.test(d) && !/^(\d)\1+$/.test(d) && luhn(d);
    }),
  });
  key('iban', 'identity', false, 'IBAN', 30, R`(?<![A-Za-z0-9])[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?(?![A-Za-z0-9])`, { check: checkIban });

  Object.assign(S.lib, { isPlaceholder, luhn, ibanOk });
})(typeof window !== 'undefined' ? window : globalThis);
