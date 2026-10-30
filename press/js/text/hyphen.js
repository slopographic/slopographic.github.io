/* Slop Press — English hyphenation: Liang's pattern algorithm with a compact hand-made pattern set
   (suffixes, prefixes, double consonants, digraphs) plus a VC|CV syllable rule and an exception list.
   Constraints: words of 6+ letters, at least 2 letters before and 3 after a break, and every piece
   must contain a vowel. Explicit soft hyphens (U+00AD) are always honoured by the breaker instead. */
(function () {
  'use strict';
  var PR = window.PR;
  var H = PR.hyphen = { leftmin: 2, rightmin: 3, minWord: 6 };

  var PATTERNS = (
    // suffixes
    '1tion 1sion 1ment. 1ments. 1ness 1less 1ful. 1fully 1able. 1ably 1ible. 1ibly 1ality 1ity. 1ities 1ize 1izing 1ization ' +
    '1ise. 1ising 1isation 1ism. 1isms 1ist. 1ists 1ous. 1ously 1ive. 1ively 1ture 1tures 1ence. 1ences 1ance. 1ances 1ency 1ancy ' +
    '1ical 1ically 1ology 1ologist 1graph 1graphy 1phy. 1ship 1hood 1ward 1wards 1ling. 1ings. 1ing. 1ingly 1ed. 1er. 1ers. 1est. ' +
    '1ally 1ular 1ulate 1ation 1ations 1ator 1ators 1ory. 1ary. 1ery. 1ient 1ial. 1ian. 1ians 1ious 1eous 1uous 1ment 1able 1ible ' +
    // prefixes
    '.un1 .dis1 .mis1 .non1 .pre1 .over1 .under1 .inter1 .intra1 .trans1 .super1 .sub1 .anti1 .semi1 .multi1 .counter1 .out1 .ex1 ' +
    '.post1 .fore1 .mid1 .micro1 .macro1 .hyper1 .auto1 .poly1 .mono1 .tele1 .photo1 .bio1 .geo1 .neo1 .pseudo1 .typo1 .co1op .be1 ' +
    // double consonants split between
    'b1b c1c d1d f1f g1g l1l m1m n1n p1p r1r s1s t1t z1z ' +
    // keep digraphs and common clusters together
    'c2h s2h t2h p2h g2h w2h c2k q2u n2g. g2n. s2c2h t2c2h ' +
    // endings that should not break
    '2ed. 4ble. 4bles. 4cle. 4dle. 4fle. 4gle. 4kle. 4ple. 4tle. 4zle. 2es. 2ly. 2le.'
  ).trim().split(/\s+/);
  var EXCEPTIONS = {
    'table': 'ta-ble', 'present': 'pres-ent', 'project': 'proj-ect', 'record': 'rec-ord', 'every': 'ev-ery', 'people': 'peo-ple',
    'hyphenation': 'hy-phen-ation', 'typography': 'ty-pog-ra-phy', 'paragraph': 'para-graph', 'document': 'doc-u-ment', 'information': 'in-for-ma-tion',
    'important': 'im-por-tant', 'children': 'chil-dren', 'knowledge': 'knowl-edge', 'something': 'some-thing', 'together': 'to-geth-er',
    'between': 'be-tween', 'because': 'be-cause', 'business': 'busi-ness', 'different': 'dif-fer-ent', 'publishing': 'pub-lish-ing',
    'magazine': 'mag-a-zine', 'designer': 'de-sign-er', 'computer': 'com-put-er', 'beautiful': 'beau-ti-ful', 'language': 'lan-guage'
  };

  var tree = null;
  function build() {
    tree = {};
    PATTERNS.forEach(function (p) {
      var letters = p.replace(/\d/g, ''), vals = [], node = tree;
      var i = 0, k = 0;
      vals.length = letters.length + 1; for (var z = 0; z <= letters.length; z++) vals[z] = 0;
      for (i = 0; i < p.length; i++) { var c = p[i]; if (c >= '0' && c <= '9') vals[k] = +c; else k++; }
      for (i = 0; i < letters.length; i++) node = node[letters[i]] = node[letters[i]] || {};
      node._ = vals;
    });
  }
  var VOWEL = /[aeiouy]/;
  var ONSETS = { bl: 1, br: 1, ch: 1, cl: 1, cr: 1, dr: 1, fl: 1, fr: 1, gl: 1, gr: 1, pl: 1, pr: 1, sc: 1, sh: 1, sk: 1, sl: 1, sm: 1, sn: 1, sp: 1, st: 1, sw: 1, th: 1, tr: 1, tw: 1, wh: 1, wr: 1, ph: 1, qu: 1 };
  var NOSPLIT = { ck: 1, ng: 0, gh: 1, ch: 1, sh: 1, th: 1, ph: 1, wh: 1, qu: 1 };

  /** Break opportunities in a lower-case word: indexes i where a hyphen may go before word[i]. */
  H.points = function (word) {
    var w = word.toLowerCase();
    if (w.length < H.minWord || !/^[a-z]+$/.test(w)) return [];
    if (EXCEPTIONS[w]) { var out = [], pos = 0; EXCEPTIONS[w].split('-').slice(0, -1).forEach(function (part) { pos += part.length; out.push(pos); }); return out; }
    if (!tree) build();
    var s = '.' + w + '.', v = new Array(s.length + 1);
    for (var z = 0; z < v.length; z++) v[z] = 0;
    for (var i = 0; i < s.length; i++) {
      var node = tree;
      for (var j = i; j < s.length && node; j++) {
        node = node[s[j]];
        if (node && node._) { var pv = node._; for (var q = 0; q < pv.length; q++) if (pv[q] > v[i + q]) v[i + q] = pv[q]; }
      }
    }
    // VC|CV: split two consonants between vowels unless they form an onset or a digraph
    var near = function (k) { return v[k - 1] % 2 || v[k] % 2 || v[k + 1] % 2 || v[k] > 1; };
    for (var a = 1; a + 2 < w.length; a++) {
      if (VOWEL.test(w[a - 1]) && !VOWEL.test(w[a]) && !VOWEL.test(w[a + 1]) && VOWEL.test(w[a + 2])) {
        var pair = w[a] + w[a + 1];
        if (!ONSETS[pair] && !NOSPLIT[pair] && !near(a + 2)) v[a + 2] = 1;
        else if (ONSETS[pair] && !near(a + 1)) v[a + 1] = 1;
      }
      // V|CV: a single consonant between vowels usually starts the next syllable
      if (a + 1 < w.length && VOWEL.test(w[a - 1]) && !VOWEL.test(w[a]) && w[a] !== 'x' && VOWEL.test(w[a + 1]) && !near(a + 1)) v[a + 1] = 1;
    }
    var res = [];
    // v[k] sits before s[k]; s[k] is w[k-1] → a break before w[i] uses v[i + 1]
    for (var b = H.leftmin; b <= w.length - H.rightmin; b++) {
      if (v[b + 1] % 2 === 1 && VOWEL.test(w.slice(0, b)) && VOWEL.test(w.slice(b)) && !/^[^aeiouy]*e[sd]?$/.test(w.slice(b))) {
        var lastBreak = res.length ? res[res.length - 1] : 0;
        if (b - lastBreak >= 2 && VOWEL.test(w.slice(lastBreak, b))) res.push(b);
      }
    }
    return res;
  };
  /** Hyphenates for display/testing: "hy-phen-ation". */
  H.hyphenate = function (word) {
    var pts = H.points(word), out = '', last = 0;
    pts.forEach(function (p) { out += word.slice(last, p) + '-'; last = p; });
    return out + word.slice(last);
  };
  H.addException = function (word) { EXCEPTIONS[word.replace(/-/g, '').toLowerCase()] = word.toLowerCase(); };
})();
