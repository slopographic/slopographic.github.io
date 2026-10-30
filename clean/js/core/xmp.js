/* SlopClean core: a quick look inside an XMP packet (JPEG APP1, PNG iTXt, WebP XMP chunk). The packet is not
 * parsed as XML: each rule is a plain match for a property name, so the report can say "location is in the XMP
 * packet" before the packet is removed. Classic script; sets window.SlopClean.xmp. */
(function (root) {
  'use strict';
  const C = (root.SlopClean = root.SlopClean || {});
  const RULES = [
    [/exif:GPS(Latitude|Longitude)/, 'location', 'GPS position (in XMP)'],
    [/tiff:(Make|Model)|aux:Lens/, 'camera', 'Camera or lens (in XMP)'],
    [/exif:(BodySerialNumber|LensSerialNumber|ImageUniqueID)|aux:SerialNumber/, 'serial', 'Serial number (in XMP)'],
    [/xmp:(CreateDate|ModifyDate|MetadataDate)|exif:DateTime(Original|Digitized)/, 'date', 'Date (in XMP)'],
    [/xmp:CreatorTool|tiff:Software/, 'software', 'Software (in XMP)'],
    [/dc:creator/, 'author', 'Author (in XMP)'],
    [/dc:rights/, 'copyright', 'Copyright (in XMP)'],
    [/dc:(description|title)/, 'description', 'Description or title (in XMP)'],
  ];
  /** Findings for the properties a packet mentions. */
  function fields(str) {
    return RULES.filter(([re]) => re.test(str)).map(([, cat, label]) => ({ cat, label, value: 'present', where: 'XMP' }));
  }
  C.xmp = { fields };
})(typeof window !== 'undefined' ? window : globalThis);
