import { Fragment } from "react";

/**
 * AI metinlerinde **isim** seklinde isaretlenmis kritik oyuncu/takim adlarini
 * (sakatlik, ceza, belirleyici etki vb.) renkli vurgu olarak render eder.
 * Duz metinde kalan cift yildizlar (orn. arastirma ciktisinin markdown
 * kalintilari) da ayni sekilde temizlenmis olur.
 */
export function HighlightedText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="highlighted-text-mark">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
