/* Slop AI Tools: the speech models (Whisper and its fine-tunes), the first family of the shared model chooser
 * (shared/models/: catalog.js ranks them, chooser.js is the dialog). Pure data (no DOM, no storage), so a Node test can
 * load it (module.exports); the browser gets window.SlopSpeechModels, and model-registry.js adds MODELS to the model index.
 * Classic script: load shared/models/catalog.js, then this file, then model-registry.js.
 * Every file is on the slopographic/cdn repository at the release tag in shared/cdn/assets.js (load it first; models/whisper/<id>/, with manifest.json, the licence
 * and SOURCE.md). A file over 95 MB is stored in parts (GitHub refuses files over 100 MB): the installer downloads them in
 * order, checks each part's SHA-256, joins them and checks the whole file's SHA-256 (aitools/download.js).
 * Exposes the catalog (shared/models/catalog.js create()): MODELS, QUICK, byId, fits, rank(language), recommended(language),
 * bytesOf(model), and CDN. */
(function (root, factory) {
  const catalog = root.SlopModelCatalog || (typeof module === 'object' && module.exports ? require('../shared/models/catalog.js') : null);
  const cdn = root.SlopCdn || (typeof module === 'object' && module.exports ? require('../shared/cdn/assets.js') : null);
  const api = factory(catalog, cdn);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopSpeechModels = api;
})(typeof window !== 'undefined' ? window : globalThis, function (catalog, cdn) {
  'use strict';
  /** The models' folder in the cdn repository; every URL comes from shared/cdn/assets.js (jsDelivr, then GitHub). */
  const CDN = 'models/whisper/';
  const B = (id, name) => cdn.url(CDN + id + '/' + name);
  const QUICK = 'whisper-tiny';
  const OPENAI = 'https://github.com/openai/whisper';

  /** The files of each model, from models/whisper/<id>/manifest.json on the cdn. */
  const FILES = {
  "whisper-tiny": [
    { name: "encoder_model_quantized.onnx", size: 10124910, sha256: "fd9d995b9dcb0520f0dbf6cf68651af639fc385f594d9d876e69ca2802dc438e", url: B("whisper-tiny", "encoder_model_quantized.onnx") },
    { name: "decoder_model_merged_quantized.onnx", size: 30727765, sha256: "6c0c125986b007d2e3734bec84c18bda0152071b90b87fadac6d7764499927a0", url: B("whisper-tiny", "decoder_model_merged_quantized.onnx") },
    { name: "vocab.json", size: 1036584, sha256: "50d6a919f0a0601d56a04eb583c780d18553aa388254ba3158eb6a00f13e2c1a", url: B("whisper-tiny", "vocab.json") },
    { name: "added_tokens.json", size: 2082, sha256: "ce949fe720c14311cb6c446e69cfe340dc669d7b006077a6feed6ae571dd7e88", url: B("whisper-tiny", "added_tokens.json") },
    { name: "config.json", size: 2243, sha256: "46aeea0a406afbeb563fc8e59ca10609203df4299af6a83f73752fef369efd2d", url: B("whisper-tiny", "config.json") },
    { name: "generation_config.json", size: 3772, sha256: "f5c67e5a4f7102f8cb4d058bc95da276bbc19eeec997267c3bb0f25ef68facd1", url: B("whisper-tiny", "generation_config.json") },
  ],
  "whisper-base": [
    { name: "encoder_model_quantized.onnx", size: 23201314, sha256: "5862993336bf33acd23736071aae2b32261d3b1b2f37780194460d4ef974dd46", url: B("whisper-base", "encoder_model_quantized.onnx") },
    { name: "decoder_model_merged_quantized.onnx", size: 53693315, sha256: "fa3ef9902734ce5ae6f9ef2bdb2ba9a6c4b5785b09f4f420ce036573dc9d090b", url: B("whisper-base", "decoder_model_merged_quantized.onnx") },
    { name: "vocab.json", size: 1036584, sha256: "50d6a919f0a0601d56a04eb583c780d18553aa388254ba3158eb6a00f13e2c1a", url: B("whisper-base", "vocab.json") },
    { name: "added_tokens.json", size: 34604, sha256: "9715fd2243b6f06a5858b5e32950d2853f73dd5bc201aafcf76f5082a2d8acd1", url: B("whisper-base", "added_tokens.json") },
    { name: "config.json", size: 2243, sha256: "f4d0608f7d918166da7edb3e188de5ef1bfe70d9802e785d271fd88111e9cf4b", url: B("whisper-base", "config.json") },
    { name: "generation_config.json", size: 3832, sha256: "61070cf8de25b1e9256e8e102ded49d8d24a8369ed36ef84fdf21549e68125a0", url: B("whisper-base", "generation_config.json") },
  ],
  "whisper-small": [
    { name: "encoder_model_quantized.onnx", size: 92326160, sha256: "a43a83f3c5361cd591cfa7c36f14b43cf7cb22f47a415cc14a8d557be800fa92", url: B("whisper-small", "encoder_model_quantized.onnx") },
    { name: "decoder_model_merged_quantized.onnx", size: 156750845, sha256: "ec07c3cbb64172c39791e26ee870a65ac22b458c36722bfe2776b3dbf741e0c9", parts: [{ size: 94371840, sha256: "043c9544be123ef5d08adc862d62257fcf65c2bfdd3ec98a3925407cfebf9be0", url: B("whisper-small", "decoder_model_merged_quantized.onnx.part1") }, { size: 62379005, sha256: "2d2665684e0c2b998d684851e4f40f5816fddddc626493cf0da429abeb2dd001", url: B("whisper-small", "decoder_model_merged_quantized.onnx.part2") }] },
    { name: "vocab.json", size: 1036584, sha256: "50d6a919f0a0601d56a04eb583c780d18553aa388254ba3158eb6a00f13e2c1a", url: B("whisper-small", "vocab.json") },
    { name: "added_tokens.json", size: 34604, sha256: "9715fd2243b6f06a5858b5e32950d2853f73dd5bc201aafcf76f5082a2d8acd1", url: B("whisper-small", "added_tokens.json") },
    { name: "config.json", size: 2227, sha256: "457854d452f17661e197d74aee12b8e74fb75ba30ebfaa7426d0d61ea1e08a18", url: B("whisper-small", "config.json") },
    { name: "generation_config.json", size: 3893, sha256: "f538b28220c6a6d6f1af1458d4141cacb4ef4963df3de98a19490440c412ddf0", url: B("whisper-small", "generation_config.json") },
  ],
  "whisper-base-en": [
    { name: "encoder_model_quantized.onnx", size: 23201320, sha256: "6e8001198c490bbae018c0044f630c2915efb826bad957006ce36152d0ab2a10", url: B("whisper-base-en", "encoder_model_quantized.onnx") },
    { name: "decoder_model_merged_quantized.onnx", size: 53692803, sha256: "dd4761a3f7add26afda3512abff4706920404c2517e85a9f2ff090b0c0987909", url: B("whisper-base-en", "decoder_model_merged_quantized.onnx") },
    { name: "vocab.json", size: 999186, sha256: "f6bd25a65e4e63ca31360e9fb11c7e4f9a391a78385d640acd814092dd6eee4f", url: B("whisper-base-en", "vocab.json") },
    { name: "added_tokens.json", size: 34604, sha256: "560be47bea388757f8d4cc185c5d82067426cbb6361e38016dd90ddc01ab203a", url: B("whisper-base-en", "added_tokens.json") },
    { name: "config.json", size: 2197, sha256: "c8a0de5ed8a083565a4319db29d0c210fda35b4d6076c2d711cae53ae00f3cb1", url: B("whisper-base-en", "config.json") },
    { name: "generation_config.json", size: 1556, sha256: "3479b1f44a07e41db799e22599222fee5816738036def94a39841cb9cdbb4120", url: B("whisper-base-en", "generation_config.json") },
  ],
  "whisper-small-en": [
    { name: "encoder_model_quantized.onnx", size: 92326170, sha256: "dae677b93ca77f911d858238e277026fa8f95a94cb899ea443ec78ee62726edf", url: B("whisper-small-en", "encoder_model_quantized.onnx") },
    { name: "decoder_model_merged_quantized.onnx", size: 156750076, sha256: "29132c41903c252d0f2b9e59ee1e7d75f7d0b64d37f3e36d1ecc4a1a1af62953", parts: [{ size: 94371840, sha256: "0cdfe002ec5ffa2a29987053a14457ad5da3502c52ebb71f0b6b57845aadb9aa", url: B("whisper-small-en", "decoder_model_merged_quantized.onnx.part1") }, { size: 62378236, sha256: "af03efa23323d7039216866f8a39314ebe2d3f874f71f2dd8ba9cf2c7ef2a445", url: B("whisper-small-en", "decoder_model_merged_quantized.onnx.part2") }] },
    { name: "vocab.json", size: 999186, sha256: "f6bd25a65e4e63ca31360e9fb11c7e4f9a391a78385d640acd814092dd6eee4f", url: B("whisper-small-en", "vocab.json") },
    { name: "added_tokens.json", size: 34604, sha256: "560be47bea388757f8d4cc185c5d82067426cbb6361e38016dd90ddc01ab203a", url: B("whisper-small-en", "added_tokens.json") },
    { name: "config.json", size: 2203, sha256: "8825c4174cb86f94d9fa67614942f8aa17bfbbdf2fae5426d4adfd0bc5893c43", url: B("whisper-small-en", "config.json") },
    { name: "generation_config.json", size: 1956, sha256: "5490747ca976d6b3765280a0697d66489020c2afa6e754244d9cd093e1639331", url: B("whisper-small-en", "generation_config.json") },
  ],
  "kb-whisper-base": [
    { name: "encoder_model_quantized.onnx", size: 23123019, sha256: "f533d80430991d585941328a55307af6a8420496056b6674c6a6470011f73d0f", url: B("kb-whisper-base", "encoder_model_quantized.onnx") },
    { name: "decoder_model_merged_quantized.onnx", size: 52726027, sha256: "2d42f2ed0bfe6d352f70d7d4bdbcecee11324ed7407a212aa2c1bdadfd54c27b", url: B("kb-whisper-base", "decoder_model_merged_quantized.onnx") },
    { name: "vocab.json", size: 835550, sha256: "8f680bba319e01a653d2e8a5dbc17a9157179e0576e6ce74ce0c06356c6e24f9", url: B("kb-whisper-base", "vocab.json") },
    { name: "added_tokens.json", size: 34604, sha256: "9715fd2243b6f06a5858b5e32950d2853f73dd5bc201aafcf76f5082a2d8acd1", url: B("kb-whisper-base", "added_tokens.json") },
    { name: "config.json", size: 3622, sha256: "a405d001093c14cfabce8eaf303321d7ab848c13f16ff52ab138ab9788220bf7", url: B("kb-whisper-base", "config.json") },
    { name: "generation_config.json", size: 3753, sha256: "92e8ce35806d0760959690be2ae4ec1d3b9db8a43f3b55d01035e8f720b394b8", url: B("kb-whisper-base", "generation_config.json") },
  ],
  "kb-whisper-small": [
    { name: "encoder_model_quantized.onnx", size: 92169288, sha256: "61b11cc46d251167fbeb6e423b9d4da8672f14e175afbd974204e534c61652a7", url: B("kb-whisper-small", "encoder_model_quantized.onnx") },
    { name: "decoder_model_merged_quantized.onnx", size: 155161985, sha256: "8eb56382bc0a26bbbdf098eb29bfbcb3d6962c90a2c198fe009389105e54512a", parts: [{ size: 94371840, sha256: "3da7d5753b1f5acc4bf4fdb897e91b7cb302d70a092ba3d0bc78f1c92fb593ec", url: B("kb-whisper-small", "decoder_model_merged_quantized.onnx.part1") }, { size: 60790145, sha256: "ff3e01760b98934750fdbb782decf374370d2255123d2ae9cc21e21ab89d0f78", url: B("kb-whisper-small", "decoder_model_merged_quantized.onnx.part2") }] },
    { name: "vocab.json", size: 835550, sha256: "8f680bba319e01a653d2e8a5dbc17a9157179e0576e6ce74ce0c06356c6e24f9", url: B("kb-whisper-small", "vocab.json") },
    { name: "added_tokens.json", size: 34604, sha256: "9715fd2243b6f06a5858b5e32950d2853f73dd5bc201aafcf76f5082a2d8acd1", url: B("kb-whisper-small", "added_tokens.json") },
    { name: "config.json", size: 3690, sha256: "140db3a6a718f234e0b6ddbd12841fde9180b97b8689840601d4f4acc8c1d4e1", url: B("kb-whisper-small", "config.json") },
    { name: "generation_config.json", size: 3911, sha256: "90d06484338974d48edd3c047c304e139e978d1b2b8fd6eef129f4261f52f12f", url: B("kb-whisper-small", "generation_config.json") },
  ],
  "nb-whisper-base": [
    { name: "encoder_model_quantized.onnx", size: 23123020, sha256: "51af9c68c86c298d04e526e3ccaf60b0fa7a82b51fbafacc3e7135dcb24668f2", url: B("nb-whisper-base", "encoder_model_quantized.onnx") },
    { name: "decoder_model_merged_quantized.onnx", size: 52728917, sha256: "7daae053cc57dd1641104ecc16a60483d70724d0d0fbdae379ae4fbe3f1f2872", url: B("nb-whisper-base", "decoder_model_merged_quantized.onnx") },
    { name: "vocab.json", size: 1036584, sha256: "50d6a919f0a0601d56a04eb583c780d18553aa388254ba3158eb6a00f13e2c1a", url: B("nb-whisper-base", "vocab.json") },
    { name: "added_tokens.json", size: 34604, sha256: "9715fd2243b6f06a5858b5e32950d2853f73dd5bc201aafcf76f5082a2d8acd1", url: B("nb-whisper-base", "added_tokens.json") },
    { name: "config.json", size: 3649, sha256: "3ddd12d3b38f755027775d20249bad6118595583c8ed86239c734e48411fdba4", url: B("nb-whisper-base", "config.json") },
    { name: "generation_config.json", size: 3884, sha256: "ed4ee46df1b3e4f9067f4f72aa7a159111c5b2ae2c9a401c9ea70d3ed5d4a26b", url: B("nb-whisper-base", "generation_config.json") },
  ],
  "nb-whisper-small": [
    { name: "encoder_model_quantized.onnx", size: 92169277, sha256: "dac2939218468483191aca951653033f2a3b9cc971b9135c22661f27e09bd8bb", url: B("nb-whisper-small", "encoder_model_quantized.onnx") },
    { name: "decoder_model_merged_quantized.onnx", size: 155166939, sha256: "9406f97712abbc43666663015c69fe1f0c3eefa98e559baa131ab174053ccab0", parts: [{ size: 94371840, sha256: "f6b03df2dfa26acd95ba6b0f205100b45323475da883edede9df22715bfa337d", url: B("nb-whisper-small", "decoder_model_merged_quantized.onnx.part1") }, { size: 60795099, sha256: "0f62a7332b2e3cbf3d9a95b8bad35402428a3b6eff1dd5da3fbd56befb5d1ee6", url: B("nb-whisper-small", "decoder_model_merged_quantized.onnx.part2") }] },
    { name: "vocab.json", size: 1036584, sha256: "50d6a919f0a0601d56a04eb583c780d18553aa388254ba3158eb6a00f13e2c1a", url: B("nb-whisper-small", "vocab.json") },
    { name: "added_tokens.json", size: 34604, sha256: "9715fd2243b6f06a5858b5e32950d2853f73dd5bc201aafcf76f5082a2d8acd1", url: B("nb-whisper-small", "added_tokens.json") },
    { name: "config.json", size: 3776, sha256: "d0c3fc2530205b3cca6b444352256d79c6c0baaa42ed1346b6efacc3eb4bb446", url: B("nb-whisper-small", "config.json") },
    { name: "generation_config.json", size: 3945, sha256: "6563a1f0ab64016162f3c20bc127b00106eeadfafceac7cd261a929ad36afe01", url: B("nb-whisper-small", "generation_config.json") },
  ],
  };

  // speed and accuracy: 1 (low) to 5 (high), for the bars in the Language and model dialog. languages: '*' (all 99) or codes.
  // The note is ui.models.speech.<id>_note (shared/i18n/ui/<code>/models2.js); maker 'kb' and 'nb' are the libraries' names
  // (ui.models.maker.kb / .nb), others are brand names shown as they are.
  const META = [
    { id: 'whisper-tiny', name: 'Whisper tiny', maker: 'OpenAI', languages: '*', speed: 5, accuracy: 1, params: '39M', licence: 'MIT', upstream: OPENAI, hf: 'Xenova/whisper-tiny' },
    { id: 'whisper-base', name: 'Whisper base', maker: 'OpenAI', languages: '*', speed: 4, accuracy: 2, params: '74M', licence: 'MIT', upstream: OPENAI, hf: 'onnx-community/whisper-base' },
    { id: 'whisper-small', name: 'Whisper small', maker: 'OpenAI', languages: '*', speed: 2, accuracy: 4, params: '244M', licence: 'MIT', upstream: OPENAI, hf: 'onnx-community/whisper-small' },
    { id: 'whisper-base-en', name: 'Whisper base.en', maker: 'OpenAI', languages: ['en'], only: true, speed: 4, accuracy: 3, params: '74M', licence: 'MIT', upstream: OPENAI, hf: 'onnx-community/whisper-base.en' },
    { id: 'whisper-small-en', name: 'Whisper small.en', maker: 'OpenAI', languages: ['en'], only: true, speed: 2, accuracy: 5, params: '244M', licence: 'MIT', upstream: OPENAI, hf: 'onnx-community/whisper-small.en' },
    { id: 'kb-whisper-base', name: 'KB-Whisper base', maker: 'kb', languages: ['sv'], speed: 4, accuracy: 4, params: '74M', licence: 'Apache-2.0', upstream: 'https://huggingface.co/KBLab/kb-whisper-base', hf: 'KBLab/kb-whisper-base' },
    { id: 'kb-whisper-small', name: 'KB-Whisper small', maker: 'kb', languages: ['sv'], speed: 2, accuracy: 5, params: '244M', licence: 'Apache-2.0', upstream: 'https://huggingface.co/KBLab/kb-whisper-small', hf: 'KBLab/kb-whisper-small' },
    { id: 'nb-whisper-base', name: 'NB-Whisper base', maker: 'nb', languages: ['no', 'nn'], speed: 4, accuracy: 4, params: '74M', licence: 'Apache-2.0', upstream: 'https://huggingface.co/NbAiLab/nb-whisper-base', hf: 'onnx-community/nb-whisper-base-ONNX' },
    { id: 'nb-whisper-small', name: 'NB-Whisper small', maker: 'nb', languages: ['no', 'nn'], speed: 2, accuracy: 5, params: '244M', licence: 'Apache-2.0', upstream: 'https://huggingface.co/NbAiLab/nb-whisper-small', hf: 'onnx-community/nb-whisper-small-ONNX' },
  ];

  const T = (k, v) => (globalThis.SlopI18n ? globalThis.SlopI18n.t(k, v) : k);
  const MAKERS = { kb: 1, nb: 1 };
  /** The entries for the model index (model-registry.js): the same shape as every other model there; the words people read
   *  are getters, read when shown. */
  const MODELS = META.map((m) => catalog.words({
    id: m.id, name: m.name, tool: 'speech', languages: m.languages, only: !!m.only, speed: m.speed, accuracy: m.accuracy,
    licence: m.licence, upstream: m.upstream, source: 'https://github.com/slopographic/cdn/tree/main/models/whisper/' + m.id,
    files: FILES[m.id],
  }, {
    maker: () => (MAKERS[m.maker] ? T('ui.models.maker.' + m.maker) : m.maker),
    note: () => T('ui.models.speech.' + m.id.replace(/-/g, '_') + '_note'),
    arch: () => T('ui.models.speech.arch_' + (m.languages === '*' ? 'multi' : m.languages.includes('en') ? 'en' : 'tuned'), { params: m.params }),
    sourceNote: () => T('ui.models.speech.source', { hf: m.hf }),
  }));
  // the ranking, badges and sizes are the shared model chooser's (shared/models/catalog.js), the same for every family
  const C = catalog.create({ family: 'speech', models: MODELS, quick: QUICK });
  return { ...C, CDN };
});
