/* SlopCut: 24px stroke icon set. SE.icon(name, cls) returns an <svg> element. */
(function () {
  'use strict';
  const SE = window.SE;
  const P = {
    open: '<path d="M3 7.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9.5a2 2 0 0 0-2-2h-7L10 5H5a2 2 0 0 0-2 2.5z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
    pause: '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/>',
    stepb: '<path d="M18 5v14L9 12zM6 5v14"/>',
    stepf: '<path d="M6 5v14l9-7zM18 5v14"/>',
    start: '<path d="M5 5v14M19 5v14l-10-7z"/>',
    end: '<path d="M19 5v14M5 5v14l10-7z"/>',
    loop: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
    film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 8h4M3 12h4M3 16h4M17 8h4M17 12h4M17 16h4"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
    cut: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
    select: '<path d="m5 3 13 7-6 1.5L9.5 18z"/>',
    multi: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="m8.5 12 2.5 2.5 5-5"/>',
    ripple: '<path d="M4 4v16M20 12H8M12 8l-4 4 4 4"/>',
    slip: '<path d="M7 12h10M10 9l-3 3 3 3M14 9l3 3-3 3M3 5v14M21 5v14"/>',
    magnet: '<path d="M6 3v8a6 6 0 0 0 12 0V3h-4v8a2 2 0 0 1-4 0V3z"/><path d="M6 7h4M14 7h4"/>',
    marker: '<path d="M6 3h12v12l-6 6-6-6z"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.9M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
    speaker: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
    mute: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="m16 9 5 6M21 9l-5 6"/>',
    zoomin: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M11 8v6M8 11h6"/>',
    zoomout: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11h6"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
    export: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    transition: '<rect x="3" y="6" width="10" height="12" rx="1.5"/><rect x="11" y="6" width="10" height="12" rx="1.5" opacity=".55"/>',
    safe: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><rect x="6" y="8" width="12" height="8" stroke-dasharray="2 2"/>',
    bin: '<path d="M3 7.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9.5a2 2 0 0 0-2-2h-7L10 5H5a2 2 0 0 0-2 2.5z"/><path d="M8 13h8"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
    lockbadge: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    drive: '<path d="M4 15h16l-2.5-9h-11z"/><path d="M4 15v4h16v-4M8 17h.01"/>',
    color: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
    split: '<path d="M12 3v18"/><path d="M8 8 4 12l4 4M16 8l4 4-4 4"/>'
  };
  SE.ICONS = P;
  SE.icon = function (name, cls) {
    const t = document.createElement('template');
    t.innerHTML = '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (P[name] || '') + '</svg>';
    return t.content.firstChild;
  };
})();
