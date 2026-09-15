import styles from "./loading.module.css";

export default function HomeLoading() {
  return (
    <main className={styles.page}>
      <div className={`${styles.bar} skeleton`} style={{ width: "70%" }} />
      <div className={styles.section}>
        <div className={`${styles.bar} skeleton`} style={{ width: "40%", height: 16 }} />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`${styles.row} skeleton`} />
        ))}
      </div>
    </main>
  );
}
