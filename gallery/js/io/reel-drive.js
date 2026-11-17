/* Slop Gallery: writes a reel into Slop Drive. begin() makes a folder "Reel <date>" and returns a session:
 *   addPhoto(photo, blob) -> driveId        one file record per photo (its original bytes, its name)
 *   addOverlay(photo, driveId, png) -> id   one "<name> (cutout).png" record per cut-out photo
 *   finish(manifest) -> id                  the manifest record, <folder>.reel.json, in the same folder
 *   abort()                                  removes everything the session wrote (cancel or failure)
 * Exposes window.SlopGallery.reelDrive. */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});
  const H = () => {
    if (!window.SlopHub) throw new Error('Slop Drive is not available');
    return window.SlopHub;
  };

  async function begin(name) {
    const hub = H();
    const folderId = await hub.createFolder(name, null);
    const made = [];
    const put = async (blob, fileName, meta) => {
      const id = await hub.put(blob, { name: fileName, from: 'gallery', folderId, meta });
      made.push(id);
      return id;
    };
    return {
      folderId,
      addPhoto: (photo, blob) => put(blob, photo.name, { reel: { photoId: photo.id } }),
      addOverlay: (photo, driveId, png) => put(png, G.reelCore.cutoutName(photo.name), { reel: { photoId: photo.id, cutoutOf: driveId } }),
      finish: (manifest) => put(new Blob([JSON.stringify(manifest, null, 2)], { type: G.reelCore.MANIFEST_TYPE }), name + '.reel.json', { reel: { manifest: true } }),
      /** Removes the records and the folder again. Safe to call twice. */
      async abort() {
        const hub2 = H();
        for (const id of made.splice(0)) await hub2.remove(id).catch(() => null);
        await hub2.removeFolder(folderId).catch(() => null);
      },
    };
  }

  G.reelDrive = { begin };
})();
