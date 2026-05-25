# Requirements Document

## Introduction

Sistem Antrian Rumah Sakit adalah aplikasi web berbasis jaringan lokal yang mengelola antrian pasien di rumah sakit. Sistem ini memiliki tiga halaman utama: halaman pengambilan nomor antrian untuk pasien, halaman admin untuk memanggil/memajukan antrian, dan halaman display untuk menampilkan status antrian saat ini. Sistem mendukung beberapa tipe antrian (Pendaftaran, Kasir, Farmasi, Fast Track) yang dapat ditambah atau dihapus secara dinamis. Setiap pemanggilan antrian disertai dengan pengumuman suara (sound announcement).

## Glossary

- **Sistem_Antrian**: Aplikasi web yang mengelola seluruh proses antrian rumah sakit
- **Halaman_Pasien**: Halaman web tempat pasien mengambil nomor antrian
- **Halaman_Admin**: Halaman web tempat petugas memanggil dan memajukan antrian
- **Halaman_Display**: Halaman web yang menampilkan status antrian saat ini secara real-time. Beberapa instance Halaman_Display dapat berjalan secara bersamaan pada perangkat berbeda dengan konfigurasi Loket yang berbeda-beda (contoh: Monitor 1 menampilkan Loket 1, Monitor 2 menampilkan Loket 2)
- **Display_Filter**: Parameter konfigurasi pada Halaman_Display yang menentukan Loket mana saja yang ditampilkan pada instance display tersebut
- **Tipe_Antrian**: Kategori layanan antrian (contoh: Pendaftaran, Kasir, Farmasi, Fast Track)
- **Nomor_Antrian**: Identifikasi unik yang diberikan kepada pasien berdasarkan tipe antrian, terdiri dari kode prefix dan nomor urut
- **Loket**: Tempat pelayanan yang ditugaskan untuk melayani tipe antrian tertentu
- **Sound_Engine**: Komponen yang memutar pengumuman suara saat antrian dipanggil
- **Server_Lokal**: Server yang berjalan pada jaringan lokal rumah sakit
- **Printer_Tiket**: Printer thermal receipt yang terhubung pada perangkat kiosk Halaman_Pasien untuk mencetak tiket antrian

## Requirements

### Requirement 1: Pengambilan Nomor Antrian

**User Story:** Sebagai pasien, saya ingin mengambil nomor antrian berdasarkan tipe layanan yang saya butuhkan, sehingga saya mendapatkan nomor urut yang jelas untuk dilayani.

#### Acceptance Criteria

1. WHEN pasien memilih Tipe_Antrian pada Halaman_Pasien, THE Sistem_Antrian SHALL menghasilkan Nomor_Antrian baru dengan format [PREFIX]-[NOMOR_URUT] di mana NOMOR_URUT adalah bilangan 3 digit berurutan dimulai dari 001 yang di-reset setiap hari pada pukul 00:00, dan PREFIX sesuai dengan kode Tipe_Antrian yang dipilih (contoh: A-001 untuk Pendaftaran)
2. WHEN Nomor_Antrian berhasil dibuat, THE Halaman_Pasien SHALL menampilkan Nomor_Antrian, Tipe_Antrian yang dipilih, serta waktu pengambilan kepada pasien dalam waktu maksimal 3 detik setelah pemilihan
3. THE Halaman_Pasien SHALL menampilkan semua Tipe_Antrian yang memiliki status aktif di dalam sistem sebagai pilihan yang dapat dipilih oleh pasien
4. WHEN Nomor_Antrian baru diambil, THE Sistem_Antrian SHALL menyimpan Nomor_Antrian tersebut ke posisi terakhir dalam daftar tunggu sesuai Tipe_Antrian yang dipilih dengan status "menunggu"
5. IF tidak ada Tipe_Antrian yang aktif tersedia, THEN THE Halaman_Pasien SHALL menampilkan pesan yang menginformasikan bahwa tidak ada layanan antrian yang tersedia saat ini
6. IF terjadi kegagalan saat pembuatan Nomor_Antrian, THEN THE Sistem_Antrian SHALL menampilkan pesan kesalahan kepada pasien dan tidak menyimpan data antrian yang tidak lengkap ke dalam daftar tunggu
7. WHEN dua atau lebih pasien mengambil Nomor_Antrian pada Tipe_Antrian yang sama secara bersamaan, THE Sistem_Antrian SHALL menjamin setiap pasien menerima NOMOR_URUT yang unik dan berurutan tanpa duplikasi

### Requirement 2: Pemanggilan dan Pengelolaan Antrian oleh Admin

**User Story:** Sebagai petugas admin, saya ingin memanggil nomor antrian berikutnya, sehingga pasien mengetahui giliran mereka untuk dilayani.

#### Acceptance Criteria

1. WHEN petugas menekan tombol "Panggil Berikutnya" pada Halaman_Admin dan terdapat Nomor_Antrian yang menunggu pada Tipe_Antrian yang dipilih, THE Sistem_Antrian SHALL memajukan antrian ke Nomor_Antrian menunggu paling awal pada Tipe_Antrian tersebut dan memperbarui jumlah antrian menunggu dalam waktu maksimal 2 detik
2. IF petugas menekan tombol "Panggil Berikutnya" dan tidak terdapat Nomor_Antrian yang menunggu pada Tipe_Antrian yang dipilih, THEN THE Halaman_Admin SHALL menampilkan pesan yang mengindikasikan bahwa antrian kosong untuk Tipe_Antrian tersebut
3. WHEN antrian dipanggil, THE Halaman_Admin SHALL menampilkan Nomor_Antrian yang sedang dilayani saat ini beserta nama atau nomor Loket yang melayani
4. THE Halaman_Admin SHALL menampilkan jumlah antrian yang menunggu untuk setiap Tipe_Antrian, diperbarui secara otomatis setiap kali terjadi pemanggilan atau penambahan antrian baru
5. WHEN petugas memilih Loket dan Tipe_Antrian, THE Halaman_Admin SHALL hanya menampilkan kontrol antrian untuk Tipe_Antrian yang dipilih pada Loket tersebut
6. WHEN petugas menekan tombol "Panggil Ulang" dan terdapat Nomor_Antrian yang sedang dilayani, THE Sistem_Antrian SHALL memutar ulang pengumuman suara untuk Nomor_Antrian yang sedang dilayani saat ini
7. IF petugas menekan tombol "Panggil Ulang" dan tidak terdapat Nomor_Antrian yang sedang dilayani, THEN THE Halaman_Admin SHALL menonaktifkan tombol "Panggil Ulang" atau menampilkan pesan yang mengindikasikan tidak ada antrian aktif untuk dipanggil ulang

### Requirement 3: Tampilan Status Antrian (Display)

**User Story:** Sebagai pasien yang menunggu, saya ingin melihat status antrian saat ini di layar display, sehingga saya mengetahui nomor antrian yang sedang dilayani dan perkiraan giliran saya.

#### Acceptance Criteria

1. THE Halaman_Display SHALL menampilkan Nomor_Antrian yang sedang dilayani untuk setiap Tipe_Antrian yang aktif, beserta jumlah antrian yang tersisa pada masing-masing Tipe_Antrian
2. WHEN antrian dipanggil oleh admin, THE Halaman_Display SHALL memperbarui tampilan dalam waktu maksimal 3 detik sejak pemanggilan tanpa perlu refresh manual oleh pengguna
3. THE Halaman_Display SHALL menampilkan informasi Loket yang melayani setiap Nomor_Antrian aktif
4. WHEN antrian baru dipanggil, THE Halaman_Display SHALL menampilkan penanda visual (highlight) pada Nomor_Antrian yang baru dipanggil selama minimal 5 detik untuk membedakannya dari antrian sebelumnya
5. IF tidak ada antrian aktif pada suatu Tipe_Antrian, THEN THE Halaman_Display SHALL menampilkan indikasi bahwa belum ada antrian yang dilayani untuk Tipe_Antrian tersebut
6. IF koneksi antara Halaman_Display dan server terputus, THEN THE Halaman_Display SHALL menampilkan indikator bahwa data mungkin tidak terkini kepada pengguna yang melihat display
7. THE Halaman_Display SHALL menerima Display_Filter melalui URL parameter (contoh: ?loket=1) untuk menentukan Loket mana yang ditampilkan pada instance display tersebut
8. WHEN Display_Filter dikonfigurasi dengan satu atau lebih nomor Loket, THE Halaman_Display SHALL hanya menampilkan informasi antrian yang terkait dengan Loket yang ditentukan dalam filter tersebut
9. IF Display_Filter tidak ditentukan atau kosong, THEN THE Halaman_Display SHALL menampilkan informasi antrian dari semua Loket yang aktif (mode gabungan)
10. WHEN antrian dipanggil pada Loket tertentu, THE Sound_Engine SHALL hanya memutar pengumuman suara pada instance Halaman_Display yang menampilkan Loket tersebut berdasarkan Display_Filter yang dikonfigurasi
11. THE Sistem_Antrian SHALL mendukung beberapa instance Halaman_Display berjalan secara bersamaan pada perangkat berbeda dengan Display_Filter yang berbeda-beda tanpa saling mempengaruhi

### Requirement 4: Pengumuman Suara (Sound Announcement)

**User Story:** Sebagai pasien yang menunggu, saya ingin mendengar pengumuman suara saat nomor antrian dipanggil, sehingga saya tidak perlu terus memperhatikan layar display.

#### Acceptance Criteria

1. WHEN antrian dipanggil, THE Sound_Engine SHALL memutar pengumuman suara dengan format: "Nomor antrian [NOMOR], silakan menuju [LOKET]", dan pengumuman diputar sebanyak 2 kali per panggilan
2. THE Sound_Engine SHALL memutar suara pengumuman melalui perangkat audio yang terhubung pada Halaman_Display
3. THE Sistem_Antrian SHALL menyediakan file audio untuk komponen berikut: angka (0-9), kata "nomor antrian", nama setiap Tipe_Antrian, kata "silakan menuju", dan nama setiap Loket
4. IF pengumuman suara gagal diputar, THEN THE Sistem_Antrian SHALL tetap menampilkan informasi antrian secara visual pada Halaman_Display tanpa perubahan pada tampilan atau fungsionalitas visual
5. IF terdapat lebih dari satu panggilan antrian dalam waktu bersamaan, THEN THE Sound_Engine SHALL memutar pengumuman secara berurutan (antrian FIFO) dengan jeda maksimal 1 detik antar pengumuman
6. WHEN petugas memanggil ulang nomor antrian yang sama, THE Sound_Engine SHALL memutar kembali pengumuman suara dengan format dan pengulangan yang sama seperti panggilan pertama

### Requirement 5: Manajemen Tipe Antrian Dinamis

**User Story:** Sebagai administrator sistem, saya ingin menambah, mengubah, atau menghapus tipe antrian, sehingga sistem dapat disesuaikan dengan kebutuhan layanan rumah sakit.

#### Acceptance Criteria

1. WHEN administrator menambahkan Tipe_Antrian baru, THE Sistem_Antrian SHALL menyimpan Tipe_Antrian tersebut dengan nama (maksimal 50 karakter), kode prefix (1-3 karakter alfabet uppercase, unik), dan status aktif
2. WHEN administrator mengubah Tipe_Antrian yang memiliki antrian sedang berjalan, THE Sistem_Antrian SHALL memperbarui konfigurasi Tipe_Antrian dan tetap mempertahankan nomor antrian yang sudah diterbitkan pada hari tersebut tanpa mengubah urutan atau status antrian yang sedang dilayani
3. WHEN administrator menonaktifkan Tipe_Antrian, THE Halaman_Pasien SHALL menyembunyikan Tipe_Antrian tersebut dari pilihan pengambilan antrian
4. IF administrator menonaktifkan Tipe_Antrian yang masih memiliki antrian aktif pada hari tersebut, THEN THE Sistem_Antrian SHALL menolak penonaktifan dan menampilkan pesan error yang menunjukkan jumlah antrian yang masih aktif
5. IF administrator menyimpan Tipe_Antrian dengan kode prefix yang sudah digunakan oleh Tipe_Antrian lain, THEN THE Sistem_Antrian SHALL menolak penyimpanan dan menampilkan pesan error yang menunjukkan bahwa kode prefix sudah digunakan
6. THE Sistem_Antrian SHALL menyediakan empat Tipe_Antrian default: Pendaftaran (A), Kasir (B), Farmasi (C), dan Fast Track (D) yang tidak dapat dihapus oleh administrator
7. THE Sistem_Antrian SHALL memvalidasi bahwa nama Tipe_Antrian tidak kosong dan kode prefix terdiri dari 1 hingga 3 karakter alfabet uppercase

### Requirement 6: Sinkronisasi Real-Time pada Jaringan Lokal

**User Story:** Sebagai pengguna sistem, saya ingin semua halaman tersinkronisasi secara real-time, sehingga informasi antrian selalu konsisten di semua perangkat.

#### Acceptance Criteria

1. WHEN status antrian berubah, THE Sistem_Antrian SHALL menyinkronkan perubahan ke semua client yang terhubung dalam waktu kurang dari 2 detik
2. THE Sistem_Antrian SHALL menggunakan komunikasi WebSocket untuk sinkronisasi real-time antar client dan Server_Lokal
3. IF koneksi client terputus, THEN THE Sistem_Antrian SHALL melakukan reconnect otomatis dengan interval 3 detik antar percobaan, maksimal 10 kali percobaan dalam 30 detik, dan menyinkronkan status antrian terbaru setelah koneksi berhasil dipulihkan
4. THE Sistem_Antrian SHALL berjalan pada Server_Lokal tanpa memerlukan koneksi internet
5. IF reconnect otomatis gagal setelah 10 kali percobaan, THEN THE Sistem_Antrian SHALL menampilkan indikasi koneksi terputus pada layar client dan terus mencoba reconnect setiap 10 detik hingga koneksi berhasil dipulihkan
6. WHILE koneksi client terputus dari Server_Lokal, THE Sistem_Antrian SHALL menampilkan data antrian terakhir yang diterima sebelum koneksi terputus beserta indikasi bahwa data belum diperbarui

### Requirement 7: Reset Antrian Harian

**User Story:** Sebagai administrator sistem, saya ingin antrian direset setiap hari, sehingga penomoran dimulai dari awal setiap hari kerja.

#### Acceptance Criteria

1. WHEN administrator menekan tombol "Reset Antrian", THE Sistem_Antrian SHALL menampilkan dialog konfirmasi yang menyebutkan tanggal dan jumlah total antrian yang akan direset, dan hanya melanjutkan proses reset jika administrator mengonfirmasi
2. WHEN administrator mengonfirmasi reset, THE Sistem_Antrian SHALL mengatur ulang semua Nomor_Antrian ke nol untuk semua Tipe_Antrian dan menampilkan pesan sukses yang menyebutkan jumlah antrian yang telah direset dalam waktu maksimal 5 detik
3. WHEN reset dilakukan, THE Sistem_Antrian SHALL menyimpan rekap data antrian hari tersebut yang mencakup: tanggal, jumlah antrian per Tipe_Antrian, jumlah antrian yang sudah dilayani, dan jumlah antrian yang belum dilayani, sebelum menghapus antrian aktif
4. THE Halaman_Admin SHALL menampilkan tombol "Reset Antrian" yang hanya dapat diakses oleh pengguna dengan peran administrator
5. IF proses reset gagal karena kegagalan penyimpanan rekap atau kegagalan sistem, THEN THE Sistem_Antrian SHALL membatalkan seluruh proses reset, mempertahankan data antrian yang ada tanpa perubahan, dan menampilkan pesan error yang menjelaskan penyebab kegagalan kepada administrator

### Requirement 8: Pencetakan Tiket Antrian

**User Story:** Sebagai pasien, saya ingin mendapatkan cetakan tiket antrian secara otomatis setelah mengambil nomor antrian, sehingga saya memiliki bukti fisik nomor antrian yang dapat saya bawa selama menunggu.

#### Acceptance Criteria

1. WHEN Nomor_Antrian berhasil dibuat, THE Sistem_Antrian SHALL mengirim perintah cetak ke Printer_Tiket yang terhubung pada Halaman_Pasien dan mencetak tiket dalam waktu maksimal 5 detik setelah pengambilan nomor antrian
2. THE Printer_Tiket SHALL mencetak tiket yang berisi informasi berikut: Nomor_Antrian, Tipe_Antrian, tanggal dan waktu pengambilan, serta jumlah antrian yang menunggu di depan pasien pada saat pengambilan
3. THE Sistem_Antrian SHALL memformat tiket dengan Nomor_Antrian ditampilkan dalam ukuran huruf besar agar mudah dibaca oleh pasien
4. IF Printer_Tiket tidak terhubung atau tidak terdeteksi oleh sistem, THEN THE Sistem_Antrian SHALL tetap menyimpan Nomor_Antrian ke dalam daftar tunggu, menampilkan Nomor_Antrian di layar Halaman_Pasien, dan menampilkan pesan peringatan bahwa tiket tidak dapat dicetak
5. IF terjadi kegagalan saat proses pencetakan (kertas habis, printer error), THEN THE Sistem_Antrian SHALL menampilkan pesan error yang menjelaskan penyebab kegagalan kepada pasien dan menyediakan opsi untuk mencetak ulang tiket
6. WHEN pasien memilih opsi cetak ulang, THE Sistem_Antrian SHALL mencetak ulang tiket dengan informasi yang sama seperti cetakan pertama
7. THE Sistem_Antrian SHALL mendukung koneksi ke Printer_Tiket bertipe thermal receipt printer yang terhubung langsung pada perangkat kiosk Halaman_Pasien

---

## Catatan Teknis: File Audio yang Diperlukan

Untuk fitur pengumuman suara, sistem memerlukan file audio (format MP3 atau WAV) berikut:

1. **Angka**: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9
2. **Kata penghubung**: "nomor antrian", "silakan menuju"
3. **Nama Loket**: "loket 1", "loket 2", "loket 3", dst. (sesuai jumlah loket)
4. **Nama Tipe Antrian**: "pendaftaran", "kasir", "farmasi", "fast track"
5. **Opsional**: Bell/chime sebagai penanda awal pengumuman

File audio ini dapat direkam menggunakan suara manusia atau menggunakan Text-to-Speech (TTS) engine. Sistem akan menggabungkan file-file audio ini secara dinamis untuk membentuk kalimat pengumuman lengkap.
