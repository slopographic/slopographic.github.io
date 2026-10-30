/* Slop Drive — core/appfolders: the folder each app keeps its files in. SlopHub.appFolderId makes one root folder per
 * registered app, tagged folder.app = <app id>. The sidebar lists them like any folder and marks them here. A person can
 * rename or move one; the tag stays, so the app still finds its folder. */
'use strict';
(function (DR) {
  /** The registry entry of the app a folder belongs to, or null for an ordinary folder. */
  DR.appOfFolder = (f) => {
    if (!f || !f.isFolder || !f.app || !window.SlopHub) return null;
    return window.SlopHub.appById(f.app) || null;
  };
})(window.DR);
