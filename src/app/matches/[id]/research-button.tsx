"use client";

import { useActionState } from "react";
import { researchMatch, type ResearchMatchState } from "./research-actions";
import styles from "./research-button.module.css";

const initialState: ResearchMatchState = { error: null };

export function ResearchButton({ matchId }: { matchId: string }) {
  const action = researchMatch.bind(null, matchId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className={styles.form}>
      {state.error && (
        <p role="alert" className={styles.error}>
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={styles.button}>
        {pending ? "Arastiriliyor..." : "Arastir"}
      </button>
    </form>
  );
}
