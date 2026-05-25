# Sistem Antrian RSI Muhammadiyah 2 Kendal

Aplikasi web berbasis jaringan lokal untuk mengelola antrian pasien di RSI Muhammadiyah 2 Kendal. Sistem ini mendukung beberapa tipe antrian (Pendaftaran, Kasir, Farmasi, Fast Track) dengan sinkronisasi real-time dan pengumuman suara otomatis.

## Fitur Utama

- **Halaman Pasien** — Kiosk untuk pengambilan nomor antrian dengan pencetakan tiket otomatis
- **Halaman Admin** — Panel kontrol petugas untuk memanggil dan mengelola antrian
- **Halaman Display** — Layar informasi antrian untuk ruang tunggu dengan pengumuman suara
- **Multi-Loket** — Mendukung beberapa loket dengan filter display per monitor
- **Real-time** — Sinkronisasi otomatis antar semua perangkat via WebSocket
- **Manajemen Tipe Antrian** — Tambah, ubah, atau nonaktifkan tipe antrian secara dinamis

## Prasyarat

- **Node.js** versi 18 atau lebih baru
- **npm** (termasuk dalam instalasi Node.js)
- Printer thermal receipt (opsional, untuk pencetakan tiket)
- Speaker/audio output pada perangkat display (untuk pengumuman suara)

## Instalasi

```bash
# Clone atau salin repository ke server lokal
cd antrian-rsi2

# Install dependencies
npm install
```

## Menjalankan Aplikasi

### Mode Produksi

```bash
npm start
```

Server akan berjalan di `http://localhost:3000` (atau port yang dikonfigurasi).

### Mode Development

```bash
npm run dev
```

Menggunakan nodemon untuk auto-restart saat ada perubahan file.

### Akses Halaman

| Halaman | URL |
|---------|-----|
| Pasien (Kiosk) | `http://<IP_SERVER>:3000/patient/` |
| Admin | `http://<IP_SERVER>:3000/admin/` |
| Display (Semua Loket) | `http://<IP_SERVER>:3000/display/` |
| Display (Loket 1) | `http://<IP_SERVER>:3000/display/?loket=1` |
| Display (Loket 1 & 2) | `http://<IP_SERVER>:3000/display/?loket=1,2` |

## Menjalankan Test

```bash
# Jalankan semua unit test
npm test

# Jalankan integration test
npm run test:integration

# Jalankan semua test (unit + integration)
npm run test:all
```

## File Audio

Sistem memerlukan file audio dalam format **MP3** untuk pengumuman suara. File-file ini ditempatkan di folder `public/audio/`.

### Daftar File Audio yang Diperlukan

| File | Isi/Konten |
|------|-----------|
| `bell.mp3` | Suara bell/chime sebagai penanda awal pengumuman |
| `nomor-antrian.mp3` | Rekaman suara "Nomor antrian" |
| `silakan-menuju.mp3` | Rekaman suara "Silakan menuju" |
| `0.mp3` - `9.mp3` | Rekaman suara angka 0 sampai 9 |
| `loket-1.mp3` - `loket-5.mp3` | Rekaman suara "Loket 1" sampai "Loket 5" |

### Panduan Perekaman Audio

- **Format**: MP3 (bitrate 128kbps atau lebih tinggi)
- **Sample rate**: 44100 Hz
- **Channel**: Mono
- **Durasi**: Sesingkat mungkin (0.5 - 2 detik per file)
- **Volume**: Konsisten antar semua file
- **Kualitas**: Jelas dan mudah didengar di ruangan besar
- Dapat menggunakan suara manusia atau Text-to-Speech (TTS) engine
- Pastikan tidak ada noise/kebisingan latar belakang

### Contoh Alur Pengumuman

Untuk nomor antrian **A-003** di **Loket 1**, sistem akan memutar:
```
[bell] → [nomor-antrian] → [0] → [0] → [3] → [silakan-menuju] → [loket-1]
```
Pengumuman diputar **2 kali** per panggilan.

## Panduan Deployment (Jaringan Lokal)

### 1. Persiapan Server

1. Siapkan komputer/server yang akan menjalankan aplikasi
2. Pastikan Node.js 18+ terinstall
3. Hubungkan server ke jaringan lokal rumah sakit
4. Catat IP address server (contoh: `192.168.1.100`)

### 2. Instalasi Aplikasi

```bash
# Salin folder aplikasi ke server
# Install dependencies
npm install

# Jalankan aplikasi
npm start
```

### 3. Konfigurasi Jaringan

- Pastikan semua perangkat (kiosk, monitor display, komputer admin) terhubung ke jaringan yang sama
- Buka port 3000 pada firewall server (jika ada)
- Tidak memerlukan koneksi internet

### 4. Setup Perangkat

#### Kiosk Pasien
- Buka browser ke `http://<IP_SERVER>:3000/patient/`
- Hubungkan printer thermal receipt via USB
- Set browser ke mode fullscreen (F11)

#### Monitor Display
- Buka browser ke `http://<IP_SERVER>:3000/display/?loket=<NOMOR>`
- Hubungkan speaker/audio output
- Set browser ke mode fullscreen (F11)
- Pastikan autoplay audio diizinkan di browser

#### Komputer Admin
- Buka browser ke `http://<IP_SERVER>:3000/admin/`

### 5. Tips Operasional

- Jalankan aplikasi sebagai service agar otomatis start saat server menyala
- Lakukan reset antrian setiap awal hari kerja melalui Halaman Admin
- Backup database (`data/antrian.db`) secara berkala
- Jika koneksi terputus, sistem akan otomatis reconnect

## Struktur Proyek

```
antrian-rsi2/
├── server/                    # Backend (Node.js + Express)
│   ├── index.js               # Entry point server
│   ├── database.js            # Koneksi & migrasi SQLite
│   ├── routes/                # REST API endpoints
│   │   ├── queue.js           # API operasi antrian
│   │   ├── queueType.js       # API manajemen tipe antrian
│   │   └── admin.js           # API admin (reset, rekap)
│   ├── services/              # Business logic
│   │   ├── queueService.js    # Logic antrian
│   │   ├── queueTypeService.js # Logic tipe antrian
│   │   └── resetService.js    # Logic reset harian
│   ├── socket/                # WebSocket handlers
│   │   ├── handler.js         # Socket.IO event handlers
│   │   └── broadcast.js       # Broadcast utilities
│   └── migrations/            # SQL migration files
│       └── 001_initial.sql    # Schema awal database
├── public/                    # Frontend (Static files)
│   ├── patient/               # Halaman Pasien (Kiosk)
│   ├── admin/                 # Halaman Admin
│   ├── display/               # Halaman Display
│   ├── shared/                # File bersama (CSS, JS)
│   │   ├── common.css         # Shared styles
│   │   └── socket-client.js   # Socket.IO client wrapper
│   └── audio/                 # File audio pengumuman
├── data/                      # Database SQLite
├── package.json
└── README.md
```

## Teknologi

- **Backend**: Node.js, Express, Socket.IO, better-sqlite3
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Database**: SQLite (file-based, zero-config)
- **Real-time**: WebSocket via Socket.IO
- **Printer**: ESC/POS via node-thermal-printer
- **Testing**: Jest, fast-check (property-based testing)

## Lisensi

ISC
