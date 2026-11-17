# Glossary: Swedish (sv)

Register: informal «du», as the Swedish versions of Microsoft Office, Adobe Acrobat and Google Workspace do, and as shared/i18n/sv.js already does. Buttons and menu commands are imperatives («Spara», «Öppna», «Ta bort», «Rotera åt höger»); menu titles follow Office («Arkiv», «Redigera», «Visa», «Infoga», «Verktyg», «Hjälp»). Sentence case everywhere («Spara som», not «Spara Som»). Running text says «du/din/dina». Status messages and toasts use the past tense without a subject («Roterade 3 sidor», «Sparade rapport.pdf»), progress uses «…» («Läser in…», «Sparar…»). Quotes are ”svenska” (same sign both ends), as in sv.js. Plurals: Swedish has one/other, so keep every '#one' form. Numbers: thin space for grouping and comma decimals come from Intl; write «%» with a space before it in prose («60 %»), but keep the English «{pct}%» in compact labels. Possessive of a format: «PDF:er», «PDF:en», «PNG-bilder».

**Undo labels.** The generic word is `ui.undo_what` = «Ångra: {what}» and `ui.redo_what` = «Gör om: {what}»; the status toasts are `pdf.app.undid` = «Ångrade: {what}» and `pdf.app.redid` = «Gjorde om: {what}». So every undo step label (`pdf.cmd.undo_*`, `pdf.act.undo_*`, `pdf.*.undo_*`) is written as the command itself, imperative, sentence case, like a menu item: «Rotera sida», «Ta bort 3 sidor», «Lägg till text», «Ersätt ”{text}”». After the colon it reads as «Ångra: Rotera sida». Do not use noun phrases («rotering av sida»).

| English | Svenska | Note |
| --- | --- | --- |
| app | app |  |
| apps | appar | as in sv.js (nav.apps) |
| file | fil |  |
| files | filer |  |
| folder | mapp |  |
| document | dokument |  |
| page | sida |  |
| pages | sidor |  |
| open | Öppna |  |
| save | Spara |  |
| save as | Spara som |  |
| download | Ladda ned | «Ladda ned PDF» |
| upload | Ladda upp | the site uploads nothing: «Inget laddas upp» |
| export | Exportera |  |
| import | Importera |  |
| print | Skriv ut |  |
| close | Stäng |  |
| cancel | Avbryt |  |
| OK | OK |  |
| delete | Ta bort | Office uses «Ta bort», not «Radera» |
| remove | Ta bort | same word as delete; «Rensa» for clearing a list |
| rename | Byt namn |  |
| duplicate | Duplicera |  |
| copy | Kopiera |  |
| paste | Klistra in |  |
| cut | Klipp ut |  |
| undo | Ångra | see the undo paragraph above |
| redo | Gör om |  |
| select all | Markera alla | «Markera allt» for text |
| search | Sök |  |
| find | Sök | «Sök i dokumentet»; «Sök och ersätt» |
| replace | Ersätt |  |
| settings | Inställningar |  |
| theme | Tema | as in sv.js (settings.theme) |
| language | Språk |  |
| help | Hjälp |  |
| about | Om | «Om Slop PDF» |
| view | Visa | menu title; «vy» for a view mode («Sidvy») |
| edit | Redigera |  |
| insert | Infoga |  |
| format | Format |  |
| tools | Verktyg |  |
| menu | meny |  |
| toolbar | verktygsfält |  |
| panel | panel |  |
| sidebar | sidofält |  |
| tab | flik | as in sv.js (switcher.open_tabs) |
| dialog | dialogruta |  |
| shortcut | kortkommando |  |
| keyboard shortcuts | Kortkommandon |  |
| command | kommando |  |
| zoom in | Zooma in |  |
| zoom out | Zooma ut |  |
| fit page | Anpassa sida | «Anpassa bredd» for fit width |
| rotate | Rotera |  |
| rotate left | Rotera åt vänster |  |
| rotate right | Rotera åt höger |  |
| merge | Sammanfoga |  |
| split | Dela upp | «delad vy» for split view |
| extract | Extrahera |  |
| compress | Komprimera |  |
| convert | Konvertera | as in sv.js (shell.convert) |
| sign | Signera |  |
| signature | Underskrift | a handwritten/drawn one; «digital signatur» for a certificate |
| stamp | Stämpel |  |
| watermark | Vattenstämpel |  |
| layer | lager | PDF optional content groups (OCG) are «lager» too |
| layers | Lager |  |
| comment | Kommentar |  |
| annotation | anteckning | Acrobat sv: «anteckning»; the tools are «Anteckningsverktyg» |
| highlight | Markera | the tool; the mark itself is «markering» |
| redact | Maskera | Acrobat sv; noun «maskering», «Tillämpa maskeringar». Never «Svärta» |
| redacted | Maskerad |  |
| form | formulär |  |
| field | fält |  |
| password | lösenord |  |
| protect | Skydda | «Skydda med lösenord» |
| image | bild |  |
| text | text |  |
| font | teckensnitt | as Office; «typsnitt» only for the site's typeface (footer.typeface) |
| color | färg |  |
| page number | sidnummer |  |
| thumbnail | miniatyr |  |
| preview | förhandsgranskning | «Förhandsgranska» as a command |
| drag and drop | dra och släpp |  |
| drop files here | Släpp filer här |  |
| untitled | Namnlös |  |
| recent | Senaste | as in sv.js (switcher.recent) |
| sample | exempel | «Prova ett exempel», «exempel-PDF» |
| tour | rundtur | «Guidad rundtur» |
| next | Nästa |  |
| back | Tillbaka |  |
| skip | Hoppa över |  |
| finish | Slutför |  |
| done | Klar |  |
| apply | Tillämpa |  |
| reset | Återställ |  |
| loading… | Läser in… |  |
| working… | Arbetar… |  |
| offline | offline |  |
| nothing is uploaded | Inget laddas upp |  |
| your files stay on this device | Dina filer stannar på den här enheten |  |
| beta | beta |  |
| flatten (form, annotations) | Platta till | «Platta till formulär»; noun «tillplattning» |
| callout | pratbubbla | a text box with a pointer, as Office shapes |
| step marker | stegmarkör | numbered marker |
| sticky note | fästis | as Acrobat sv («Lägg till fästis») |
| shape | form |  |
| line | linje |  |
| arrow | pil |  |
| rectangle | rektangel |  |
| ellipse | ellips |  |
| freehand / ink | frihand / bläck | «Rita» for the tool |
| strikeout | genomstrykning | «Stryk över» as a command |
| underline | understrykning | «Stryk under» as a command |
| object (page object) | objekt |  |
| nudge | flytta en bit |  |
| organize (pages) | Ordna | as in sv-apps.js |
| organizer (all pages view) | sidöversikt |  |
| page view | sidvy |  |
| metadata | metadata | «Dokumentegenskaper» in dialog titles |
| embedded | inbäddad |  |
| subset (font) | delmängd |  |
| OCR / recognise text | OCR / Känn igen text |  |
| rasterise | rastrera |  |
| blank page | tom sida |  |
| range (pages) | intervall |  |
| macro / workflow | makro / arbetsflöde |  |
| autosave | Spara automatiskt | noun «autosparning» |
| session | session |  |
| version | version | «Versioner» |
| revert | Återgå | «Återgå till originalet» |
| pane | ruta |  |
| zip | zip | «en .zip-fil» |
| Slop Drive | Slop Drive | brand: «till Slop Drive», «i Slop Drive», «från Slop Drive» |

## PDF editor (part B)

| English | Svenska | Note |
| --- | --- | --- |
| highlighter (tool) | Överstrykningspenna | the mark it leaves: «överstrykning» |
| whiteout | vit överstrykning | covers content, does not remove it (unlike «Maskera») |
| highlight box | markeringsruta |  |
| text highlight | textmarkering |  |
| redaction mark | maskeringsmarkering |  |
| bold / italic short labels | F / K | as Swedish Office |
| bring to front / send to back | Placera längst fram / Placera längst bak | «Flytta framåt» / «Flytta bakåt» one step |
| turn (object) | Vrid | «Rotera» stays for pages |
| resolve / reopen (comment) | Markera som löst / Öppna igen | state: «löst», «Lösta» |
| paragraph | stycke | «Styckeram» for the frame |
| lossless / lossy | förlustfri / med förlust |  |
| header / footer | sidhuvud / sidfot |  |
| anchor | fästpunkt |  |
| match case | Matcha gemener/versaler |  |
| regular expression | reguljärt uttryck | «Regex» as a short mode label |
| replay (saved edits) | Spela upp | «Ignorera» for discard |
| object kinds in sentences | indefinite, lower case | «Ta bort bild», «Markerad: bild» (colon avoids adjective agreement) |
| page positions | överst/nederst till vänster, i mitten, till höger | lower case in sentences |

## PhotoSlop

Tool names are compounds, as in Swedish Photoshop («Penselverktyg», «Trollstavsverktyg»); the short form («Pensel») is the
history step and palette word, so never strip a suffix to get it. Layer names the app gives new layers stay English
(they are the person's document content).

| English | Svenska | Note |
| --- | --- | --- |
| layer mask | lagermask |  |
| clipping mask | urklippsmask | «Skapa urklippsmask» |
| brush | pensel | tool «Penselverktyg»; preset «förinställd pensel» |
| brush tip | spets |  |
| pencil | penna |  |
| eraser | suddgummi |  |
| blend mode | blandningsläge | Normal, Mörkna, Multiplicera, Färgbränning, Ljusna, Raster, Färgskugga, Linjär skugga (addera), Täcka över, Mjukt ljus, Hårt ljus, Differens, Uteslutning, Nyans, Mättnad, Färg, Luminiscens |
| opacity / fill | opacitet / fyllning |  |
| marquee | markeringsram | «Rektangulär markeringsram» |
| magic wand | trollstav |  |
| eyedropper | pipett |  |
| clone stamp | klonstämpel |  |
| healing brush / spot healing brush | läkningspensel / punktläkningspensel |  |
| gradient | övertoning | «Övertoningsverktyg» |
| paint bucket | färgpyts |  |
| dodge / burn | Ljusa / Bränn |  |
| smudge | Smeta ut |  |
| sponge | svamp |  |
| canvas | arbetsyta | «Arbetsytans storlek» |
| image size | Bildstorlek |  |
| resample | omsampling | Närmaste granne, Bilinjär, Bikubisk |
| flatten image | Gör till ett lager |  |
| merge down | Sammanfoga nedåt |  |
| feather | mjuk kant |  |
| tolerance / fuzziness | tolerans |  |
| contiguous | Angränsande |  |
| sample all layers | Sampla alla lager |  |
| expand / contract (selection) | Utöka / Dra ihop |  |
| select inverse | Omvänd markering |  |
| select subject | Markera motiv | «Isolera motiv» for SlopIsolate |
| colour range | Färgområde |  |
| free transform | Fri omformning | «Omforma»; «Verkställ» to commit |
| flip horizontal / vertical | Vänd horisontellt / vertikalt |  |
| clockwise / counter clockwise | medurs / moturs |  |
| guides / grid / rulers / snap | stödlinjer / stödraster / linjaler / Fäst mot |  |
| swatches | färgrutor |  |
| character (panel) | Tecken |  |
| tracking / leading | spärrning / radavstånd |  |
| anti-aliasing | kantutjämning |  |
| warp text | Förvräng text | Båge, Valv, Utbuktning, Flagga, Våg, Stigande |
| rasterize type | Rastrera text |  |
| layer style | lagerstil | «Blandningsalternativ» |
| drop / inner shadow | Skugga / Inre skugga |  |
| outer / inner glow | Yttre / Inre glöd |  |
| stroke (style) | Linje |  |
| colour / gradient overlay | Färgöverlägg / Övertoningsöverlägg |  |
| bevel & emboss | Avfasning och relief |  |
| adjustments | Justeringar | Nivåer, Kurvor, Nyans/mättnad, Ljusstyrka/kontrast, Färgbalans, Svartvitt, Fotofilter, Tröskel, Posterisera, Övertoningsmappning |
| vibrance | Lyster |  |
| highlights / midtones | högdagrar / mellantoner |  |
| blur / sharpen / noise | oskärpa / Skärpa / brus | «Gaussisk oskärpa», «Oskarp mask» |
| preset | förinställning |  |
| auto retouch | Autoretusch | «Autoförbättra», «Porträttretusch», «Räta upp» (straighten) |
| red eye | röda ögon |  |
| develop (RAW) | framkalla | «Som tagen» for As shot |
| recovery (autosave) | återställning |  |
| options bar | alternativfält |  |
| Window (menu) | Fönster |  |

## File convert

| English | Svenska | Note |
| --- | --- | --- |
| X to Y (conversion) | X till Y | «Till PNG» |
| conversion | konvertering |  |
| route (chain of conversions) | kedja | «mellansteg» for in-between steps |
| options | Alternativ |  |
| clear | Rensa |  |
| selected | markerade |  |
| quality / bitrate | Kvalitet / bithastighet | «kbit/s» in prose |
| frame (video) / frame rate | bildruta / bildfrekvens | «nyckelbildruta» |
| fade in / out | Tona in / Tona ut |  |
| cut (trim) | Klipp |  |
| subtitles | undertexter | «Förskjut tiderna» |
| line endings / encoding | radslut / teckenkodning | «Identifiera» for Detect |
| separator | avgränsare | «lodstreck» for pipe |
| sheet / workbook | blad / arbetsbok |  |
| plain text | oformaterad text |  |
| speaker notes | talaranteckningar |  |
| picture PDF | bild-PDF |  |
| unzip | Packa upp |  |
| voucher (SIE) | verifikation |  |
| statement / transaction / value date / counterparty | kontoutdrag / transaktion / valutadag / motpart |  |
| track / waypoint | spår / vägpunkt |  |
| mesh / up axis | nät / uppåtaxel | 3D |
| video engine | videomotor |  |
| Finance / Maps and GPS / Other (groups) | Ekonomi / Kartor och GPS / Övrigt |  |

## Video and motion (SlopCut, Slop Effects, Reel Remix)

| English | Svenska | Note |
| --- | --- | --- |
| clip | klipp | plural «klipp»; «Dela klipp» |
| timeline | tidslinje |  |
| track | spår | «Videospår», «Ljudspår» |
| sequence | sekvens |  |
| media bin | mediebibliotek | the tab: «Media» |
| playhead | uppspelningshuvud |  |
| play / pause | Spela upp / Pausa |  |
| frame | bildruta | «Nästa bildruta» |
| frame rate (fps) | bildfrekvens | keep «fps» in compact labels |
| keyframe | nyckelbildruta |  |
| transition | övergång |  |
| title (text on video) | titel |  |
| captions / subtitles | undertexter |  |
| trim | Trimma |  |
| razor / split at playhead | Klipp / Dela vid uppspelningshuvudet |  |
| ripple delete | Ta bort och stäng luckan |  |
| snap / snapping | Fäst / fästning | «Fäst mot klipp» |
| marker | markör |  |
| in / out point | startpunkt / slutpunkt | «I/O» keys stay |
| fade in / fade out | Tona in / Tona ut | noun «intoning», «uttoning» |
| volume | volym |  |
| mute / solo | Stäng av ljud / Solo |  |
| speed | hastighet |  |
| aspect ratio | bildförhållande |  |
| resolution | upplösning |  |
| render / encode | rendera / koda | «Renderar…», «Exporterar video…» |
| opacity | opacitet |  |
| blend mode | blandningsläge |  |
| mask | mask |  |
| crop | Beskär |  |
| colour grade | färgkorrigering |  |
| look (colour preset) | look | «Looks» as in DaVinci sv; or «stil» in running text |
| preset | förinställning |  |
| template | mall |  |
| composition | komposition | Slop Effects |
| easing | easing | «Mjuk in», «Mjuk ut», «Mjuk in/ut» for ease in/out |
| graph editor | kurvredigerare |  |
| seed (random) | slumpfrö |  |
| blur / glow / shadow | Oskärpa / Glöd / Skugga |  |
| grain / vignette / glitch | Filmkorn / Vinjett / Glitch |  |
| waveform | vågform |  |
| shuffle | Blanda |  |
| beat (music) | takt | «Klipp i takt» |
| slideshow | bildspel |  |
| project | projekt |  |
| loop | Upprepa | the toggle; «loop» for a looping clip |

## Labels (SlopLabel)

| English | Svenska | Note |
| --- | --- | --- |
| label | etikett |  |
| barcode | streckkod |  |
| QR code | QR-kod |  |
| label stock (sheet / roll) | etikettmaterial (ark / rulle) |  |
| printer | skrivare |  |
| print job | utskriftsjobb |  |
| data merge / print from data | dataimport / Skriv ut från data | «Dokumentkoppling» only for mail merge proper |
| variable (field) | variabel |  |
| serial number / counter | löpnummer / räknare |  |
| column / row | kolumn / rad |  |
| margin / gap | marginal / mellanrum |  |
| align / distribute | Justera / Fördela | «Justera vänster», «Centrera» |
| group / ungroup | Gruppera / Dela upp grupp |  |
| lock / unlock | Lås / Lås upp |  |
| grid / ruler / guide | rutnät / linjal / stödlinje |  |
| element (object on a label) | objekt |  |
| copies | kopior | «Antal kopior» |

## Wave 1 terms (SlopCut, SlopLabel, Slop Effects, Reel Remix)

| English | Svenska | Note |
| --- | --- | --- |
| inspector (panel) | Granskare | SlopCut's right panel |
| program monitor | programmonitor |  |
| colour matte | färgplatta |  |
| cross dissolve | övertoning | «Tona via svart/vitt» for dip to black/white |
| wipe | svep |  |
| lower third | namnskylt |  |
| random edit | slumpklippning | «Blanda om» for reshuffle |
| cut (a span of a random edit or reel) | klipp | same word as clip; «klippning» for the whole edit |
| slot (a cell of a layout) | plats |  |
| reel | reel | «Stående 9:16-reel» |
| effect layer | effektlager | «slumpeffektlager» for the random one |
| safe areas | säkra områden |  |
| shuttle (J/K/L) | spola | «Spola bakåt (J)» |
| ripple edit tool | Ripple-verktyg |  |
| null layer | nollager |  |
| solid layer | färglager |  |
| anchor point (where an object is pinned) | fästpunkt | as the PDF part; a path's anchor point is «ankarpunkt» |
| feather (mask) | mjuk kant |  |
| quiet zone (barcode) | frizon |  |
| bearer bars | bärlister |  |
| human readable (barcode text) | läsbar text |  |
| check digit | kontrollsiffra |  |
| symbology | symbologi |  |
| record (a data row) | post | «Föregående post», «Skriv ut post 3» |
| prompt (variable asked at print) | fråga | «Fråga vid utskrift» |
| thermal transfer / direct thermal | termotransfer / direkt termo |  |
| darkness (printer) | svärta |  |
| config (saved setup) | konfiguration |  |
| print form link | länk till utskriftsformulär |  |
| inverse box | inverterad ruta |  |
| look (colour) | look | «Färglook», «Looks» |
| pace | tempo |  |

## Slop Press, SlopVector, Slop Slides, Slop Font (wave 1, group C)

| English | Svenska | Note |
| --- | --- | --- |
| place (a file, art, image) | Montera | as Adobe sv (InDesign, Illustrator): «Montera…», «Montera från Slop Drive…», «Monterade text» |
| master page | mallsida | «Ny mallsida», «Använd mallsida» |
| paragraph style / character style | styckeformat / teckenformat | as InDesign sv |
| swatch / Swatches panel | färgruta / Färgrutor |  |
| spread / facing pages | uppslag |  |
| text frame / image frame | textram / bildram |  |
| fill / stroke | fyllning / linje | «Fyllningsfärg», «Linjefärg», «Linjetjocklek»; Slides' shape «outline» is «kontur» |
| leading / tracking | radavstånd / spärrning | short labels «Radavst.», «Spärr.» |
| text wrap | textombrytning |  |
| overset text | överskjutande text |  |
| autoflow | flöda automatiskt |  |
| thread (text frames) | länka | «Visa textlänkar» |
| gutter | spaltavstånd | short label «Avst.» |
| inset (frame) | indrag / inre marginal |  |
| drop cap | anfang |  |
| baseline grid | baslinjeraster |  |
| composer | disposition | «Styckedisposition», «Enradsdisposition» |
| bleed / slug | utfall / informationsområde | marks: skärmärken, utfallsmärken, passmärken |
| pasteboard | montagebord |  |
| guide / smart guides | stödlinje / smarta stödlinjer |  |
| grid (view) | stödraster | «Fäst mot stödraster» |
| ruler | linjal |  |
| snap | Fäst |  |
| Type / Object / Window menus | Text / Objekt / Fönster |  |
| Document Setup | Dokumentinställningar (Press), Dokumentformat (Vector) | as each Adobe app |
| artboard | rityta |  |
| gradient | övertoning | «Färgstopp» for a stop |
| anchor point (on a path) | ankarpunkt | an object's pinning point is «fästpunkt» |
| path | bana | «Sammansatt bana» |
| clipping mask | urklippsmask | «Skapa/Frigör urklippsmask» |
| Pathfinder | Banhanterare | Förena / Minus framför / Snitt / Uteslut |
| expand / release | Utvidga / Frigör |  |
| reflect / flip | Spegla / Vänd vågrätt, Vänd lodrätt |  |
| blend mode | blandningsläge |  |
| miter / cap / join | gering / ände / hörn |  |
| eyedropper / scissors / pencil / paintbrush | Pipett / Sax / Blyertspenna / Pensel |  |
| buffer (Slop buffer) | buffert | «Kopiera till bufferten» |
| Slopify | Slopifiera | coined verb |
| slide (Slides) | bild | as PowerPoint sv: «Ny bild», «Bild 3 av 10» |
| presenter view / speaker notes | presentatörsvy / talaranteckningar |  |
| present / slide show | Presentera / bildspel |  |
| transition / animation | övergång / animering | «Med föregående», «Vid klick» |
| layout (slide) | layout | «Rubrik och innehåll», «Endast rubrik», «Tom» |
| template | mall | «Ny från mall…», «Mina mallar» |
| glyph | glyf | plural «glyfer» |
| kerning / kerning pair | kerning / kerningpar |  |
| ascender / descender / cap height / x-height | uppstapel / nedstapel / versalhöjd / x-höjd |  |
| type test (Font) | provtext |  |
| handwriting sheet | handskriftsark |  |
| trace (a picture) | Spåra |  |
| contour (glyph) | kontur | «Förena markerade konturer» |
| font weight names | Tunn … Svart in Slop Font's weight list; kept English where they are a typeface's style name (Vector) |  |

## Shared across apps (wave 1)

| English | Svenska | Note |
| --- | --- | --- |
| template | mall | «Mina mallar», «Från mall…», «Spara som mall» |
| discard (unsaved changes) | Ignorera | «Ignorera ändringarna?» |
| config (settings file) | konfiguration | «Importera konfiguration…» |
| tag | tagg | «Taggar», «otaggade» |
| duplicate (noun, exact copy) | dubblett | «Hitta dubbletter»; the verb stays «Duplicera» |
| grid / list / compact (view) | Rutnät / Lista / Kompakt |  |
| backup / back up | säkerhetskopia / Säkerhetskopiera | «Återställ från en säkerhetskopia» |
| deselect | Avmarkera | «Avmarkera alla» |
| invert selection | Invertera markering |  |
| selection | markering |  |
| properties (panel) | Egenskaper |  |
| pan (view, tool) | Panorera |  |
| transparent | Transparent | shorter than «Genomskinlig», fits button rows |

## Slop Tables

| English | Svenska | Note |
| --- | --- | --- |
| spreadsheet | kalkylark | «Namnlöst kalkylark» |
| workbook | arbetsbok |  |
| sheet | blad | menu «Blad»; «Lägg till blad» |
| cell | cell |  |
| formula / formula bar | formel / formelfält |  |
| name box | namnruta |  |
| number format | Talformat | General «Allmänt», Currency «Valuta», Custom «Anpassat» |
| clear contents | Radera innehåll | as Excel; delete stays «Ta bort» |
| freeze / unfreeze panes | Lås fönsterrutor / Lås upp fönsterrutor |  |
| pivot table | pivottabell |  |
| chart | diagram | column «Stapel», bar «Liggande stapel», line «Linje», pie «Cirkel» |
| legend (chart) | förklaring |  |
| series | serie |  |
| range (cells) | område | «Källområde», «Dataområde» |
| refresh | Uppdatera |  |
| sum / count / average | Summa / Antal / Medel |  |

## Slop Docs

| English | Svenska | Note |
| --- | --- | --- |
| bold / italic (full label) | Fet / Kursiv | F / K only as short labels |
| underlined (character format) | Understruken | the PDF command stays «Stryk under» |
| clear formatting | Rensa formatering |  |
| font size | teckenstorlek | «Öka/Minska teckenstorleken» |
| align left / centre / right | Vänsterjustera / Centrera / Högerjustera | menu items: Vänster, Centrerat, Höger |
| justify | Marginaljustera | menu item «Marginaljusterat» |
| alignment | Justering |  |
| bulleted / numbered list | Punktlista / Numrerad lista |  |
| paragraph style | Styckeformat |  |
| normal text | Normal text |  |
| title / heading (style) | Rubrik / Rubrik 1–3 |  |
| quote (style) | Citat |  |
| outline (document) | Disposition | as Word sv |
| section | avsnitt | «Lägg till avsnitt» |
| promote / demote (heading) | Höj nivå / Sänk nivå |  |
| collapse / expand | Komprimera / Expandera |  |
| caret | markören |  |
| seed (random) | frö | «Slumpa igen» for reshuffle |
| page break | sidbrytning |  |
| wrap text / inline (image) | Radbyte / I nivå med texten | as Word sv |
| different first page | Annorlunda förstasida | as Word sv |
| plain text | oformaterad text |  |
| buffer (Slop buffer) | bufferten | «Kopiera till bufferten» |
| untitled document | Namnlöst dokument |  |

## Slop Drive

| English | Svenska | Note |
| --- | --- | --- |
| Trash | Papperskorgen | «Flytta till papperskorgen», «Töm papperskorgen»; short button «Kasta» |
| Starred | Stjärnmärkta | place name |
| star / unstar | Stjärnmärk / Ta bort stjärna |  |
| Quick look | Snabbtitt | as macOS sv |
| delete forever | Ta bort permanent |  |
| local drive | lokal enhet | sidebar heading «Enheter» |
| local folder | lokal mapp |  |
| connect / disconnect (folder) | Anslut / Koppla från |  |
| allow access | Ge åtkomst | state «Åtkomst nekad» |
| details panel / info panel | detaljpanel / Infopanel |  |
| kind (file kind) | typ | «Alla» in the narrow kind filter |
| MIME type | MIME-typ |  |
| disk usage | Diskanvändning |  |
| treemap / sunburst | trädkarta / solstråle |  |
| cache | cache | «Rensa lokal cache…» |
| uploaded (source) | Uppladdad |  |
| faces and people | Ansikten och personer | «Hitta ansikten» |
| playback | uppspelning | «Spela upp», «Pausa», «Spelas nu» |

## Slop AI

| English | Svenska | Note |
| --- | --- | --- |
| chat (noun) | chatt | «Ny chatt», «Chattar» |
| model (AI) | modell |  |
| load / unload (a model) | Läs in / Ta ur | «Läser in…» |
| token(s) | token | same in the plural; «token/s» |
| persona | persona |  |
| system prompt | systemprompt |  |
| temperature (AI) | temperatur |  |
| Control apps (agent tools) | Styr appar |  |
| mini-app | miniapp | «Ny miniapp», «Miniappsbyggare» |
| sandboxed | sandlåda | «🔒 sandlåda» |
| workspace | arbetsyta |  |
| demo engine / real engine | demomotor / riktig motor |  |
| benchmark | prestandatest |  |
| spec card | systemkort |  |
| regenerate | Generera igen |  |
| verdict (can it run) | bedömning |  |
| Can my PC run it? | Klarar min dator det? |  |

## Slop 3D

| English | Svenska | Note |
| --- | --- | --- |
| mesh | nät | «Redigera nät» |
| vertex / edge / face | hörn / kant / yta | modes «Hörnläge», «Kantläge», «Ytläge» |
| edge loop | kantslinga |  |
| extrude | Extrudera |  |
| subdivide | Dela in |  |
| flip normals | Vänd normaler |  |
| wireframe | Trådmodell |  |
| snap (step) | Fäst / fäststeg |  |
| orbit (camera) | kretsa |  |
| frame (selection in view) | Rama in | «Rama in markering», «Rama in allt» |
| viewport (3D) | 3D-vy |  |
| outliner | Scenträd |  |
| scene | scen |  |
| transform | Transformering | the command group is «Transformera» |
| ungroup | Dela upp grupp |  |
| ambient / directional light | Omgivningsljus / Riktat ljus |  |
| render | Rendera |  |
| roughness / metallic / opacity | Grovhet / Metallisk / Opacitet |  |
| texture | textur |  |
| primitive | primitiv |  |

## SlopIsolate

| English | Svenska | Note |
| --- | --- | --- |
| cut out (background removal) | Frilägga | noun «friläggning»; «Frilägger…» |
| subject (of a photo) | motiv |  |
| mask | mask |  |
| matte (video alpha mask) | alfamask |  |
| keep / remove brush | Behåll-pensel / Ta bort-pensel | buttons «Behåll» / «Ta bort» |
| threshold | Tröskel |  |
| softness | Mjukhet |  |
| feather | mjuk kant | as PhotoSlop; «Ludd» is not used |
| decontaminate colours | Rensa färger | as Photoshop sv |
| refine edges | Förfina kanter |  |
| hardness (brush) | Hårdhet |  |
| drop shadow | Slagskugga | the section is «Skugga» |
| gradient | Övertoning |  |
| offset X / Y | Förskjutning X / Y |  |
| padding | Marginal |  |
| mixed (values differ) | Blandat |  |
| queue / queued | kö / I kö |  |
| look (background, shadow, crop) | utseende |  |
| frame (video) | bildruta |  |
| scrub (video) | Spola |  |
| batch (of images) | omgång |  |

## Slop Gallery

| English | Svenska | Note |
| --- | --- | --- |
| photo / photos | foto / foton |  |
| library (photo library) | bibliotek |  |
| album | album | plural «album» |
| favourite / favourites | favorit / Favoriter |  |
| people (view) | Personer |  |
| like / dislike | Gilla / Ogilla | «gillad», «ogillad» |
| slideshow | bildspel |  |
| reel (short video) | reel | «Gör reel» |
| face detection | ansiktsdetektering | detection only, no recognition |
| pace | tempo |  |
| aspect | bildformat | «16:9 liggande», «9:16 stående» |
| swipe deck (sort mode) | svepläge |  |

| invoice / credit note | faktura / kreditfaktura | «Fakturautkast» for a draft invoice |
| quote | offert |  |
| order (sales) / purchase order | order / inköpsorder | «Order» is the same in singular and plural |
| delivery note | följesedel |  |
| fulfil (an order) / fulfilled | leverera / levererad |  |
| confirmed (order status) | Bekräftad |  |
| issue (a document) / issued | utfärda / utfärdad |  |
| void (a document) | makulera / makulerad |  |
| post (to the books) / posted | bokföra / bokförd | «Bokför» on buttons |
| journal / journal entry | grundbok / verifikation | «Vänd» to reverse an entry |
| general ledger | huvudbok |  |
| trial balance | råbalans |  |
| profit and loss / balance sheet | resultaträkning / balansräkning |  |
| debit / credit | debet / kredit |  |
| opening balances | ingående balanser |  |
| tax (VAT) | moms | «Ingående moms» for tax to reclaim on expenses |
| due date / overdue | förfallodatum / förfallen |  |
| statement (customer account) | kontoutdrag |  |
| payment reminder | påminnelse |  |
| expense / mileage claim | utgift / milersättning |  |
| timesheet / billable | tidrapport / debiterbar |  |
| inventory (app) / stock (tab) | Lager / Lagersaldo |  |
| stock count | inventering |  |
| SKU / reorder level | artikelnr / beställningspunkt |  |
| lead / pipeline (CRM) | lead / säljtratt |  |
| numbering series | nummerserie |  |
| sample seed | frö | for the random samples of the business apps |

## Wave 1, group F (tools and utilities)

| English | Svenska | Note |
| --- | --- | --- |
| Slopographic home (brand link) | Slopographic start | as the PDF app; not «startsida» |
| 100% local (badge) | 100 % lokalt |  |
| Get more (download a model) | Hämta mer | «Hämta mer…»; every AI and model page |
| model (AI) | modell | «Det här verktyget behöver en modell», «Språk och modell» |
| detect automatically (language) | Identifiera automatiskt |  |
| hash / checksum | hash / kontrollsumma | «Kopiera hash», «Förväntad hash»; the app name is «Kontrollsumma» |
| serial number | serienummer | «Serienummerräknare» |
| recognised text | igenkänd text | OCR |
| searchable PDF | sökbar PDF |  |
| transcribe / transcript | Transkribera / transkription | «Transkribera igen» |
| subtitles | undertexter | «Webbundertexter (.vtt)» |
| record / recording | Spela in / inspelning | «Stoppa inspelningen» |
| discard (a recording) | Släng |  |
| resume | Fortsätt | after Pause |
| countdown | nedräkning |  |
| webcam | webbkamera |  |
| trim | Trimma |  |
| playhead | uppspelningshuvud |  |
| frame (video) / frame rate | bildruta / bildfrekvens |  |
| microphone | mikrofon |  |
| denoise | Brusreducering | tool name; «Filtrerar…» |
| portrait blur | Porträttoskärpa | «Oskärpa:» for the strength |
| auto tags / suggest tags | Automatiska taggar / Föreslå taggar |  |
| tag (noun / verb) | tagg / tagga |  |
| before / after | Före / Efter |  |
| like / dislike (photos) | Gilla / Ogilla | «Gillade», «Osorterade» |
| upscale | Skala upp | «uppskalad», noun «uppskalning» |
| resize | Ändra storlek | «Ändra storlek på {n} filer» |
| keep aspect ratio | Behåll proportioner |  |
| fit / cover / stretch | Anpassa / Täck (beskär) / Sträck ut |  |
| long edge | långsida |  |
| resampling | omsampling |  |
| preset (saved settings) | förinställning | as PhotoSlop and the video apps; plural «Förinställningar» |
| custom size / target size | Anpassad storlek / Målstorlek |  |
| transparent | genomskinlig | in prose; the button word is «Transparent» (Shared across apps) |
| output (settings group) | Utdata |  |
| queue | kö |  |
| lossless | förlustfri |  |
| tile (processing) | ruta |  |
| metadata remover | Ta bort metadata | SlopClean; «Kopiera och rensa» |
| removed / kept | Borttagen / Kvar |  |
| location (GPS) | Plats (GPS) |  |
| colour profile (ICC) | Färgprofil (ICC) |  |
| maker notes | Tillverkarens anteckningar |  |
| date taken | Fotograferingsdatum |  |
| chunk (PNG/WebP) | segment |  |
| mailbox (.mbox) | brevlåda |  |
| email (sample) | mejl / e-post | «exempelmejl», «e-postfil» |
| attachment | bilaga | «Bilagor ({n})» |
| Cc / Bcc | Kopia / Hemlig kopia | as Outlook sv |
| remote images / embedded images | Fjärrbilder / inbäddade bilder |  |
| sort A to Z | A till Ö |  |
| Start (empty panel section) | Kom igång |  |
| page header / margins | Sidhuvud / Marginaler | html2pdf |
| portrait / landscape (paper) | Stående / Liggande |  |
| background graphics | Bakgrundsgrafik |  |
| depth / depth map | djup / djupkarta | Image to 3D |
| mesh / point cloud | Nät / Punktmoln | «Höjdfältsnät»; «Splats» stays |
| smoothing | Utjämning |  |
| subject (vs background) | Motiv |  |
| orbit (3D view) | rotera | in hints («Dra för att rotera»); the 3D camera mode is «kretsa» |
| compare | Jämför | Slop Compare |
| side by side / unified | Sida vid sida / Samlad |  |
| ignore whitespace / case | Ignorera blanksteg / skiftläge |  |
| threshold | tröskel |  |
| swap A and B | Byt plats på A och B |  |
| key column | nyckelkolumn |  |
| path (JSON) | Sökväg |  |
| node / wire / graph | nod / tråd / graf | Slopnodes |
| value / formula / output (node types) | Värde / Formel / Utdata |  |
| canvas (graph or drawing) | arbetsyta / rityta | graph / paint |
| loop (cycle) | slinga |  |
| actual size | Verklig storlek |  |
| offset (byte position) | position | «Gå till position» |
| inspector | Granskare |  |
| executable | körbar fil |  |
| binary data | binära data |  |
| notebook | anteckningsbok | plural «anteckningsböcker» |
| pin / unpin | Fäst / Lossa |  |
| trash (Slop Drive) | papperskorg | «Flytta till papperskorgen»; the button verb is «Släng» |
| callout (Markdown note block) | faktaruta | the PDF annotation stays «pratbubbla» |
| divider | avdelare |  |
| explorer / open editors | Utforskaren / Öppna redigerare | as VS Code sv |
| extensions / snippets | Tillägg / Kodsnuttar |  |
| formatter | Formaterare | «Formatera dokument» |
| language mode | språkläge |  |
| line wrap | radbrytning |  |
| Ln, Col | Rad, kol |  |
| read only | Skrivskyddad |  |
| copy path | Kopiera sökväg |  |
| plain text | Oformaterad text |  |
| console | Konsol |  |
| library (music) | bibliotek |  |
| playlist / track | spellista / spår | «3 spår» |
| now playing | Spelas nu |  |
| shuffle / repeat / mute | Blanda / Upprepa / Ljud av |  |
| seek | Spola |  |
| playback speed | Uppspelningshastighet | short «Hastighet» |
| workflow / step | arbetsflöde / steg |  |
| template | mall |  |
| run (noun / button) | körning / Kör |  |
| share link | Delningslänk | button «Dela länk» |
| pick a colour | Hämta | «Hämta från skärmen» |
| eyedropper | pipett |  |
| palette (colours) | palett |  |
| harmony (colours) | harmoni | Komplementär / Analog / Triad / Tetrad / Kvadrat / Monokrom |
| contrast check | Kontrastkontroll | Godkänd / Underkänd |
| QR: error correction / quiet zone / module | felkorrigering / frizon / modul | «frizon» as for barcodes |
| raw text | råtext |  |
| logo | logotyp |  |
| buffer (SlopBuffer) | bufferten | «Kopiera till bufferten» |
| primary / secondary colour (Paint) | förgrundsfärg / bakgrundsfärg | as MS Paint sv |
| Tool Box / Color Box | Verktygslåda / Färgruta |  |
| Flip/Rotate / Stretch/Skew | Vänd/rotera / Töj/lutning |  |
| magnifier / airbrush / eraser | Förstoringsglas / Sprayburk / Suddgummi |  |
| free-form select | Fri markering |  |
| clipboard | Urklipp | as Windows sv |
| hue / saturation / luminosity | nyans / mättnad / ljushet |  |
| spreadsheet / worksheet | kalkylark / kalkylblad | a sheet tab is «blad» |
| table style | Tabellformat | Randig / Enkel / Rutnät / Kompakt |
| (Blanks) | (Tomma) | filter list |
| watermark (verb) | vattenstämpla | «Vattenstämpla 3 bilder» |
| nine positions | Uppe till vänster … Nere till höger, Mitten |  |
| opacity | Opacitet |  |
| paste (a Paste item) | klipp | «Nytt klipp», «Bildklipp» |
| expires | Upphör |  |
| paper tape | pappersremsa | Slopculator |
| expression / variable | uttryck / variabel |  |
| exchange rate | växelkurs |  |

## Guided tours (the tour words in each app's tables)

| English | Svenska | Example |
| --- | --- | --- |
| <App> tour (tour name) | Rundtur i <App> | «Rundtur i Slop Hex» |
| drop zone | släppyta | «Släppyta» |
| side bearings (font) | sidomarginaler | «Bredd och sidomarginaler» |
| depth scale | djupskala | «Djupskala» |

## Shared labels that follow a language switch (widgets)

| English | Swedish | Note |
| --- | --- | --- |
| Object / Data (menu) | Objekt / Data | SlopMenuBar titles |
| Send to {app} | Skicka till {app} | SlopOuttake verb |
| Export current config… | Exportera aktuell konfiguration… |  |
| Export plain template… | Exportera tom mall… |  |
| Ask AI to write a config… | Be AI skriva en konfiguration… |  |
| Number formats | Nummerformat | invoice and order numbers |

## Shared panels: workflow steps, watermark, preview, deck, faces, guides (wave 1, shared components)

| English | Svenska | Note |
| --- | --- | --- |
| step (workflow) | steg | «Steg 1 har ingen åtgärd» |
| Run a workflow… / Add to a workflow… | Kör ett arbetsflöde… / Lägg till i ett arbetsflöde… |  |
| see-through (background) | genomskinlig | «Genomskinlig (PNG)» |
| cut-out | urklipp |  |
| drop shadow | skugga |  |
| crop to the subject | Beskär till motivet |  |
| fit / fill / stretch (resize) | Anpassa / Fyll / Sträck ut |  |
| longest side | längsta sidan |  |
| lossless / strong (compression) | förlustfri / stark |  |
| searchable PDF | sökbar PDF |  |
| plain text | oformaterad text |  |
| frame (aspect, video) | bildformat | «Stående 9:16», «Liggande 16:9» |
| frame rate | bildfrekvens |  |
| seed (random edit) | startvärde |  |
| pace | tempo |  |
| edit list (EDL) | redigeringslista |  |
| outline (deck, document) | disposition |  |
| speaker notes | talaranteckningar |  |
| denoise | brusreducering |  |
| blemish | hudfläck | «Läk hudfläckar» |
| whiten teeth / eyes | Bleka tänder / Ljusa upp ögonvitor |  |
| layer (watermark) | lager | «Lägg till textlager» |
| My watermarks | Mina vattenstämplar |  |
| shorter side | kortsidan | «% av kortsidan» |
| move across / move down | Flytta i sidled / Flytta nedåt |  |
| tile (repeat a mark) | Upprepa över bilden | «sida vid sida» in the step option |
| actual size | verklig storlek |  |
| like / dislike (photo deck) | Gilla / Ogilla; stamp «Gillad» / «Ogillad» |  |
| tag (photo) | tagg | «Taggade ”a”, ”b”.» |
| merge / split (people) | Slå ihop / Dela upp |  |
| face boxes | ansiktsrutor |  |
| margins / columns / rows / gutter (guides) | marginaler / kolumner / rader / mellanrum |  |
| baseline grid | baslinjeraster |  |
| wildcard (guide notation) | jokertecken |  |
| Live preview | Direkt förhandsgranskning |  |
| Rule of thirds / Golden ratio | Tredjedelsregeln / Gyllene snittet |  |
| kinds: Images, Code and text, Archives, Other | Bilder, Kod och text, Arkiv, Övrigt | Gallery filters |

## Shared AI panel, own AI account and model choice

| English | Svenska | Note |
| --- | --- | --- |
| AI permissions | AI-behörigheter | the panel's ⚙ and the mode switch |
| Ask each time / Allow app changes / Allow everything | Fråga varje gång / Tillåt appändringar / Tillåt allt | permission modes |
| Allow once / for this request / for this visit / Always allow / Deny | Tillåt en gång / för den här förfrågan / under det här besöket / Tillåt alltid / Neka | the permission question |
| kinds of action | appändringar, borttagningar, filutskick, kommandon i en annan app, kostnader för bildgenerering | nouns, so «Tillåt filutskick i …» reads |
| the assistant | assistenten |  |
| Undo all AI changes | Ångra alla AI-ändringar |  |
| step (of a request) | steg | «3 steg, 1 misslyckades» |
| operation (file job) | åtgärd | «Lista åtgärderna» |
| good at app control | bra på att styra appar | model badge |
| GPU memory | GPU-minne |  |
| licence / commercial use | licens / kommersiell användning |  |
| Detect automatically | Identifiera automatiskt | the language list's first row |
| Recommended / Fastest / Made for … | Rekommenderas / Snabbast / Gjord för … | model badges |
| Speed / Accuracy | Hastighet / Noggrannhet |  |
| matting (cut-out) | frilägga |  |
| AI provider | AI-leverantör | «Välj en leverantör» |
| API key | API-nyckel | |
| own AI account | eget AI-konto | «Använd ditt eget AI-konto» |
| Test connection | Testa anslutningen | button |
| Forget key | Glöm nyckeln | |
| spending cap | utgiftstak | «inget tak», «(tak 500)» |
| token (AI usage) | token (pl. token) | «976 token» |
| request (to a provider) | förfrågan / förfrågningar | |
| rate limit | hastighetsgräns | |
| free tier / free trial | gratisnivå / gratis provperiod | badges «Gratis», «Gratismodeller», «Gratis provperiod» |
| model turn | modellvända | usage hover text |
| cached (tokens) | i cache | «35 314 från cache» |
| Main (provider group) | Huvudval | groups: Snabb inferens, Öppna modeller, Moln, Lokalt på den här datorn, Bilder, Fler |
| Any address | Valfri adress | the OpenAI-compatible custom entry |
| needs a proxy / browser OK | kräver proxy / webbläsare OK | picker badges |
| endpoint | slutpunkt | «Slutpunkts-id» |
| deployment (Azure) | driftsättning | |
| mixed content | blandat innehåll | |
| How to connect … | Så ansluter du … | |
| Generate image / Generate (button) | Skapa bild / Skapa | imagegen dialog |
| Edit with AI | Redigera med AI | |
| Made by (picture provider) | Görs av | |
| Transparent background | Genomskinlig bakgrund | |
| Spend on image generation | Betala för bildgenerering | permission question title |
| prompt | prompt | kept as «prompt» in AI contexts |
| content rules | innehållsregler | |
| charges your account | debiterar ditt konto | |

## Shell and shared components (shell, finder, calendar, sheets, calc)

| English | Svenska | Note |
|---|---|---|
| app drawer | applådan | «Stäng applådan» |
| ungroup (a folder) | Dela upp | «Mappen delades upp.» |
| notification / desktop alerts | avisering / skrivbordsaviseringar | as the chrome's «Aviseringar» |
| dismiss (a notification) | Stäng |  |
| video tutorial | videoguide | «Se videoguiden för {app}» |
| unsaved changes (dot) | Osparade ändringar |  |
| item / items (generic count) | objekt | «2 objekt», same in singular |
| ascending / descending (sort) | stigande / fallande |  |
| until (a repeat's last day, inclusive) | till och med | «Varje vecka till och med 31 jan. 2027» |
| every 2 weeks | var 2:e vecka | «varje vecka» for one |
| N minutes before | {n} minuter före | «1 timme före», «1 dag före» |
| snooze time | snoozetid | as the Reminders app's «Snooza» |
| file size units | byte / kB / MB / GB | «3,4 kB» (decimal comma) |
| pictures / chart sheets (not imported) | bilder / diagramblad |  |
| conditional formatting / data validation | villkorsstyrd formatering / dataverifiering | as Excel sv |
| quantity (calc) | storhet | «två storheter» |
| division by zero | Division med noll |  |
| dimension names (calc) | längd / massa / volym / tid / kalenderdagar / datamängd / temperatur / valuta |  |

## Printed business documents (document language)

| English | Swedish | Note |
| --- | --- | --- |
| invoice | Faktura | document title |
| quote | Offert |  |
| order | Order |  |
| purchase order | Inköpsorder |  |
| credit note | Kreditfaktura |  |
| delivery note | Följesedel |  |
| statement (customer account) | Kontoutdrag |  |
| price list | Prislista |  |
| payment reminder | Betalningspåminnelse | subject «Betalningspåminnelse: {belopp} att betala» |
| tax / VAT (on a document) | Moms | «Moms 25 % på …», column «Moms» |
| subtotal (before tax) | Summa exkl. moms |  |
| with tax | Inkl. moms |  |
| balance due / balance owed | Att betala |  |
| due date | Förfallodatum |  |
| invoice number | Fakturanummer | Offertnummer, Ordernummer for the others |
| payment terms | Betalningsvillkor | «30 dagar netto» |
| reference / OCR | OCR/Referens | not printed yet (no field) |
| late payment interest | Dröjsmålsränta | not printed yet (no field) |
| tax number | Momsreg.nr |  |
| bill to | Kund | «Leverantör» on a purchase order |
| unit price | À-pris |  |
| page n of N | Sida n av N |  |
| document language | Dokumentspråk | Admin and the document editor; «Företagets standard (Svenska)» |

## Shared media lists (ui.video, ui.graphics, ui.presets)

| English | Svenska | Note |
| --- | --- | --- |
| layout switch (lane) | layoutbyte | «Byt vid uppspelningshuvudet», «Ta bort byte» |
| pointers / marks / callouts (graphics groups) | Pekare / Markeringar / Pratbubblor |  |
| colour look (effect type) | färglook | the looks themselves: «Varm look», «Kall look» |
| emboss / bevel and emboss | Relief / Avfasning och relief | as PhotoSlop |
| built-in (preset) | Inbyggd | «Mina» for the person's own |
## wip/i18n-r2-settings (the Settings page)

| English | Swedish | Note |
|---|---|---|
| Your choices (page title) | Dina val | |
| Analytics / Ads (consent switches) | Statistik / Annonser | as the chrome's «Statistik och annonser» |
| Defaults / Default currency | Standardval / Standardvaluta | |
| Locale | Nationella inställningar | as Windows and Office name it |
| Update on open | Uppdatera vid start | |
| Base / Quote (currency pair) | Bas / Mot | «motvalutan» in prose |
| Load the latest version | Läs in senaste versionen | |
| release (site version) | version | «Den här webbläsaren har version {version}.» |
| config (settings file) | konfiguration | «Spara konfiguration i mappen» |
| downloaded extras | nedladdade tillägg | Storage: «Rensa alla nedladdade tillägg» |
| offline caches | offlinecacher | |
| Light / Dark (theme) | Ljust / Mörkt | neuter, agrees with «tema» |

## wip/i18n-r2-ai (model notes, script and language names, AI model tags)

| English | Swedish | Note |
|---|---|---|
| script (writing system) | skrift | «latinsk skrift», «kyrillisk skrift»; lower case in running text |
| recogniser (OCR model part) | igenkännare | «CRNN-igenkännare» |
| detector (OCR) | detektor | «DB-detektor» |
| accents (diacritics) | diakritiska tecken | as in ui.models.ocr_accents |
| encoder-decoder | kodare-avkodare | Whisper |
| fine-tuned / trained further | finjusterad / vidaretränad |  |
| language names | from Intl.DisplayNames («svenska», «förenklad kinesiska») | capital first letter in lists only |
| strength tags (Slop AI cards) | pytteliten, snabb, chatt, balanserad, flerspråkig, verktyg, kod, miniappar, skrivande, sammanfattningar, resonemang, matte, smartast | lower case, as the English tags |
| National Library of Sweden / Norway | Kungliga biblioteket / Norges nationalbibliotek |  |

## wip/i18n-r2-shell (app descriptions, theme names, shell leftovers)

| English | Svenska | Note |
|---|---|---|
| Light / Dark / Classic 98 (theme) | Ljust / Mörkt / Klassiskt 98 | neuter, agrees with «tema»; «Slopographic Lime» kept |
| Language… (menu row) | Språk… |  |
| N new (notifications) | {n} nya / {n} ny | «Aviseringar, 1 ny» |
| Preview (status tag of an app in development) | Förhandsversion | the plain tone's word, also in the app switcher |
| rows (report count) | rader / rad | «3 av 12 rader matchar» |
| presenter view | presentatörsvy |  |
| master pages / threaded text | mallsidor / länkade textramar | as InDesign sv |
| fulfilment (orders) | leverans |  |
| gapless numbers (invoices) | obrutna nummerserier |  |
| keyframes / easing | nyckelrutor / easing |  |
| sandboxed preview | isolerad förhandsvisning |  |
| leads (CRM) | leads |  |

## wip/i18n-r2-misc (fonts, Sloppo, AI agents, shared engines and small components)

| English | Swedish | Note |
|---|---|---|
| font (typeface) | teckensnitt | «Teckensnitt…», «Hämta fler…» |
| Bundled (offline) / Downloaded / Your own | Inbyggda (offline) / Nedladdade / Dina egna | font groups |
| Built in. / Missing. | Inbyggt. / Saknas. | Fonts panel rows |
| set in (a font) | sätts i | «sätts i Carlito» |
| character widths | teckenbredder | |
| closest font | närmaste teckensnitt | |
| font library | teckensnittsbibliotek | |
| sample line (pangram) | Flygande bäckasiner söka hwila på 13 mjuka tuvor | the Swedish pangram, shows å ä ö |
| language font | språkteckensnitt | download just in time |
| AI agent | AI-agent | «AI-agenten», «en AI-agent» |
| AI app (on your computer) | AI-app | «Anslut en AI-app…» |
| Connect / Disconnect (AI app) | Anslut / Koppla från | |
| pair / pairing code | parkoppla / parkopplingskod | |
| Allow (this action) | Tillåt | |
| Select and copy | Markera och kopiera | |
| Sloppo buddy | Sloppo-kompis | toggle tooltip |
| Unleash / Calm down | Släpp lös / Lugna ner | |
| RAGE / Rage | RASERI / Ilska | |
| Lv (level, compact) | Nv | «Nivå {n}!» |
| Restore page | Återställ sidan | |
| Give… / Make candy | Ge… / Gör godis | |
| hat | hatt | Partyhatt, Höghatt, Studentmössa, Gloria |
| goo | gegga | |
| Ask Sloppo | Fråga Sloppo | |
| HEIC photo decoder | HEIC-avkodare | |
| camera RAW engine | RAW-motor | |
| Developing… (RAW) | Framkallar… | |
| mesh / vertex / triangle | nät / hörn / triangel | 3D |
| texture / morph targets | textur / morfmål | |
| point cloud | punktmoln | |
| units (3D size) | enheter | |
| Hue / Saturation / Brightness | Nyans / Mättnad / Ljusstyrka | short H S B: N M L |
| Hex colour | Hexfärg | |
| Recent (colours) | Senaste | |
| Review (clean-up window) | Granska | |
| Invert (selection) | Invertera | |
| {n} of {total} checked | {n} av {total} markerade | |
| copy buffer | kopieringsbuffert | |

## wip/i18n-r2-macros (macros, config, backup, sync, storage, Drive picker, guard, tasks)

| English | Swedish | Notes |
| --- | --- | --- |
| macro (pl.) | makron | «Sparade makron», «Importera makron» |
| Play (a macro) | Spela upp | «Spela upp ”{name}”» |
| Leave out (a step) | Utelämna | |
| Apply (a config) | Tillämpa | «Tillämpad: {name}» |
| kind (of config) | typ | field label «Typ» |
| Locale (settings field) | Språkformat | as in the base table's settings kind |
| Default tax rate | Standardmomssats | |
| Merge / Replace (restore modes) | Sammanfoga / Ersätt | |
| Everything in one file | Allt i en fil | backup dialog |
| Cloud backup | Molnsäkerhetskopia | panel title |
| Back up now | Säkerhetskopiera nu | |
| client ID (OAuth) | klient-id | «OAuth-klient-id» |
| Disconnect | Koppla från | |
| Local or network folder | Lokal mapp eller nätverksmapp | |
| sign-in token | inloggningstoken | |
| cache (noun) | cacheminne | plural «cacheminnen» |
| hard reload | hård omladdning | «Läs in igen» for the button |
| due date / due time | förfallodatum / förfallotid | tasks |

## Records, bank files, print, navigation (wip/i18n-r2-data)

| English | Swedish | Note |
|---|---|---|
| draft / issued / paid / void / credited (status in a sentence) | utkast / utfärdad / betald / makulerad / krediterad | ui.data.status.*: «kan inte gå från utkast till betald» |
| open / fulfilled / cancelled (order) | öppen / levererad / avbruten | |
| sent / accepted / declined (quote) | skickad / accepterad / avböjd | |
| ordered / received (purchase order) | beställd / mottagen | |
| bill (an owed expense) | leverantörsfaktura | «obetald leverantörsfaktura» |
| numbering sequence | nummerserie | |
| minor units | minsta enhet (öre) | amounts in messages |
| record / collection (data) | post / samling | validation messages |
| every month / every 2 weeks | varje månad / var 2:e vecka | repeating invoices |
| Cash, Bank, Accounts Receivable, Accounts Payable | Kassa, Bank, Kundfordringar, Leverantörsskulder | starting chart, named at set-up |
| Sales Tax Payable, Equity, Sales Revenue, Expenses | Utgående moms, Eget kapital, Försäljning, Kostnader | |
| statement (bank) | kontoutdrag | bank file warnings |
| Portrait / Landscape | Stående / Liggande | print dialog |
| Margins: Normal / Narrow | Marginaler: Normala / Smala | |
| Print preview | Förhandsgranskning | |
| preset (navigation, layout) | förinställning | |
| Photoshop-style | Photoshop-stil | |
| pan / zoom / pinch | panorera / zooma / nyp | |
| Space (key) / Shift (key) | blanksteg / Skift | |
| Not bound (no key) | Ingen tangent | |
| Customise (tab) | Anpassa | |
| layout (workspace) | layout | «Layout: återställ standard» |
| Fade in / Slide up / Pop / Shake / Pulse / Spin in | Tona in / Glid upp / Studsa fram / Skaka / Pulsera / Snurra in | motion presets |
| Navy / Cobalt / Slate | Marinblå / Koboltblå / Skiffer | template colour schemes |
