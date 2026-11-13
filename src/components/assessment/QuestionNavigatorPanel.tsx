import React, { useState } from 'react';
import {
  Search,
  Plus,
  Copy,
  Trash2,
  GripVertical,
  CheckCircle2,
  AlertCircle,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { Button, Input } from '../ui/primitives';

export function isQuestionValid(q: any): boolean {
  if (!q?.promptText || !String(q.promptText).trim()) return false;
  if (
    q.questionType === 'SINGLE_CHOICE' ||
    q.questionType === 'MULTIPLE_SELECT' ||
    q.questionType === 'TRUE_FALSE'
  ) {
    const opts = Array.isArray(q.options) ? q.options : [];
    const correctCount = opts.filter((o: any) => o.isCorrect).length;
    if (q.questionType === 'SINGLE_CHOICE' && correctCount !== 1) return false;
    if (q.questionType === 'MULTIPLE_SELECT' && correctCount < 1) return false;
  }
  return true;
}

export function QuestionNavigatorPanel({
  questions,
  selectedIndex,
  collapsed,
  onToggleCollapse,
  onSelect,
  onReorder,
  onDuplicate,
  onRequestDelete,
  onOpenAddModal,
}: {
  questions: any[];
  selectedIndex: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelect: (index: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDuplicate: (index: number) => void;
  onRequestDelete: (index: number) => void;
  onOpenAddModal: () => void;
}) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'OBJECTIVE' | 'ESSAY'>('ALL');
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  if (collapsed) {
    return (
      <div className="hidden lg:flex flex-col items-center py-3 px-1.5 bg-white border border-[#E2E8F0] rounded-xl w-12 shrink-0 gap-3">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="p-1.5 rounded-lg text-[#64748B] hover:bg-slate-100 hover:text-[#172033]"
          title="Buka Navigator Soal"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onOpenAddModal}
          className="p-1.5 rounded-lg bg-[#14213D] text-white hover:bg-slate-800"
          title="Tambah Soal"
        >
          <Plus className="w-4 h-4" />
        </button>
        <div className="text-[11px] font-bold text-[#64748B] [writing-mode:vertical-rl] rotate-180 mt-2">
          {questions.length} Soal
        </div>
      </div>
    );
  }

  const filtered = questions
    .map((q, idx) => ({ q, idx }))
    .filter(({ q }) => {
      const matchesMode = typeFilter === 'ALL' || q.questionMode === typeFilter;
      const s = search.trim().toLowerCase();
      const matchesSearch =
        !s ||
        String(q.promptText || '')
          .toLowerCase()
          .includes(s) ||
        String(q.questionType || '')
          .toLowerCase()
          .includes(s);
      return matchesMode && matchesSearch;
    });

  return (
    <aside className="w-full lg:w-[245px] shrink-0 bg-white border border-[#E2E8F0] rounded-xl flex flex-col max-h-[calc(100vh-210px)]">
      <div className="p-3 border-b border-[#E2E8F0] space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-[#172033]">
            Daftar Soal ({questions.length})
          </span>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden lg:inline-flex p-1 rounded text-[#64748B] hover:bg-slate-100"
            title="Ciutkan Navigator"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        <Button
          type="button"
          size="sm"
          className="w-full bg-[#14213D] hover:bg-[#1e2f52] text-white"
          onClick={onOpenAddModal}
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Tambah Soal
        </Button>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-2.5 top-2.5" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari soal..."
            className="pl-8 h-8 text-xs border-[#E2E8F0]"
          />
        </div>

        <div className="grid grid-cols-3 gap-1 text-[11px]">
          {(['ALL', 'OBJECTIVE', 'ESSAY'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setTypeFilter(f)}
              className={`py-1 rounded font-semibold transition-colors ${
                typeFilter === f
                  ? 'bg-[#14213D] text-white'
                  : 'bg-[#F7F9FC] text-[#64748B] hover:text-[#172033]'
              }`}
            >
              {f === 'ALL' ? 'Semua' : f === 'OBJECTIVE' ? 'Objektif' : 'Esai'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-[11px] text-[#64748B]">
            Belum ada soal yang sesuai.
          </div>
        ) : (
          filtered.map(({ q, idx }) => {
            const active = selectedIndex === idx;
            const valid = isQuestionValid(q);
            return (
              <div
                key={q.questionId || idx}
                draggable
                onDragStart={() => setDragIdx(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIdx !== null && dragIdx !== idx) {
                    onReorder(dragIdx, idx);
                  }
                  setDragIdx(null);
                }}
                onClick={() => onSelect(idx)}
                className={`group p-2.5 rounded-lg border cursor-pointer transition-all ${
                  active
                    ? 'border-[#2563EB] bg-blue-50/50'
                    : 'border-[#E2E8F0] bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <GripVertical className="w-3.5 h-3.5 text-slate-300 shrink-0 cursor-grab" />
                    <span className="text-[11px] font-bold text-[#14213D]">#{idx + 1}</span>
                    <span className="px-1.5 py-0.5 rounded bg-[#F7F9FC] border border-[#E2E8F0] text-[9px] font-semibold text-[#64748B] truncate">
                      {q.questionType}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {valid ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" aria-label="Valid" />
                    ) : (
                      <AlertCircle className="w-3 h-3 text-amber-500" aria-label="Belum lengkap" />
                    )}
                    <span className="text-[10px] font-mono font-semibold text-[#64748B]">
                      {q.points}p
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-[#172033] line-clamp-2 mt-1 leading-snug">
                  {q.promptText || '(Belum ada teks soal)'}
                </p>

                <div className="flex items-center justify-end gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicate(idx);
                    }}
                    className="p-1 rounded text-[#64748B] hover:bg-slate-100 hover:text-[#172033]"
                    title="Duplikasi soal"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestDelete(idx);
                    }}
                    className="p-1 rounded text-[#64748B] hover:bg-rose-50 hover:text-rose-600"
                    title="Hapus soal"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
