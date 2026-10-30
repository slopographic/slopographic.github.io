/* Shared components, Traditional Chinese (Taiwan): the first-run downloads: what is fetched once for HEIC, camera RAW and 3D files, and what stays on the device. Rules: shared/i18n/APPS-HOWTO.md. */
window.SlopI18n && window.SlopI18n.add('zh-TW', {
  'ui.firstrun.privacy': '您的檔案會留在此瀏覽器中。不會上傳任何內容：本網站託管於 GitHub Pages，沒有伺服器，也沒有後端儲存空間。',
  'ui.firstrun.download_one': '此檔案只會下載一次（{size}），之後會由此瀏覽器保留，供下次使用。',
  'ui.firstrun.download_many': '這些檔案只會下載一次，共約 {size}，之後會由此瀏覽器保留，供下次使用。',
  'ui.firstrun.continue': '繼續',
  'ui.firstrun.heic_title': '要下載 HEIC 照片解碼器嗎？',
  'ui.firstrun.heic_text': '此瀏覽器本身無法開啟 HEIC 照片（iPhone 的格式），因此轉換這類照片需要 HEIC 解碼器（libheif，編譯後可在您的瀏覽器中執行；LGPL-3.0 授權）。它會從 {brand} 的檔案儲存區下載一次、經過檢查，並保留在此瀏覽器中。您的照片絕不會被上傳。',
  'ui.firstrun.heic_name': 'HEIC 照片解碼器（libheif {version}）',
  'ui.firstrun.raw_title': '要下載相機 RAW 引擎嗎？',
  'ui.firstrun.raw_text': '沖洗相機 RAW 照片需要 RAW 引擎（LibRaw，編譯後可在您的瀏覽器中執行；LGPL-2.1 或 CDDL-1.0 授權）。它會從 {brand} 的檔案儲存區下載一次、經過檢查，並保留在此瀏覽器中。',
  'ui.firstrun.raw_name': '相機 RAW 引擎（LibRaw {version}）',
  'ui.firstrun.d3_title': '要下載 3D 解碼器嗎？',
  'ui.firstrun.d3_text': '此模型經過壓縮。讀取它需要解碼器，該解碼器會從 {brand} 的 CDN 下載一次，並由此瀏覽器保留。模型本身仍會在此裝置上讀取，絕不會上傳。',
});
