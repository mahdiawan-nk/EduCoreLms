import { db } from '../db/index.ts';
import {
  users,
  userProfiles,
  roles,
  permissions,
  userRoles,
  rolePermissions,
  academicYears,
  semesters,
  courses,
  classrooms,
  classroomInstructors,
  classroomJoinCodes,
  classroomEnrollments,
  classroomTopics,
  storedFiles,
  learningMaterials,
  materialAttachments,
  announcements,
  comments,
  assignments,
  assignmentAttachments,
  assignmentSubmissions,
  submissionRevisions,
  quizzes,
  quizQuestions,
  quizOptions,
  quizAttempts,
  quizAnswers,
  gradeCategories,
  gradeItems,
  gradeRecords,
  notifications,
  auditLogs,
} from '../db/schema.ts';
import {
  PERMISSION_REGISTRY,
  ROLE_PERMISSION_MAP,
  hashPassword,
} from './security.ts';

let isSeeded = false;
let seedPromise: Promise<void> | null = null;

export async function ensureSeeded(): Promise<void> {
  if (isSeeded) return;
  if (seedPromise) return seedPromise;

  seedPromise = (async () => {
    try {
      const existingRoles = await db.select().from(roles);
      if (existingRoles.length > 0) {
        isSeeded = true;
        return;
      }

      console.log('Initializing Politeknik Kampar LMS PostgreSQL database seed...');

      const superadminHash = await hashPassword('AdminPolkam#2026');
      const dosenHash = await hashPassword('DosenPolkam#2026');
      const mahasiswaHash = await hashPassword('MhsPolkam#2026');

      await db.transaction(async (tx) => {
        // 1. Insert Roles
        const insertedRoles = await tx
          .insert(roles)
          .values([
            {
              code: 'SUPERADMIN',
              name: 'Superadmin Akademik',
              description: 'Otoritas penuh pengelolaan sistem, RBAC, data akademik, dan audit keamanan Politeknik Kampar.',
              isSystem: true,
            },
            {
              code: 'DOSEN',
              name: 'Dosen Pengampu',
              description: 'Pengajar mata kuliah yang berwenang mengelola kelas digital, materi, tugas, kuis, dan buku nilai.',
              isSystem: true,
            },
            {
              code: 'MAHASISWA',
              name: 'Mahasiswa',
              description: 'Peserta didik aktif Politeknik Kampar yang mengikuti perkuliahan, tugas, kuis, dan diskusi.',
              isSystem: true,
            },
          ])
          .returning();

        const roleMap = new Map(insertedRoles.map((r) => [r.code, r.id]));

        // 2. Insert Permissions & Role Permissions
        const insertedPerms = await tx
          .insert(permissions)
          .values(PERMISSION_REGISTRY)
          .returning();

        const permMap = new Map(insertedPerms.map((p) => [p.code, p.id]));

        const rpValues: { roleId: string; permissionId: string }[] = [];
        for (const [roleCode, permCodes] of Object.entries(ROLE_PERMISSION_MAP)) {
          const rId = roleMap.get(roleCode);
          if (!rId) continue;
          for (const pCode of permCodes) {
            const pId = permMap.get(pCode);
            if (pId) {
              rpValues.push({ roleId: rId, permissionId: pId });
            }
          }
        }
        await tx.insert(rolePermissions).values(rpValues);

        // 3. Insert Primary Actors (Superadmin, 2 Dosen, 3 Mahasiswa)
        const [superadmin, dosen1, dosen2, mhs1, mhs2, mhs3] = await tx
          .insert(users)
          .values([
            {
              email: 'superadmin@poltek-kampar.ac.id',
              passwordHash: superadminHash,
              fullName: 'Ir. Hendra Pratama, M.Kom.',
              identityNumber: 'NIP-198204112009121001',
              isActive: true,
            },
            {
              email: 'fitriani.dosen@poltek-kampar.ac.id',
              passwordHash: dosenHash,
              fullName: 'Dr. Fitriani Syahrir, S.T., M.T.',
              identityNumber: 'NIDN-1015088701',
              isActive: true,
            },
            {
              email: 'ridwan.dosen@poltek-kampar.ac.id',
              passwordHash: dosenHash,
              fullName: 'M. Ridwan Nasution, S.Kom., M.Cs.',
              identityNumber: 'NIDN-1022039002',
              isActive: true,
            },
            {
              email: 'ahmad.mhs@student.poltek-kampar.ac.id',
              passwordHash: mahasiswaHash,
              fullName: 'Ahmad Fauzan Al-Farisi',
              identityNumber: 'NIM-202413001',
              isActive: true,
            },
            {
              email: 'siti.mhs@student.poltek-kampar.ac.id',
              passwordHash: mahasiswaHash,
              fullName: 'Siti Rahmawati Putri',
              identityNumber: 'NIM-202413002',
              isActive: true,
            },
            {
              email: 'dimas.mhs@student.poltek-kampar.ac.id',
              passwordHash: mahasiswaHash,
              fullName: 'Dimas Wahyu Saputra',
              identityNumber: 'NIM-202413003',
              isActive: true,
            },
          ])
          .returning();

        // Profiles
        await tx.insert(userProfiles).values([
          {
            userId: superadmin.id,
            studyProgram: 'Direktorat Akademik & Sistem Informasi',
            phone: '0811-7501-101',
            bio: 'Kepala UPT Teknologi Informasi & Komunikasi Politeknik Kampar.',
            academicTitle: 'Ir., M.Kom.',
          },
          {
            userId: dosen1.id,
            studyProgram: 'Teknik Informatika',
            phone: '0812-7602-204',
            bio: 'Dosen Koordinator Rekayasa Perangkat Lunak & Arsitektur Sistem Terdistribusi.',
            academicTitle: 'Dr., S.T., M.T.',
          },
          {
            userId: dosen2.id,
            studyProgram: 'Teknik Pengolahan Sawit',
            phone: '0813-6509-318',
            bio: 'Dosen Otomasi Industri & Instrumentasi Pabrik Kelapa Sawit.',
            academicTitle: 'S.Kom., M.Cs.',
          },
          {
            userId: mhs1.id,
            studyProgram: 'Teknik Informatika',
            phone: '0821-7011-4001',
            bio: 'Mahasiswa Semester 5 Program Studi D3 Teknik Informatika.',
            semesterLevel: 5,
          },
          {
            userId: mhs2.id,
            studyProgram: 'Teknik Informatika',
            phone: '0822-7011-4002',
            bio: 'Mahasiswa Semester 5 Program Studi D3 Teknik Informatika.',
            semesterLevel: 5,
          },
          {
            userId: mhs3.id,
            studyProgram: 'Teknik Pengolahan Sawit',
            phone: '0823-7011-4003',
            bio: 'Mahasiswa Semester 3 Program Studi D3 Teknik Pengolahan Sawit.',
            semesterLevel: 3,
          },
        ]);

        // User Roles
        await tx.insert(userRoles).values([
          { userId: superadmin.id, roleId: roleMap.get('SUPERADMIN')! },
          { userId: dosen1.id, roleId: roleMap.get('DOSEN')! },
          { userId: dosen2.id, roleId: roleMap.get('DOSEN')! },
          { userId: mhs1.id, roleId: roleMap.get('MAHASISWA')! },
          { userId: mhs2.id, roleId: roleMap.get('MAHASISWA')! },
          { userId: mhs3.id, roleId: roleMap.get('MAHASISWA')! },
        ]);

        // 4. Academic Years & Semesters
        const [ayPrev, ayCurrent] = await tx
          .insert(academicYears)
          .values([
            {
              name: '2025/2026',
              startDate: '2025-09-01',
              endDate: '2026-07-31',
              isCurrent: false,
            },
            {
              name: '2026/2027',
              startDate: '2026-09-01',
              endDate: '2027-07-31',
              isCurrent: true,
            },
          ])
          .returning();

        const [semPrev, semActive] = await tx
          .insert(semesters)
          .values([
            {
              academicYearId: ayPrev.id,
              name: 'Semester Genap 2025/2026',
              termType: 'GENAP',
              isActive: false,
            },
            {
              academicYearId: ayCurrent.id,
              name: 'Semester Ganjil 2026/2027',
              termType: 'GANJIL',
              isActive: true,
            },
          ])
          .returning();

        // 5. Master Courses
        const [course1, course2, course3, course4] = await tx
          .insert(courses)
          .values([
            {
              code: 'TIF-501',
              title: 'Rekayasa Perangkat Lunak Terdistribusi',
              studyProgram: 'Teknik Informatika',
              credits: 4,
              semesterNumber: 5,
              description: 'Perancangan arsitektur modular monolith, microservices, keamanan autentikasi Argon2id, transaksi PostgreSQL, dan pengujian terintegrasi.',
              createdById: superadmin.id,
            },
            {
              code: 'TIF-504',
              title: 'Keamanan Jaringan & Kriptografi Terapan',
              studyProgram: 'Teknik Informatika',
              credits: 3,
              semesterNumber: 5,
              description: 'Implementasi protokol keamanan sesi, pertahanan CSRF/SQLi, manajemen kunci kriptografi, dan audit forensik aplikasi web.',
              createdById: superadmin.id,
            },
            {
              code: 'TPS-302',
              title: 'Otomasi & Instrumentasi Pengolahan Kelapa Sawit',
              studyProgram: 'Teknik Pengolahan Sawit',
              credits: 3,
              semesterNumber: 3,
              description: 'Sistem kendali PLC, telemetri suhu sterilizer, pemantauan kualitas CPO berbasis sensor industri di pabrik kelapa sawit.',
              createdById: superadmin.id,
            },
            {
              code: 'PPM-305',
              title: 'Manajemen Perawatan Mesin Industri Perkebunan',
              studyProgram: 'Perawatan & Perbaikan Mesin',
              credits: 3,
              semesterNumber: 3,
              description: 'Preventive dan predictive maintenance untuk mesin digester, screw press, dan boiler uap bertekanan tinggi.',
              createdById: superadmin.id,
            },
          ])
          .returning();

        // 6. Classrooms
        const [cls1, cls2, cls3] = await tx
          .insert(classrooms)
          .values([
            {
              courseId: course1.id,
              semesterId: semActive.id,
              name: 'TIF-5A Rekayasa Perangkat Lunak Terdistribusi',
              section: 'Kelas Reguler A — Bangkinang',
              roomNumber: 'Lab Rekayasa Perangkat Lunak Gd. Utama Lt. 2',
              scheduleText: 'Senin & Rabu, 08:00 – 10:30 WIB',
              capacity: 30,
              enrollmentPolicy: 'AUTO',
              status: 'ACTIVE',
              bannerTheme: 'slate',
              description: 'Ruang kelas digital resmi untuk mahasiswa D3 Teknik Informatika Semester 5 Kelas A. Seluruh praktikum menggunakan PostgreSQL & Fastify.',
              createdById: dosen1.id,
            },
            {
              courseId: course2.id,
              semesterId: semActive.id,
              name: 'TIF-5B Keamanan Jaringan & Kriptografi',
              section: 'Kelas Reguler B — Bangkinang',
              roomNumber: 'Lab Jaringan Komputer & Cyber Security Lt. 3',
              scheduleText: 'Selasa, 13:30 – 16:00 WIB',
              capacity: 25,
              enrollmentPolicy: 'APPROVAL_REQUIRED',
              status: 'ACTIVE',
              bannerTheme: 'amber',
              description: 'Kelas keamanan siber dengan kebijakan persetujuan instruktur (Approval Required) untuk verifikasi akses laboratorium.',
              createdById: dosen1.id,
            },
            {
              courseId: course3.id,
              semesterId: semActive.id,
              name: 'TPS-3A Otomasi Pabrik Kelapa Sawit',
              section: 'Kelas Praktikum A — Workshop Kampar',
              roomNumber: 'Workshop Instrumentasi & Pilot Plant PKS',
              scheduleText: 'Kamis, 08:30 – 11:30 WIB',
              capacity: 32,
              enrollmentPolicy: 'AUTO',
              status: 'ACTIVE',
              bannerTheme: 'emerald',
              description: 'Pembelajaran terpadu sistem kendali suhu sterilizer dan otomatisasi stasiun klarifikasi CPO.',
              createdById: dosen2.id,
            },
          ])
          .returning();

        // Classroom Instructors
        await tx.insert(classroomInstructors).values([
          { classroomId: cls1.id, instructorId: dosen1.id, isPrimary: true },
          { classroomId: cls1.id, instructorId: dosen2.id, isPrimary: false },
          { classroomId: cls2.id, instructorId: dosen1.id, isPrimary: true },
          { classroomId: cls3.id, instructorId: dosen2.id, isPrimary: true },
        ]);

        // Classroom Join Codes
        await tx.insert(classroomJoinCodes).values([
          {
            classroomId: cls1.id,
            code: 'PKM-RPL5A',
            isActive: true,
            createdById: dosen1.id,
          },
          {
            classroomId: cls2.id,
            code: 'PKM-SEC5B',
            isActive: true,
            createdById: dosen1.id,
          },
          {
            classroomId: cls3.id,
            code: 'PKM-TPS3A',
            isActive: true,
            createdById: dosen2.id,
          },
        ]);

        // Classroom Enrollments
        await tx.insert(classroomEnrollments).values([
          {
            classroomId: cls1.id,
            studentId: mhs1.id,
            status: 'active',
            joinCodeUsed: 'PKM-RPL5A',
            approvedById: dosen1.id,
            statusHistory: [
              {
                status: 'active',
                changedAt: new Date().toISOString(),
                reason: 'Auto-enrolled via valid join code PKM-RPL5A',
              },
            ],
          },
          {
            classroomId: cls1.id,
            studentId: mhs2.id,
            status: 'active',
            joinCodeUsed: 'PKM-RPL5A',
            approvedById: dosen1.id,
            statusHistory: [
              {
                status: 'active',
                changedAt: new Date().toISOString(),
                reason: 'Auto-enrolled via valid join code PKM-RPL5A',
              },
            ],
          },
          {
            classroomId: cls2.id,
            studentId: mhs1.id,
            status: 'active',
            joinCodeUsed: 'PKM-SEC5B',
            approvedById: dosen1.id,
            statusHistory: [
              {
                status: 'pending',
                changedAt: new Date(Date.now() - 86400000).toISOString(),
                reason: 'Requested enrollment via join code PKM-SEC5B',
              },
              {
                status: 'active',
                changedAt: new Date().toISOString(),
                reason: 'Approved by Dr. Fitriani Syahrir, S.T., M.T.',
              },
            ],
          },
          {
            classroomId: cls2.id,
            studentId: mhs2.id,
            status: 'pending',
            joinCodeUsed: 'PKM-SEC5B',
            statusHistory: [
              {
                status: 'pending',
                changedAt: new Date().toISOString(),
                reason: 'Awaiting instructor approval for Lab Cyber Security',
              },
            ],
          },
          {
            classroomId: cls3.id,
            studentId: mhs3.id,
            status: 'active',
            joinCodeUsed: 'PKM-TPS3A',
            approvedById: dosen2.id,
            statusHistory: [
              {
                status: 'active',
                changedAt: new Date().toISOString(),
                reason: 'Auto-enrolled via valid join code PKM-TPS3A',
              },
            ],
          },
        ]);

        // 7. Classroom Topics
        const [topic1, topic2, topic3] = await tx
          .insert(classroomTopics)
          .values([
            {
              classroomId: cls1.id,
              title: 'Modul 01: Arsitektur Modular Monolith & Skema Relasional PostgreSQL',
              description: 'Prinsip pemisahan domain, normalisasi tabel, kunci asing, dan transaksi ACID menggunakan Drizzle ORM.',
              sortOrder: 1,
            },
            {
              classroomId: cls1.id,
              title: 'Modul 02: Autentikasi Sesi Server, Argon2id & Otorisasi RBAC',
              description: 'Implementasi keamanan berlapis menggunakan hashing Argon2id, HttpOnly cookie, proteksi CSRF, dan matriks izin RBAC.',
              sortOrder: 2,
            },
            {
              classroomId: cls3.id,
              title: 'Modul 01: Kalibrasi Sensor Tekanan & Suhu Sterilizer Sawit',
              description: 'Prosedur pembacaan sinyal 4-20mA pada ketel rebusan tandan buah segar (TBS).',
              sortOrder: 1,
            },
          ])
          .returning();

        // 8. Private S3-Compatible Stored Files & Learning Materials
        const syllabusContent = Buffer.from(
          'SILABUS PERKULIAHAN POLITEKNIK KAMPAR\nMata Kuliah: Rekayasa Perangkat Lunak Terdistribusi (TIF-501)\nBobot: 4 SKS\nCapaian Pembelajaran: Mahasiswa mampu merancang dan mengimplementasikan sistem backend Fastify + PostgreSQL yang aman dengan autentikasi Argon2id dan kontrol akses RBAC.'
        ).toString('base64');

        const [file1] = await tx
          .insert(storedFiles)
          .values([
            {
              bucket: 'poltek-kampar-lms-private',
              objectKey: 'classrooms/tif-501/silabus-rpl-terdistribusi-2026.txt',
              originalName: 'Silabus_RPL_Terdistribusi_Polkam_2026.txt',
              mimeType: 'text/plain',
              sizeBytes: 312,
              contentBase64: syllabusContent,
              uploadedById: dosen1.id,
              classroomId: cls1.id,
            },
          ])
          .returning();

        const [mat1, mat2] = await tx
          .insert(learningMaterials)
          .values([
            {
              classroomId: cls1.id,
              topicId: topic1.id,
              authorId: dosen1.id,
              title: 'Panduan Arsitektur Modular Monolith & Desain Skema 30+ Tabel PostgreSQL',
              content:
                'Materi ini membahas struktur database terpusat menggunakan UUID primary keys, composite unique constraints, serta penggunaan transaksi database (db.transaction) untuk menjamin konsistensi pendaftaran kelas dan penilaian mahasiswa.',
              externalUrl: 'https://orm.drizzle.team/docs/overview',
              isPublished: true,
            },
            {
              classroomId: cls1.id,
              topicId: topic2.id,
              authorId: dosen1.id,
              title: 'Standar Keamanan Sesi Server-Side, Hashing Argon2id & Kebijakan Deny-by-Default',
              content:
                'Pelajari mengapa token sesi mentah tidak boleh disimpan langsung di database. Setiap token sesi di-hash menggunakan SHA-256 sebelum disimpan di tabel user_sessions dan dikirimkan melalui cookie HttpOnly yang disertai validasi header X-CSRF-Token.',
              isPublished: true,
            },
          ])
          .returning();

        await tx.insert(materialAttachments).values([
          {
            materialId: mat1.id,
            fileId: file1.id,
          },
        ]);

        // 9. Stream Announcements & Comments
        const [ann1, ann2] = await tx
          .insert(announcements)
          .values([
            {
              classroomId: cls1.id,
              authorId: dosen1.id,
              title: 'Selamat Datang di Ruang Kelas Digital TIF-5A Semester Ganjil 2026/2027',
              content:
                'Selamat datang rekan-rekan mahasiswa Politeknik Kampar. Seluruh materi praktikum, pengumpulan tugas repositori, pelaksanaan kuis, serta transparansi nilai akhir akan dikelola secara terpusat di ruang kelas ini. Pastikan Anda mengunduh silabus pada tab Classwork.',
              isPinned: true,
            },
            {
              classroomId: cls1.id,
              authorId: dosen2.id,
              title: 'Jadwal Asistensi Laboratorium Transaksi Database & Pengujian API',
              content:
                'Sesi asistensi praktikum akan dilaksanakan hari Rabu pukul 08:00 WIB di Lab RPL Lantai 2. Siapkan skema migrasi Drizzle dan endpoint Fastify masing-masing kelompok.',
              isPinned: false,
            },
          ])
          .returning();

        await tx.insert(comments).values([
          {
            classroomId: cls1.id,
            announcementId: ann1.id,
            authorId: mhs1.id,
            content: 'Terima kasih Bu Dr. Fitriani, silabus dan modul pertama sudah berhasil kami unduh.',
          },
          {
            classroomId: cls1.id,
            announcementId: ann1.id,
            authorId: mhs2.id,
            content: 'Siap Bu, lingkungan PostgreSQL dan proyek Fastify kami sudah siap untuk praktikum Rabu pagi.',
          },
        ]);

        // 10. Assignments & Student Submissions
        const [asg1, asg2] = await tx
          .insert(assignments)
          .values([
            {
              classroomId: cls1.id,
              topicId: topic1.id,
              authorId: dosen1.id,
              title: 'Tugas Praktikum 01: Implementasi Skema Database & Transaksi Enrollment',
              instructions:
                'Buatlah skema database ternormalisasi beserta layanan transaksi persetujuan pendaftaran mahasiswa (approve/reject enrollment) yang memeriksa kapasitas maksimum kelas serta mencatat riwayat perubahan status.',
              maxPoints: 100,
              dueAt: new Date(Date.now() + 7 * 86400000),
              allowLateSubmission: true,
              status: 'PUBLISHED',
            },
            {
              classroomId: cls1.id,
              topicId: topic2.id,
              authorId: dosen1.id,
              title: 'Tugas Praktikum 02: Middleware RBAC & Proteksi Endpoint Kepemilikan Sumber Daya',
              instructions:
                'Implementasikan middleware otorisasi berbasis izin (permission registry) dan verifikasi kepemilikan kelas sehingga instruktur hanya dapat mengelola kelas yang diotorisasi kepadanya.',
              maxPoints: 100,
              dueAt: new Date(Date.now() + 14 * 86400000),
              allowLateSubmission: true,
              status: 'PUBLISHED',
            },
          ])
          .returning();

        await tx.insert(assignmentAttachments).values([
          {
            assignmentId: asg1.id,
            fileId: file1.id,
          },
        ]);

        const [sub1] = await tx
          .insert(assignmentSubmissions)
          .values([
            {
              assignmentId: asg1.id,
              studentId: mhs1.id,
              submissionText:
                'Telah diselesaikan implementasi skema PostgreSQL menggunakan Drizzle ORM dengan UUID primary keys, composite unique index pada classroom_enrollments, serta fungsi db.transaction untuk validasi kapasitas kelas sebelum menyetujui mahasiswa.',
              repositoryUrl: 'https://git.poltek-kampar.ac.id/ahmad-fauzan/rpl-praktikum-01',
              status: 'GRADED',
              score: '94.00',
              feedback:
                'Struktur transaksi sangat rapi dan penanganan race condition kapasitas kelas sudah tepat. Pertahankan kualitas dokumentasi kode.',
              gradedById: dosen1.id,
              gradedAt: new Date(),
            },
          ])
          .returning();

        await tx.insert(submissionRevisions).values([
          {
            submissionId: sub1.id,
            revisionNumber: 1,
            submissionText: sub1.submissionText,
            repositoryUrl: sub1.repositoryUrl,
          },
        ]);

        // 11. Quizzes, Questions, Options & Attempts
        const [quiz1] = await tx
          .insert(quizzes)
          .values([
            {
              classroomId: cls1.id,
              topicId: topic2.id,
              authorId: dosen1.id,
              title: 'Evaluasi Kuis 01: Keamanan Autentikasi, Sesi Server & RBAC',
              description:
                'Kuis evaluasi pemahaman arsitektur keamanan aplikasi web produksi. Kunci jawaban tidak diekspos ke klien dan dinilai secara otomatis di sisi server.',
              durationMinutes: 30,
              passingScore: 75,
              maxAttempts: 2,
              dueAt: new Date(Date.now() + 5 * 86400000),
              isPublished: true,
            },
          ])
          .returning();

        const [q1, q2, q3] = await tx
          .insert(quizQuestions)
          .values([
            {
              quizId: quiz1.id,
              questionText:
                'Mengapa algoritma Argon2id direkomendasikan sebagai standar utama penyimpanan kata sandi dibandingkan SHA-256 biasa?',
              points: 35,
              sortOrder: 1,
              explanation:
                'Argon2id bersifat memory-hard dan tahan terhadap serangan GPU cracking maupun side-channel timing attacks.',
            },
            {
              quizId: quiz1.id,
              questionText:
                'Bagaimana cara paling aman menyimpan token sesi pengguna di dalam tabel user_sessions PostgreSQL?',
              points: 35,
              sortOrder: 2,
              explanation:
                'Menyimpan hasil hash kriptografis (SHA-256) dari token sesi sehingga kebocoran baca tabel tidak memungkinkan pembajakan sesi aktif.',
            },
            {
              quizId: quiz1.id,
              questionText:
                'Prinsip keamanan apa yang mengharuskan setiap operasi API ditolak secara otomatis kecuali pengguna memiliki izin eksplisit yang terverifikasi?',
              points: 30,
              sortOrder: 3,
              explanation: 'Deny-by-default security.',
            },
          ])
          .returning();

        const insertedOpts = await tx
          .insert(quizOptions)
          .values([
            {
              questionId: q1.id,
              optionLabel: 'A',
              optionText: 'Karena Argon2id menghasilkan panjang string yang lebih pendek',
              isCorrect: false,
              sortOrder: 1,
            },
            {
              questionId: q1.id,
              optionLabel: 'B',
              optionText: 'Karena Argon2id bersifat memory-hard serta tahan terhadap serangan GPU/ASIC dan side-channel',
              isCorrect: true,
              sortOrder: 2,
            },
            {
              questionId: q1.id,
              optionLabel: 'C',
              optionText: 'Karena Argon2id dapat didekripsi kembali menjadi teks asli oleh administrator',
              isCorrect: false,
              sortOrder: 3,
            },
            {
              questionId: q2.id,
              optionLabel: 'A',
              optionText: 'Menyimpan token mentah (plaintext) agar mudah dicocokkan',
              isCorrect: false,
              sortOrder: 1,
            },
            {
              questionId: q2.id,
              optionLabel: 'B',
              optionText: 'Menyimpan digest hash SHA-256 dari token sesi di database dan mengirim token mentah melalui HttpOnly cookie',
              isCorrect: true,
              sortOrder: 2,
            },
            {
              questionId: q2.id,
              optionLabel: 'C',
              optionText: 'Menyimpan token sesi di localStorage browser tanpa tabel server',
              isCorrect: false,
              sortOrder: 3,
            },
            {
              questionId: q3.id,
              optionLabel: 'A',
              optionText: 'Deny-by-default authorization policy',
              isCorrect: true,
              sortOrder: 1,
            },
            {
              questionId: q3.id,
              optionLabel: 'B',
              optionText: 'Client-side conditional rendering',
              isCorrect: false,
              sortOrder: 2,
            },
            {
              questionId: q3.id,
              optionLabel: 'C',
              optionText: 'Optimistic UI bypass',
              isCorrect: false,
              sortOrder: 3,
            },
          ])
          .returning();

        const correctQ1 = insertedOpts.find((o) => o.questionId === q1.id && o.isCorrect)!;
        const correctQ2 = insertedOpts.find((o) => o.questionId === q2.id && o.isCorrect)!;
        const correctQ3 = insertedOpts.find((o) => o.questionId === q3.id && o.isCorrect)!;

        const [attempt1] = await tx
          .insert(quizAttempts)
          .values([
            {
              quizId: quiz1.id,
              studentId: mhs1.id,
              attemptNumber: 1,
              status: 'COMPLETED',
              totalScore: '100.00',
              maxScore: 100,
              submittedAt: new Date(),
            },
          ])
          .returning();

        await tx.insert(quizAnswers).values([
          {
            attemptId: attempt1.id,
            questionId: q1.id,
            selectedOptionId: correctQ1.id,
            isCorrect: true,
            pointsAwarded: 35,
          },
          {
            attemptId: attempt1.id,
            questionId: q2.id,
            selectedOptionId: correctQ2.id,
            isCorrect: true,
            pointsAwarded: 35,
          },
          {
            attemptId: attempt1.id,
            questionId: q3.id,
            selectedOptionId: correctQ3.id,
            isCorrect: true,
            pointsAwarded: 30,
          },
        ]);

        // 12. Grade Categories, Grade Items & Grade Records
        const [catAssignment, catQuiz] = await tx
          .insert(gradeCategories)
          .values([
            {
              classroomId: cls1.id,
              name: 'Tugas & Praktikum Terstruktur',
              weightPercent: 60,
            },
            {
              classroomId: cls1.id,
              name: 'Evaluasi Kuis & Ujian Kompetensi',
              weightPercent: 40,
            },
          ])
          .returning();

        const [gItem1, gItem2] = await tx
          .insert(gradeItems)
          .values([
            {
              classroomId: cls1.id,
              categoryId: catAssignment.id,
              sourceType: 'ASSIGNMENT',
              sourceId: asg1.id,
              title: asg1.title,
              maxScore: 100,
            },
            {
              classroomId: cls1.id,
              categoryId: catQuiz.id,
              sourceType: 'QUIZ',
              sourceId: quiz1.id,
              title: quiz1.title,
              maxScore: 100,
            },
          ])
          .returning();

        await tx.insert(gradeRecords).values([
          {
            gradeItemId: gItem1.id,
            classroomId: cls1.id,
            studentId: mhs1.id,
            score: '94.00',
            maxScore: 100,
            remarks: 'Implementasi transaksi database sangat baik.',
            gradedById: dosen1.id,
          },
          {
            gradeItemId: gItem2.id,
            classroomId: cls1.id,
            studentId: mhs1.id,
            score: '100.00',
            maxScore: 100,
            remarks: 'Nilai otomatis evaluasi kuis percobaan #1.',
            gradedById: dosen1.id,
          },
        ]);

        // 13. Notifications & Audit Logs
        await tx.insert(notifications).values([
          {
            userId: mhs1.id,
            title: 'Tugas Praktikum 01 Telah Dinilai',
            message: 'Dr. Fitriani Syahrir memberikan nilai 94.00/100 pada Tugas Praktikum 01 Anda.',
            type: 'GRADE',
            linkUrl: `/classrooms/${cls1.id}`,
            isRead: false,
          },
          {
            userId: dosen1.id,
            title: 'Permohonan Enrollment Menunggu Persetujuan',
            message: 'Siti Rahmawati Putri mengajukan pendaftaran ke kelas TIF-5B Keamanan Jaringan & Kriptografi.',
            type: 'ENROLLMENT',
            linkUrl: `/classrooms/${cls2.id}`,
            isRead: false,
          },
        ]);

        await tx.insert(auditLogs).values([
          {
            actorId: superadmin.id,
            action: 'SYSTEM_BOOTSTRAP_COMPLETE',
            entityType: 'PLATFORM',
            entityId: ayCurrent.id,
            metadata: {
              academicYear: '2026/2027',
              semester: 'Ganjil',
              rolesConfigured: 3,
              permissionsRegistered: PERMISSION_REGISTRY.length,
            },
            ipAddress: '127.0.0.1',
          },
          {
            actorId: dosen1.id,
            action: 'CLASSROOM_CREATED',
            entityType: 'CLASSROOM',
            entityId: cls1.id,
            metadata: {
              name: cls1.name,
              joinCode: 'PKM-RPL5A',
            },
            ipAddress: '127.0.0.1',
          },
        ]);
      });

      isSeeded = true;
      console.log('Politeknik Kampar LMS database seed completed successfully.');
    } catch (error) {
      console.error('Database seed failed:', error);
      seedPromise = null;
      throw error;
    }
  })();

  return seedPromise;
}
