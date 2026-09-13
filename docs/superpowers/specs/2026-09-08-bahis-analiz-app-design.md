# Bahis Analiz Uygulaması — Tasarım Spec'i

**Tarih:** 2026-09-08
**Durum:** Onay bekliyor (kullanıcı incelemesi)

## 1. Amaç

Kullanıcının (ve 3-5 arkadaşının) seçtiği Avrupa/Türkiye liglerindeki maçlar için:
- Güncel oran verisi
- Takım formu, sakatlık, kart cezası, istatistik verisi
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

| Kaynak | Ne için | Plan | Limit |
|---|---|---|---|
| API-Football (api-sports.io) | Fikstür, takım istatistikleri, sakatlık, kart cezası, kadro, son maç sonuçları | Ücretsiz | 100 istek/gün |
| The Odds API | Bookmaker oranları (1X2 / maç sonucu) | Ücretsiz | 500 kredi/ay (kredi = istek değil, piyasa×bölge başına) |
| Gemini API (Google) | AI analiz metni üretimi | Ücretsiz | Flash-Lite: 1500 istek/gün, 30 istek/dk |

**Önemli kısıtlamalar (kullanıcıya açıkça gösterilecek):**
- Oranlar uluslararası bookmaker'lardan gelir, İddaa/Nesine/Bilyoner'in kendi oranı **değildir**. İddaa marjı (~%23) uluslararası "sharp" kitapçılara (~%2-3) göre çok daha yüksektir — yani gösterilen oran, gerçek oynadığınız sitedeki oranla birebir aynı olmayacaktır.
- "Bu orana ne kadar oynandığı" (gerçek bahis hacmi) hiçbir kaynakta yoktur. Bunun yerine kendi periyodik çekimlerimizden **oran zaman serisi** ("oran 48 saatte X'ten Y'ye değişti") gösterilir — bu gerçek ve ücretsiz bir veridir, hacim verisi değildir, arayüzde bu fark netçe belirtilir.
- Küçük liglerde (Norveç, İsveç, İsviçre, Hollanda vb.) API-Football veri kapsamı (özellikle sakatlık/kadro) büyük liglere göre daha sınırlı olabilir; eksik veri varsa analiz bunu belirterek devam eder, hata vermez.
- **The Odds API, TFF 1. Lig'i (Türkiye 2. ligi) kapsamıyor** (doğrulanmış — `/v4/sports` listesinde yok). Bu ligde oran verisi olmayacak, sadece takım istatistikleri/analiz olacak.
- **KG Var/Yok (BTTS) otomatik çekimde yok (düzeltme):** İlk tasarımda KG Var/Yok'u da çekeceğimizi varsaymıştık, ancak The Odds API bu piyasayı toplu (`/sports/{key}/odds`) endpoint'inde sunmuyor — sadece maç başına ayrı bir endpoint'te (kotayı hızla tüketir) mevcut. Plan 2 uygulamasında bu yüzden **sadece 1X2 (maç sonucu, `h2h`) oranı** otomatik çekiliyor. KG Var/Yok gerekirse ileride maç başına ayrı çağrı ile (kota bütçesi yeniden hesaplanarak) eklenebilir.
- **Gerçekçi güncelleme sıklığı ve düzeltilmiş kota hesabı:** The Odds API krediyi **istek başına değil, piyasa×bölge başına** faturalandırıyor. 14 lig (TFF 1. Lig hariç) × 1 piyasa (`h2h`) × 1 bölge (`eu`) × günde 1 senkron × 30 gün ≈ **420 kredi/ay** — 500 kredi/ay kotasının içinde, ~80 kredi tampon payı bırakır. API-Football'un günlük 100 istek kotası fikstür senkronunu günde 2 kez (~30 istek), takım istatistik/sakatlık senkronunu günde 1 kez (en fazla 15 maç × 3 istek ≈ 45 istek) çalıştırmaya izin veriyor, toplam ~75/100. Yani veriler "anlık" değil, günde 1-2 kez güncellenen bir görünüm sunacak — bu, ücretsiz kalmanın maliyeti.
- **Takım istatistiği kapsama sınırı:** Günlük istatistik senkronu en fazla 15 maçla sınırlı (API-Football kotası yüzünden). Yoğun bir hafta sonunda 15'ten fazla maç varsa, kapsam dışı kalan maçların `team_stats_snapshots` kaydı **hiç oluşmayabilir** (kickoff geçtikten sonra bir daha denenmez). Arayüz ve AI analiz aşaması (Plan 3/4) bunu "bu maç için yeterli istatistik verisi yok" şeklinde ele almalı, her maçta veri olacağını varsaymamalı.
- **Gemini model güncellemesi (Plan 3 öncesi düzeltme):** İlk tasarımda seçilen `gemini-2.5-flash-lite`'ın Ekim 2026'da (yaklaşık 16-20 Ekim) emekliye ayrılacağı doğrulandı — Plan 3'ün üzerine kurulacağı bir modelin bir ay içinde kaldırılması riskli olduğundan, **`gemini-3.5-flash-lite`** kullanılacak (aynı ücretsiz tier, hatta biraz daha yüksek limit: 1500 istek/gün, 30 istek/dk, retirement tarihi duyurulmamış). SDK tarafı da güncel: `@google/genai` paketinde artık `ai.models.generateContent()` değil, `ai.interactions.create({ model, input, response_format: { type: "text", mime_type: "application/json", schema: {...} } })` şekli kullanılıyor — yapılandırılmış JSON çıktısı (3 persona + özet) bu şekilde tek çağrıda alınacak.

## 4. Varsayılan lig listesi (kullanıcı checkbox ile seçer)

- İngiltere: Premier League, Championship
- İspanya: La Liga
- İtalya: Serie A
- Almanya: Bundesliga
- Fransa: Ligue 1
- Türkiye: Süper Lig, TFF 1. Lig
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
   - Takım formu, son maçlar, sakatlık/ceza durumu (API-Football'dan)
   - Güncel referans oran + oran geçmişi grafiği (The Odds API + kendi snapshot'larımız)
   - 3 persona analiz: **Takım Analizcisi** (form/sakatlık/önemli an yorumu — örn. "play-off için 3 puana mecburlar"), **Bahis Analizcisi** (istatistik + oran okuma, value değerlendirmesi), **Yorumcu** (genel maç yorumu/tahmini)
   - Genel "AI görüşü" özet kutusu
   - "İddaa/Bilyoner'de gördüğünüz oranı girin" alanı → girilirse referans oranla fark ve yorum gösterilir

## 6. Veri modeli (özet)

- `leagues`: id, name, country, api_football_id, odds_api_sport_key, current_season, active (checkbox için)
- `matches`: id, league_id, home_team, away_team, home_team_api_id, away_team_api_id, kickoff_at, api_football_fixture_id
- `team_stats_snapshots`: match_id, team, form, injuries(json), cards(json), last_matches(json), stats(json — ham API verisi, kesin alan adları AI yorumlama aşamasında okunur)
- `odds_snapshots`: match_id, market, outcome, bookmaker, price, fetched_at (zaman serisi için append-only)
- `ai_analyses`: match_id, generated_at, team_analyst_text, betting_analyst_text, commentator_text, summary_text, model_used
- `manual_odds`: match_id, entered_by, market, outcome, price, entered_at

## 7. Hata yönetimi

- API kotası dolarsa: o döngü atlanır, log'lanır, bir sonraki job'da devam edilir. Arayüzde veri "X saat önce güncellendi" notu ile gösterilir, sayfa kırılmaz.
- Gemini analiz üretimi başarısız olursa (rate limit/hata): eski analiz (varsa) gösterilmeye devam eder, "analiz güncellenemedi" notu düşülür; job bir sonraki döngüde tekrar dener.
- Küçük liglerde eksik istatistik/sakatlık verisi: analiz promptunda "bu veri mevcut değil" olarak işaretlenir, AI buna göre temkinli yorum üretir.

## 8. Erişim/güvenlik

- Auth/şifre koruması yok — uygulama linki bilen herkese açık (kullanıcının tercihi: 3-5 kişilik güven çevresi için gereksiz karmaşıklık). İleride ihtiyaç olursa eklenebilir.
- API anahtarları (API-Football, The Odds API, Gemini, Supabase) sunucu tarafı env variable olarak tutulur, client'a asla gönderilmez.

## 9. Maliyet özeti

| Kalem | Maliyet |
|---|---|
| Hosting (Vercel) | $0 |
| Veritabanı (Supabase) | $0 |
| Spor/istatistik verisi (API-Football) | $0 |
| Oran verisi (The Odds API) | $0 |
| AI analiz (Gemini 3.5 Flash-Lite) | $0 |
| **Toplam** | **$0/ay** |

Not: Ücretsiz kotalar aşılırsa (çok yoğun kullanım) ilk aşılacak muhtemelen The Odds API'nin aylık 500 istek limiti olur — bu durumda çekim sıklığı azaltılır ya da seçili lig sayısı kısıtlanır, ek ücret ödemeden yönetilebilir.

## 10. Test yaklaşımı

- Veri çekme job'ları için: API'lerden dönen örnek yanıtlarla (mock/fixture) birim testleri.
- AI analiz üretimi için: prompt'a verilen örnek veri ile üretilen çıktının beklenen alanları (3 persona + özet) içerdiğini doğrulayan testler (içerik doğruluğu değil, yapı doğruluğu test edilir).
- Arayüz için: temel akış (giriş → lig seçimi → maç listesi → detay sayfası) manuel/entegrasyon testi ile doğrulanır.

## 11. Açık riskler

- API-Football ücretsiz plan kapsamının bazı küçük liglerde (Norveç, İsveç, İsviçre, Hollanda alt seviye) yetersiz kalma ihtimali — implementasyon sırasında doğrulanacak.
- Gemini ücretsiz kotasının kullanım verisini ürün geliştirme amacıyla kullanabilmesi — hassas olmayan spor verisi olduğu için düşük risk kabul edildi.
- Referans oranların İddaa oranlarından farklı olması nedeniyle "value bet" yorumlarının yanıltıcı algılanma riski — arayüzde bu net şekilde uyarı olarak belirtilecek.
