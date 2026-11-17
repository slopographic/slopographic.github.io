/* Slop Contacts: the view modes (shared/viewmode). Regions: the top bar, the groups column (sidebar) and the contact
 * card (panels). The URL parameters are in url-place.js (shared/router). Classic script. */
(function () {
  'use strict';
  function init() {
    SlopViewMode.register('contacts', {
      regions: { toolbar: '.topbar', sidebar: '#colGroups', panels: '#card' },
      edges: { sidebar: 'left', panels: 'right' },
      mount: '.topbar',
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
