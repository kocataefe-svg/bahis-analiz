/**
 * The Odds API'nin eu bolgesinde onlarca bookmaker donduruyor - hepsini
 * gostermek listeyi okunmaz yapiyor. Tercih edilen (taninmis/tutarli)
 * siteler bunlar; ama bir pazarda bunlardan hicbiri yoksa (kapsama
 * lig/bolgeye gore degisir) o pazarda bulunan herhangi bir siteye
 * dusulur - boylece o pazar hic gosterilmeyip her ziyarette bosuna
 * tekrar API cagrisi yapilmaz.
 */
export const DISPLAY_BOOKMAKERS = ["pinnacle", "unibet_nl"];

/** Bir pazar icin en fazla kac farkli bookmaker gosterilecek/saklanacak. */
export const MAX_BOOKMAKERS_PER_MARKET = 2;

/**
 * Verilen oran listesini, HER MAC + HER PAZAR kombinasyonu icin ayri ayri,
 * tercih edilen sitelere oncelik vererek en fazla MAX_BOOKMAKERS_PER_MARKET
 * farkli bookmaker'a indirger. Tercih edilenlerden hicbiri o mac+pazarda
 * yoksa, orada bulunan diger sitelerden doldurulur.
 *
 * Gruplama mac (eventId) bazinda yapilir - aksi halde coklu-mac bir toplu
 * senkronda (orn. bir ligin tum maclari) "tercih edilen site A ligin
 * BASKA bir macinda var" diye bir mac icin yanlislikla sifir satir
 * birakilabilirdi.
 */
export function limitBookmakersPerMarket<T extends { market: string; bookmaker: string; eventId?: string }>(
  quotes: T[],
): T[] {
  const byGroup = new Map<string, T[]>();
  for (const q of quotes) {
    const key = `${q.eventId ?? ""}::${q.market}`;
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key)!.push(q);
  }

  const result: T[] = [];
  for (const groupQuotes of byGroup.values()) {
    const bookmakersInGroup = [...new Set(groupQuotes.map((q) => q.bookmaker))];
    const preferred = DISPLAY_BOOKMAKERS.filter((b) => bookmakersInGroup.includes(b));
    const others = bookmakersInGroup.filter((b) => !DISPLAY_BOOKMAKERS.includes(b));
    const chosen = new Set([...preferred, ...others].slice(0, MAX_BOOKMAKERS_PER_MARKET));
    result.push(...groupQuotes.filter((q) => chosen.has(q.bookmaker)));
  }
  return result;
}
