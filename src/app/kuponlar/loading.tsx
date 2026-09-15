import styles from "./loading.module.css";

export default function KuponlarLoading() {
  return (
    <main className={styles.page}>
      <div className={`${styles.line} skeleton`} style={{ width: "40%", height: 20 }} />
      <div className={`${styles.panel} skeleton`} />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className={`${styles.card} skeleton`} />
      ))}
    </main>
  );
}
