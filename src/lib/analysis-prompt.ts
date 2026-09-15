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
  const extraMarketsPresent = Object.keys(byMarket).some((m) => !MANDATORY_MARKETS.includes(m));
  if (extraMarketsPresent) {
    lines.push(
      "Yukaridaki Taraf Bahsi/KG/2.5 disindaki pazarlar (ilk yari, handikap, gol atacak oyuncu vb.) opsiyoneldir - bunlar icin ayri zorunlu tahmin YOK, ama Bahis Analizcisi ve Surpriz Yorumcu firsat buldukca (kisa sekilde) bu verilerden yararlanabilir.",
    );
  }
  return lines.join("\n");
}

export function buildAnalysisPrompt(input: AnalysisPromptInput): string {
  return [
    "Sen bir futbol bahis analiz ekibisin. Asagidaki mac icin dort ayri persona olarak Turkce yorum uret:",
    "1. Takim Analizcisi: form, sakatlik, kart cezasi, onemli anlar (orn. play-off/sampiyonluk icin 3 puan gerekliligi) uzerinden yorum. Asagida sakatlik/form/H2H arastirmasi verilmisse (bkz. altta) bunu mutlaka kullan ve yorumuna somut sekilde yansit - 'arastirma yapilmadi' gibi bir ifade sadece arastirma gercekten mevcut degilse kullanilir.",
    "2. Bahis Analizcisi: istatistik + oran okumasi, value degerlendirmesi (oran varsa).",
    "3. Yorumcu: genel mac yorumu VE her pazar icin net bir tahmin.",
    "4. Surpriz Yorumcu: favoriyi tekrarlamak yerine, macta cikabilecek daha az beklenen ama yuksek oranli sonuclari analiz eder. Elindeki pazarlari (Taraf Bahsi, varsa KG Var/Yok, varsa 2.5 Alt/Ust, varsa ilk yari pazarlari, handikap, gol atacak oyuncu) birlikte degerlendirip somut bir 'sürpriz kombinasyon' onerir - ornegin favori kazanir ama KG Var, favori kazanamaz + Alt, veya favorinin haricinde bir oyuncunun (surpriz secenegi varsa) gol atmasi gibi. Sadece iki ogeli bir oneri yeterli, daha fazlasi gerekmez. ONEMLI: Iddaa/Bilyoner/Nesine gibi Turkiye sitelerinden SPESIFIK bir oran sayisi UYDURMA (bu sitelere erisimin yok) - sadece asagida verilen uluslararasi referans oranlardan kombinasyonun YAKLASIK oranini hesapla (ilgili iki oranı çarparak kabaca tahmin edebilirsin) ve bunun uluslararasi referans oldugunu, Turkiye sitelerindeki gercek oranin farkli olabilecegini belirt. Sadece taraf bahsi verisi varsa, digerleri olmadan da (orn. beklenmedik bir skor/sonuc vurgusu ile) bir surpriz senaryosu sunmaya calis, veri yetersizse bunu acikca soyle.",
    "Asagida hangi pazarlar icin oran verisi varsa (Taraf Bahsi/1X2, KG Var/Yok, 2.5 Alt/Ust) HER UCU icin de ayri ayri yorum ve tahmin uret - sadece taraf bahsine (1X2) odaklanip digerlerini atlama. Veri olmayan bir pazar hakkinda yorum yapma, bunu acikca belirt.",
    "ONEMLI - net tahmin kurali: Yorumcu persona'si, mevcut her pazar icin cekinmeden NET bir tahmin cumlesiyle bitirmeli, ornegin: 'Tahminim: MS 2', 'Tahminim: 2.5 Ust', 'Tahminim: KG Var'. 'Kesin bir sey soylemek zor', 'net bir tahminde bulunmak guc', 'iki yonlu de olasi' gibi cekingen/kacamak ifadeler YASAK - elindeki bilgiyle (oranlar, varsa arastirma) bir tarafi sec ve acikca soyle. Bu bir kesinlik iddiasi degil, olasilik degerlendirmesidir ama yine de net olmali. Mantikli bir kombinasyon varsa (orn. KG Var + 2.5 Alt), tek pazarlik tahminlerin sonuna ek olarak 'Kombine onerim: <iki secim>' seklinde bir kombine tahmin de ekleyebilirsin - bu opsiyoneldir, zorunlu degil.",
    "Ayrica kisa bir summary_text ozet alani uret.",
    "",
    "OKUNABILIRLIK KURALI: Metinler bir spor sitesi yazarinin dogal, akici Turkcesiyle yazilmali - ust uste siralanan sayi/oran/istatistik listesi DEGIL. Takim Analizcisi, Yorumcu ve Surpriz Yorumcu personalari cumle basina en fazla bir-iki sayi kullansin (orn. 'favori', 'az farkla one cikiyor', 'oranlar dengeli' gibi nitel ifadeler tercih edilsin); detayli oran rakamlarini (hangi sitede kac) sadece Bahis Analizcisi kullanabilir, o da her cumlede degil, gerektikce. Arastirma metni varsa oradaki bilgiyi kisa ve dogal bir sekilde ozetle, ham veriyi (her oyuncu icin ayri sakatlik suresi, her mac icin ayri skor) tek tek sayma - genel bir tabloya donustur ('X'te birkac eksik var, Y ise daha zinde' gibi).",
    "ASLA SAYI UYDURMA: Yukarida (arastirma veya oran olarak) sana verilmeyen hicbir sayisal veriyi (yuzde, ortalama, mac sayisi, gol sayisi, sure) kendin uretme. Sadece asagida acikca verilmis oran degerlerini ve arastirma metnindeki bilgileri kullan.",
    "",
    `Mac: ${input.homeTeam} - ${input.awayTeam}, ${input.kickoffAt}`,
    "",
    formatResearchContext(input.researchContext),
    "",
    formatOdds(input.odds),
    "",
    "Eksik veri varsa bunu acikca belirt, veri yokmus gibi davranma veya uydurma.",
  ].join("\n");
}
