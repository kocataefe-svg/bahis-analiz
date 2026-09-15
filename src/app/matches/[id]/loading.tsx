import styles from "./loading.module.css";

export default function MatchDetailLoading() {
  return (
    <main className={styles.page}>
      <div className={`${styles.line} skeleton`} style={{ width: "35%", height: 12 }} />
      <div className={`${styles.line} skeleton`} style={{ width: "70%", height: 22, marginTop: 4 }} />
      <div className={`${styles.line} skeleton`} style={{ width: "40%", height: 14, marginTop: 8 }} />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className={`${styles.section} skeleton`} />
      ))}
    </main>
  );
}
