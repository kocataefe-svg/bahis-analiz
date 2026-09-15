import { MARKET_LABELS } from "./market-labels";

/** Yorumcularin HER BIRI icin zorunlu tek-satir tahmin uretmesi gereken pazarlar - digerleri opsiyonel baglamdir. */
const MANDATORY_MARKETS = ["h2h", "totals", "btts"];

export interface OddsForPrompt {
  market: string;
  bookmaker: string;
  outcome: string;
  price: number;
}

export interface AnalysisPromptInput {
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  researchContext: string | null;
  odds: OddsForPrompt[];
}

function formatResearchContext(researchContext: string | null): string {
  if (!researchContext) {
    return "Sakatlik/form/H2H arastirmasi mevcut degil (henuz 'Arastir' butonuyla tetiklenmemis). Bu durumu belirt ve temkinli yorum yap. YASAK: gol ortalamasi, savunma hatasi, sakatlik sayisi/suresi, son X mac skoru gibi HICBIR sayisal istatistik UYDURMA - arastirma yoksa bu sayilarin hicbiri elinde yok, 'X gol ortalamasina sahip' gibi bir cumle kurma.";
  }
  return ["Sakatlik/form/H2H arastirmasi (web arama ile toplanmis):", researchContext].join("\n");
}

function formatOdds(odds: OddsForPrompt[]): string {
  // Odds API bazi bookmaker'lar (orn. Betfair borsasi) icin h2h_lay gibi
  // bilmedigimiz ek market anahtarlari dondurebiliyor - sadece bildigimiz
  // (yorum yapmasi istenen) pazarlar prompt'a girsin.
  const knownOdds = odds.filter((o) => o.market in MARKET_LABELS);
  if (knownOdds.length === 0) {
    return "Oran verisi mevcut degil. Oran bazli yorum (value bet vs.) yapma, sadece takim/istatistik yorumuna odaklan.";
  }

  const byMarket = new Map<string, OddsForPrompt[]>();
  for (const o of knownOdds) {
    if (!byMarket.has(o.market)) byMarket.set(o.market, []);
    byMarket.get(o.market)!.push(o);
  }

  const lines = ["Guncel referans oranlar (uluslararasi bookmaker, Iddaa/Nesine ile birebir ayni degil), pazar bazinda:"];
  for (const [market, quotes] of byMarket) {
    lines.push(`${MARKET_LABELS[market] ?? market}:`);
    lines.push(...quotes.map((o) => `- ${o.bookmaker}: ${o.outcome} @ ${o.price}`));
  }
  const missingMandatory = MANDATORY_MARKETS.filter((m) => !byMarket.has(m));
  if (missingMandatory.length > 0) {
    lines.push(`Su pazarlar icin oran verisi yok, bunlar hakkinda yorum/tahmin yapma: ${missingMandatory.map((m) => MARKET_LABELS[m]).join(", ")}.`);
  }
  const extraMarketsPresent = [...byMarket.keys()].some((m) => !MANDATORY_MARKETS.includes(m));
  if (extraMarketsPresent) {
    lines.push(
      "Yukaridaki Taraf Bahsi/KG/2.5 disindaki pazarlar (ilk yari, handikap, gol atacak oyuncu vb.) opsiyoneldir - bunlar icin ayri zorunlu 'Tahminim:' formatinda tahmin YOK, ama asagidaki personalardan hangisi konusuyorsa bu verileri tamamen yok saymamali, en az birine kisaca deginmeli.",
    );
  }
  return lines.join("\n");
}

function buildSharedContext(input: AnalysisPromptInput): string {
  return [
    `Mac: ${input.homeTeam} - ${input.awayTeam}, ${input.kickoffAt}`,
    "",
    formatResearchContext(input.researchContext),
    "",
    formatOdds(input.odds),
    "",
    "Eksik veri varsa bunu acikca belirt, veri yokmus gibi davranma veya uydurma.",
  ].join("\n");
}

const NO_FABRICATION_RULE =
  "ASLA SAYI UYDURMA: Sana (arastirma veya oran olarak) verilmeyen hicbir sayisal veriyi (yuzde, ortalama, mac sayisi, gol sayisi, sure, KESIN SKOR orn. '1-0', '2-1') kendin uretme. Sadece acikca verilmis oran degerlerini ve arastirma metnindeki bilgileri kullan. Bir pazarin sonucundan bahsederken MUTLAKA o pazarin gercek 'outcome' etiketini kullan (orn. takim adi, 'Yes'/'No', 'Over'/'Under') - elde olmayan bir kesin skor veya detay UYDURMA.";

const HIGHLIGHT_RULE =
  "ONEMLI ISIM VURGUSU: Bir oyuncunun sakatligi/cezasi/eksikligi mac sonucunu onemli olcude etkileyebilecek kadar kritikse (orn. takimin en golcu oyuncusu sakat), o oyuncunun adini metinde **isim** seklinde (cift yildiz arasinda) isaretle. Sadece gercekten kritik olanlari isaretle - her ismi isaretlemek vurguyu anlamsizlastirir, arastirma yoksa hic isaretleme yapma.";

const PICK_FIELD_RULE =
  "YAPISAL TAHMIN ALANI: Metnindeki yoruma ek olarak, en guvendigin TEK pazar+sonuc ciftini ayri bir JSON alaninda belirt. Bu deger asagida sana verilen oran satirlarindan BIRIYLE birebir eslesmeli: market alani tam olarak su anahtarlardan biri olmali (h2h, totals, btts, h2h_h1, totals_h1, btts_h1, spreads, player_goal_scorer_anytime), outcome alani ise o pazardaki oran satirinin outcome metniyle AYNEN (harfi harfine) eslesmeli. Hicbir pazar icin yeterince emin degilsen veya oran verisi yoksa bu alani null birak - uydurma bir market veya outcome YAZMA.";

/**
 * Groq'a giden, mac icin "cekirdek" iki persona (Takim Analizcisi + Yorumcu)
 * artı ozet alanini isteyen prompt. Bahis Analizcisi ve Surpriz Yorumcu
 * ayri bir Gemini cagrisinda uretiliyor (bkz. buildBettingAndSurprisePrompt)
 * - iki sagliyiciya bolerek her birinin ucretsiz kota/rate-limit riskini
 * azaltiyoruz.
 */
export function buildTeamAndCommentaryPrompt(input: AnalysisPromptInput): string {
  return [
    "Sen bir futbol bahis analiz ekibisin. Asagidaki mac icin iki ayri persona olarak Turkce yorum uret:",
    "1. Takim Analizcisi: form, sakatlik, kart cezasi, onemli anlar (orn. play-off/sampiyonluk icin 3 puan gerekliligi) uzerinden yorum. Asagida sakatlik/form/H2H arastirmasi verilmisse bunu mutlaka kullan ve yorumuna somut sekilde yansit - 'arastirma yapilmadi' gibi bir ifade sadece arastirma gercekten mevcut degilse kullanilir.",
    "2. Yorumcu: genel mac yorumu VE her pazar icin net bir tahmin.",
    "Asagida hangi pazarlar icin oran verisi varsa (Taraf Bahsi/1X2, KG Var/Yok, 2.5 Alt/Ust) HER UCU icin de ayri ayri yorum ve tahmin uret - sadece taraf bahsine (1X2) odaklanip digerlerini atlama. Veri olmayan bir pazar hakkinda yorum yapma, bunu acikca belirt.",
    "Eger asagida ilk yari (1X2/1.5 Alt-Ust/KG), handikap veya gol atacak oyuncu pazarlarindan biri icin veri varsa, Yorumcu bunlardan en az birine ayri 'Tahminim:' cumlesi gerekmeden kisaca deginsin (orn. 'ilk yaride de X biraz daha avantajli gorunuyor') - bu verileri tamamen atlamak YASAK.",
    "ONEMLI - net tahmin kurali: Yorumcu persona'si, mevcut her pazar icin cekinmeden NET bir tahmin cumlesiyle bitirmeli, ornegin: 'Tahminim: MS 2', 'Tahminim: 2.5 Ust', 'Tahminim: KG Var'. 'Kesin bir sey soylemek zor', 'net bir tahminde bulunmak guc', 'iki yonlu de olasi' gibi cekingen/kacamak ifadeler YASAK - elindeki bilgiyle (oranlar, varsa arastirma) bir tarafi sec ve acikca soyle. Bu bir kesinlik iddiasi degil, olasilik degerlendirmesidir ama yine de net olmali.",
    "Ayrica kisa bir summary_text ozet alani uret (genel mac degerlendirmesi).",
    "",
    "OKUNABILIRLIK KURALI: Metinler bir spor sitesi yazarinin dogal, akici Turkcesiyle yazilmali - ust uste siralanan sayi/oran/istatistik listesi DEGIL. Cumle basina en fazla bir-iki sayi kullan (orn. 'favori', 'az farkla one cikiyor', 'oranlar dengeli' gibi nitel ifadeler tercih edilsin). Arastirma metni varsa oradaki bilgiyi kisa ve dogal bir sekilde ozetle, ham veriyi (her oyuncu icin ayri sakatlik suresi, her mac icin ayri skor) tek tek sayma - genel bir tabloya donustur ('X'te birkac eksik var, Y ise daha zinde' gibi).",
    NO_FABRICATION_RULE,
    HIGHLIGHT_RULE,
    PICK_FIELD_RULE,
    "",
    buildSharedContext(input),
    "",
    "Yanitini SADECE gecerli bir JSON nesnesi olarak ver, baska hicbir metin ekleme. JSON tam olarak su alanlari icermeli: team_analyst_text, commentator_text, summary_text (hepsi string), team_analyst_pick, commentator_pick (her biri {\"market\": string, \"outcome\": string} veya null).",
  ].join("\n");
}

/**
 * Gemini'ye giden, "sayisal agirlikli" iki persona (Bahis Analizcisi +
 * Surpriz Yorumcu) icin prompt.
 */
export function buildBettingAndSurprisePrompt(input: AnalysisPromptInput): string {
  return [
    "Sen bir futbol bahis analiz ekibisin. Asagidaki mac icin iki ayri persona olarak Turkce yorum uret:",
    "1. Bahis Analizcisi: istatistik + oran okumasi, value degerlendirmesi (oran varsa). Bu persona detayli oran rakamlarini (hangi sitede kac) kullanabilir, ama yine de dogal cumlelerle yaz - ham liste degil.",
    "2. Surpriz Yorumcu: favoriyi tekrarlamak yerine, macta cikabilecek daha az beklenen ama yuksek oranli sonuclari analiz eder. Elindeki pazarlari (Taraf Bahsi, varsa KG Var/Yok, varsa 2.5 Alt/Ust, varsa ilk yari pazarlari, handikap, gol atacak oyuncu) birlikte degerlendirip somut bir 'sürpriz kombinasyon' onerir - ornegin favori kazanir ama KG Var, favori kazanamaz + Alt, veya favorinin haricinde bir oyuncunun (surpriz secenegi varsa) gol atmasi gibi. Sadece iki ogeli bir oneri yeterli, daha fazlasi gerekmez. HER BACAK, asagida verilen oranlardaki gercek bir 'outcome' degerine karsilik gelmeli (orn. takim adi, 'Yes'/'No', 'Over'/'Under') - KESIN SKOR (orn. '1-0') UYDURMA, elindeki veri sadece kazanan/berabere veya alt/ust bilgisi, mac skoru degil. Bir bacak ilk yari pazarindan geliyorsa bunu acikca 'Ilk yari: ...' diye belirt ve diger bacaktan zaman kapsami olarak ayirt et (orn. 'Ilk yari: X kazanir' ile 'Mac sonu: KG Var' gibi, ikisini ayni sey gibi anlatip celiski yaratma). ONEMLI: Iddaa/Bilyoner/Nesine gibi Turkiye sitelerinden SPESIFIK bir oran sayisi UYDURMA (bu sitelere erisimin yok) - sadece asagida verilen uluslararasi referans oranlardan kombinasyonun YAKLASIK oranini hesapla (ilgili iki oranı çarparak kabaca tahmin edebilirsin) ve bunun uluslararasi referans oldugunu, Turkiye sitelerindeki gercek oranin farkli olabilecegini belirt. Sadece taraf bahsi verisi varsa, digerleri olmadan da (orn. beklenmedik bir sonuc vurgusu ile) bir surpriz senaryosu sunmaya calis, veri yetersizse bunu acikca soyle.",
    "",
    "OKUNABILIRLIK KURALI: Surpriz Yorumcu dogal, akici Turkce yazsin, sayi/oran listesi gibi degil. Bahis Analizcisi rakamlari kullanabilir ama tam cumleler halinde.",
    NO_FABRICATION_RULE,
    HIGHLIGHT_RULE,
    PICK_FIELD_RULE,
    "surprise_combo_pick icin: onerdigin kombinasyonun iki bacagindan EN ONE CIKAN/en carpici olanini (tek market+outcome) sec, ikisini ayni alanda birlestirmeye calisma.",
    "",
    buildSharedContext(input),
    "",
    "Yanitini SADECE gecerli bir JSON nesnesi olarak ver, baska hicbir metin ekleme. JSON tam olarak su alanlari icermeli: betting_analyst_text, surprise_pick_text (hepsi string), betting_analyst_pick, surprise_combo_pick (her biri {\"market\": string, \"outcome\": string} veya null).",
  ].join("\n");
}
