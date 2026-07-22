# KURULUM — Merkezi Veritabanı (Supabase)

> Bu kurulum yapılmazsa sistem "yerel mod"da çalışır: herkes sadece kendi
> telefonundaki verileri görür. Merkezi sistem için 10 dakikalık bu kurulum şart.

## 1. Supabase hesabı açın (ücretsiz)

1. https://supabase.com → **Start your project** → GitHub ile giriş yapın
2. **New project** butonuna tıklayın
3. Doldurun:
   - Name: **cop31**
   - Database Password: güçlü bir şifre yazın ve NOT EDİN
   - Region: **Frankfurt (eu-central-1)** (Türkiye'ye en yakın)
4. **Create new project** → 1-2 dakika bekleyin

## 2. Veritabanı tablolarını oluşturun

1. Sol menüden **SQL Editor** seçin
2. **New query** deyin
3. `schema.sql` dosyasının TÜM içeriğini kopyalayıp yapıştırın
4. Sağ altta **RUN** butonuna basın
5. "Success" görmelisiniz

Bu işlem tabloları, ilk yönetici hesabını (PIN: **1907**) ve fotoğraf deposunu oluşturur.

## 3. API anahtarlarını alın

1. Sol menüden **Project Settings** (dişli) → **API**
2. Şu iki değeri kopyalayın:
   - **Project URL** (https://xxxx.supabase.co gibi)
   - **anon public** anahtarı (uzun bir metin)

## 4. Vercel'e anahtarları girin

1. Vercel → **cop31-waste-management** projesi → **Settings** → **Environment Variables**
2. İki değişken ekleyin:

   | Name | Value |
   |------|-------|
   | `VITE_SUPABASE_URL` | (Project URL'yi yapıştırın) |
   | `VITE_SUPABASE_ANON_KEY` | (anon public anahtarı yapıştırın) |

3. Her ikisi için de **Production + Preview + Development** seçili olsun → **Save**

## 5. Yeniden yayınlayın

Environment variable değişince yeniden deploy gerekir:

1. Vercel → **Deployments** sekmesi
2. En üstteki deployment'ın sağındaki **⋯** → **Redeploy** → **Redeploy**

## 6. Test

1. `cop31.uhodmogilturkey.com` açın (Ctrl+Shift+R)
2. Giriş ekranı gelecek → **Yönetici** seçin → PIN: **1907**
3. Alt yazıda "● Merkezi veritabanına bağlı" görmelisiniz
4. İlk iş: Personel sekmesinden kendi hesabınızı yönetici olarak ekleyin,
   sonra "Yönetici" hesabının PIN'ini değiştirin veya pasifleştirin

## Sistem ne yapabiliyor artık?

| Özellik | Açıklama |
|---------|----------|
| Merkezi veri | Tüm telefonlar/bilgisayarlar aynı veriyi görür, 30 sn'de bir otomatik yenilenir |
| PIN girişi | Her personelin 4 haneli kodu var; kayıtlar otomatik onun adına |
| Yetki ayrımı | Personel/QR/Hedef ekranlarını sadece yöneticiler görür |
| Fotoğraf kanıtı | Atık kaydına tartı fişi fotoğrafı eklenir (otomatik küçültülür) |
| UATF alanı | Tehlikeli atıkta Ulusal Atık Taşıma Formu no zorunlu |
| Tesis lisansı | Gönderilen tesisin çevre lisans numarası kaydedilir |
| Karbon hesabı | Bertaraf yöntemi + taşıma km'sine göre otomatik CO₂e |
| Hedef takibi | ISO 20121 tarzı hedef-gerçekleşen; aşımda dashboard uyarır |
| Görev/SLA | Bölge-personel ataması + temizlik sıklığı; gecikme uyarısı |
| Denetim izi | Silme yok (pasifleştirme var); her işlem audit_log'a yazılır |
| CSV dışa aktarım | UATF, lisans, km, CO₂e dahil tüm ham veri |

## Bilinmesi gerekenler

- Ücretsiz Supabase planı: 500 MB veritabanı + 1 GB dosya — bu iş için fazlasıyla yeter.
- PIN sistemi pratik bir saha çözümüdür; kritik kurumsal ortamda Supabase Auth'a
  (e-posta/şifre) geçilmesi önerilir.
- Karbon faktörleri yaklaşık uluslararası değerlerdir; resmî UNFCCC raporunda
  ulusal emisyon faktörleriyle doğrulanmalıdır.
