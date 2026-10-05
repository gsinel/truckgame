# Arena AI — fan-made Android istemcisi

> **Resmî değil.** Arena AI'nın (arena.ai) herkese açık bir sohbet API'si yok. Bu uygulama bir
> **WebView sarmalayıcısı**: siteyi kendi oturumunla açar ve yanıtın ne zaman bittiğini senin
> adına izleyip **bildirim** gönderir. Verilerini hiçbir yere göndermez, sunucu yoktur.

## Ne yapıyor?

- Telefonda "gerçek uygulama" gibi: kendi ikonu, kendi penceresi, Chrome'un sekmeleri arasında kaybolmazsın.
- **Yanıt bitince bildirim** (ses + titreşim, kilit ekranında önizleme).
- Bildirimden **hızlı yanıt** yazabilir, yanıtı **kopyalayabilir**, bildirime dokunup doğrudan sohbete dönebilirsin.
- Ekran kapalıyken / uygulama arka plandayken izlemeyi sürdürür (ön plan servisi + wake lock).
- Tamamlanan yanıtların **geçmişi** uygulama içinde listelenir.
- Mobil konfor: geri/ileri/ana sayfa düğmeleri, dosya & fotoğraf ekleme, indirme, karanlık mod.

## "Bitti" anını nasıl anlıyor?

Üç katman, biri çalışmazsa diğeri devreye girer:

| Katman | Yöntem | Ne zaman |
|---|---|---|
| **Akış izleyici** (birincil) | Sayfa yüklenmeden önce `fetch` / `XMLHttpRequest` / `EventSource` sarmalanır; modele giden isteğin cevap akışı (SSE/NDJSON) kapanınca "bitti" denir. | Arayüz değişse de çalışır. |
| **Arayüz izleyici** (yedek) | DOM'daki "Durdur / Stop generating" düğmesi yoklanır; düğme kaybolduğunda "bitti" denir. | Akış yakalanamazsa (ör. akışsız JSON cevabı) devreye girer. |
| **Manuel düğme** (garanti) | Toolbar'daki zil düğmesiyle izlemeyi elle başlatırsın; 2 dakika içinde hiçbir şey yakalanamazsa uygulama sana "yakalayamadım" der. | Diğer ikisi sessiz kalırsa. |

Aynı yanıt için **çift bildirim engellenir** (8 saniyelik pencere).

## Kurulum

### 1. Hazır APK (en kolay)

1. Repo'daki **Actions → Android APK** iş akışının son çalıştırmasını aç.
2. `arena-ai-debug-apk` yapısını indir.
3. Telefonda "Bilinmeyen kaynaklara izin ver" → APK'yı kur.
4. Aç, arena.ai'ya giriş yap, bir prompt gönder — bildirim geliyor mu bak.

### 2. Android Studio ile derleme

```bash
# Android Studio > Open > android/ klasörü
# veya komut satırından:
cd android
./gradlew assembleDebug      # -> app/build/outputs/apk/debug/app-debug.apk
./gradlew installDebug       # USB'deki cihaza kurar
```

Gereksinimler: JDK 17, Android SDK 35, minSdk 26 (Android 8+).

## İlk kurulumda şunları yap

1. **Bildirim izni** ver (Android 13+ otomatik istenir).
2. **Ayarlar → Pil optimizasyonunu kapat**: aksi hâlde sistem arka plan servisini uykuya alır ve
   ekran kapalıyken bildirim gecikebilir.
3. **Ayarlar → İzleme**: "Akış izleyici" ve "Arayüz izleyici" açık kalsın.

## Bildirim gelmiyorsa

1. Ayarlar → **İzleme → İzlemeyi şimdi durdur**, sonra toolbar'daki zil düğmesiyle tekrar başlat.
2. Sorun devam ederse Ayarlar → **İzleyici hata ayıklama**'yı aç, sayfayı yenile, Logcat'te
   `ArenaMonitor` etiketini filtrele (`adb logcat -s ArenaMonitor`).
3. Site büyük güncelleme aldıysa "Durdur" düğmesinin metni değişmiş olabilir → arayüz izleyici
   şaşırabilir; akış izleyici genelde yine çalışır.

## Dosya düzeni

```
android/app/src/main/java/com/fanmade/arenaai/
├── MainActivity.kt            # giriş noktası, izinler, derin bağlantılar
├── data/Prefs.kt              # ayarlar
├── monitor/
│   ├── JobRecord.kt           # izlenen iş modeli
│   ├── JobStore.kt            # bildirim geçmişi
│   ├── MonitorController.kt   # olay → bildirim/servis orkestrasyonu
│   └── MonitorService.kt      # ön plan servisi + wake lock
├── notifications/
│   ├── Notifier.kt            # kanal & bildirim kurulumu
│   └── ActionReceiver.kt      # bildirimdeki Yanıtla / Kopyala
├── web/
│   ├── ArenaWeb.kt            # WebView, indirme, dosya seçici, koyu mod
│   ├── JsBridge.kt            # JS ↔ Kotlin köprüsü
│   ├── MonitorJs.kt           # ayarları JS'e gömer
│   └── WebViewModel.kt        # WebView'ı dönmelerde canlı tutar
└── ui/                        # Compose ekranları (Sohbet / Bildirimler / Ayarlar)
android/app/src/main/assets/arena_monitor.js   # sayfaya enjekte edilen izleyici
```

## Yasal / nezaket notu

Bu bir hayran projesidir; Arena AI markası ve sitesi kendilerine aittir. Uygulama yalnızca senin
hesabınla, senin cihazında, normal bir tarayıcı gibi davranır. Siteyi otomatikleştirmek için
istek yağmuruna tutmaz veya kazıma yapmaz — sadece açık olan sohbeti izler.
