/* Slop Code: data for guessing East Asian text encodings (a pure module, no DOM). A legacy byte stream often decodes
 * without error in several CJK encodings, so the guess in encoding.js asks two questions of each candidate: are the
 * decoded characters in that language's scripts, and are they the common characters of that language (a short list of
 * the most frequent kana, hanzi/kanji or Hangul syllables)? The right encoding makes a third or more of the characters
 * common; a wrong one produces rare characters almost by chance (a few in a hundred). */

const inRange = (cp, lo, hi) => cp >= lo && cp <= hi;

/** Ideographs: CJK unified, extension A, compatibility, the extensions that GB18030 and Big5-HKSCS reach, and Bopomofo. */
export const isHan = (cp) => inRange(cp, 0x4E00, 0x9FFF) || inRange(cp, 0x3400, 0x4DBF) || inRange(cp, 0xF900, 0xFAFF) ||
  inRange(cp, 0x20000, 0x2FA1F) || inRange(cp, 0x3100, 0x312F);
/** Hiragana and katakana (half-width katakana are left out on purpose: they are what EUC-JP looks like read as Shift_JIS). */
export const isKana = (cp) => inRange(cp, 0x3040, 0x30FF) || inRange(cp, 0x31F0, 0x31FF);
export const isHangul = (cp) => inRange(cp, 0xAC00, 0xD7A3) || inRange(cp, 0x1100, 0x11FF) || inRange(cp, 0x3130, 0x318F);
/** Symbols and punctuation that every East Asian table carries: Latin-1 signs, Greek and Cyrillic rows, quotes, arrows,
 * boxes, ideographic punctuation and full-width forms. */
export const isSymbol = (cp) => inRange(cp, 0xA0, 0xFF) || inRange(cp, 0x100, 0x1FF) || inRange(cp, 0x370, 0x4FF) ||
  inRange(cp, 0x2000, 0x2BFF) || inRange(cp, 0x3000, 0x303F) || inRange(cp, 0xFF00, 0xFF60) || inRange(cp, 0xFFE0, 0xFFEF);

const chars = (text) => new Set(Array.from(text));
// The 500 most common simplified hanzi, and the same characters in traditional form (the same order).
const SIMPLIFIED = chars(
  '的一是不了在人有我他这个们中来上大为和国地到以说时要就出会可也你对生能而子那得于着下自之年过发后作里用道行所然家种事成方多经么去法学如都同现当没动面起看定天分还进好小部其些主样理心她本前开但因只从想实日军者意无力它与长把' +
  '机十民第公此已工使情明性知全三又关点正业外将两高间由问很最重并物手应战向头文体政美相见被利什二等产或新己制身果加西斯月话合回特代内信表化老给世位次度门任常先海通教儿原东声提立及比员解水名真论处走义各入几口认条平系气题活尔' +
  '更别打女变四神总何电数安少报才结反受目太量再感建务做接必场件计管期市直德资命山金指克许统区保至队形社便空决治展马科司五基眼书非则听白却界达光放强即像难且权思王象完设式色路记南品住告类求据程北边死张该交规万取拉格望觉术领共' +
  '确传师观清今切院让识候带导争运笑飞风步改收根干造言联持组每济车亲极林服快办议往元英士证近失转夫令准布始怎呢存未远叫台单影具罗字爱击流备兵连调深商算质团集百需价花党华城石级整府离况亚请技际约示复病息究线似官火断精满支视消越' +
  '器容照须九增研写称企八功吗包片史委乎查轻易早曾除农找装广显吧阿李标谈吃图念六引历首医局突专费号尽另周较注语仅考落青随选列开'
);
// Traditional hanzi: the same 500 characters as SIMPLIFIED.
const TRADITIONAL = chars(
  '的一是不了在人有我他這個們中來上大為和國地到以說時要就出會可也你對生能而子那得於著下自之年過發後作裡用道行所然家種事成方多經麼去法學如都同現當沒動面起看定天分還進好小部其些主樣理心她本前開但因只從想實日軍者意無力它與長把' +
  '機十民第公此已工使情明性知全三又關點正業外將兩高間由問很最重並物手應戰向頭文體政美相見被利什二等產或新己制身果加西斯月話合回特代內信表化老給世位次度門任常先海通教兒原東聲提立及比員解水名真論處走義各入幾口認條平系氣題活爾' +
  '更別打女變四神總何電數安少報才結反受目太量再感建務做接必場件計管期市直德資命山金指克許統區保至隊形社便空決治展馬科司五基眼書非則聽白卻界達光放強即像難且權思王象完設式色路記南品住告類求據程北邊死張該交規萬取拉格望覺術領共' +
  '確傳師觀清今切院讓識候帶導爭運笑飛風步改收根干造言聯持組每濟車親極林服快辦議往元英士證近失轉夫令準布始怎呢存未遠叫台單影具羅字愛擊流備兵連調深商算質團集百需價花黨華城石級整府離況亞請技際約示復病息究線似官火斷精滿支視消越' +
  '器容照須九增研寫稱企八功嗎包片史委乎查輕易早曾除農找裝廣顯吧阿李標談吃圖念六引歷首醫局突專費號盡另周較注語僅考落青隨選列開'
);
// Common kanji (kana are counted separately).
const JAPANESE = chars(
  '日本人年大出中会国一事今時私思見行生間上下手入分何前後先長東京都気的者方同三二四五十百千万円目語学校社業用来持自田山川子女男名所新最作家場合話高書立開言通発対動教全実現理度情意関体変物北南西道県市区町村府島海空水火木金土' +
  '曜'
);
// Common Hangul syllables.
const KOREAN = chars(
  '이다는에의가을를로한하고서지리도은사기으시대있과나자어인해라일수그게정것제아보주니면오들전여무신상부공국학교생명동민계미경성세스트원문화연구회유소장재용진조현방비위분개물입습합었했됩요'
);

// Kana that every sentence has; the small ones (ぃ ゅ ッ) are rare enough to be what Big5 looks like read as EUC-JP.
const SMALL_KANA = chars('ぁぃぅぇぉっゃゅょゎゐゑァィゥェォッャュョヮヰヱヵヶ');
const japanese = { script: (cp) => isKana(cp) || isHan(cp) || isSymbol(cp), common: (ch, cp) => (isKana(cp) && !SMALL_KANA.has(ch)) || JAPANESE.has(ch) };
const chinese = (common) => ({ script: (cp) => isHan(cp) || isSymbol(cp), common: (ch) => common.has(ch) });

/** The multi-byte candidates, in the order that settles a tie. */
export const CJK_CANDIDATES = [
  { id: 'shift_jis', ...japanese },
  { id: 'euc-jp', ...japanese },
  { id: 'gbk', ...chinese(SIMPLIFIED) },
  { id: 'big5', ...chinese(TRADITIONAL) },
  { id: 'euc-kr', script: (cp) => isHangul(cp) || isSymbol(cp), common: (ch) => KOREAN.has(ch) },
];

const SCRIPT_SHARE_MIN = 0.9; // share of the non-ASCII characters that must be in the candidate's scripts

/** How a strict decode of `text` fits a candidate: inScript (the non-ASCII characters are mostly in its scripts), common
 * (how many are common characters of its language) and total (how many non-ASCII characters there are). */
export function rate(candidate, text) {
  let total = 0, script = 0, common = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp < 0x80) continue;
    total++;
    if (candidate.script(cp)) script++;
    if (candidate.common(ch, cp)) common++;
  }
  return { inScript: total > 0 && script >= total * SCRIPT_SHARE_MIN, common, total };
}
