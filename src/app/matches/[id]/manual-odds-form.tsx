"use client";

import { useActionState } from "react";
import { submitManualOdds, type ManualOddsFormState } from "./actions";
import styles from "./manual-odds-form.module.css";

const initialState: ManualOddsFormState = { error: null, success: false };

export function ManualOddsForm({
  matchId,
  homeTeam,
  awayTeam,
}: {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
}) {
  const action = submitManualOdds.bind(null, matchId, homeTeam, awayTeam);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className={styles.form}>
      <p className={styles.disclaimer}>
        Gordugunuz oran, uluslararasi referans oranla birebir ayni olmayabilir (bkz. yukaridaki fark tablosu).
      </p>
      <label className={styles.label}>
        Adiniz
        <input type="text" name="enteredBy" required className={styles.input} />
      </label>
      <label className={styles.label}>
        {homeTeam} kazanir
        <input type="number" step="0.01" min="1.01" name="homePrice" className={styles.input} />
      </label>
      <label className={styles.label}>
        Beraberlik
        <input type="number" step="0.01" min="1.01" name="drawPrice" className={styles.input} />
      </label>
      <label className={styles.label}>
        {awayTeam} kazanir
        <input type="number" step="0.01" min="1.01" name="awayPrice" className={styles.input} />
      </label>
      {state.error && (
        <p role="alert" className={styles.error}>
          {state.error}
        </p>
      )}
      {state.success && <p className={styles.success}>Kaydedildi.</p>}
      <button type="submit" disabled={pending} className={styles.submit}>
        {pending ? "Kaydediliyor..." : "Kaydet"}
      </button>
    </form>
  );
}
