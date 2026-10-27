# Kalkulator Diskon Toko — UI Keyboard + Firebase Cloud Firestore

Patch ini mempertahankan UI/UX terbaru yang bisa diketik melalui keyboard komputer atau tombol numpad layar, lalu menambahkan fitur riwayat perhitungan ke Firebase.

## Yang ditambahkan
- Firebase JavaScript SDK melalui CDN (Compat SDK 12.17.0).
- Anonymous Authentication sehingga demo UTS tidak memerlukan layar daftar/login.
- Tombol **Simpan Perhitungan** dan daftar 10 riwayat terbaru.
- Cloud Firestore dengan Security Rules untuk memisahkan data per UID.
- Status koneksi Firebase di bagian Riwayat Perhitungan.

## 1. Pasang patch ke project Cordova yang sudah ada
1. Tutup browser tab kalkulator bila sedang terbuka.
2. Ekstrak ZIP ke folder utama project, misalnya `C:\Users\LENOVO\KalkulatorDiskonToko`.
3. Izinkan folder `www` dan file `firestore.rules.txt` digabung/diganti jika diminta.
4. Jangan hapus `config.xml`, `package.json`, `node_modules`, atau `platforms/android` yang sudah kamu punya.

## 2. Buat dan daftarkan Firebase Web App
1. Buka https://console.firebase.google.com/ dan buat/pilih project.
2. Di halaman Project Overview, klik ikon Web `</>` untuk mendaftarkan Web App. Firebase Hosting tidak wajib.
3. Buka Project settings (roda gigi) > General > Your apps > SDK setup and configuration.
4. Salin nilai `apiKey`, `authDomain`, `projectId`, dan `appId`.
5. Buka `www/js/firebase-config.js`, lalu ganti nilai `ISI_...` dengan nilai dari project Firebase milikmu. Jangan letakkan service account/private key di sini.

Contoh format:

```js
window.KALKULATOR_FIREBASE_CONFIG = {
  apiKey: "nilai-api-key-dari-firebase",
  authDomain: "id-project.firebaseapp.com",
  projectId: "id-project",
  appId: "nilai-app-id"
};
```

Gunakan konfigurasi aslimu, bukan contoh di atas.

## 3. Aktifkan Anonymous Authentication
1. Firebase Console > Build > Authentication.
2. Klik Get started jika muncul.
3. Buka tab Sign-in method / Providers.
4. Pilih **Anonymous**, aktifkan, lalu Save.

Aplikasi membuat sesi anonim agar bisa mematuhi Firestore Security Rules tanpa perlu form login.

## 4. Buat Cloud Firestore
1. Firebase Console > Build > Firestore Database > Create database.
2. Pilih lokasi database yang sesuai. Lokasi tidak bisa diubah dengan mudah setelah dibuat.
3. Setelah database dibuat, buka tab **Rules**.
4. Salin isi file `firestore.rules.txt` ke editor Rules dan klik **Publish**.
5. Jangan gunakan aturan terbuka `allow read, write: if true`.

Struktur data yang akan muncul:

```text
users
  └── <UID pengguna anonim>
      └── history
          └── <ID dokumen otomatis>
              ├── hargaAwal
              ├── diskon1
              ├── diskon2
              ├── hargaSetelahDiskon1
              ├── hargaAkhir
              ├── totalHemat
              ├── persenHemat
              └── createdAt
```

## 5. Jalankan untuk pengujian
Untuk menguji Firebase di browser, sebaiknya buka folder `www` dengan ekstensi VS Code **Live Server** (misalnya `http://localhost:5500`) daripada membuka file HTML dengan `file://`.

1. Di VS Code, klik kanan `www/index.html` > Open with Live Server.
2. Pastikan komputer terkoneksi ke internet.
3. Gulir ke bagian **Riwayat perhitungan**. Status harus berubah menjadi **Terhubung**.
4. Isi harga dan dua diskon, lalu klik **Simpan Perhitungan**.
5. Pastikan riwayat muncul dalam aplikasi dan di Firebase Console > Firestore Database > Data.

Jika menggunakan Live Server pada alamat host lain, periksa Firebase Console > Authentication > Settings > Authorized domains. Tambahkan hostname pengujian jika diminta. Jangan memasukkan `http://` atau port, cukup hostname.

## 6. Jika status belum terhubung
- `Belum dikonfigurasi`: periksa placeholder di `www/js/firebase-config.js`.
- `SDK tidak tersedia`: pastikan internet aktif dan akses `www.gstatic.com` tidak diblokir.
- `Autentikasi gagal`: pastikan Anonymous Authentication aktif; cek pesan Console browser.
- Gagal memuat/menyimpan riwayat: pastikan Firestore sudah dibuat dan Rules sudah dipublikasikan.
- Untuk detail, buka Developer Tools browser (F12) > Console.

## 7. Build Android nanti
Firebase di project ini dimuat melalui CDN, jadi aplikasi memerlukan koneksi internet untuk login dan membaca/menulis riwayat. Perhitungan diskon lokal tetap berjalan meskipun Firebase belum diatur.

Setelah JDK 17 dan Android SDK dikonfigurasi, kembali ke folder utama Cordova dan jalankan:

```powershell
npx.cmd cordova requirements android
npx.cmd cordova build android
```

## Catatan rumus
Harga setelah diskon pertama = harga awal × (1 − diskon 1 / 100).
Harga akhir = harga setelah diskon pertama × (1 − diskon 2 / 100).
Nominal hemat = harga awal − harga akhir.
