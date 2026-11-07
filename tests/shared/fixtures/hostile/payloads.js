/* XSS payloads for the sanitiser tests (tests/shared/sanitize.test.html and the app tests that open hostile files), in the
 * style of the OWASP XSS filter evasion cheat sheet and the known DOMPurify bypasses. Each one, if it ran, would add one
 * to window.__xss (or parent.__xss). In a file of its own: inside an inline <script> these strings would end the script. */
(function () {
  'use strict';
  const X = '__xss=(window.__xss||0)+1';
  const PAYLOADS = [
    `<img src=x onerror="${X}">`, `<IMG SRC=x OnErRoR="${X}">`, `<img src=x onerror=${X}`, `<svg onload="${X}">`,
    `<svg><script>${X}</script></svg>`, `<script>${X}</script>`, `<scr<script>ipt>${X}</script>`, `<<script>script>${X}<</script>/script>`,
    `<body onload="${X}">`, `<details open ontoggle="${X}">`, `<input autofocus onfocus="${X}">`, `<video><source onerror="${X}"></video>`,
    `<iframe srcdoc="<script>parent.${X}</script>"></iframe>`, `<iframe src="javascript:parent.${X}"></iframe>`,
    `<object data="javascript:${X}"></object>`, `<embed src="javascript:${X}">`, `<meta http-equiv="refresh" content="0;url=javascript:${X}">`,
    `<a id="l1" href="javascript:${X}">a</a>`, `<a id="l2" href="JaVaScRiPt:${X}">a</a>`, `<a id="l3" href="java&#x09;script:${X}">a</a>`,
    `<a id="l4" href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;${X}">a</a>`, `<a id="l5" href=" &#14; javascript:${X}">a</a>`,
    `<a id="l6" href="java\nscript:${X}">a</a>`, `<a id="l7" href="\u0001javascript:${X}">a</a>`, `<a id="l8" href="vbscript:msgbox(1)">a</a>`,
    `<a id="l9" href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">a</a>`,
    `<form action="javascript:${X}"><button id="b1">go</button></form>`, `<button id="b2" formaction="javascript:${X}">go</button>`,
    `<img srcset="javascript:${X} 1x">`, `<div style="background:url(javascript:${X})">s</div>`, `<div style="width:expression(${X})">s</div>`,
    `<style>@import 'javascript:${X}';</style>`, `<math><mtext><table><mglyph><style><img src=x onerror="${X}">`,
    `<svg></p><style><a id="</style><img src=1 onerror=${X}>">`, `<form><math><mtext></form><form><mglyph><style></math><img src onerror=${X}>`,
    `<noscript><p title="</noscript><img src=x onerror=${X}>"></p></noscript>`, `<template><img src=x onerror="${X}"></template>`,
    `<svg><a id="s1"><animate attributeName="href" values="javascript:${X}"/><text y="20">x</text></a></svg>`,
    `<svg><set attributeName="onload" to="${X}"/></svg>`, `<svg><a id="s2" xlink:href="javascript:${X}"><text y="20">x</text></a></svg>`,
    `<svg><use href="data:image/svg+xml;base64,PHN2ZyBpZD0neCcgeG1sbnM9J2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJz48aW1hZ2UgaHJlZj0neCcgb25lcnJvcj0nX194c3M9MScvPjwvc3ZnPg==#x"/></svg>`,
    `<svg><foreignObject><img src=x onerror="${X}"></foreignObject></svg>`, `<math><maction actiontype="statusline" xlink:href="javascript:${X}">x</maction></math>`,
    `<div><p>unclosed <b>tags <i>everywhere`, `<a href="#" onclick="${X}" id="l10">click</a>`, `<base href="javascript:/">`,
    `<isindex action="javascript:${X}" type="image">`, `<xmp><img src=x onerror="${X}"></xmp>`, `<listing><img src=x onerror="${X}"></listing>`,
  ];
  window.XSS = { X, PAYLOADS };
})();
