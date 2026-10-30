/* ファイル変換（日本語）: 複数ステップの変換経路、ページ範囲の確認メッセージ。キーは convert/i18n/en/chain.js と同じです。用語: shared/i18n/glossary-ja.md */
window.SlopI18n && window.SlopI18n.add('ja', {
  'convert.chain.cancelled': 'キャンセルされました',
  'convert.chain.no_file': 'ファイルは作成されませんでした。',
  'convert.chain.step_failed': 'ステップ {i} / {n}（{label}）が失敗しました：{message}',
  'convert.chain.via': '{to} · {steps} 経由',
  'convert.chain.step': 'ステップ {i} · {from} → {to}',
  'convert.chain.pdf_lib': 'PDF ライブラリを読み込めませんでした',
  'convert.chain.range_bad': '「{part}」はページ番号または範囲ではありません。1、3-5、7- のように入力してください。',
  'convert.chain.range_start': 'ページ番号は 1 から始まります。',
  'convert.chain.range_back': '「{part}」は逆順になっています。',
  'convert.chain.range_past': 'ページ {page} は終わりを超えています。このファイルは {n} ページです。',
  'convert.chain.range_none': 'ページが選択されていません。',
});
