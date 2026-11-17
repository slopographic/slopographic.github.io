/* Shared components, Simplified Chinese: the first-use notice (shared/firstrun/notice.js) and the notices of the shared engines that download before they start (HEIC, camera RAW, 3D decoders). Same keys as ui/en/firstrun.js. Terms: shared/i18n/glossary-zh-CN.md. */
window.SlopI18n && window.SlopI18n.add('zh-CN', {
  'ui.firstrun.privacy': '你的文件保留在此浏览器中，不会上传任何内容。本站托管在 GitHub Pages 上，没有服务器，也没有后端存储。',
  'ui.firstrun.download_one': '仅下载一次，大小 {size}，之后由此浏览器保存，供下次使用。',
  'ui.firstrun.download_many': '仅下载一次，合计约 {size}，之后由此浏览器保存，供下次使用。',
  'ui.firstrun.continue': '继续',
  'ui.firstrun.heic_title': '下载 HEIC 照片解码器？',
  'ui.firstrun.heic_text': '此浏览器本身无法打开 HEIC 照片（iPhone 格式），因此转换这类照片需要 HEIC 解码器（libheif，已编译为可在浏览器中运行；LGPL-3.0 许可）。它会从 {brand} 的文件服务器下载一次，经校验后保存在此浏览器中。你的照片永远不会上传。',
  'ui.firstrun.heic_name': 'HEIC 照片解码器（libheif {version}）',
  'ui.firstrun.raw_title': '下载相机 RAW 引擎？',
  'ui.firstrun.raw_text': '冲洗相机 RAW 照片需要 RAW 引擎（LibRaw，已编译为可在浏览器中运行；LGPL-2.1 或 CDDL-1.0 许可）。它会从 {brand} 的文件服务器下载一次，经校验后保存在此浏览器中。',
  'ui.firstrun.raw_name': '相机 RAW 引擎（LibRaw {version}）',
  'ui.firstrun.d3_title': '下载 3D 解码器？',
  'ui.firstrun.d3_text': '此模型已压缩。读取它需要解码器，解码器会从 {brand} 的 CDN 下载一次，并由此浏览器保存。模型本身仍在此设备上读取，永远不会上传。',
});
