/* Shared components, Japanese: the first-use notice (shared/firstrun/notice.js) and the notices of the shared engines that
 * download before they start (HEIC, camera RAW, 3D decoders). Terms: shared/i18n/glossary-ja.md. */
window.SlopI18n && window.SlopI18n.add('ja', {
  'ui.firstrun.privacy': 'ファイルはこのブラウザーに保存されたままです。何もアップロードされません。このサイトは GitHub Pages でホストされており、サーバーやバックエンドのストレージはありません。',
  'ui.firstrun.download_one': 'これは一度だけダウンロードされ（{size}）、次回以降のためにこのブラウザーに保存されます。',
  'ui.firstrun.download_many': 'これらは一度だけダウンロードされ（合計で約 {size}）、次回以降のためにこのブラウザーに保存されます。',
  'ui.firstrun.continue': '続ける',
  'ui.firstrun.heic_title': 'HEIC 写真のデコーダーをダウンロードしますか？',
  'ui.firstrun.heic_text': 'このブラウザーだけでは HEIC 写真（iPhone の形式）を開けないため、変換には HEIC デコーダー（libheif。ブラウザーで動作するようにコンパイルされたもので、LGPL-3.0 ライセンス）が必要です。{brand} のファイル ストアから一度だけダウンロードされ、検証されたうえで、このブラウザーに保存されます。写真がアップロードされることはありません。',
  'ui.firstrun.heic_name': 'HEIC 写真デコーダー（libheif {version}）',
  'ui.firstrun.raw_title': 'カメラ RAW エンジンをダウンロードしますか？',
  'ui.firstrun.raw_text': 'カメラの RAW 写真を現像するには、RAW エンジン（LibRaw。ブラウザーで動作するようにコンパイルされたもので、LGPL-2.1 または CDDL-1.0 ライセンス）が必要です。{brand} のファイル ストアから一度だけダウンロードされ、検証されたうえで、このブラウザーに保存されます。',
  'ui.firstrun.raw_name': 'カメラ RAW エンジン（LibRaw {version}）',
  'ui.firstrun.d3_title': '3D デコーダーをダウンロードしますか？',
  'ui.firstrun.d3_text': 'このモデルは圧縮されています。読み込むにはデコーダーが必要です。デコーダーは {brand} の CDN から一度だけダウンロードされ、このブラウザーに保存されます。モデル自体はこのデバイスで読み込まれ、アップロードされることはありません。',
});
