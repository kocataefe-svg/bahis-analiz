export interface LeagueCatalogEntry {
  name: string;
  country: string;
  apiFootballSearchName: string;
  apiFootballSearchCountry: string;
  oddsApiSportKey: string | null;
}

export const LEAGUE_CATALOG: LeagueCatalogEntry[] = [
  { name: "Premier League", country: "İngiltere", apiFootballSearchName: "Premier League", apiFootballSearchCountry: "England", oddsApiSportKey: "soccer_epl" },
  { name: "Championship", country: "İngiltere", apiFootballSearchName: "Championship", apiFootballSearchCountry: "England", oddsApiSportKey: "soccer_efl_champ" },
  { name: "La Liga", country: "İspanya", apiFootballSearchName: "La Liga", apiFootballSearchCountry: "Spain", oddsApiSportKey: "soccer_spain_la_liga" },
  { name: "Serie A", country: "İtalya", apiFootballSearchName: "Serie A", apiFootballSearchCountry: "Italy", oddsApiSportKey: "soccer_italy_serie_a" },
  { name: "Bundesliga", country: "Almanya", apiFootballSearchName: "Bundesliga", apiFootballSearchCountry: "Germany", oddsApiSportKey: "soccer_germany_bundesliga" },
  { name: "Ligue 1", country: "Fransa", apiFootballSearchName: "Ligue 1", apiFootballSearchCountry: "France", oddsApiSportKey: "soccer_france_ligue_one" },
  { name: "Süper Lig", country: "Türkiye", apiFootballSearchName: "Super Lig", apiFootballSearchCountry: "Turkey", oddsApiSportKey: "soccer_turkey_super_league" },
  { name: "TFF 1. Lig", country: "Türkiye", apiFootballSearchName: "1. Lig", apiFootballSearchCountry: "Turkey", oddsApiSportKey: null },
  { name: "Eliteserien", country: "Norveç", apiFootballSearchName: "Eliteserien", apiFootballSearchCountry: "Norway", oddsApiSportKey: "soccer_norway_eliteserien" },
  { name: "Allsvenskan", country: "İsveç", apiFootballSearchName: "Allsvenskan", apiFootballSearchCountry: "Sweden", oddsApiSportKey: "soccer_sweden_allsvenskan" },
  { name: "Super League", country: "İsviçre", apiFootballSearchName: "Super League", apiFootballSearchCountry: "Switzerland", oddsApiSportKey: "soccer_switzerland_superleague" },
  { name: "Eredivisie", country: "Hollanda", apiFootballSearchName: "Eredivisie", apiFootballSearchCountry: "Netherlands", oddsApiSportKey: "soccer_netherlands_eredivisie" },
  { name: "Şampiyonlar Ligi", country: "Avrupa", apiFootballSearchName: "UEFA Champions League", apiFootballSearchCountry: "World", oddsApiSportKey: "soccer_uefa_champs_league" },
  { name: "Avrupa Ligi", country: "Avrupa", apiFootballSearchName: "UEFA Europa League", apiFootballSearchCountry: "World", oddsApiSportKey: "soccer_uefa_europa_league" },
  { name: "Milli Maçlar (Dünya Kupası Elemeleri - Avrupa)", country: "Avrupa", apiFootballSearchName: "World Cup - Qualification Europe", apiFootballSearchCountry: "World", oddsApiSportKey: "soccer_fifa_world_cup_qualifiers_europe" },
];
