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
│  Next.js (Vercel)│◄────►│ Supabase (Postgres)   │◄────►│ Zamanlanmış Job  │
│  - UI (lig/maç    │      │ - leagues              │      │ (Vercel Cron)    │
│    seçimi)         │      │ - matches              │      │ - API-Football    │
│  - API routes      │      │ - odds_snapshots       │      │   veri çeker      │
│  - Analiz görünümü │      │ - ai_analyses          │      │ - The Odds API     │
└─────────────────┘      │ - manual_odds (kullanıcı│      │   oran çeker       │
                            │   girişi)               │      │ - Gemini API'ye    │
                            └──────────────────────┘      │   analiz ürettirir │
                                                             └─────────────────┘
```

- **Frontend + Backend:** Next.js (App Router), tek proje, Vercel'e deploy.
- **Veritabanı:** Supabase (ücretsiz Postgres planı).
- **Zamanlanmış veri çekme:** Vercel Cron (ücretsiz plan sınırları içinde, günde birkaç tetikleme) → API route'u tetikler → veri çeker → DB'ye yazar.
- **AI analiz üretimi:** Aynı zamanlanmış akış içinde, yeni/güncellenmiş maçlar için Gemini API çağrılır, sonuç DB'ye yazılır (kullanıcı sayfa açtığında yeniden üretilmez — maliyet ve hız için cache şart).

## 3. Veri kaynakları

| Kaynak | Ne için | Plan | Limit |
|---|---|---|---|
| API-Football (api-sports.io) | Fikstür, takım istatistikleri, sakatlık, kart cezası, kadro, son maç sonuçları | Ücretsiz | 100 istek/gün |
| The Odds API | Bookmaker oranları (1X2, KG Var/Yok vb.) | Ücretsiz | 500 istek/ay |
| Gemini API (Google) | AI analiz metni üretimi | Ücretsiz | Flash-Lite: 1500 istek/gün, 15 istek/dk |

**Önemli kısıtlamalar (kullanıcıya açıkça gösterilecek):**
- Oranlar uluslararası bookmaker'lardan gelir, İddaa/Nesine/Bilyoner'in kendi oranı **değildir**. İddaa marjı (~%23) uluslararası "sharp" kitapçılara (~%2-3) göre çok daha yüksektir — yani gösterilen oran, gerçek oynadığınız sitedeki oranla birebir aynı olmayacaktır.
- "Bu orana ne kadar oynandığı" (gerçek bahis hacmi) hiçbir kaynakta yoktur. Bunun yerine kendi periyodik çekimlerimizden **oran zaman serisi** ("oran 48 saatte X'ten Y'ye değişti") gösterilir — bu gerçek ve ücretsiz bir veridir, hacim verisi değildir, arayüzde bu fark netçe belirtilir.
- Küçük liglerde (Norveç, İsveç, İsviçre, Hollanda vb.) API-Football veri kapsamı (özellikle sakatlık/kadro) büyük liglere göre daha sınırlı olabilir; eksik veri varsa analiz bunu belirterek devam eder, hata vermez.

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

- `leagues`: id, name, country, api_football_id, odds_api_key, active (checkbox için)
- `matches`: id, league_id, home_team, away_team, kickoff_at, api_football_fixture_id
- `team_stats_snapshots`: match_id, team, form, injuries(json), cards(json), last_matches(json), shots/goals istatistikleri
- `odds_snapshots`: match_id, market, outcome, price, fetched_at (zaman serisi için append-only)
- `ai_analyses`: match_id, generated_at, team_analyst_text, betting_analyst_text, commentator_text, summary_text, model_used
- `manual_odds`: match_id, user_id, market, price, entered_at

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
| AI analiz (Gemini 2.5 Flash-Lite) | $0 |
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
