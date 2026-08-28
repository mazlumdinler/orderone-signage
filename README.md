# OrderOne Signage

Restoranınız için TV menü ekranı (LG TV / webOS uyumlu) + web tabanlı admin paneli + Square POS ürün eşleştirmesi.

## Nasıl çalışır?

- **`/admin`** — Şifre korumalı yönetim paneli. Buradan sınırsız sayıda "menü panosu" (board) oluşturabilir, her board içine kategori ve ürün ekleyebilir, görsel yükleyebilir, ürünleri Square POS kataloğunuzdaki gerçek ürünlerle eşleştirebilirsiniz.
- **`/display`** — TV'de tam ekran açacağınız sayfa. Aktif tüm board'lar arasında otomatik olarak dönüşümlü geçiş yapar (her board'un kendi süresi vardır), her 30 saniyede bir sunucudan güncel veriyi çeker ve ekranı otomatik günceller — TV'yi elle yenilemenize gerek yoktur. Tek bir board'u sabit göstermek isterseniz `/display/<board-slug>` adresini kullanın (slug'ı admin panelde board'u "Önizle" ile açtığınızda görürsünüz).
- Veriler bir SQLite veritabanında saklanır; görseller sunucudaki `data/uploads` klasöründe tutulur.

## İlk kurulum (yerel bilgisayarda çalıştırmak isterseniz)

```bash
npm install
cp .env.example .env    # içindeki ADMIN_PASSWORD ve SESSION_SECRET değerlerini değiştirin
npm start
```

Sunucu ilk çalıştığında:
- `.env` içindeki `ADMIN_USERNAME` / `ADMIN_PASSWORD` ile bir yönetici hesabı otomatik oluşturulur.
- Mevcut 2 TV menü görselinizdeki tüm kategori/ürün/fiyat bilgileri otomatik olarak veritabanına yüklenir (yalnızca veritabanı boşsa, yani ilk çalıştırmada).

Admin panel: `http://localhost:3000/admin`
TV ekranı: `http://localhost:3000/display`

## Square POS Bağlantısı Nasıl Kurulur?

TV'de gösterilen ürün adının Square'deki ürün adıyla **aynı olması gerekmez** — eşleştirmeyi siz admin panelden yaparsınız.

1. [Square Developer Dashboard](https://developer.squareup.com/apps) üzerinden bir uygulama oluşturun (veya mevcut birini kullanın).
2. "Credentials" sekmesinden **Access Token**'ınızı kopyalayın (canlı Square hesabınız için "Production" access token).
3. Admin panelde **Square POS** sekmesine gidin, token'ı yapıştırın, ortamı "Production" seçin, "Ayarları Kaydet" deyin.
4. "Square Kataloğunu Senkronize Et" butonuna basın — Square'deki tüm ürün ve varyasyonlarınız önbelleğe çekilir.
5. Her menü ürününü düzenlerken açılan formda "Square ürünlerinde ara…" kutusuna yazıp doğru ürünü seçerek bağlayın. İsimler farklı olsa da sorun değildir; bağlantı gerçek Square ürün ID'si üzerinden kurulur.

Token hiçbir zaman TV ekranına veya herkese açık API'ye gönderilmez; sadece admin paneli kullanır.

## Yeni bir menü panosu (board) eklemek

Admin panelde **Menü Panoları** sekmesinde **"+ Yeni Board"** butonuna basmanız yeterli. İstediğiniz kadar board oluşturabilir, her birine kategori ve ürün ekleyebilir, TV rotasyonunda gösterilip gösterilmeyeceğini ve kaç saniye ekranda kalacağını ayarlayabilirsiniz. Yeni board'lar için "Genel Amaçlı Izgara" şablonunu kullanmanız önerilir; mevcut kahvaltı/waffle ve sandviç panolarınızın stilini birebir korumak isterseniz "Klasik" şablonlardan birini seçebilirsiniz.

## TV'de (LG webOS) nasıl açılır?

- TV'nizin dahili tarayıcısı varsa, adres olarak sunucunuzun `/display` adresini girip tam ekran açın.
- Dahili tarayıcı yoksa veya sınırlıysa, ucuz bir Android/Fire TV medya kutusu veya Chromecast ile Chrome tarayıcısında aynı adresi açıp "kiosk modunda" gösterebilirsiniz.
- Sayfa periyodik olarak sunucuya "canlı" sinyali gönderir; admin panelin **Ekranlar** sekmesinden hangi TV'lerin şu an bağlı olduğunu görebilirsiniz.
- İnternet/ağ bağlantısı kısa süreliğine kesilirse, TV son bilinen menüyü göstermeye devam eder (tarayıcı önbelleğinden).

## Railway'de barındırma

Bu proje Railway'de host edilecek şekilde hazırlanmıştır. Kalıcı veri (SQLite + yüklenen görseller) için mutlaka bir **Volume** ekleyip `DB_PATH` ve `UPLOAD_DIR` değişkenlerini o volume'ün mount path'ine göre ayarlayın (örn. `/data/signage.db`, `/data/uploads`), aksi halde her yeni deploy'da verileriniz sıfırlanır.

Gerekli ortam değişkenleri: `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `DB_PATH`, `UPLOAD_DIR`.

## Güvenlik notları

- İlk girişten sonra **Hesap** sekmesinden şifrenizi değiştirin.
- `SESSION_SECRET` değerini kimseyle paylaşmayın ve production'da mutlaka değiştirin.
- Square Access Token'ınız veritabanında düz metin olarak saklanır (yalnızca admin panel API'sinden okunabilir, herkese açık uçlara asla gönderilmez). Sunucunuzu ve veritabanı dosyanızı yalnızca güvendiğiniz kişilerle paylaşın.
