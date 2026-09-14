# Bahis Analiz Uygulaması — Tasarım Spec'i

**Tarih:** 2026-09-08 (2026-09-14'te veri kaynağı mimarisi düzeltildi — bkz. §3)
**Durum:** Onay bekliyor (kullanıcı incelemesi)

## 1. Amaç

Kullanıcının (ve 3-5 arkadaşının) seçtiği Avrupa/Türkiye liglerindeki maçlar için:
- Güncel oran verisi
- İsteğe bağlı, tek tıkla tetiklenen sakatlık/form/H2H araştırması (Gemini + Google Search grounding)
- Çok personalı bir AI "bahis analiz ekibi" tarafından üretilen yazılı yorum/analiz

sunan, mobil uyumlu, tamamen ücretsiz altyapı üzerinde çalışan bir web uygulaması.

**Kapsam dışı (bu spec'te değil):** Gerçek para ile bahis oynatma, gerçek bahis hacmi verisi (hiçbir ücretsiz/ücretli kaynakta yok), tam üyelik/kayıt sistemi, native mobil uygulama.

## 2. Mimari

```
┌─────────────────┐      ┌──────────────────────┐      ┌─────────────────┐
│  Next.js (Vercel)│◄────►│ Supabase (Postgres)   │◄────►│ GitHub Actions   │
│  - UI (lig/maç    │      │ - leagues              │      │ (zamanlanmış)     │
│    seçimi)         │      │ - matches              │      │ - API route'larını│
│  - API routes      │      │ - odds_snapshots       │      │   HTTP ile tetikler│
│  - Analiz görünümü │      │ - ai_analyses          │      │ - veri çekme + AI  │
└─────────────────┘      │ - manual_odds (kullanıcı│      │   analiz iş route'ta│
                            │   girişi)               │      │   çalışır          │
                            └──────────────────────┘      └─────────────────┘
```

- **Frontend + Backend:** Next.js (App Router), tek proje, Vercel'e deploy.
- **Veritabanı:** Supabase (ücretsiz Postgres planı).
- **Zamanlanmış veri çekme:** ~~Vercel Cron~~ **GitHub Actions scheduled workflow** (ücretsiz, sınırsız zamanlama) → HTTP ile korumalı bir API route'unu tetikler (paylaşılan sır/`CRON_SECRET` header ile) → route veri çeker → DB'ye yazar. Vercel'in ücretsiz (Hobby) planındaki cron job'ları günde en fazla 1 kez çalışabildiği için (doğrulanmış kısıt), günde birden fazla tetikleme ihtiyacı GitHub Actions ile karşılanıyor — repo GitHub'da olduğu için ek maliyet yok.
- **AI analiz üretimi:** Aynı akış içinde, yeni/güncellenmiş maçlar için Gemini API çağrılır, sonuç DB'ye yazılır (kullanıcı sayfa açtığında yeniden üretilmez — maliyet ve hız için cache şart).

## 3. Veri kaynakları

> **2026-09-14 düzeltmesi — API-Football canlı testte kullanılamaz çıktı:** Gerçek deploy'da API-Football'un ücretsiz planının **hesap genelinde** güncel sezona (2026) hiç erişimi olmadığı doğrulandı (`{"errors":{"plan":"Free plans do not have access to this season, try from 2022 to 2024."}}`) — fikstür, sakatlık, `last=N` (son maç formu) uçlarının hepsinde, sezon parametresi verilen her istekte aynı hata alındı. Bu, ilk tasarımda öngörülemeyen, sadece canlı test ile ortaya çıkan bir kısıt. Sonuç: **API-Football tamamen çıkarıldı.** Fikstür artık The Odds API'nin kendi event listesinden geliyor; sakatlık/form/H2H ise aşağıda açıklanan Gemini tabanlı isteğe bağlı araştırmaya devredildi. Maçkolik/İddaa/Nesine/Sofascore/TheSportsDB gibi alternatifler ayrıca araştırıldı ve reddedildi (AI-crawler'ı `robots.txt`/`Content-Signal` ile engelliyorlar, veya İddaa/Nesine gibi lisanslı bahis tekeli + Sportradar/Betradar lisanslı veri riski taşıyorlar) — bkz. altta "Sakatlık/form/H2H" maddesi.

| Kaynak | Ne için | Plan | Limit |
|---|---|---|---|
| The Odds API | Fikstür (event id/takım/başlama saati) + bookmaker oranları (1X2 / maç sonucu) | Ücretsiz | 500 kredi/ay (kredi = istek değil, piyasa×bölge başına) |
| Gemini API (Google) | AI analiz metni üretimi (arka plan) + isteğe bağlı sakatlık/form/H2H araştırması (Google Search grounding, kullanıcı tetikler) | Ücretsiz | Flash-Lite: 1500 istek/gün, 30 istek/dk; Search grounding: 5.000 istek/ay (Gemini 3.x, paylaşımlı) |

**Önemli kısıtlamalar (kullanıcıya açıkça gösterilecek):**
- Oranlar uluslararası bookmaker'lardan gelir, İddaa/Nesine/Bilyoner'in kendi oranı **değildir**. İddaa marjı (~%23) uluslararası "sharp" kitapçılara (~%2-3) göre çok daha yüksektir — yani gösterilen oran, gerçek oynadığınız sitedeki oranla birebir aynı olmayacaktır.
- "Bu orana ne kadar oynandığı" (gerçek bahis hacmi) hiçbir kaynakta yoktur. Bunun yerine kendi periyodik çekimlerimizden **oran zaman serisi** ("oran 48 saatte X'ten Y'ye değişti") gösterilir — bu gerçek ve ücretsiz bir veridir, hacim verisi değildir, arayüzde bu fark netçe belirtilir.
- **TFF 1. Lig kapsam dışı:** The Odds API bu ligi kapsamıyor (doğrulanmış — `/v4/sports` listesinde yok). Fikstür artık tamamen Odds API'den geldiği için bu lig katalogdan tamamen çıkarıldı (ne fikstür ne oran var).
- **KG Var/Yok (BTTS) otomatik çekimde yok:** The Odds API bu piyasayı toplu (`/sports/{key}/odds`) endpoint'inde sunmuyor — sadece maç başına ayrı bir endpoint'te (kotayı hızla tüketir) mevcut. Bu yüzden **sadece 1X2 (maç sonucu, `h2h`) oranı** otomatik çekiliyor.
- **Kota hesabı:** The Odds API krediyi **istek başına değil, piyasa×bölge başına** faturalandırıyor. 13 lig (TFF 1. Lig hariç, Milli Maçlar dahil) × 1 piyasa (`h2h`) × 1 bölge (`eu`) × günde 1 senkron × 30 gün ≈ **390 kredi/ay** — 500 kredi/ay kotasının içinde. Aynı çağrı hem fikstürü hem oranı getirdiği için (Odds API event objesi `id`/`home_team`/`away_team`/`commence_time`'ı bookmaker verisiyle birlikte döndürüyor) fikstür senkronu ek kota **tüketmiyor**.
- **Sakatlık/form/H2H artık isteğe bağlı, arka planda otomatik değil:** API-Football'un kullanılamaz çıkması üzerine, maç detay sayfasında bir **"Araştır" butonu** var. Tıklanınca Gemini, Google Search grounding aracıyla genel spor haberi kaynaklarını (kulüp siteleri, TFF, Transfermarkt, spor basını) arar; sakatlık/ceza, her iki takımın son 5 resmi maçı ve varsa aralarındaki son karşılaşmaları serbest metin olarak özetler, kaynak linkleriyle birlikte. Sonuç DB'de saklanır (`match_research`), aynı maça tekrar tıklayan başka bir kullanıcı yeni bir Gemini çağrısı tetiklemez, kayıtlı sonucu görür. Bu veri **kesin/yapılandırılmış istatistik değil**, AI'nin bulabildiği güncel haber/kaynak özetidir — emin olmadığı bilgiyi "bulunamadı" diyerek belirtmesi promptla zorunlu kılınır, uydurma riskini azaltır (canlı testte doğrulandı). Maçkolik/İddaa/Nesine'nin oran verisine veya JS ile yüklenen sayfalarına bu araştırma **erişmiyor** — bunlar test edildi ve hem teknik (JS-render, veri gelmiyor) hem hukuki (İddaa/Nesine lisanslı bahis tekeli + Sportradar/Betradar veri riski, Maçkolik'in `robots.txt`'i `anthropic-ai`'ı engelliyor) nedenlerle kapsam dışı bırakıldı; bu araştırma sadece genel (bahis dışı) spor haberciliği kaynaklarını tarıyor.
- **Gemini model güncellemesi (Plan 3 öncesi düzeltme):** İlk tasarımda seçilen `gemini-2.5-flash-lite`'ın Ekim 2026'da (yaklaşık 16-20 Ekim) emekliye ayrılacağı doğrulandı — Plan 3'ün üzerine kurulacağı bir modelin bir ay içinde kaldırılması riskli olduğundan, **`gemini-3.5-flash-lite`** kullanılacak (aynı ücretsiz tier, hatta biraz daha yüksek limit: 1500 istek/gün, 30 istek/dk, retirement tarihi duyurulmamış). SDK tarafı da güncel: arka plan analiz üretimi `ai.interactions.create({ model, input, response_format: {...} })` ile yapılandırılmış JSON döndürür; isteğe bağlı araştırma ise `ai.models.generateContent({ model, contents, config: { tools: [{ googleSearch: {} }] } })` ile serbest metin + kaynak listesi döndürür (iki farklı çağrı şekli, iki farklı amaç).

## 4. Varsayılan lig listesi (kullanıcı checkbox ile seçer)

- İngiltere: Premier League, Championship
- İspanya: La Liga
- İtalya: Serie A
- Almanya: Bundesliga
- Fransa: Ligue 1
- Türkiye: Süper Lig (**TFF 1. Lig kapsam dışı — bkz. §3**)
- Norveç: Eliteserien
- İsveç: Allsvenskan
- İsviçre: Super League
- Hollanda: Eredivisie
- Avrupa kupaları: Şampiyonlar Ligi, Avrupa Ligi
- Milli maçlar (aktif dönemde: EURO/Dünya Kupası eleme/final maçları)

Liste kod içinde yapılandırılabilir bir sabit olacak (yeni lig eklemek kolay olacak şekilde).

## 5. Kullanıcı akışı

1. Ana sayfada lig listesi checkbox olarak gösterilir → seçilen liglerin güncel/yaklaşan maçları listelenir.
2. Kullanıcı bir maça tıklar → detay sayfası açılır:
   - Güncel referans oran + oran geçmişi grafiği (The Odds API + kendi snapshot'larımız)
   - 3 persona analiz: **Takım Analizcisi** (form/sakatlık/önemli an yorumu — örn. "play-off için 3 puana mecburlar"), **Bahis Analizcisi** (istatistik + oran okuma, value değerlendirmesi), **Yorumcu** (genel maç yorumu/tahmini) — bu analiz artık sadece oran verisine dayanıyor, sakatlık/form verisi yoksa promptta bu açıkça belirtiliyor
   - Genel "AI görüşü" özet kutusu
   - **"Araştır" butonu:** tıklanınca Gemini (Google Search grounding) sakatlık/ceza, son 5 maç formu ve varsa H2H geçmişini kaynaklı bir metin olarak getirir; sonuç kalıcıdır, tekrar tıklanınca yeniden sorgulanmaz
   - "İddaa/Bilyoner'de gördüğünüz oranı girin" alanı → girilirse referans oranla fark ve yorum gösterilir

## 6. Veri modeli (özet)

- `leagues`: id, name, country, odds_api_sport_key, active (checkbox için)
- `matches`: id, league_id, home_team, away_team, kickoff_at, odds_api_event_id (Odds API'nin döndürdüğü stabil event id, unique)
- `odds_snapshots`: match_id, market, outcome, bookmaker, price, fetched_at (zaman serisi için append-only)
- `ai_analyses`: match_id, generated_at, team_analyst_text, betting_analyst_text, commentator_text, summary_text, model_used
- `manual_odds`: match_id, entered_by, market, outcome, price, entered_at
- `match_research`: match_id (unique), content (metin), sources (json — {url,title}[]), model_used, generated_at — "Araştır" butonunun sonucu, maç başına tek kayıt

**Kaldırılan:** `team_stats_snapshots` tablosu ve `leagues.api_football_id`/`current_season`, `matches.api_football_fixture_id`/`home_team_api_id`/`away_team_api_id` kolonları — API-Football'un çıkarılmasıyla birlikte tamamen gereksiz kaldı.

## 7. Hata yönetimi

- API kotası dolarsa: o döngü atlanır, log'lanır, bir sonraki job'da devam edilir. Arayüzde veri "X saat önce güncellendi" notu ile gösterilir, sayfa kırılmaz.
- Gemini analiz üretimi başarısız olursa (rate limit/hata): eski analiz (varsa) gösterilmeye devam eder, "analiz güncellenemedi" notu düşülür; job bir sonraki döngüde tekrar dener.
- Sakatlık/form verisi artık arka planda çekilmiyor (bkz. §3); analiz promptunda bu veri hep "mevcut değil" olarak işaretlenir, AI buna göre temkinli yorum üretir.
- "Araştır" butonu Gemini hatası/timeout alırsa: kullanıcıya "araştırma başarısız, tekrar deneyin" gösterilir, `match_research` kaydı oluşturulmaz, buton tekrar tıklanabilir kalır.

## 8. Erişim/güvenlik

- Auth/şifre koruması yok — uygulama linki bilen herkese açık (kullanıcının tercihi: 3-5 kişilik güven çevresi için gereksiz karmaşıklık). İleride ihtiyaç olursa eklenebilir.
- API anahtarları (API-Football, The Odds API, Gemini, Supabase) sunucu tarafı env variable olarak tutulur, client'a asla gönderilmez.

## 9. Maliyet özeti

| Kalem | Maliyet |
|---|---|
| Hosting (Vercel) | $0 |
| Veritabanı (Supabase) | $0 |
| Fikstür + oran verisi (The Odds API) | $0 |
| AI analiz + isteğe bağlı araştırma (Gemini 3.5 Flash-Lite + Search grounding) | $0 |
| **Toplam** | **$0/ay** |

Not: Ücretsiz kotalar aşılırsa (çok yoğun kullanım) ilk aşılacak muhtemelen The Odds API'nin aylık 500 istek limiti olur — bu durumda çekim sıklığı azaltılır ya da seçili lig sayısı kısıtlanır, ek ücret ödemeden yönetilebilir.

## 10. Test yaklaşımı

- Veri çekme job'ları için: API'lerden dönen örnek yanıtlarla (mock/fixture) birim testleri.
- AI analiz üretimi için: prompt'a verilen örnek veri ile üretilen çıktının beklenen alanları (3 persona + özet) içerdiğini doğrulayan testler (içerik doğruluğu değil, yapı doğruluğu test edilir).
- Arayüz için: temel akış (giriş → lig seçimi → maç listesi → detay sayfası) manuel/entegrasyon testi ile doğrulanır.

## 11. Açık riskler

- Gemini ücretsiz kotasının kullanım verisini ürün geliştirme amacıyla kullanabilmesi — hassas olmayan spor verisi olduğu için düşük risk kabul edildi.
- Referans oranların İddaa oranlarından farklı olması nedeniyle "value bet" yorumlarının yanıltıcı algılanma riski — arayüzde bu net şekilde uyarı olarak belirtilecek.
- "Araştır" özelliğinin ürettiği sakatlık/form/H2H bilgisi resmi bir API'den değil, Gemini'nin serbest web aramasından geliyor — yanlış/eksik olabilir, kaynak linkleriyle birlikte "AI tarafından araştırıldı, doğrulayın" notuyla gösterilecek.
- Odds API'nin takım isimlendirmesi bazen resmi kaynaklardan (örn. Transfermarkt, TFF) farklı olabilir — "Araştır" prompt'unun doğru takımı bulduğunu garanti etmez, sonuçta bu husus kontrol edilecek.
