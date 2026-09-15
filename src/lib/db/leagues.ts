import type { SupabaseClient } from "@supabase/supabase-js";

export interface SyncLeague {
  id: string;
  oddsApiSportKey: string | null;
}

export async function getActiveLeagues(supabase: SupabaseClient): Promise<SyncLeague[]> {
  const { data, error } = await supabase.from("leagues").select("id, odds_api_sport_key").eq("active", true);

  if (error) throw new Error(`Ligler alinamadi: ${error.message}`);

  interface RawLeagueRow {
    id: string;
    odds_api_sport_key: string | null;
  }

  return ((data ?? []) as RawLeagueRow[]).map((row) => ({
    id: row.id,
    oddsApiSportKey: row.odds_api_sport_key,
  }));
}

export interface DisplayLeague {
  id: string;
  name: string;
  country: string;
}

export async function getActiveLeaguesForDisplay(supabase: SupabaseClient): Promise<DisplayLeague[]> {
  const { data, error } = await supabase
    .from("leagues")
    .select("id, name, country")
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) throw new Error(`Ligler alinamadi: ${error.message}`);

  interface RawRow {
    id: string;
    name: string;
    country: string;
  }

  return ((data ?? []) as RawRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    country: row.country,
  }));
}

export interface LeagueWithSportKey extends DisplayLeague {
  oddsApiSportKey: string | null;
}

export async function getLeagueById(supabase: SupabaseClient, id: string): Promise<LeagueWithSportKey | null> {
  const { data, error } = await supabase
    .from("leagues")
    .select("id, name, country, odds_api_sport_key")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Lig alinamadi: ${error.message}`);
  if (!data) return null;

  const row = data as { id: string; name: string; country: string; odds_api_sport_key: string | null };
  return { id: row.id, name: row.name, country: row.country, oddsApiSportKey: row.odds_api_sport_key };
}
