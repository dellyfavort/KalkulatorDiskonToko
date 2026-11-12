# Kalkulator Diskon Toko

Aplikasi kalkulator diskon bertingkat berbasis Apache Cordova, JavaScript, dan Firebase Authentication (Anonymous) + Cloud Firestore.

### Keyboard dan tata letak mobile

Kolom harga dan diskon memakai atribut `readonly` saat aplikasi pertama dibuka agar keyboard sistem tidak langsung tampil. Saat pengguna mengetuk kolom, input diaktifkan dan keyboard sistem muncul. Ketika keyboard terbuka, aplikasi mendeteksi perubahan `VisualViewport`, mengecilkan kartu hasil, menyembunyikan numpad/footer agar tidak bertumpuk dengan keyboard, dan menggulir kolom aktif ke area yang terlihat. Seluruh layar aplikasi menjadi area scroll pada layar pendek.

Untuk Android, `config.xml` mengatur `windowSoftInputMode="adjustResize"` melalui manifest merge agar area WebView dapat menyesuaikan ruang ketika keyboard tampil. Setelah mengubah `config.xml`, jalankan `cordova prepare android` sebelum build ulang. Perilaku akhir tetap perlu diuji pada beberapa ukuran layar dan versi Android/WebView karena pengelolaan keyboard dapat berbeda antarperangkat.


## Fitur
- Menghitung diskon pertama dan diskon kedua secara bertingkat.
- Menampilkan harga akhir, nominal hemat, serta persentase diskon efektif.
- Menyimpan perhitungan ke Cloud Firestore melalui tombol **Simpan Perhitungan**.
- Membaca maksimal 30 riwayat terakhir.
- Menghapus riwayat per item setelah konfirmasi.
- Menampilkan platform perangkat melalui `cordova-plugin-device`.
- Riwayat bersifat tidak dapat diedit; Rules mengizinkan Create, Read, dan Delete (CRD).

## Struktur Firestore

```text
users/{uid}/history/{historyId}
  hargaAwal
  diskon1
  diskon2
  hargaSetelahDiskon1
  hargaAkhir
  totalHemat
  persenHemat
  createdAt
```

Nama koleksi dan nama field pada kode JavaScript harus sama dengan `firestore.rules.txt`. Jangan mengubah salah satunya tanpa memperbarui yang lain.

## Pengaturan Firebase
1. Buka Firebase Console dan pilih project `kalkulator-diskon-toko`.
2. Pastikan Authentication sudah diaktifkan.
3. Di Authentication > Sign-in method, aktifkan **Anonymous**.
4. Pastikan Cloud Firestore sudah dibuat.
5. Buka Firestore Database > Rules. Salin isi `firestore.rules.txt`, lalu klik **Publish**.
6. Jangan gunakan Rules testing yang mengizinkan semua akses.

Konfigurasi web Firebase berada di `www/js/firebase-config.js`. File ini memuat konfigurasi aplikasi klien, bukan service account/private key.

## Menjalankan di browser
1. Buka folder proyek melalui VS Code.
2. Jalankan `www/index.html` menggunakan Live Server atau server lokal lain, bukan `file://`.
3. Pastikan perangkat terhubung ke internet untuk memuat Firebase SDK dari CDN serta melakukan autentikasi dan akses Firestore.
4. Isi harga dan diskon, lalu tekan **Simpan Perhitungan**.
5. Tekan ikon riwayat untuk membaca data.
6. Tekan **Hapus** pada salah satu item dan setujui konfirmasi untuk menghapusnya.

## Menjalankan di Android dengan Cordova
Plugin `cordova-plugin-device` tetap digunakan untuk menampilkan platform saat event `deviceready` berjalan. Firebase SDK dimuat melalui CDN, sehingga koneksi internet diperlukan untuk memuat modul Firebase, autentikasi anonim, dan akses Cloud Firestore. Kalkulasi diskon tetap berjalan secara lokal tanpa Firebase.

Di folder utama proyek, jalankan: 

```bash
npm install
npx cordova platform add android
npx cordova requirements android
npx cordova build android
```

Sesuaikan langkah platform Android dengan setup Cordova yang sudah ada pada komputer.

## Uji fungsional yang disarankan
| No. | Skenario | Hasil yang diharapkan |
|---|---|---|
| 1 | Harga Rp500.000, diskon 50% dan 20% | Harga akhir Rp200.000; diskon efektif 60% |
| 2 | Simpan perhitungan saat internet aktif | Pesan berhasil dan dokumen muncul di `users/{uid}/history` |
| 3 | Baca riwayat | Maksimal 30 dokumen milik UID aktif ditampilkan |
| 4 | Hapus satu riwayat | Setelah konfirmasi, dokumen terhapus dari Firestore dan daftar |
| 5 | Anonymous Authentication tidak aktif | Pesan kegagalan autentikasi ditampilkan |
| 6 | Rules menolak akses | Pesan akses ditolak ditampilkan; data tidak berubah |
| 7 | Buka aplikasi tanpa internet sejak awal | Kalkulator tetap berjalan; modul riwayat menampilkan pesan gagal dimuat |
| 8 | Buka melalui browser dan Android | Status platform menampilkan Mode web atau platform Android |

## Catatan keamanan dan pengujian
- Firestore Rules membatasi akses berdasarkan UID pengguna yang sedang terautentikasi.
- Rules hanya mengizinkan Create, Read, dan Delete. Update sengaja dinonaktifkan.
- Untuk menguji isolasi data antar pengguna, gunakan dua sesi/instalasi dengan UID anonim berbeda; pengguna kedua tidak boleh membaca atau menghapus dokumen pengguna pertama.
- Jangan menyatakan pengujian berhasil sebelum benar-benar dijalankan pada Firebase project dan perangkat yang digunakan.

## Batas waktu respons operasi Firestore

Operasi simpan dan hapus menampilkan peringatan apabila Firestore belum memberikan respons dalam 10 detik. Batas waktu ini hanya menghentikan penantian antarmuka, bukan membatalkan permintaan yang sudah dikirim ke Firestore. Karena itu tombol Simpan atau Hapus tetap dinonaktifkan sampai permintaan aslinya memperoleh hasil, untuk menghindari pengiriman ulang dan kemungkinan data ganda. Jika koneksi kembali, status akhir akan diperbarui sesuai respons Firebase.

Fitur ini bukan penyimpanan offline dan tidak menjamin sinkronisasi offline. Pengujian tetap perlu dilakukan pada APK Android dengan koneksi aktif dan mode pesawat.
