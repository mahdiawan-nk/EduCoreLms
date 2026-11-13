import React from 'react';
import {
  CheckCircle2,
  CheckSquare,
  ToggleLeft,
  ArrowLeftRight,
  ListOrdered,
  TextCursorInput,
  MessageSquare,
  Hash,
  SlidersHorizontal,
  FileText,
  AlignLeft,
  Briefcase,
  Lightbulb,
  Puzzle,
  Code2,
  Paperclip,
  Database,
  FileSpreadsheet,
} from 'lucide-react';
import { ModalDialog } from '../ui/primitives';

export const OBJECTIVE_QUESTION_ITEMS = [
  {
    value: 'SINGLE_CHOICE',
    label: 'Pilihan Ganda Tunggal',
    sub: 'Single Choice',
    desc: 'Satu jawaban benar dari beberapa opsi.',
    icon: CheckCircle2,
  },
  {
    value: 'MULTIPLE_SELECT',
    label: 'Pilihan Ganda Kompleks',
    sub: 'Multiple Select',
    desc: 'Lebih dari satu jawaban benar.',
    icon: CheckSquare,
  },
  {
    value: 'TRUE_FALSE',
    label: 'Benar / Salah',
    sub: 'True / False',
    desc: 'Pernyataan dikotomis Benar atau Salah.',
    icon: ToggleLeft,
  },
  {
    value: 'MATCHING',
    label: 'Menjodohkan',
    sub: 'Matching Pairs',
    desc: 'Pasangkan premis kiri dan kanan.',
    icon: ArrowLeftRight,
  },
  {
    value: 'ORDERING',
    label: 'Mengurutkan Langkah',
    sub: 'Ordering',
    desc: 'Susun urutan proses atau algoritma.',
    icon: ListOrdered,
  },
  {
    value: 'FILL_IN_BLANK',
    label: 'Isian Rumpang',
    sub: 'Fill in the Blank',
    desc: 'Lengkapi bagian teks yang kosong.',
    icon: TextCursorInput,
  },
  {
    value: 'SHORT_ANSWER',
    label: 'Jawaban Singkat',
    sub: 'Short Answer',
    desc: 'Pencocokan teks pendek otomatis.',
    icon: MessageSquare,
  },
  {
    value: 'NUMERIC',
    label: 'Numerik Eksak',
    sub: 'Numeric',
    desc: 'Jawaban angka dengan nilai pasti.',
    icon: Hash,
  },
  {
    value: 'NUMERIC_TOLERANCE',
    label: 'Numerik Toleransi',
    sub: 'Numeric Tolerance',
    desc: 'Angka dengan rentang toleransi (+/-).',
    icon: SlidersHorizontal,
  },
];

export const SUBJECTIVE_QUESTION_ITEMS = [
  {
    value: 'ESSAY_SHORT',
    label: 'Esai Singkat',
    sub: 'Short Essay',
    desc: 'Uraian ringkas 1–2 paragraf.',
    icon: FileText,
  },
  {
    value: 'ESSAY_LONG',
    label: 'Esai Uraian Panjang',
    sub: 'Long Essay',
    desc: 'Pembahasan mendalam dengan rubrik.',
    icon: AlignLeft,
  },
  {
    value: 'CASE_STUDY',
    label: 'Studi Kasus',
    sub: 'Case Study',
    desc: 'Analisis skenario industri nyata.',
    icon: Briefcase,
  },
  {
    value: 'ANALYTICAL_RESPONSE',
    label: 'Respons Analitis',
    sub: 'Analytical Response',
    desc: 'Evaluasi kritis & argumentasi.',
    icon: Lightbulb,
  },
  {
    value: 'PROBLEM_SOLVING',
    label: 'Pemecahan Masalah',
    sub: 'Problem Solving',
    desc: 'Langkah penyelesaian terstruktur.',
    icon: Puzzle,
  },
  {
    value: 'ALGORITHM_CODE',
    label: 'Algoritma & Kode',
    sub: 'Algorithm / Code',
    desc: 'Pseudocode, logika, atau analisis kode.',
    icon: Code2,
  },
  {
    value: 'DOCUMENT_BASED_RESPONSE',
    label: 'Berbasis Dokumen',
    sub: 'Document-Based Response',
    desc: 'Respons atau unggahan dokumen.',
    icon: Paperclip,
  },
];

export function AddQuestionModal({
  open,
  onClose,
  onSelectType,
  onOpenRepository,
  onOpenImport,
}: {
  open: boolean;
  onClose: () => void;
  onSelectType: (mode: 'OBJECTIVE' | 'ESSAY', type: string) => void;
  onOpenRepository: () => void;
  onOpenImport: () => void;
}) {
  return (
    <ModalDialog open={open} onClose={onClose} title="Tambah Soal ke Evaluasi" maxWidth="max-w-3xl">
      <div className="space-y-5 text-xs">
        {/* Group 1: Objective */}
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] mb-2">
            1. Soal Objektif (Penilaian Otomatis Server-Side)
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {OBJECTIVE_QUESTION_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    onSelectType('OBJECTIVE', item.value);
                    onClose();
                  }}
                  className="flex items-start gap-2.5 p-2.5 rounded-lg border border-[#E2E8F0] bg-white hover:border-[#2563EB] hover:bg-blue-50/40 text-left transition-colors"
                >
                  <Icon className="w-4 h-4 text-[#2563EB] shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-semibold text-[#172033]">{item.label}</div>
                    <div className="text-[10px] text-[#64748B]">{item.sub} — {item.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Group 2: Subjective */}
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] mb-2">
            2. Soal Subjektif / Esai (Penilaian Rubrik & Manual)
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {SUBJECTIVE_QUESTION_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    onSelectType('ESSAY', item.value);
                    onClose();
                  }}
                  className="flex items-start gap-2.5 p-2.5 rounded-lg border border-[#E2E8F0] bg-white hover:border-[#14213D] hover:bg-slate-50 text-left transition-colors"
                >
                  <Icon className="w-4 h-4 text-[#14213D] shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-semibold text-[#172033]">{item.label}</div>
                    <div className="text-[10px] text-[#64748B]">{item.sub} — {item.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Group 3 & 4: Repository & Import */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#E2E8F0]">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenRepository();
            }}
            className="flex items-center gap-3 p-3 rounded-xl border border-[#E2E8F0] bg-[#F7F9FC] hover:border-[#2563EB] text-left transition-colors"
          >
            <div className="p-2 rounded-lg bg-blue-100 text-[#2563EB]">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-[#172033]">3. Ambil dari Bank Soal</div>
              <div className="text-[11px] text-[#64748B]">
                Pilih soal terstandarisasi sebagai snapshot permanen
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenImport();
            }}
            className="flex items-center gap-3 p-3 rounded-xl border border-[#E2E8F0] bg-[#F7F9FC] hover:border-[#2563EB] text-left transition-colors"
          >
            <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-[#172033]">4. Import Excel / CSV</div>
              <div className="text-[11px] text-[#64748B]">
                Unggah massal XLSX atau CSV hingga ratusan soal
              </div>
            </div>
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
