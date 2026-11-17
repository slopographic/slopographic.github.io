/* Slop Drive: the view modes (shared/viewmode). Regions: the top bar, the places and folders column (sidebar) and the
 * Details column (panels). The URL parameters are in url-state.js (shared/router). Classic script. */
(function () {
  'use strict';
  function init() {
    SlopViewMode.register('drive', {
      regions: { toolbar: '.topbar', sidebar: '#side', panels: '#info' },
      edges: { sidebar: 'left', panels: 'right' },
      mount: '.topbar',
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
