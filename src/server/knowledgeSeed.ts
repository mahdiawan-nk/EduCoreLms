import { db } from '../db/index.ts';
import {
  knowledgeCategories,
  knowledgeArticles,
  knowledgeArticleRoles,
  knowledgeTags,
  knowledgeArticleTags,
  knowledgeFaqs,
  knowledgeArticleVersions,
  roles,
} from '../db/schema.ts';
import { count, eq } from 'drizzle-orm';

export interface ArticleSectionSeed {
  ringkasan: string;
  prasyarat: string[];
  tujuan: string[];
  langkah: { title: string; detail: string }[];
  hasil: string;
  catatanPenting: string[];
  troubleshooting: { masalah: string; solusi: string }[];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildArticleDocument(spec: ArticleSectionSeed): {
  html: string;
  json: Record<string, any>;
} {
  const nodes: Record<string, any>[] = [];
  const htmlParts: string[] = [];

  const addHeading = (level: 2 | 3, text: string) => {
    nodes.push({
      type: 'heading',
      attrs: { level },
      content: [{ type: 'text', text }],
    });
    htmlParts.push(`<h${level}>${escapeHtml(text)}</h${level}>`);
  };

  const addParagraph = (text: string) => {
    nodes.push({
      type: 'paragraph',
      content: [{ type: 'text', text }],
    });
    htmlParts.push(`<p>${escapeHtml(text)}</p>`);
  };

  const addBulletList = (items: string[]) => {
    nodes.push({
      type: 'bulletList',
      content: items.map((item) => ({
        type: 'listItem',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: item }],
          },
        ],
      })),
    });
    htmlParts.push(
      `<ul>${items.map((item) => `<li><p>${escapeHtml(item)}</p></li>`).join('')}</ul>`
    );
  };

  const addOrderedList = (steps: { title: string; detail: string }[]) => {
    nodes.push({
      type: 'orderedList',
      content: steps.map((step) => ({
        type: 'listItem',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: step.title, marks: [{ type: 'bold' }] },
              { type: 'text', text: ` — ${step.detail}` },
            ],
          },
        ],
      })),
    });
    htmlParts.push(
      `<ol>${steps
        .map(
          (step) =>
            `<li><p><strong>${escapeHtml(step.title)}</strong> — ${escapeHtml(step.detail)}</p></li>`
        )
        .join('')}</ol>`
    );
  };

  const addCallout = (label: string, items: string[]) => {
    nodes.push({
      type: 'blockquote',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: label, marks: [{ type: 'bold' }] }],
        },
        ...items.map((item) => ({
          type: 'paragraph',
          content: [{ type: 'text', text: `• ${item}` }],
        })),
      ],
    });
    htmlParts.push(
      `<blockquote><p><strong>${escapeHtml(label)}</strong></p>${items
        .map((item) => `<p>• ${escapeHtml(item)}</p>`)
        .join('')}</blockquote>`
    );
  };

  addHeading(2, 'Ringkasan');
  addParagraph(spec.ringkasan);

  addHeading(2, 'Prasyarat');
  addBulletList(spec.prasyarat);

  addHeading(2, 'Tujuan');
  addBulletList(spec.tujuan);

  addHeading(2, 'Langkah Penggunaan');
  addOrderedList(spec.langkah);

  addHeading(2, 'Hasil yang Diharapkan');
  addParagraph(spec.hasil);

  if (spec.catatanPenting.length > 0) {
    addHeading(2, 'Catatan Penting');
    addCallout('Perhatian Operasional', spec.catatanPenting);
  }

  if (spec.troubleshooting.length > 0) {
    addHeading(2, 'Troubleshooting');
    addBulletList(
      spec.troubleshooting.map((t) => `Kendala: ${t.masalah} | Solusi: ${t.solusi}`)
    );
  }

  return {
    html: htmlParts.join('\n'),
    json: {
      type: 'doc',
      content: nodes,
    },
  };
}

interface SeedArticleInput {
  slug: string;
  categorySlug: string;
  title: string;
  excerpt: string;
  difficulty: 'PEMULA' | 'MENENGAH' | 'LANJUTAN';
  estimatedReadingMinutes: number;
  isFeatured: boolean;
  keywords: string;
  roles: ('SUPERADMIN' | 'DOSEN' | 'MAHASISWA' | 'AUDITOR')[];
  tags: string[];
  body: ArticleSectionSeed;
}

const INITIAL_CATEGORIES = [
  {
    name: 'Panduan Umum & Keamanan',
    slug: 'panduan-umum',
    description:
      'Panduan dasar login, keamanan akun, ganti password wajib, navigasi, dan penggunaan Knowledge Center untuk seluruh pengguna.',
    icon: 'Compass',
    sortOrder: 1,
  },
  {
    name: 'Panduan Superadmin',
    slug: 'panduan-superadmin',
    description:
      'Operasional administrasi institusi: periode akademik, manajemen pengguna, RBAC, system settings, audit log, dan CMS dokumentasi.',
    icon: 'ShieldCheck',
    sortOrder: 2,
  },
  {
    name: 'Panduan Dosen & Pengajaran',
    slug: 'panduan-dosen',
    description:
      'Panduan lengkap mengelola ruang kelas digital, materi, tugas, ujian, bank soal, penilaian, dan analytics pembelajaran.',
    icon: 'GraduationCap',
    sortOrder: 3,
  },
  {
    name: 'Panduan Mahasiswa',
    slug: 'panduan-mahasiswa',
    description:
      'Panduan bergabung ke kelas, mengakses materi, mengumpulkan tugas, mengikuti ujian digital, dan memantau hasil belajar.',
    icon: 'BookOpen',
    sortOrder: 4,
  },
  {
    name: 'Panduan Auditor (Read-Only)',
    slug: 'panduan-auditor',
    description:
      'Panduan pemeriksaan akademik, monitoring aktivitas, audit log keamanan, serta kebijakan pembatasan akses read-only.',
    icon: 'Eye',
    sortOrder: 5,
  },
];

const INITIAL_TAGS = [
  { name: 'Keamanan Akun', slug: 'keamanan-akun' },
  { name: 'Dashboard', slug: 'dashboard' },
  { name: 'Periode Akademik', slug: 'periode-akademik' },
  { name: 'Ruang Kelas', slug: 'ruang-kelas' },
  { name: 'Materi & Editor', slug: 'materi-editor' },
  { name: 'Tugas & Penilaian', slug: 'tugas-penilaian' },
  { name: 'Ujian & Bank Soal', slug: 'ujian-bank-soal' },
  { name: 'RBAC & Audit', slug: 'rbac-audit' },
  { name: 'System Settings', slug: 'system-settings' },
  { name: 'Read-Only', slug: 'read-only' },
];

const INITIAL_ARTICLES: SeedArticleInput[] = [
  // ── PANDUAN UMUM (ALL ROLES) ──────────────────────────────────────────────
  {
    slug: 'login-keamanan-profil-akun',
    categorySlug: 'panduan-umum',
    title: 'Login, Keamanan Sesi & Ganti Password Wajib',
    excerpt:
      'Cara masuk ke EduCoreLMS Politeknik Kampar, memahami mekanisme ganti password wajib, serta menjaga keamanan sesi pengguna.',
    difficulty: 'PEMULA',
    estimatedReadingMinutes: 4,
    isFeatured: true,
    keywords: 'login masuk password lupa sesi keamanan profil ganti password wajib',
    roles: ['SUPERADMIN', 'DOSEN', 'MAHASISWA', 'AUDITOR'],
    tags: ['keamanan-akun'],
    body: {
      ringkasan:
        'EduCoreLMS menggunakan autentikasi sesi berbasis cookie HTTP-only terenkripsi dan proteksi CSRF untuk menjaga keamanan akun sivitas akademika Politeknik Kampar.',
      prasyarat: [
        'Akun Anda telah terdaftar dan berstatus ACTIVE oleh Superadmin.',
        'Anda memiliki email institusi dan kata sandi awal atau kredensial Google yang terhubung.',
      ],
      tujuan: [
        'Berhasil masuk ke aplikasi EduCoreLMS sesuai role masing-masing.',
        'Memahami alur Force Password Change saat menerima kata sandi sementara.',
      ],
      langkah: [
        {
          title: 'Buka Halaman Login',
          detail: 'Akses alamat aplikasi EduCoreLMS dan pastikan Anda berada di rute /login.',
        },
        {
          title: 'Masukkan Kredensial',
          detail: 'Isi kolom Email dan Kata Sandi, lalu klik tombol Masuk.',
        },
        {
          title: 'Selesaikan Ganti Password Wajib (Jika Diminta)',
          detail:
            'Jika akun baru di-reset oleh Superadmin, sistem otomatis mengarahkan Anda ke halaman /auth/force-password-change. Masukkan kata sandi baru minimal 8 karakter dengan kombinasi huruf besar, huruf kecil, dan angka.',
        },
        {
          title: 'Keluar dari Aplikasi (Logout)',
          detail:
            'Klik menu profil pengguna di pojok kanan atas topbar, lalu pilih Keluar dan konfirmasi pada dialog logout.',
        },
      ],
      hasil:
        'Anda masuk ke Dashboard sesuai role dan sesi Anda terlindungi secara otomatis.',
      catatanPenting: [
        'Kata sandi baru tidak boleh sama dengan riwayat kata sandi sebelumnya.',
        'Percobaan login gagal berulang kali akan memicu pembatasan sementara (rate limit 429) demi mencegah brute-force.',
      ],
      troubleshooting: [
        {
          masalah: 'Muncul pesan "Email atau kata sandi tidak sesuai" atau akun tidak aktif.',
          solusi:
            'Pastikan huruf besar/kecil benar. Jika tetap gagal atau akun berstatus INACTIVE, hubungi Superadmin untuk aktivasi atau reset password.',
        },
        {
          masalah: 'Muncul pesan terlalu banyak percobaan masuk.',
          solusi: 'Tunggu beberapa puluh detik sesuai timer pada pesan galat sebelum mencoba masuk kembali.',
        },
      ],
    },
  },
  {
    slug: 'navigasi-pusat-bantuan-tema',
    categorySlug: 'panduan-umum',
    title: 'Navigasi Aplikasi, Branding Global & Pusat Bantuan',
    excerpt:
      'Mengenal struktur sidebar, topbar, mode ringkas, dan cara mencari panduan pada EduCoreLMS Knowledge Center.',
    difficulty: 'PEMULA',
    estimatedReadingMinutes: 3,
    isFeatured: false,
    keywords: 'navigasi sidebar topbar pusat bantuan knowledge center search faq',
    roles: ['SUPERADMIN', 'DOSEN', 'MAHASISWA', 'AUDITOR'],
    tags: ['dashboard'],
    body: {
      ringkasan:
        'Navigasi EduCoreLMS menyesuaikan hak akses (RBAC) setiap role. Menu Pusat Bantuan (/help) tersedia bagi seluruh role untuk membaca panduan resmi.',
      prasyarat: ['Sudah login ke dalam sistem EduCoreLMS.'],
      tujuan: [
        'Menemukan menu modul yang relevan dengan cepat.',
        'Menggunakan pencarian dan kategori di Knowledge Center.',
      ],
      langkah: [
        {
          title: 'Gunakan Sidebar Navigasi',
          detail:
            'Pada layar desktop, sidebar berada di sisi kiri. Anda dapat menekan tombol ciutkan untuk mengaktifkan mode ikon ringkas. Pada layar mobile, gunakan tombol menu di kiri atas topbar.',
        },
        {
          title: 'Buka Menu Pusat Bantuan',
          detail: 'Klik Pusat Bantuan pada sidebar untuk membuka halaman /help.',
        },
        {
          title: 'Cari Artikel atau FAQ',
          detail:
            'Ketik kata kunci pada kolom pencarian di bagian atas Knowledge Center atau pilih kategori yang tersedia di sisi kiri.',
        },
      ],
      hasil: 'Anda dapat berpindah antarmodul dengan lancar dan menemukan panduan sesuai role.',
      catatanPenting: [
        'Artikel yang tampil di Pusat Bantuan difilter otomatis di server berdasarkan role akun Anda.',
      ],
      troubleshooting: [
        {
          masalah: 'Menu tertentu tidak muncul di sidebar.',
          solusi:
            'Visibilitas menu dikendalikan oleh permission RBAC role Anda. Hubungi Superadmin jika Anda merasa memerlukan akses tambahan.',
        },
      ],
    },
  },

  // ── SUPERADMIN DOCUMENTATION ──────────────────────────────────────────────
  {
    slug: 'superadmin-dashboard-ringkasan-akademik',
    categorySlug: 'panduan-superadmin',
    title: 'Dashboard Superadmin & Ringkasan Akademik Institusi',
    excerpt:
      'Memahami statistik pengguna, ruang kelas, periode akademik aktif, aktivitas sistem, dan quick actions pada Dashboard Superadmin.',
    difficulty: 'PEMULA',
    estimatedReadingMinutes: 4,
    isFeatured: true,
    keywords: 'dashboard superadmin statistik pengguna kelas periode akademik quick actions',
    roles: ['SUPERADMIN'],
    tags: ['dashboard'],
    body: {
      ringkasan:
        'Dashboard Superadmin menyajikan ringkasan kondisi institusi Politeknik Kampar secara real-time dari database PostgreSQL.',
      prasyarat: ['Login menggunakan akun dengan role SUPERADMIN.'],
      tujuan: [
        'Memantau metrik pengguna aktif, dosen, mahasiswa, serta ruang kelas digital.',
        'Mengakses modul administrasi secara cepat melalui tombol Quick Actions.',
      ],
      langkah: [
        {
          title: 'Buka Dashboard',
          detail: 'Klik menu Dashboard (/) setelah login sebagai Superadmin.',
        },
        {
          title: 'Tinjau Kartu Statistik Utama',
          detail:
            'Periksa ringkasan jumlah total pengguna, kelas aktif, materi, tugas, ujian, dan periode akademik yang sedang aktif.',
        },
        {
          title: 'Filter Berdasarkan Periode Akademik',
          detail:
            'Gunakan dropdown Periode Akademik di bagian atas dashboard untuk melihat metrik pada semester tertentu.',
        },
        {
          title: 'Gunakan Quick Actions',
          detail:
            'Klik pintasan cepat untuk langsung menuju Manajemen Pengguna, Buat Ruang Kelas, Periode Akademik, atau Pengaturan Sistem.',
        },
      ],
      hasil: 'Superadmin memperoleh gambaran menyeluruh status akademik dan operasional sistem.',
      catatanPenting: [
        'Data statistik dihitung langsung dari aktivitas aktual di database tanpa angka dummy.',
      ],
      troubleshooting: [
        {
          masalah: 'Angka kelas pada periode tertentu tampak kosong.',
          solusi: 'Pastikan filter Periode Akademik sudah memilih semester yang memiliki kelas terdaftar.',
        },
      ],
    },
  },
  {
    slug: 'superadmin-manajemen-periode-akademik',
    categorySlug: 'panduan-superadmin',
    title: 'Manajemen Periode Akademik & Siklus Semester',
    excerpt:
      'Cara membuat, mengedit, mengaktifkan, dan mengarsipkan periode akademik (semester) beserta dampaknya pada ruang kelas.',
    difficulty: 'MENENGAH',
    estimatedReadingMinutes: 6,
    isFeatured: false,
    keywords: 'periode akademik semester ganjil genap aktif arsip siklus akademik',
    roles: ['SUPERADMIN'],
    tags: ['periode-akademik'],
    body: {
      ringkasan:
        'Modul Periode Akademik (/academic-periods) mengelola tahun ajaran dan semester yang menjadi acuan ruang kelas digital.',
      prasyarat: ['Akun SUPERADMIN dengan permission academic_period.view dan academic_period.manage.'],
      tujuan: [
        'Membuat periode akademik baru.',
        'Menentukan satu periode aktif sebagai default pembuatan ruang kelas.',
        'Mengarsipkan periode yang telah selesai.',
      ],
      langkah: [
        {
          title: 'Buka Menu Periode Akademik',
          detail: 'Pada sidebar grup MANAJEMEN AKADEMIK, klik Periode Akademik (/academic-periods).',
        },
        {
          title: 'Tambah Periode Baru',
          detail:
            'Klik tombol Tambah Periode Akademik, lalu isi kode periode, nama periode (misal: 2026/2027 Ganjil), jenis semester, tanggal mulai, dan tanggal selesai.',
        },
        {
          title: 'Tetapkan Periode Aktif',
          detail:
            'Klik aksi Aktifkan pada baris periode yang diinginkan. Sistem akan menandai periode tersebut sebagai periode aktif institusi.',
        },
        {
          title: 'Arsipkan Periode Lama',
          detail:
            'Untuk semester yang telah berakhir, gunakan aksi Arsipkan agar tetap tersimpan dalam riwayat tanpa mengganggu daftar semester berjalan.',
        },
      ],
      hasil: 'Periode akademik tersimpan dan langsung tersedia saat dosen atau Superadmin membuat ruang kelas.',
      catatanPenting: [
        'Mengarsipkan periode tidak menghapus data ruang kelas, materi, tugas, atau nilai yang sudah tercatat di periode tersebut.',
      ],
      troubleshooting: [
        {
          masalah: 'Gagal menyimpan periode baru karena tanggal tidak valid.',
          solusi: 'Pastikan Tanggal Selesai lebih besar daripada Tanggal Mulai dan kode periode bersifat unik.',
        },
      ],
    },
  },
  {
    slug: 'superadmin-manajemen-pengguna-impersonation',
    categorySlug: 'panduan-superadmin',
    title: 'Manajemen Pengguna, Reset Password, Import Excel/CSV & Account Switching',
    excerpt:
      'Panduan lengkap CRUD pengguna, aktivasi akun, reset password wajib ganti, import massal Excel/CSV, export data, dan Account Switching.',
    difficulty: 'MENENGAH',
    estimatedReadingMinutes: 8,
    isFeatured: true,
    keywords: 'pengguna user tambah edit reset password import excel csv template export impersonation switch account',
    roles: ['SUPERADMIN'],
    tags: ['keamanan-akun', 'rbac-audit'],
    body: {
      ringkasan:
        'Halaman Manajemen Pengguna (/admin/users) memungkinkan Superadmin mengelola seluruh akun Dosen, Mahasiswa, Auditor, dan staf secara terpusat.',
      prasyarat: ['Login sebagai SUPERADMIN dengan permission users:manage.'],
      tujuan: [
        'Menambah, mengubah, mengaktifkan, dan menonaktifkan akun.',
        'Melakukan reset password (otomatis/manual) dan import massal Excel/CSV.',
        'Menggunakan fitur Switch Account (Impersonation) untuk troubleshooting.',
      ],
      langkah: [
        {
          title: 'Buka Manajemen Pengguna',
          detail: 'Klik Manajemen Pengguna (/admin/users) di sidebar SISTEM & KEAMANAN.',
        },
        {
          title: 'Tambah atau Edit Pengguna',
          detail:
            'Klik Tambah Pengguna untuk membuat akun baru, atau ikon Edit pada kolom Aksi untuk memperbarui nama, email, NIM/NIDN/NIP, dan role.',
        },
        {
          title: 'Reset Password Pengguna',
          detail:
            'Klik ikon Reset Password pada kolom Aksi. Anda dapat memilih generate password acak otomatis atau memasukkan kata sandi sementara manual, serta mengaktifkan opsi Wajib Ganti Password saat login berikutnya.',
        },
        {
          title: 'Import Massal Excel / CSV & Export',
          detail:
            'Klik tombol Import Pengguna untuk mengunduh template Excel/CSV resmi, isi data pengguna, lalu unggah file untuk validasi dan import massal. Gunakan tombol Export untuk mengunduh daftar pengguna.',
        },
        {
          title: 'Gunakan Switch Account (Impersonation)',
          detail:
            'Klik ikon Switch Account pada kolom Aksi (setelah Reset Password) untuk masuk sementara ke sesi pengguna lain guna memeriksa kendala tampilan/akses. Banner impersonation akan tampil di bagian atas dan Anda dapat menekan Kembali ke Superadmin kapan saja.',
        },
      ],
      hasil: 'Seluruh siklus manajemen identitas pengguna berjalan tertib dan tercatat otomatis dalam Audit Log.',
      catatanPenting: [
        'Akun berstatus INACTIVE tidak dapat di-impersonate.',
        'Nested impersonation (berpindah dari akun impersonasi ke akun ketiga) diblokir oleh backend.',
      ],
      troubleshooting: [
        {
          masalah: 'Import Excel/CSV gagal pada beberapa baris.',
          solusi:
            'Periksa pesan validasi per baris pada pratinjau import; pastikan format email valid dan NIM/NIDN tidak duplikat.',
        },
      ],
    },
  },
  {
    slug: 'superadmin-rbac-hak-akses',
    categorySlug: 'panduan-superadmin',
    title: 'Role & Permission (RBAC) serta Dampak Pencabutan Akses',
    excerpt:
      'Memahami 4 role kanonik (SUPERADMIN, DOSEN, MAHASISWA, AUDITOR), matriks permission, visibilitas navigasi, dan audit perubahan.',
    difficulty: 'LANJUTAN',
    estimatedReadingMinutes: 6,
    isFeatured: false,
    keywords: 'rbac role permission superadmin dosen mahasiswa auditor hak akses audit',
    roles: ['SUPERADMIN'],
    tags: ['rbac-audit'],
    body: {
      ringkasan:
        'Halaman Role & Permission (/admin/rbac) mengatur izin granular setiap role di seluruh aplikasi.',
      prasyarat: ['Login sebagai SUPERADMIN dengan permission rbac:manage.'],
      tujuan: [
        'Memahami pembagian wewenang SUPERADMIN, DOSEN, MAHASISWA, dan AUDITOR.',
        'Mengelola centang permission per role dengan aman.',
      ],
      langkah: [
        {
          title: 'Buka Role & Permission (RBAC)',
          detail: 'Klik menu Role & Permission (RBAC) (/admin/rbac) pada sidebar.',
        },
        {
          title: 'Pilih Role yang Akan Diatur',
          detail: 'Pilih salah satu role (misal DOSEN atau MAHASISWA) untuk melihat daftar permission per modul.',
        },
        {
          title: 'Perbarui & Simpan Permission',
          detail:
            'Aktifkan atau nonaktifkan permission sesuai kebutuhan operasional, lalu simpan perubahan. Sistem langsung mencatat perubahan ke Audit Log.',
        },
      ],
      hasil: 'Menu sidebar dan otorisasi API menyesuaikan permission terbaru secara konsisten.',
      catatanPenting: [
        'Role SUPERADMIN bersifat terproteksi sehingga permission kritis tidak dapat dicabut.',
        'Role AUDITOR hanya dapat memiliki permission bertipe VIEW (read-only); backend memblokir seluruh mutasi dari Auditor.',
      ],
      troubleshooting: [
        {
          masalah: 'Pengguna tidak langsung melihat perubahan menu setelah permission diubah.',
          solusi: 'Minta pengguna me-refresh halaman agar sesi /auth/me memuat ulang daftar permission terbaru.',
        },
      ],
    },
  },
  {
    slug: 'superadmin-manajemen-ruang-kelas-delegasi',
    categorySlug: 'panduan-superadmin',
    title: 'Manajemen Ruang Kelas & Delegated Creation untuk Dosen',
    excerpt:
      'Cara Superadmin memantau seluruh kelas, membuatkan kelas untuk dosen (Delegated Creation), mengelola co-instructor, visibility, dan arsip.',
    difficulty: 'MENENGAH',
    estimatedReadingMinutes: 6,
    isFeatured: false,
    keywords: 'ruang kelas delegated creation dosen pengampu co-instructor public private arsip',
    roles: ['SUPERADMIN'],
    tags: ['ruang-kelas'],
    body: {
      ringkasan:
        'Superadmin dapat melihat seluruh ruang kelas lintas periode serta membantu dosen membuat kelas melalui mekanisme Delegated Classroom Creation.',
      prasyarat: ['Akun SUPERADMIN dan minimal satu akun DOSEN aktif serta periode akademik tersedia.'],
      tujuan: [
        'Membuat ruang kelas dengan menunjuk Dosen Pengampu Utama (Primary Instructor).',
        'Mengatur visibility PUBLIC/PRIVATE, co-instructor, peserta, dan status arsip.',
      ],
      langkah: [
        {
          title: 'Buka Buat Ruang Kelas (Wizard)',
          detail: 'Klik Buat Ruang Kelas (Wizard) (/classrooms/new) pada sidebar.',
        },
        {
          title: 'Lengkapi Step 1 & Step 2',
          detail: 'Isi identitas kelas (judul, kode kelas, deskripsi, cover opsional) dan pilih periode akademik.',
        },
        {
          title: 'Tentukan Dosen Pengampu di Step 3 (Tim Pengajar)',
          detail:
            'Karena login sebagai Superadmin, pilih Dosen Pengampu Utama (wajib) dan tambahkan Co-Instructor/Asisten bila perlu. Superadmin tidak otomatis menjadi pemilik akademik kelas.',
        },
        {
          title: 'Atur Visibility & Publikasi (Step 4 & 5)',
          detail:
            'Pilih visibility PUBLIC (dapat ditemukan mahasiswa) atau PRIVATE (memerlukan kode/link undangan), tinjau ringkasan, lalu terbitkan kelas.',
        },
      ],
      hasil: 'Ruang kelas tercatat dengan Dosen terpilih sebagai pemilik akademik dan tampil pada daftar kelas dosen tersebut.',
      catatanPenting: [
        'Superadmin tetap dapat meninjau peserta, mengubah pengaturan kelas, atau mengarsipkan kelas dari /classrooms/:id.',
      ],
      troubleshooting: [
        {
          masalah: 'Tombol lanjut pada Step 3 tidak aktif.',
          solusi: 'Pastikan Anda telah memilih minimal satu Dosen Pengampu Utama dari daftar dosen aktif.',
        },
      ],
    },
  },
  {
    slug: 'superadmin-system-settings-branding',
    categorySlug: 'panduan-superadmin',
    title: 'System Settings: Identitas, Logo, Favicon, SEO & Preset Warna',
    excerpt:
      'Mengatur nama institusi, logo, favicon, metadata SEO, dan preset warna global EduCoreLMS untuk seluruh role.',
    difficulty: 'PEMULA',
    estimatedReadingMinutes: 5,
    isFeatured: true,
    keywords: 'system settings pengaturan sistem logo favicon seo preset warna tema branding',
    roles: ['SUPERADMIN'],
    tags: ['system-settings'],
    body: {
      ringkasan:
        'Halaman Pengaturan Sistem (/admin/settings) menjadi pusat konfigurasi tampilan global EduCoreLMS. Perubahan langsung berlaku untuk Superadmin, Dosen, Mahasiswa, dan Auditor.',
      prasyarat: ['Login sebagai SUPERADMIN dengan permission system_settings.view dan manage.'],
      tujuan: [
        'Memperbarui identitas institusi, logo institusi/aplikasi, dan favicon.',
        'Mengaktifkan preset warna akademik yang seragam di seluruh perangkat.',
      ],
      langkah: [
        {
          title: 'Buka Pengaturan Sistem',
          detail: 'Klik menu Pengaturan Sistem (/admin/settings) di sidebar SISTEM & KEAMANAN.',
        },
        {
          title: 'Kelola Identitas & Branding',
          detail:
            'Pada tab Identitas Institusi & Branding, perbarui nama institusi, unggah logo resmi (PNG/JPG/WEBP/SVG aman), dan unggah favicon. Brand utama aplikasi tetap terkunci sebagai EduCoreLMS.',
        },
        {
          title: 'Atur SEO & Metadata',
          detail: 'Lengkapi judul situs, meta deskripsi, dan tag SEO pada tab SEO & Metadata.',
        },
        {
          title: 'Pilih Preset Warna Akademik',
          detail:
            'Buka tab Tema & Tampilan, pilih salah satu preset warna resmi (misal Teal Akademik atau Navy Institusi), lalu klik Terapkan Tema.',
        },
      ],
      hasil: 'Logo, favicon, dan warna sidebar/topbar/tombol utama diperbarui di database dan disinkronkan ke seluruh role.',
      catatanPenting: [
        'File SVG yang diunggah disanitasi otomatis di server untuk mencegah script berbahaya (XSS).',
      ],
      troubleshooting: [
        {
          masalah: 'Logo belum berubah di tab browser lain.',
          solusi: 'Lakukan refresh ringan atau tunggu beberapa detik karena sinkronisasi lintas tab berjalan otomatis.',
        },
      ],
    },
  },
  {
    slug: 'superadmin-audit-log-keamanan',
    categorySlug: 'panduan-superadmin',
    title: 'Membaca Audit Log & Pemantauan Keamanan Sistem',
    excerpt:
      'Cara menelusuri aktivitas login, perubahan RBAC, reset password, switching account, dan perubahan pengaturan sistem.',
    difficulty: 'MENENGAH',
    estimatedReadingMinutes: 4,
    isFeatured: false,
    keywords: 'audit log keamanan login gagal rbac reset password impersonation',
    roles: ['SUPERADMIN'],
    tags: ['rbac-audit', 'keamanan-akun'],
    body: {
      ringkasan:
        'Menu Log Audit Keamanan (/admin/audit-logs) merekam jejak aktivitas penting secara kronologis dan tidak dapat diubah.',
      prasyarat: ['Login sebagai SUPERADMIN dengan permission audit:view.'],
      tujuan: [
        'Memantau aktivitas autentikasi, mutasi pengguna, perubahan RBAC, dan impersonation.',
      ],
      langkah: [
        {
          title: 'Buka Log Audit Keamanan',
          detail: 'Klik Log Audit Keamanan (/admin/audit-logs) pada sidebar.',
        },
        {
          title: 'Gunakan Filter Pencarian',
          detail: 'Saring log berdasarkan jenis aksi (action), tipe entitas, atau kata kunci aktor.',
        },
        {
          title: 'Periksa Detail Kejadian',
          detail: 'Klik baris log untuk melihat payload perubahan, alamat IP, dan timestamp lengkap.',
        },
      ],
      hasil: 'Superadmin dapat memverifikasi setiap tindakan administratif dan mendeteksi anomali keamanan.',
      catatanPenting: [
        'Audit log bersifat append-only dan mencakup metadata impersonation (siapa Superadmin yang sedang menyamar).',
      ],
      troubleshooting: [
        {
          masalah: 'Daftar log terlalu panjang.',
          solusi: 'Gunakan filter tipe aksi atau entitas untuk mempersempit hasil pencarian.',
        },
      ],
    },
  },
  {
    slug: 'superadmin-kelola-knowledge-center',
    categorySlug: 'panduan-superadmin',
    title: 'Mengelola Artikel, Kategori & FAQ di Knowledge Center',
    excerpt:
      'Panduan menggunakan CMS Knowledge Center (/admin/help) untuk membuat, mengedit dengan editor kaya, mempublikasikan, dan mengatur hak akses role artikel.',
    difficulty: 'MENENGAH',
    estimatedReadingMinutes: 6,
    isFeatured: false,
    keywords: 'knowledge center cms artikel kategori tag faq publish draft archive',
    roles: ['SUPERADMIN'],
    tags: ['materi-editor'],
    body: {
      ringkasan:
        'CMS Knowledge Center (/admin/help) memungkinkan Superadmin memelihara dokumentasi resmi aplikasi secara dinamis.',
      prasyarat: ['Login sebagai SUPERADMIN dengan permission knowledge.manage.'],
      tujuan: [
        'Membuat dan menyunting artikel panduan menggunakan Tiptap editor.',
        'Mengatur role audience (SUPERADMIN, DOSEN, MAHASISWA, AUDITOR), status publikasi, kategori, tag, dan FAQ.',
      ],
      langkah: [
        {
          title: 'Buka Kelola Knowledge Center',
          detail: 'Klik Kelola Knowledge Center (/admin/help) di sidebar atau tombol Kelola Dokumentasi pada halaman /help.',
        },
        {
          title: 'Buat atau Edit Artikel',
          detail:
            'Klik Buat Artikel Baru, isi judul, ringkasan, kategori, tingkat kesulitan, estimasi waktu baca, kata kunci pencarian, serta pilih role yang diizinkan membaca artikel.',
        },
        {
          title: 'Tulis Konten dengan Editor',
          detail:
            'Gunakan toolbar editor untuk menambahkan heading, daftar bernomor/bullet, tabel, blok kode, gambar, dan blok kutipan/peringatan.',
        },
        {
          title: 'Publikasikan & Pantau Riwayat Versi',
          detail:
            'Ubah status menjadi PUBLISHED agar tampil di /help. Setiap pembaruan otomatis menyimpan snapshot versi di tab Riwayat Versi.',
        },
      ],
      hasil: 'Dokumentasi langsung tersedia bagi role yang dipilih pada halaman /help.',
      catatanPenting: [
        'Pastikan role audience dipilih dengan tepat agar panduan internal Superadmin tidak terlihat oleh Mahasiswa atau Dosen.',
      ],
      troubleshooting: [
        {
          masalah: 'Artikel baru belum muncul di halaman /help.',
          solusi: 'Periksa status artikel — hanya artikel berstatus PUBLISHED yang tampil di Pusat Bantuan.',
        },
      ],
    },
  },
  {
    slug: 'superadmin-emergency-account-recovery',
    categorySlug: 'panduan-superadmin',
    title: 'Superadmin Emergency Account Recovery (CLI Resmi)',
    excerpt:
      'Prosedur pemulihan darurat akun Superadmin melalui CLI resmi aplikasi ketika administrator utama lupa kata sandi dan tidak dapat login.',
    difficulty: 'LANJUTAN',
    estimatedReadingMinutes: 6,
    isFeatured: false,
    keywords: 'recovery emergency superadmin lupa password cli terminal reset darurat',
    roles: ['SUPERADMIN'],
    tags: ['keamanan-akun', 'rbac-audit'],
    body: {
      ringkasan:
        'Fitur Superadmin Emergency Account Recovery menyediakan skrip CLI resmi (scripts/recover-superadmin.ts) untuk memulihkan akses akun Superadmin tanpa manipulasi SQL manual ke database.',
      prasyarat: [
        'Akses terminal server yang berwenang ke direktori proyek EduCoreLMS.',
        'Variabel environment database (SQL_HOST, SQL_USER, SQL_PASSWORD, SQL_DB_NAME) aktif dan terhubung ke PostgreSQL.',
        'Akun target berstatus ACTIVE dan memiliki role SUPERADMIN.',
      ],
      tujuan: [
        'Menghasilkan kata sandi sementara yang aman secara kriptografis.',
        'Mencabut seluruh sesi aktif lama, mencatat audit log, dan mewajibkan penggantian kata sandi pada login berikutnya.',
      ],
      langkah: [
        {
          title: 'Jalankan Skrip Recovery Resmi',
          detail:
            'Pada terminal server, jalankan perintah: bun run scripts/recover-superadmin.ts <email-superadmin> (atau npx tsx scripts/recover-superadmin.ts <email-superadmin>). Jangan memasukkan kata sandi melalui argumen CLI.',
        },
        {
          title: 'Verifikasi Identitas & Konfirmasi Eksplisit',
          detail:
            'Periksa nama, email, dan status akun yang ditampilkan, lalu ketik RECOVER-SUPERADMIN untuk mengonfirmasi pemulihan.',
        },
        {
          title: 'Simpan Kata Sandi Sementara (Ditampilkan Satu Kali)',
          detail:
            'Catat kata sandi sementara yang tampil di terminal secara aman. Kata sandi ini hanya ditampilkan satu kali dan tidak pernah disimpan dalam bentuk plaintext maupun dicatat ke audit log.',
        },
        {
          title: 'Login & Selesaikan Penggantian Kata Sandi Wajib',
          detail:
            'Buka halaman /login, masuk dengan email Superadmin dan kata sandi sementara. Sistem otomatis mengarahkan ke /auth/force-password-change untuk membuat kata sandi permanen baru yang memenuhi kebijakan keamanan dan berbeda dari kata sandi sebelumnya.',
        },
      ],
      hasil:
        'Akses Superadmin pulih, seluruh sesi lama telah dicabut, role dan permission tetap utuh, dan kejadian tercatat di Audit Log sebagai SUPERADMIN_PASSWORD_RECOVERY.',
      catatanPenting: [
        'Dilarang mengubah password melalui SQL manual, PostgreSQL console, atau manipulasi database langsung.',
        'Skrip ini menolak akun dengan role DOSEN, MAHASISWA, AUDITOR, maupun akun yang berstatus tidak aktif.',
      ],
      troubleshooting: [
        {
          masalah: 'Pemulihan ditolak dengan pesan akun bukan SUPERADMIN atau tidak aktif.',
          solusi:
            'Pastikan email yang dimasukkan benar-benar milik Superadmin yang berstatus ACTIVE.',
        },
        {
          masalah: 'Transaksi gagal di tengah jalan.',
          solusi:
            'Seluruh perubahan berjalan dalam satu transaksi database sehingga otomatis di-rollback tanpa mengubah password ataupun menampilkan kredensial.',
        },
      ],
    },
  },

  // ── DOSEN DOCUMENTATION ───────────────────────────────────────────────────
  {
    slug: 'dosen-dashboard-profil',
    categorySlug: 'panduan-dosen',
    title: 'Dashboard Dosen & Keamanan Akun Pengajar',
    excerpt:
      'Memahami ringkasan kelas yang diampu, tugas menunggu penilaian, aktivitas kelas terbaru, serta keamanan akun dosen.',
    difficulty: 'PEMULA',
    estimatedReadingMinutes: 4,
    isFeatured: true,
    keywords: 'dashboard dosen kelas diampu penilaian keamanan akun profil',
    roles: ['DOSEN', 'SUPERADMIN'],
    tags: ['dashboard', 'keamanan-akun'],
    body: {
      ringkasan:
        'Dashboard Dosen (/) menampilkan ringkasan beban mengajar pada periode akademik aktif, jumlah mahasiswa, dan tugas/ujian yang memerlukan pemeriksaan.',
      prasyarat: ['Login menggunakan akun dengan role DOSEN.'],
      tujuan: [
        'Memantau progres kelas yang diampu dengan cepat.',
        'Menjaga keamanan akun dosen.',
      ],
      langkah: [
        {
          title: 'Masuk ke Dashboard Dosen',
          detail: 'Setelah login, Anda langsung diarahkan ke halaman Dashboard (/).',
        },
        {
          title: 'Filter Periode Akademik',
          detail: 'Pilih semester pada dropdown Periode Akademik untuk melihat statistik kelas pada periode tersebut.',
        },
        {
          title: 'Akses Kelas dari Daftar Cepat',
          detail: 'Klik kartu kelas atau gunakan tombol pintasan untuk masuk ke ruang kelas digital (/classrooms/:id).',
        },
      ],
      hasil: 'Dosen dapat memprioritaskan pemeriksaan tugas, esai ujian, dan pengelolaan kelas secara efisien.',
      catatanPenting: ['Pastikan selalu logout setelah menggunakan komputer laboratorium atau ruang dosen bersama.'],
      troubleshooting: [
        {
          masalah: 'Kelas tidak tampil di Dashboard.',
          solusi: 'Periksa filter Periode Akademik di bagian atas atau buka menu Ruang Kelas (/classrooms) untuk melihat semua kelas.',
        },
      ],
    },
  },
  {
    slug: 'dosen-wizard-buat-ruang-kelas',
    categorySlug: 'panduan-dosen',
    title: 'Cara Membuat Ruang Kelas Digital melalui Wizard 5 Langkah',
    excerpt:
      'Panduan langkah demi langkah membuat ruang kelas baru: identitas, periode akademik, tim pengajar, visibility PUBLIC/PRIVATE, dan publikasi.',
    difficulty: 'PEMULA',
    estimatedReadingMinutes: 6,
    isFeatured: true,
    keywords: 'buat ruang kelas wizard step identitas cover periode akademik visibility public private',
    roles: ['DOSEN', 'SUPERADMIN'],
    tags: ['ruang-kelas'],
    body: {
      ringkasan:
        'Classroom Creation Wizard (/classrooms/new) memandu dosen menyiapkan ruang kelas digital terstruktur dalam 5 langkah.',
      prasyarat: [
        'Akun DOSEN aktif.',
        'Periode akademik tersedia di sistem.',
      ],
      tujuan: [
        'Membuat ruang kelas baru lengkap dengan identitas, cover image opsional, dan aturan pendaftaran.',
      ],
      langkah: [
        {
          title: 'Buka Wizard Pembuatan Kelas',
          detail: 'Klik Buat Ruang Kelas (Wizard) pada sidebar atau tombol + Buat Kelas di halaman /classrooms.',
        },
        {
          title: 'Step 1 — Identitas Kelas',
          detail:
            'Masukkan nama kelas, kode kelas/mata kuliah, deskripsi singkat, dan unggah cover image (opsional; jika kosong, card memakai gradient dinamis).',
        },
        {
          title: 'Step 2 — Konteks Akademik',
          detail: 'Pilih Periode Akademik, program studi/semester, dan bobot SKS.',
        },
        {
          title: 'Step 3 — Tim Pengajar',
          detail: 'Anda otomatis terdaftar sebagai Dosen Pengampu Utama dan dapat menambahkan Co-Instructor jika mengajar tim.',
        },
        {
          title: 'Step 4 — Aturan Pendaftaran & Visibility',
          detail:
            'Pilih visibility PUBLIC (muncul di direktori kelas publik) atau PRIVATE (hanya dapat diakses via kode/link undangan) serta atur persetujuan pendaftaran.',
        },
        {
          title: 'Step 5 — Review & Publikasi',
          detail: 'Periksa seluruh ringkasan konfigurasi, lalu klik Publikasikan Kelas.',
        },
      ],
      hasil: 'Ruang kelas berhasil dibuat dan tampil pada daftar kelas yang Anda kelola di /classrooms.',
      catatanPenting: [
        'Cover image yang diunggah otomatis dioptimasi oleh sistem untuk performa tampilan cepat.',
      ],
      troubleshooting: [
        {
          masalah: 'Tidak ada pilihan periode akademik di Step 2.',
          solusi: 'Hubungi Superadmin untuk membuat atau mengaktifkan periode akademik terlebih dahulu.',
        },
      ],
    },
  },
  {
    slug: 'dosen-kelola-mahasiswa-invitation-co-instructor',
    categorySlug: 'panduan-dosen',
    title: 'Mengelola Mahasiswa, Persetujuan Enrollment, Invitation Code & Co-Instructor',
    excerpt:
      'Cara membagikan kode/link undangan kelas, menyetujui pendaftaran mahasiswa, mengelola peserta, dan menambah co-instructor.',
    difficulty: 'MENENGAH',
    estimatedReadingMinutes: 5,
    isFeatured: false,
    keywords: 'invitation code link undangan mahasiswa enrollment setujui co-instructor peserta',
    roles: ['DOSEN', 'SUPERADMIN'],
    tags: ['ruang-kelas'],
    body: {
      ringkasan:
        'Pengaturan peserta dan tim pengajar berada di dalam halaman Ruang Kelas (/classrooms/:id) pada tab Peserta & Pengaturan.',
      prasyarat: ['Anda adalah Dosen Pengampu atau Co-Instructor pada ruang kelas terkait.'],
      tujuan: [
        'Mengundang mahasiswa ke kelas PUBLIC maupun PRIVATE.',
        'Menyetujui atau mengelola daftar peserta kelas.',
      ],
      langkah: [
        {
          title: 'Salin Invitation Code atau Link',
          detail:
            'Buka ruang kelas (/classrooms/:id), lalu salin Kode Undangan atau Tautan Undangan yang tampil pada header/pengaturan kelas.',
        },
        {
          title: 'Kelola Peserta & Persetujuan Enrollment',
          detail:
            'Buka halaman Peserta (/classrooms/:id/participants) atau tab Peserta. Jika kelas mewajibkan persetujuan, klik Setujui atau Tolak pada pendaftar berstatus PENDING.',
        },
        {
          title: 'Tambah Co-Instructor / Asisten',
          detail:
            'Pada tab Pengaturan Kelas -> Tim Pengajar, cari nama dosen lain untuk ditambahkan sebagai Co-Instructor.',
        },
      ],
      hasil: 'Mahasiswa terdaftar aktif di kelas dan tim pengajar dapat berkolaborasi.',
      catatanPenting: [
        'Anda dapat me-regenerate (membuat ulang) Invitation Code kapan saja jika kode lama tersebar ke pihak yang tidak berkepentingan.',
      ],
      troubleshooting: [
        {
          masalah: 'Mahasiswa gagal bergabung memakai kode undangan.',
          solusi: 'Pastikan status kelas ACTIVE, pendaftaran masih dibuka, dan mahasiswa memasukkan kode terbaru.',
        },
      ],
    },
  },
  {
    slug: 'dosen-stream-pengumuman-classwork',
    categorySlug: 'panduan-dosen',
    title: 'Mengelola Stream Pengumuman & Struktur Classwork',
    excerpt:
      'Cara mempublikasikan pengumuman pada Stream kelas serta menata modul, materi, tugas, dan ujian pada tab Classwork.',
    difficulty: 'PEMULA',
    estimatedReadingMinutes: 4,
    isFeatured: false,
    keywords: 'stream pengumuman classwork topik modul kelas',
    roles: ['DOSEN', 'SUPERADMIN'],
    tags: ['ruang-kelas'],
    body: {
      ringkasan:
        'Tab Stream berfungsi sebagai papan pengumuman dan pembaruan kelas, sedangkan tab Classwork menyusun seluruh materi, tugas, dan ujian berdasarkan topik/pertemuan.',
      prasyarat: ['Memiliki akses mengajar di ruang kelas terkait.'],
      tujuan: [
        'Menyampaikan pengumuman penting kepada mahasiswa.',
        'Mengorganisir aktivitas pembelajaran di Classwork.',
      ],
      langkah: [
        {
          title: 'Buat Pengumuman di Stream',
          detail:
            'Buka ruang kelas (/classrooms/:id), pilih tab Stream, tulis isi pengumuman pada kotak pembaruan, lalu klik Posting.',
        },
        {
          title: 'Kelola Item di Classwork',
          detail:
            'Buka tab Classwork untuk melihat atau menambahkan Materi, Tugas, maupun Ujian ke dalam kelas.',
        },
      ],
      hasil: 'Mahasiswa langsung menerima pembaruan di Stream dan melihat daftar pembelajaran terstruktur di Classwork.',
      catatanPenting: ['Gunakan pengumuman yang ringkas dan sertakan tautan atau instruksi tenggat waktu jika relevan.'],
      troubleshooting: [
        {
          masalah: 'Pengumuman tidak muncul setelah dikirim.',
          solusi: 'Pastikan isi pengumuman tidak kosong dan koneksi stabil, lalu muat ulang halaman.',
        },
      ],
    },
  },
  {
    slug: 'dosen-membuat-materi-tiptap-lampiran',
    categorySlug: 'panduan-dosen',
    title: 'Membuat Materi Pembelajaran dengan Editor Konten & Lampiran',
    excerpt:
      'Panduan menyusun materi kuliah menggunakan Tiptap Editor (heading, tabel, kode, gambar, video) dan mengelola file lampiran.',
    difficulty: 'MENENGAH',
    estimatedReadingMinutes: 6,
    isFeatured: false,
    keywords: 'materi pembelajaran editor tiptap lampiran upload pdf video gambar',
    roles: ['DOSEN', 'SUPERADMIN'],
    tags: ['materi-editor'],
    body: {
      ringkasan:
        'Material Builder (/classrooms/:classroomId/materials/new) menyediakan editor teks kaya lengkap untuk menyusun modul perkuliahan interaktif beserta lampiran file.',
      prasyarat: ['Memiliki permission content:publish di kelas terkait.'],
      tujuan: [
        'Membuat, mempublikasikan, dan memperbarui materi perkuliahan.',
        'Melampirkan file pendukung seperti PDF, slide, atau gambar.',
      ],
      langkah: [
        {
          title: 'Buka Material Builder',
          detail: 'Dari tab Classwork pada ruang kelas, klik + Tambah Materi.',
        },
        {
          title: 'Isi Judul & Konten pada Editor',
          detail:
            'Masukkan judul materi dan topik. Gunakan toolbar Tiptap Editor untuk menyisipkan heading, daftar, tabel, blok kode, gambar, atau video YouTube.',
        },
        {
          title: 'Unggah Lampiran Materi',
          detail: 'Pada bagian Lampiran, unggah dokumen pendukung (PDF/DOCX/PPTX/gambar) yang dapat diunduh mahasiswa.',
        },
        {
          title: 'Simpan sebagai Draft atau Publikasikan',
          detail: 'Klik Simpan Draft untuk meninjau nanti atau Publikasikan agar langsung dapat dibaca mahasiswa.',
        },
      ],
      hasil: 'Materi tersimpan dengan rapi dan progres baca mahasiswa mulai tercatat.',
      catatanPenting: ['Setiap perubahan materi yang dipublikasikan dapat dipantau riwayatnya.'],
      troubleshooting: [
        {
          masalah: 'Upload gambar atau lampiran gagal.',
          solusi: 'Periksa ukuran file dan pastikan format file didukung oleh kebijakan unggahan sistem.',
        },
      ],
    },
  },
  {
    slug: 'dosen-tugas-submission-penilaian',
    categorySlug: 'panduan-dosen',
    title: 'Membuat Tugas, Memeriksa Submission & Memberikan Nilai',
    excerpt:
      'Cara membuat tugas dengan tenggat waktu dan rubrik, memantau pengumpulan mahasiswa, serta menilai submission.',
    difficulty: 'MENENGAH',
    estimatedReadingMinutes: 6,
    isFeatured: false,
    keywords: 'tugas assignment submission penilaian rubrik grading monitoring',
    roles: ['DOSEN', 'SUPERADMIN'],
    tags: ['tugas-penilaian'],
    body: {
      ringkasan:
        'Modul Tugas (/classrooms/:classroomId/assignments/new) mengelola penugasan mahasiswa, aturan keterlambatan, pemantauan pengumpulan, dan penilaian terstruktur.',
      prasyarat: ['Memiliki permission assignments:manage pada kelas terkait.'],
      tujuan: [
        'Membuat tugas dengan instruksi jelas dan tenggat waktu.',
        'Memeriksa file/teks submission mahasiswa dan memberikan nilai serta umpan balik.',
      ],
      langkah: [
        {
          title: 'Buat Tugas Baru',
          detail: 'Di tab Classwork, klik + Tambah Tugas. Isi judul, instruksi, nilai maksimal, tenggat waktu, dan kriteria rubrik bila diperlukan.',
        },
        {
          title: 'Pantau Pengumpulan Mahasiswa',
          detail: 'Buka halaman Monitoring Tugas (/classrooms/:classroomId/assignments/:assignmentId/monitoring) untuk melihat siapa yang sudah atau belum mengumpulkan.',
        },
        {
          title: 'Periksa & Nilai Submission',
          detail:
            'Klik Nilai pada baris mahasiswa (/classrooms/:classroomId/assignments/:assignmentId/grading/:submissionId), tinjau lampiran/jawaban, masukkan skor serta komentar umpan balik, lalu simpan nilai.',
        },
      ],
      hasil: 'Nilai dan umpan balik langsung tersimpan dan dapat dilihat oleh mahasiswa yang bersangkutan.',
      catatanPenting: ['Submission yang terlambat ditandai otomatis oleh sistem sesuai tenggat waktu tugas.'],
      troubleshooting: [
        {
          masalah: 'Mahasiswa mengaku tidak bisa mengunggah jawaban.',
          solusi: 'Pastikan status tugas sudah PUBLISHED dan tenggat waktu atau kebijakan late submission mengizinkan pengiriman.',
        },
      ],
    },
  },
  {
    slug: 'dosen-ujian-bank-soal-assessment-builder',
    categorySlug: 'panduan-dosen',
    title: 'Membuat Ujian Digital, Bank Soal, Keamanan Ujian & Penilaian Esai',
    excerpt:
      'Panduan Assessment Builder, pengelolaan bank soal (termasuk import massal), pengaturan keamanan ujian, monitoring, dan koreksi esai.',
    difficulty: 'LANJUTAN',
    estimatedReadingMinutes: 8,
    isFeatured: true,
    keywords: 'ujian kuis assessment builder bank soal import soal keamanan ujian esai grading monitoring',
    roles: ['DOSEN', 'SUPERADMIN'],
    tags: ['ujian-bank-soal'],
    body: {
      ringkasan:
        'Assessment & Examination Engine (/classrooms/:classroomId/assessments/new) mendukung kuis pilihan ganda, isian, esai, bank soal terpusat, dan pengawasan ujian.',
      prasyarat: ['Memiliki permission quizzes:manage dan question_bank:manage.'],
      tujuan: [
        'Menyusun ujian dengan durasi, jadwal buka/tutup, dan acak soal.',
        'Memanfaatkan Bank Soal serta melakukan penilaian jawaban esai.',
      ],
      langkah: [
        {
          title: 'Buat Ujian pada Assessment Builder',
          detail: 'Dari tab Classwork, klik + Tambah Ujian. Atur judul, tipe ujian, durasi menit, jumlah percobaan, dan jadwal pelaksanaan.',
        },
        {
          title: 'Tambahkan Soal atau Ambil dari Bank Soal',
          detail:
            'Buat soal baru langsung di builder (pilihan ganda/esai/benar-salah) atau impor dari Bank Soal (termasuk import CSV/Excel untuk ratusan soal).',
        },
        {
          title: 'Aktifkan Pengaturan Keamanan & Publikasikan',
          detail: 'Atur pengacakan urutan soal/opsi dan batas waktu, lalu publikasikan ujian.',
        },
        {
          title: 'Pantau & Nilai Jawaban Esai',
          detail:
            'Buka Monitoring Ujian (/monitoring) untuk melihat progres pengerjaan mahasiswa, dan buka Penilaian Esai (/grading/:attemptId) untuk memberi skor soal uraian.',
        },
      ],
      hasil: 'Ujian berjalan sesuai jadwal, soal objektif dinilai otomatis, dan soal esai dinilai manual oleh dosen.',
      catatanPenting: [
        'Saat ujian dipublikasikan dan dikerjakan, sistem membuat snapshot soal agar perubahan bank soal tidak merusak integritas ujian yang sedang berlangsung.',
      ],
      troubleshooting: [
        {
          masalah: 'Nilai akhir mahasiswa belum muncul penuh.',
          solusi: 'Periksa apakah masih ada soal esai yang berstatus menunggu penilaian manual oleh dosen.',
        },
      ],
    },
  },
  {
    slug: 'dosen-analytics-arsip-kelas',
    categorySlug: 'panduan-dosen',
    title: 'Melihat Analytics Pembelajaran & Mengarsipkan Ruang Kelas',
    excerpt:
      'Cara memantau keterlibatan mahasiswa, progres materi/tugas, serta menonaktifkan atau mengarsipkan kelas setelah semester selesai.',
    difficulty: 'PEMULA',
    estimatedReadingMinutes: 4,
    isFeatured: false,
    keywords: 'analytics statistik kelas arsip selesai nonaktif',
    roles: ['DOSEN', 'SUPERADMIN'],
    tags: ['ruang-kelas', 'dashboard'],
    body: {
      ringkasan:
        'Setiap ruang kelas menyediakan tab Analytics dan Pengaturan Siklus Hidup Kelas untuk memantau capaian belajar dan mengarsipkan kelas.',
      prasyarat: ['Anda adalah Dosen Pengampu atau Co-Instructor kelas tersebut.'],
      tujuan: [
        'Membaca statistik progres materi dan ketuntasan tugas/ujian.',
        'Mengarsipkan kelas yang sudah selesai.',
      ],
      langkah: [
        {
          title: 'Buka Tab Analytics Kelas',
          detail: 'Di dalam /classrooms/:id, pilih tab Analytics untuk melihat ringkasan progres mahasiswa, rata-rata nilai, dan keaktifan.',
        },
        {
          title: 'Arsipkan Kelas di Pengaturan',
          detail: 'Buka tab Pengaturan Kelas -> Lifecycle / Status Kelas, lalu pilih Arsipkan Kelas saat perkuliahan berakhir.',
        },
      ],
      hasil: 'Data pembelajaran terdokumentasi rapi dan kelas arsip tidak lagi menerima pendaftaran baru.',
      catatanPenting: ['Kelas yang diarsipkan tetap dapat dibaca datanya sebagai riwayat akademik.'],
      troubleshooting: [
        {
          masalah: 'Angka progres masih 0%.',
          solusi: 'Pastikan materi atau tugas sudah dipublikasikan dan mahasiswa telah mengaksesnya.',
        },
      ],
    },
  },

  // ── MAHASISWA DOCUMENTATION ───────────────────────────────────────────────
  {
    slug: 'mahasiswa-dashboard-periode-akademik',
    categorySlug: 'panduan-mahasiswa',
    title: 'Dashboard Mahasiswa & Melihat Periode Akademik',
    excerpt:
      'Cara memantau kelas yang diikuti, tugas yang harus segera dikumpulkan, serta filter semester aktif pada Dashboard Mahasiswa.',
    difficulty: 'PEMULA',
    estimatedReadingMinutes: 3,
    isFeatured: true,
    keywords: 'dashboard mahasiswa kelas diikuti tenggat tugas periode akademik',
    roles: ['MAHASISWA', 'SUPERADMIN'],
    tags: ['dashboard', 'periode-akademik'],
    body: {
      ringkasan:
        'Dashboard Mahasiswa (/) menampilkan ringkasan kelas aktif, progres belajar, serta daftar tugas/ujian yang perlu diselesaikan.',
      prasyarat: ['Login menggunakan akun MAHASISWA aktif.'],
      tujuan: ['Memantau agenda pembelajaran dan tenggat waktu pada semester berjalan.'],
      langkah: [
        {
          title: 'Buka Dashboard Utama',
          detail: 'Setelah login, periksa kartu ringkasan kelas aktif, materi selesai, dan tugas mendatang.',
        },
        {
          title: 'Pilih Periode Akademik',
          detail: 'Gunakan pemilih Periode Akademik di bagian atas untuk melihat ringkasan semester tertentu.',
        },
        {
          title: 'Klik Kelas atau Tugas',
          detail: 'Klik langsung kartu kelas atau tugas dari dashboard untuk membuka ruang kelas terkait.',
        },
      ],
      hasil: 'Mahasiswa tidak ketinggalan jadwal pengumpulan tugas maupun ujian.',
      catatanPenting: ['Periode akademik diatur oleh Superadmin; mahasiswa hanya dapat melihat daftar periode yang tersedia.'],
      troubleshooting: [
        {
          masalah: 'Daftar kelas kosong di dashboard.',
          solusi: 'Buka menu Ruang Kelas (/classrooms) untuk bergabung ke kelas publik atau memasukkan kode undangan dari dosen.',
        },
      ],
    },
  },
  {
    slug: 'mahasiswa-jelajah-kelas-invitation-code',
    categorySlug: 'panduan-mahasiswa',
    title: 'Menjelajahi Kelas Publik & Bergabung via Invitation Code / Link',
    excerpt:
      'Perbedaan kelas PUBLIC dan PRIVATE serta cara bergabung ke ruang kelas menggunakan kode undangan atau tautan dari dosen.',
    difficulty: 'PEMULA',
    estimatedReadingMinutes: 4,
    isFeatured: true,
    keywords: 'gabung kelas public private invitation code link undangan ruang kelas',
    roles: ['MAHASISWA', 'SUPERADMIN'],
    tags: ['ruang-kelas'],
    body: {
      ringkasan:
        'Mahasiswa dapat bergabung ke kelas PUBLIC melalui katalog di halaman Ruang Kelas (/classrooms) atau masuk ke kelas PRIVATE menggunakan Kode/Link Undangan.',
      prasyarat: ['Login sebagai MAHASISWA dan memiliki kode/link undangan untuk kelas PRIVATE.'],
      tujuan: [
        'Memahami perbedaan visibility PUBLIC dan PRIVATE.',
        'Berhasil mendaftar ke ruang kelas.',
      ],
      langkah: [
        {
          title: 'Buka Menu Ruang Kelas',
          detail: 'Klik Ruang Kelas (/classrooms) pada sidebar.',
        },
        {
          title: 'Gabung ke Kelas PUBLIC',
          detail: 'Pada bagian Jelajahi Kelas Publik, pilih kelas yang tersedia lalu klik Gabung Kelas.',
        },
        {
          title: 'Gabung ke Kelas PRIVATE dengan Kode / Link',
          detail:
            'Klik tombol Gabung dengan Kode, masukkan Invitation Code dari dosen (atau buka langsung Invitation Link), lalu konfirmasi.',
        },
      ],
      hasil: 'Anda terdaftar di kelas (langsung ACTIVE atau menunggu persetujuan dosen bila kelas mengaktifkan mode approval).',
      catatanPenting: [
        'Kelas PRIVATE tidak muncul di daftar pencarian publik; hanya dapat diakses menggunakan kode atau tautan undangan resmi.',
      ],
      troubleshooting: [
        {
          masalah: 'Status pendaftaran masih Menunggu Persetujuan.',
          solusi: 'Hubungi dosen pengampu kelas tersebut untuk menyetujui permintaan enrollment Anda.',
        },
      ],
    },
  },
  {
    slug: 'mahasiswa-stream-materi-progress-belajar',
    categorySlug: 'panduan-mahasiswa',
    title: 'Mengakses Stream, Materi, Lampiran & Progress Pembelajaran',
    excerpt:
      'Cara membaca pengumuman di Stream, membuka materi, mengunduh lampiran, dan menandai materi selesai untuk mencatat progress.',
    difficulty: 'PEMULA',
    estimatedReadingMinutes: 5,
    isFeatured: false,
    keywords: 'stream materi unduh lampiran progress tandai selesai bookmark catatan',
    roles: ['MAHASISWA', 'SUPERADMIN'],
    tags: ['materi-editor'],
    body: {
      ringkasan:
        'Di dalam ruang kelas (/classrooms/:id), mahasiswa dapat memantau pengumuman di Stream, membaca materi terstruktur, mengunduh lampiran, dan menandai materi selesai.',
      prasyarat: ['Sudah berstatus peserta ACTIVE pada ruang kelas terkait.'],
      tujuan: [
        'Mengakses materi perkuliahan dan lampiran pendukung.',
        'Mencatat capaian belajar dengan tombol Tandai Selesai.',
      ],
      langkah: [
        {
          title: 'Pantau Tab Stream & Classwork',
          detail: 'Buka ruang kelas Anda. Baca pengumuman terbaru di Stream, lalu buka tab Classwork untuk memilih materi.',
        },
        {
          title: 'Baca Materi & Unduh Lampiran',
          detail: 'Klik materi untuk membuka halaman pembaca (/classrooms/:classroomId/materials/:materialId). Unduh file lampiran yang tersedia di bagian bawah/samping materi.',
        },
        {
          title: 'Tandai Materi Selesai',
          detail: 'Klik tombol Tandai Selesai setelah membaca materi agar persentase progres belajar Anda di kelas bertambah.',
        },
      ],
      hasil: 'Progres pembelajaran Anda tercatat dan terlihat pada ringkasan kelas maupun riwayat belajar.',
      catatanPenting: [
        'Catatan Keterbatasan Fitur (PARTIAL): Fitur Bookmark Materi dan Catatan Belajar Pribadi belum tersedia pada versi aplikasi saat ini; fokus pencatatan progres menggunakan fitur Tandai Selesai.',
      ],
      troubleshooting: [
        {
          masalah: 'Lampiran gagal dibuka di browser.',
          solusi: 'Gunakan tombol Unduh untuk menyimpan file terlebih dahulu ke perangkat Anda.',
        },
      ],
    },
  },
  {
    slug: 'mahasiswa-kumpul-tugas-status-submission',
    categorySlug: 'panduan-mahasiswa',
    title: 'Mengumpulkan Tugas & Melihat Status Submission serta Nilai',
    excerpt:
      'Cara membuka instruksi tugas, mengunggah file/jawaban, memeriksa status pengumpulan, dan melihat nilai serta komentar dosen.',
    difficulty: 'PEMULA',
    estimatedReadingMinutes: 4,
    isFeatured: false,
    keywords: 'tugas kumpul submission status nilai umpan balik',
    roles: ['MAHASISWA', 'SUPERADMIN'],
    tags: ['tugas-penilaian'],
    body: {
      ringkasan:
        'Halaman Tugas (/classrooms/:classroomId/assignments/:assignmentId) memungkinkan mahasiswa membaca instruksi, mengunggah jawaban, dan memantau hasil penilaian.',
      prasyarat: ['Terdaftar aktif di kelas dan tugas berstatus PUBLISHED.'],
      tujuan: ['Mengirimkan tugas tepat waktu dan memeriksa status penilaian dosen.'],
      langkah: [
        {
          title: 'Buka Detail Tugas',
          detail: 'Pilih tugas dari tab Classwork atau dari daftar tugas di Dashboard.',
        },
        {
          title: 'Siapkan & Unggah Jawaban',
          detail: 'Isi teks jawaban dan/atau unggah file lampiran sesuai format yang diminta, lalu klik Kirim Tugas / Submit.',
        },
        {
          title: 'Cek Status Submission & Nilai',
          detail: 'Setelah dikirim, status berubah menjadi Dikumpulkan (atau Terlambat jika melewati tenggat). Setelah dosen menilai, skor dan catatan umpan balik tampil di halaman yang sama.',
        },
      ],
      hasil: 'Tugas tercatat masuk ke sistem dan siap diperiksa oleh dosen pengampu.',
      catatanPenting: ['Periksa kembali file yang diunggah sebelum menekan tombol Submit final.'],
      troubleshooting: [
        {
          masalah: 'Tombol kirim tidak tersedia.',
          solusi: 'Kemungkinan batas waktu pengumpulan sudah ditutup oleh dosen.',
        },
      ],
    },
  },
  {
    slug: 'mahasiswa-ujian-digital-aturan-hasil',
    categorySlug: 'panduan-mahasiswa',
    title: 'Mengikuti Ujian Digital, Aturan Ujian & Melihat Hasil',
    excerpt:
      'Panduan mengerjakan kuis/ujian online, memperhatikan timer ujian, aturan pengerjaan, dan memeriksa hasil penilaian.',
    difficulty: 'MENENGAH',
    estimatedReadingMinutes: 5,
    isFeatured: false,
    keywords: 'ujian kuis digital timer aturan submit hasil nilai',
    roles: ['MAHASISWA', 'SUPERADMIN'],
    tags: ['ujian-bank-soal'],
    body: {
      ringkasan:
        'Halaman Ujian (/classrooms/:classroomId/assessments/:assessmentId) menyediakan antarmuka pengerjaan ujian berbatas waktu dengan navigator soal.',
      prasyarat: ['Ujian sedang berada dalam rentang jadwal buka dan kuota percobaan masih tersedia.'],
      tujuan: ['Menyelesaikan ujian dengan tertib dan melihat hasil setelah selesai.'],
      langkah: [
        {
          title: 'Buka Halaman Ujian & Baca Aturan',
          detail: 'Klik ujian di Classwork, baca durasi waktu, jumlah soal, serta aturan ujian, lalu klik Mulai Ujian.',
        },
        {
          title: 'Jawab Soal & Gunakan Navigator',
          detail: 'Pilih atau tulis jawaban untuk setiap nomor. Gunakan panel navigator soal di samping untuk berpindah nomor dan memastikan tidak ada soal terlewat.',
        },
        {
          title: 'Kirim Ujian (Finish Attempt)',
          detail: 'Klik Selesai & Kirim Ujian sebelum timer habis. Sistem otomatis menyimpan dan mengirimkan jawaban jika waktu berakhir.',
        },
        {
          title: 'Lihat Hasil Ujian',
          detail: 'Skor soal pilihan ganda langsung dihitung; jika terdapat soal esai, nilai final tampil setelah dosen selesai mengoreksi.',
        },
      ],
      hasil: 'Percobaan ujian terekam aman dan skor tercatat pada kelas.',
      catatanPenting: ['Jangan menutup tab browser secara paksa saat ujian berlangsung; pastikan koneksi internet stabil.'],
      troubleshooting: [
        {
          masalah: 'Halaman sempat ter-refresh saat ujian berlangsung.',
          solusi: 'Buka kembali halaman ujian yang sama; jawaban yang tersimpan tetap dilanjutkan selama waktu belum habis.',
        },
      ],
    },
  },

  // ── AUDITOR DOCUMENTATION ─────────────────────────────────────────────────
  {
    slug: 'auditor-kebijakan-read-only-batasan-akses',
    categorySlug: 'panduan-auditor',
    title: 'Memahami Role Auditor & Kebijakan Read-Only Everywhere',
    excerpt:
      'Penjelasan lengkap hak akses Auditor: hanya melihat dan memeriksa data tanpa kemampuan membuat, mengubah, menyetujui, atau menghapus apa pun.',
    difficulty: 'PEMULA',
    estimatedReadingMinutes: 4,
    isFeatured: true,
    keywords: 'auditor read-only batasan akses kebijakan tidak bisa edit hapus',
    roles: ['AUDITOR', 'SUPERADMIN'],
    tags: ['read-only', 'rbac-audit'],
    body: {
      ringkasan:
        'Role AUDITOR dirancang khusus untuk pemeriksaan, pengawasan mutu akademik, dan audit keamanan dengan prinsip mutlak: READ-ONLY EVERYWHERE — NO WRITE ACTIONS.',
      prasyarat: ['Login menggunakan akun dengan role AUDITOR.'],
      tujuan: [
        'Memahami ruang lingkup pengawasan Auditor.',
        'Mengetahui batasan sistem yang memblokir seluruh tindakan modifikasi data.',
      ],
      langkah: [
        {
          title: 'Masuk dengan Akun Auditor',
          detail: 'Login melalui /login menggunakan akun Auditor resmi.',
        },
        {
          title: 'Kenali Penanda Mode Read-Only',
          detail:
            'Seluruh tombol aksi tambah, edit, hapus, simpan, submit, reset password, switch account, maupun ubah pengaturan otomatis disembunyikan di UI dan diblokir (403 Forbidden) di API.',
        },
      ],
      hasil: 'Auditor dapat melakukan pemeriksaan secara objektif tanpa risiko mengubah data produksi.',
      catatanPenting: [
        'Kebijakan ini tetap berlaku bahkan jika Superadmin mencoba melakukan impersonation ke akun Auditor.',
        'Auditor tidak dapat memberikan feedback artikel atau mengubah preferensi sistem.',
      ],
      troubleshooting: [
        {
          masalah: 'Muncul pesan 403 Forbidden saat mengakses rute pembuatan/pengeditan.',
          solusi: 'Hal tersebut adalah perilaku keamanan yang diharapkan karena Auditor hanya diperbolehkan mengakses halaman lihat (VIEW).',
        },
      ],
    },
  },
  {
    slug: 'auditor-dashboard-filter-audit-log',
    categorySlug: 'panduan-auditor',
    title: 'Dashboard Auditor, Filter Data & Membaca Audit Log',
    excerpt:
      'Cara memantau ringkasan institusi pada Dashboard Auditor serta memeriksa riwayat aktivitas sistem di Log Audit Keamanan.',
    difficulty: 'PEMULA',
    estimatedReadingMinutes: 5,
    isFeatured: true,
    keywords: 'dashboard auditor filter audit log laporan pemeriksaan',
    roles: ['AUDITOR', 'SUPERADMIN'],
    tags: ['read-only', 'rbac-audit', 'dashboard'],
    body: {
      ringkasan:
        'Dashboard Auditor (/) dan halaman Log Audit Keamanan (/admin/audit-logs) menjadi alat utama Auditor dalam meninjau aktivitas akademik dan keamanan.',
      prasyarat: ['Akun AUDITOR dengan permission auditor.dashboard.view dan audit:view.'],
      tujuan: [
        'Meninjau statistik institusi secara read-only.',
        'Menelusuri catatan audit log menggunakan filter.',
      ],
      langkah: [
        {
          title: 'Tinjau Dashboard Auditor',
          detail: 'Buka Dashboard (/) untuk melihat statistik periode akademik, jumlah pengguna, ruang kelas, serta ringkasan aktivitas.',
        },
        {
          title: 'Gunakan Filter Data',
          detail: 'Saring data berdasarkan Periode Akademik atau parameter filter yang tersedia di tabel pemantauan.',
        },
        {
          title: 'Buka Log Audit Keamanan',
          detail: 'Klik Log Audit Keamanan (/admin/audit-logs) di sidebar untuk memeriksa aktivitas login, perubahan RBAC, reset password, dan impersonation.',
        },
      ],
      hasil: 'Auditor memperoleh data pengawasan yang akurat dan terverifikasi.',
      catatanPenting: ['Semua informasi pada Dashboard Auditor bersifat tampilan baca saja.'],
      troubleshooting: [
        {
          masalah: 'Data log tidak muncul.',
          solusi: 'Periksa kembali filter pencarian atau reset filter untuk melihat seluruh catatan terbaru.',
        },
      ],
    },
  },
  {
    slug: 'auditor-pemeriksaan-akademik-pengguna-kelas',
    categorySlug: 'panduan-auditor',
    title: 'Memeriksa Periode Akademik, Pengguna, Ruang Kelas, Enrollment & Materi',
    excerpt:
      'Panduan meninjau daftar periode akademik, data dosen/mahasiswa, ruang kelas, peserta enrollment, materi, tugas, dan ujian secara read-only.',
    difficulty: 'MENENGAH',
    estimatedReadingMinutes: 5,
    isFeatured: false,
    keywords: 'auditor periode akademik pengguna dosen mahasiswa ruang kelas enrollment materi tugas ujian',
    roles: ['AUDITOR', 'SUPERADMIN'],
    tags: ['read-only', 'ruang-kelas'],
    body: {
      ringkasan:
        'Auditor memiliki akses baca ke modul Periode Akademik, Manajemen Pengguna, dan Ruang Kelas untuk memeriksa kelengkapan proses pembelajaran.',
      prasyarat: ['Akun AUDITOR dengan permission auditor.*.view yang sesuai.'],
      tujuan: [
        'Memeriksa kesesuaian periode akademik, daftar dosen/mahasiswa, peserta kelas, materi, tugas, dan monitoring ujian.',
      ],
      langkah: [
        {
          title: 'Periksa Periode Akademik',
          detail: 'Buka menu Periode Akademik (/academic-periods) untuk melihat daftar semester aktif dan arsip.',
        },
        {
          title: 'Periksa Daftar Pengguna',
          detail: 'Buka Manajemen Pengguna (/admin/users) untuk melihat daftar akun Dosen, Mahasiswa, dan status keaktifannya (tanpa tombol ubah/reset).',
        },
        {
          title: 'Periksa Ruang Kelas, Enrollment & Aktivitas',
          detail:
            'Buka Ruang Kelas (/classrooms), pilih kelas (/classrooms/:id) untuk meninjau Stream, Classwork, Materi (/materials/:materialId), Peserta (/participants), serta Monitoring Tugas & Ujian.',
        },
      ],
      hasil: 'Auditor dapat memverifikasi kepatuhan akademik di setiap ruang kelas tanpa memengaruhi data.',
      catatanPenting: [
        'Menu Buat Ruang Kelas dan Pengaturan Sistem tidak ditampilkan kepada Auditor.',
      ],
      troubleshooting: [
        {
          masalah: 'Tidak menemukan tombol edit atau unduh khusus admin.',
          solusi: 'Sesuai kebijakan read-only, Auditor hanya diberi akses tampilan baca.',
        },
      ],
    },
  },
];

const INITIAL_FAQS = [
  {
    question: 'Mengapa saya diminta langsung mengganti password setelah login?',
    answer:
      'Akun Anda menggunakan kata sandi sementara hasil pembuatan akun baru atau reset password oleh Superadmin. Demi keamanan, sistem mewajibkan Anda membuat kata sandi pribadi baru sebelum mengakses dashboard.',
    categorySlug: 'panduan-umum',
    audienceRole: 'ALL',
    sortOrder: 1,
  },
  {
    question: 'Mengapa menu Dokumentasi OpenAPI tidak lagi ada di sidebar?',
    answer:
      'Dokumentasi OpenAPI telah digantikan oleh menu Pusat Bantuan (/help) yang menyediakan panduan operasional resmi untuk Superadmin, Dosen, Mahasiswa, dan Auditor.',
    categorySlug: 'panduan-umum',
    audienceRole: 'ALL',
    sortOrder: 2,
  },
  {
    question: 'Bagaimana cara Superadmin membuatkan ruang kelas untuk Dosen?',
    answer:
      'Gunakan menu Buat Ruang Kelas (Wizard) di /classrooms/new. Pada Step 3 (Tim Pengajar), pilih Dosen yang bersangkutan sebagai Dosen Pengampu Utama (Delegated Creation).',
    categorySlug: 'panduan-superadmin',
    audienceRole: 'SUPERADMIN',
    sortOrder: 3,
  },
  {
    question: 'Apa perbedaan ruang kelas PUBLIC dan PRIVATE?',
    answer:
      'Kelas PUBLIC muncul di direktori kelas publik dan dapat langsung diikuti mahasiswa. Kelas PRIVATE tersembunyi dari direktori publik dan hanya dapat dimasuki menggunakan Invitation Code atau Invitation Link dari dosen.',
    categorySlug: 'panduan-dosen',
    audienceRole: 'DOSEN',
    sortOrder: 4,
  },
  {
    question: 'Apakah fitur Bookmark dan Catatan Belajar Pribadi sudah tersedia untuk Mahasiswa?',
    answer:
      'Saat ini fitur Bookmark dan Catatan Belajar Pribadi belum diaktifkan. Mahasiswa dapat menggunakan tombol Tandai Selesai pada setiap materi untuk mencatat progres pembelajaran secara akurat.',
    categorySlug: 'panduan-mahasiswa',
    audienceRole: 'MAHASISWA',
    sortOrder: 5,
  },
  {
    question: 'Mengapa akun Auditor tidak melihat tombol Tambah, Edit, atau Hapus?',
    answer:
      'Role Auditor menerapkan kebijakan ketat Read-Only Everywhere. Auditor hanya diperbolehkan membaca dan memeriksa data akademik maupun audit log tanpa mengubah data apa pun.',
    categorySlug: 'panduan-auditor',
    audienceRole: 'AUDITOR',
    sortOrder: 6,
  },
];

let seedPromise: Promise<void> | null = null;

export async function ensureKnowledgeCenterSeeded(): Promise<void> {
  if (seedPromise) return seedPromise;

  seedPromise = (async () => {
    const existingCountRes = await db
      .select({ total: count() })
      .from(knowledgeCategories);
    const totalCategories = Number(existingCountRes[0]?.total || 0);
    const existingArticlesCountRes = await db
      .select({ total: count() })
      .from(knowledgeArticles);
    const totalArticles = Number(existingArticlesCountRes[0]?.total || 0);
    if (totalCategories > 0 && totalArticles >= INITIAL_ARTICLES.length) return;

    // 1. Insert Categories
    const categoryIdBySlug = new Map<string, string>();
    for (const cat of INITIAL_CATEGORIES) {
      const [inserted] = await db
        .insert(knowledgeCategories)
        .values({
          name: cat.name,
          slug: cat.slug,
          description: cat.description,
          icon: cat.icon,
          sortOrder: cat.sortOrder,
          isActive: true,
        })
        .onConflictDoNothing({ target: knowledgeCategories.slug })
        .returning({ id: knowledgeCategories.id, slug: knowledgeCategories.slug });

      if (inserted) {
        categoryIdBySlug.set(inserted.slug, inserted.id);
      } else {
        const [existing] = await db
          .select({ id: knowledgeCategories.id })
          .from(knowledgeCategories)
          .where(eq(knowledgeCategories.slug, cat.slug));
        if (existing) categoryIdBySlug.set(cat.slug, existing.id);
      }
    }

    // 2. Insert Tags
    const tagIdBySlug = new Map<string, string>();
    for (const tag of INITIAL_TAGS) {
      const [inserted] = await db
        .insert(knowledgeTags)
        .values({ name: tag.name, slug: tag.slug })
        .onConflictDoNothing({ target: knowledgeTags.slug })
        .returning({ id: knowledgeTags.id, slug: knowledgeTags.slug });

      if (inserted) {
        tagIdBySlug.set(inserted.slug, inserted.id);
      } else {
        const [existing] = await db
          .select({ id: knowledgeTags.id })
          .from(knowledgeTags)
          .where(eq(knowledgeTags.slug, tag.slug));
        if (existing) tagIdBySlug.set(tag.slug, existing.id);
      }
    }

    // 3. Load Roles
    const roleRows = await db.select().from(roles);
    const roleIdByName = new Map(roleRows.map((r) => [r.code, r.id]));

    // 4. Insert Articles + Role Audiences + Tags + Initial Version
    const now = new Date();
    for (const article of INITIAL_ARTICLES) {
      const categoryId = categoryIdBySlug.get(article.categorySlug);
      if (!categoryId) continue;

      const rendered = buildArticleDocument(article.body);
      const [insertedArticle] = await db
        .insert(knowledgeArticles)
        .values({
          categoryId,
          title: article.title,
          slug: article.slug,
          excerpt: article.excerpt,
          content: rendered.html,
          contentJson: rendered.json,
          status: 'PUBLISHED',
          difficulty: article.difficulty,
          estimatedReadingMinutes: article.estimatedReadingMinutes,
          isFeatured: article.isFeatured,
          keywords: article.keywords,
          relatedArticleIds: [],
          version: 1,
          docVersionLabel: 'v1.0.0',
          publishedAt: now,
        })
        .onConflictDoNothing({ target: knowledgeArticles.slug })
        .returning({ id: knowledgeArticles.id });

      if (!insertedArticle) continue;

      for (const roleName of article.roles) {
        const roleId = roleIdByName.get(roleName);
        if (roleId) {
          await db
            .insert(knowledgeArticleRoles)
            .values({ articleId: insertedArticle.id, roleId })
            .onConflictDoNothing();
        }
      }

      for (const tagSlug of article.tags) {
        const tagId = tagIdBySlug.get(tagSlug);
        if (tagId) {
          await db
            .insert(knowledgeArticleTags)
            .values({ articleId: insertedArticle.id, tagId })
            .onConflictDoNothing();
        }
      }

      await db.insert(knowledgeArticleVersions).values({
        articleId: insertedArticle.id,
        version: 1,
        contentSnapshot: {
          title: article.title,
          excerpt: article.excerpt,
          content: rendered.html,
          contentJson: rendered.json,
          difficulty: article.difficulty,
          roles: article.roles,
        },
        changeSummary: 'Publikasi awal dokumentasi resmi EduCoreLMS v1.0.0',
      });
    }

    // 5. Insert FAQs
    for (const faq of INITIAL_FAQS) {
      const categoryId = categoryIdBySlug.get(faq.categorySlug) || null;
      await db.insert(knowledgeFaqs).values({
        question: faq.question,
        answer: faq.answer,
        categoryId,
        audienceRole: faq.audienceRole,
        status: 'PUBLISHED',
        sortOrder: faq.sortOrder,
      });
    }
  })().catch((err) => {
    seedPromise = null;
    throw err;
  });

  return seedPromise;
}
