export interface LeagueCatalogEntry {
  name: string;
  country: string;
  oddsApiSportKey: string | null;
}

export const LEAGUE_CATALOG: LeagueCatalogEntry[] = [
  { name: "Premier League", country: "İngiltere", oddsApiSportKey: "soccer_epl" },
  { name: "Championship", country: "İngiltere", oddsApiSportKey: "soccer_efl_champ" },
  { name: "La Liga", country: "İspanya", oddsApiSportKey: "soccer_spain_la_liga" },
  { name: "Serie A", country: "İtalya", oddsApiSportKey: "soccer_italy_serie_a" },
  { name: "Bundesliga", country: "Almanya", oddsApiSportKey: "soccer_germany_bundesliga" },
  { name: "Ligue 1", country: "Fransa", oddsApiSportKey: "soccer_france_ligue_one" },
  { name: "Süper Lig", country: "Türkiye", oddsApiSportKey: "soccer_turkey_super_league" },
  { name: "Eliteserien", country: "Norveç", oddsApiSportKey: "soccer_norway_eliteserien" },
  { name: "Allsvenskan", country: "İsveç", oddsApiSportKey: "soccer_sweden_allsvenskan" },
  { name: "Super League", country: "İsviçre", oddsApiSportKey: "soccer_switzerland_superleague" },
  { name: "Eredivisie", country: "Hollanda", oddsApiSportKey: "soccer_netherlands_eredivisie" },
  { name: "Şampiyonlar Ligi", country: "Avrupa", oddsApiSportKey: "soccer_uefa_champs_league" },
  { name: "Avrupa Ligi", country: "Avrupa", oddsApiSportKey: "soccer_uefa_europa_league" },
  {
    name: "Milli Maçlar (Dünya Kupası Elemeleri - Avrupa)",
    country: "Avrupa",
    oddsApiSportKey: "soccer_fifa_world_cup_qualifiers_europe",
  },
];
