# shared/patterns: find IP addresses, keys, tokens, emails, URLs and similar in text (window.SlopPatterns)

Pure JavaScript (no DOM, no network, no dependencies). Two classic scripts, each an IIFE on `window.SlopPatterns`, each at
most 300 lines. Load them in this order:

| File | What |
|---|---|
| `patterns.js` | the engine: `scan`, `count`, `regex`, `mask`, `byId`, `ipClass`, `define`, IP parsing |
| `patterns-kinds.js` | the table of kinds (`KINDS`) with each kind's regular expression, priority and checks |

`patterns.js` alone has the engine and an empty `KINDS`; `patterns-kinds.js` alone throws and says what to load first.
Under Node, `require('./shared/patterns/patterns.js')` loads both and returns the same object (it also sets
`globalThis.SlopPatterns`, as `detector/rules.js` does for its object). Loading both scripts again resets the table, it does
not repeat the kinds.

## API

```
SlopPatterns.KINDS            [{ id, group, secret, label }] in display order
   id      lower_snake_case and stable: the UI translates the label through the key 'ui.patterns.' + id
   group   'network' | 'identity' | 'secret' | 'id'
   secret  true for keys, tokens, passwords and card numbers (what a UI should hide by default)
   label   the English name

SlopPatterns.scan(text, { kinds?, limit?, validate? }) -> [{ kind, start, end, text }]
   sorted by start, never overlapping, text === the input's slice(start, end)
   kinds     array of ids (default all; unknown ids are ignored; [] finds nothing)
   limit     stop after this many hits (default 5000 = SlopPatterns.DEFAULT_LIMIT; 0 = none; Infinity = all)
   validate  false skips the checks (see below); default true
   Any input is accepted (null and undefined are ''; other values are turned into strings); it never throws.
SlopPatterns.count(text, opts)  -> { kindId: n } for the kinds found; the same options and the same default limit as scan
SlopPatterns.byId(id)           -> the KINDS entry or null
SlopPatterns.regex(id)          -> { source, flags } or null (see below)
SlopPatterns.mask(id, matchText) -> string
   a secret keeps its first 4 and last 2 characters around '…' when it has 12 or more characters, else '…'
   (private key: '----…--'); every other kind becomes '[' + id + ']' ('[ipv4]', '[email]', '[url]', '[iban]')
SlopPatterns.ipClass(ip)        -> 'private' | 'loopback' | 'link-local' | 'multicast' | 'reserved' | 'public' | null
   IPv4 or IPv6 (brackets, a zone id, ::ffff:a.b.c.d are understood); null when it is not an IP address
   private: 10/8, 172.16/12, 192.168/16, 100.64/10, fc00::/7, fec0::/10; reserved: 0/8, 240/4 (255.255.255.255),
   documentation and benchmark ranges, ::, 2001:db8::/32, 100::/64, the old ::a.b.c.d form
SlopPatterns.define(def)        registers a kind (used by patterns-kinds.js; def fields are listed above `define`)
```

## Kinds (display order; pri = who wins an overlap, higher wins)

| id | group | secret | pri | matches |
|---|---|---|---|---|
| `ipv4` | network | | 40 | four octets 0-255, no leading zeros, not inside a longer dotted number (1.2.3.4.5, 10.0.0.1.2), not after a letter (v1.2.3.4) |
| `ipv6` | network | | 40 | full, `::` compressed and IPv4-mapped forms, validated (8 groups, one `::`, no `::` alone) |
| `mac` | network | | 30 | six hex pairs with `:` or `-` (one kind of separator), not part of a longer hex run |
| `email` | identity | | 50 | local@domain.tld (tld 2-24 letters); file names like icon@2x.png are refused |
| `url` | network | | 60 | http, https, ftp, ws, wss, file, ssh, git; trailing `. , ; : ! ? * ' "` trimmed, a closing `)` or `]` kept only when the URL has its opener |
| `uuid` | id | | 30 | 8-4-4-4-12 hex, any case |
| `jwt` | secret | yes | 90 | three base64url parts, the header starts `eyJ` |
| `aws_access_key` | secret | yes | 90 | `AKIA` or `ASIA` + 16 upper-case alphanumerics |
| `aws_secret` | secret | yes | 85 | exactly 40 base64 characters, only when `aws` then `secret` come earlier on the same line (60 characters apart at most, any case) |
| `github_token` | secret | yes | 90 | `ghp_` `gho_` `ghu_` `ghs_` `ghr_` + 36 or more alphanumerics; `github_pat_` + 22 or more of `[A-Za-z0-9_]` |
| `slack_token` | secret | yes | 90 | `xox` + one of `abprs` + `-` + 10 or more of digits, letters and hyphens |
| `stripe_key` | secret | yes | 90 | `sk_live_` `rk_live_` `pk_live_` `sk_test_` + 16 or more alphanumerics |
| `google_api_key` | secret | yes | 90 | `AIza` + 35 of `[A-Za-z0-9_-]` |
| `private_key` | secret | yes | 100 | a PEM `BEGIN ... PRIVATE KEY` block through its `END ... PRIVATE KEY` line, or to the end of the text when it has none; at most 20000 characters in all |
| `bearer` | secret | yes | 85 | the token after `Bearer` (16 or more of `[A-Za-z0-9._~+/=-]`); reports the token only. With no `Authorization:` before it, the token must hold a digit |
| `basic_auth_url` | secret | yes | 85 | `user:password` in `scheme://user:password@host`; reports the credentials only (any scheme: postgres, mongodb, ftp ...) |
| `secret_assignment` | secret | yes | 80 | a value of 8 or more characters after `key`, `secret`, `password`, `passwd`, `pwd`, `token`, `api_key`, `apikey`, `access_key`, `client_secret` (also inside longer names such as `DB_PASSWORD`, `clientSecret`) and `=`, `:`, `:=` or `=>`; quoted (may hold spaces) or bare; reports the value only |
| `hash` | id | | 30 | a hex run of exactly 32, 40, 64 or 128 characters not inside a longer alphanumeric run, with at least one letter a-f |
| `credit_card` | identity | yes | 75 | 13-19 digits, ungrouped or grouped 4-4-4-4(-3) / 4-6-5 with spaces or hyphens, first digit 2-6, Luhn-valid, not one repeated digit |
| `iban` | identity | | 30 | country code of the IBAN registry + 2 digits + alphanumerics, 15-34 characters, ungrouped or in groups of 4 with spaces, mod-97 valid |

No phone numbers (too noisy).

### Overlaps

Hits that overlap are settled by priority (`pri`: secrets and keys, then card, URL, email, IP, then the rest), then by length
(the longer wins), then by table order. The loser is dropped whole, not cut. So a key inside a URL is reported and the URL is
not; an email, IP, UUID or hash inside a URL is not reported (the URL is); the password of `scheme://user:pw@host` is reported
and the URL around it is not; a JWT after `Bearer` is a `jwt`, not a `bearer`; a GitHub token after `token =` is a
`github_token`, not a `secret_assignment`. `scan` with `kinds: ['email']` does not see the URL, so it still finds the email
inside it.

### What `validate: false` skips

The per-kind checks, nothing else: IPv6 structure, Luhn, mod 97, the file-name list of `email`, the placeholder test of
`secret_assignment`, `bearer` and `basic_auth_url`, the context test of `aws_secret`, the digits-only test of `hash`, the host
test of `url`. Trailing punctuation of URLs is still trimmed. Expect many more false positives.

### secret_assignment is not placeholders

A value is skipped when it is a placeholder: changeme, a repeated character (xxxx, ****), `<...>`, `${...}`, `{{...}}`,
`null` `none` `undefined` `true` `false`, `your_...`, `example...`, `password`, `secret`, `token`, `process.env...`,
`os.environ...`; when it is bare and reads as a code name (`get_password_from_env`); or, after a plain `key`, when it has no
digit (`key = "background-color"`).

## regex(id)

`{ source, flags }`: `new RegExp(source, 'g' + flags)` finds the kind in a search box. `flags` never holds `g` or `d`. The
source needs lookbehind (Safari 16.4, the site's target). It is a superset of what `scan` accepts after validation, in this
sense: every `scan` hit lies inside a match of the regex. Differences to know:

- it does not run the checks: `ipv6` matches any run of hex digits, colons and dots (`12:30`), `credit_card` and `iban` match
  without Luhn or mod 97, `url` keeps trailing punctuation, `hash` matches all-digit runs;
- for `bearer`, `basic_auth_url` and `secret_assignment`, a match includes the key part (`Bearer `, `scheme://`, `password = `)
  and the value is a capture group; `scan` reports only the value;
- `aws_secret`: the search form needs `aws` and `secret` before the 40 characters (the scan form checks the same context
  in code, so the search form is the better one for a search box);
- there is no overlap handling: a URL and the email inside it are both found.

## Speed and limits

- Every regex has no nested quantifiers and no unbounded lazy part, and starts behind a lookbehind (`(?<!\w)` and the like), so
  a long run of look-alike characters is read once. Tested: 200 000 `a`, digits, digits and dots, `-`, `:`, `@`, repeated
  prefixes (`eyJ-`, `ghp_`, `password=`, `Bearer `), 1 000 000 characters in one URL, each under 1500 ms; a 5 MB mixed text
  with every kind and no limit under 3 s (about 1 s here).
- The kinds are read as streams and merged by start, so `limit` stops the work early (rare kinds still cost one pass
  each: about 0.6 s for 5 MB of text with nothing in it).
- Bounds: a private key 20000 characters; `secret_assignment` values 256; `bearer` tokens 4096; `basic_auth_url` user 64 and
  password 128; an IPv6 candidate 100; a chain of overlapping hits is resolved 256 at a time (longer chains are cut, never slow).
- Text only (UTF-16 strings, offsets are string indexes). Emails and domains are ASCII. A rejected candidate is looked at again
  one character after its start, so a valid card number right after a failed one is still found.
- Keys and values that span lines are not found, except a private key.

## Using it

```
const hits = SlopPatterns.scan(text);                       // [{ kind, start, end, text }]
for (const h of hits) label = t('ui.patterns.' + h.kind);   // the UI's own translator
redacted = text.slice(0, h.start) + SlopPatterns.mask(h.kind, h.text) + text.slice(h.end);   // from the last hit backwards
SlopPatterns.byId(h.kind).secret                            // hide by default
SlopPatterns.ipClass(h.text)                                // for ipv4 and ipv6 hits: 'private', 'public' ...
```

Offsets are for the string given; replace from the last hit to the first so the earlier offsets stay valid.

## Tests

`tests/node/patterns.test.mjs` (the kinds: positives and negatives for each, checks), `patterns-engine.test.mjs` (overlaps,
options, masks, `regex` against `scan`, `ipClass`), `patterns-perf.test.mjs` (adversarial strings, 5 MB, loading as classic
scripts and under Node), `patterns-fixture.mjs` (shared fixtures). Every key-shaped fixture is built at run time from pieces
(`['gh', 'p_'].join('') + ...`): GitHub push protection rejects a push that holds a realistic token, so never write one out
whole in a test or a doc.
