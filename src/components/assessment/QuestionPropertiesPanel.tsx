import React from 'react';
import { PanelRightClose, PanelRightOpen, Plus, Trash2 } from 'lucide-react';
import { Input } from '../ui/primitives';

export function QuestionPropertiesPanel({
  question,
  collapsed,
  onToggleCollapse,
  onChange,
}: {
  question: any | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onChange: (patch: Record<string, any>) => void;
}) {
  if (collapsed) {
    return (
      <div className="hidden lg:flex flex-col items-center py-3 px-1.5 bg-white border border-[#E2E8F0] rounded-xl w-12 shrink-0 gap-3">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="p-1.5 rounded-lg text-[#64748B] hover:bg-slate-100 hover:text-[#172033]"
          title="Buka Properti Soal"
        >
          <PanelRightOpen className="w-4 h-4" />
        </button>
        <div className="text-[11px] font-bold text-[#64748B] [writing-mode:vertical-rl] rotate-180 mt-2">
          Properti
        </div>
      </div>
    );
  }

  if (!question) {
    return (
      <aside className="w-full lg:w-[275px] shrink-0 bg-white border border-[#E2E8F0] rounded-xl p-4 text-xs text-[#64748B]">
        Pilih soal di navigator untuk melihat dan mengubah properti butir soal.
      </aside>
    );
  }

  const isObjective = question.questionMode === 'OBJECTIVE';

  return (
    <aside className="w-full lg:w-[275px] shrink-0 bg-white border border-[#E2E8F0] rounded-xl flex flex-col max-h-[calc(100vh-210px)]">
      <div className="p-3 border-b border-[#E2E8F0] flex items-center justify-between">
        <span className="text-xs font-bold text-[#172033]">Properti Soal</span>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="hidden lg:inline-flex p-1 rounded text-[#64748B] hover:bg-slate-100"
          title="Ciutkan Properti"
        >
          <PanelRightClose className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
        {/* Common Properties */}
        <div className="space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
            Pengaturan Umum
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block font-semibold text-[#172033] mb-1">Bobot Poin</label>
              <Input
                type="number"
                min={1}
                max={1000}
                value={question.points ?? 10}
                onChange={(e) => onChange({ points: Number(e.target.value) || 1 })}
                className="h-8 text-xs border-[#E2E8F0]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#172033] mb-1">Kesulitan</label>
              <select
                value={question.difficulty || 'MEDIUM'}
                onChange={(e) => onChange({ difficulty: e.target.value })}
                className="w-full h-8 rounded-lg border border-[#E2E8F0] bg-white px-2 text-xs text-[#172033]"
              >
                <option value="EASY">Mudah</option>
                <option value="MEDIUM">Sedang</option>
                <option value="HARD">Sulit</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[#172033] mb-1">Topik / Pokok Bahasan</label>
            <Input
              value={question.topic || ''}
              onChange={(e) => onChange({ topic: e.target.value })}
              placeholder="Contoh: Basis Data Relasional"
              className="h-8 text-xs border-[#E2E8F0]"
            />
          </div>

          <div>
            <label className="block font-semibold text-[#172033] mb-1">CPMK / Capaian</label>
            <Input
              value={question.learningOutcome || ''}
              onChange={(e) => onChange({ learningOutcome: e.target.value })}
              placeholder="Contoh: CPMK-01"
              className="h-8 text-xs border-[#E2E8F0]"
            />
          </div>

          <div>
            <label className="block font-semibold text-[#172033] mb-1">Status Bank Soal</label>
            <select
              value={question.status || 'READY'}
              onChange={(e) => onChange({ status: e.target.value })}
              className="w-full h-8 rounded-lg border border-[#E2E8F0] bg-white px-2 text-xs text-[#172033]"
            >
              <option value="READY">Siap Digunakan (READY)</option>
              <option value="DRAFT">Draf (DRAFT)</option>
            </select>
          </div>
        </div>

        {/* Objective-Only Properties */}
        {isObjective && (
          <div className="space-y-3 pt-3 border-t border-[#E2E8F0]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
              Kebijakan Penilaian Objektif
            </div>

            <div>
              <label className="block font-semibold text-[#172033] mb-1">
                Penalti Jawaban Salah
              </label>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={question.negativePoints ?? 0}
                onChange={(e) => onChange({ negativePoints: Number(e.target.value) || 0 })}
                className="h-8 text-xs border-[#E2E8F0]"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(question.partialCreditEnabled)}
                onChange={(e) => onChange({ partialCreditEnabled: e.target.checked })}
                className="rounded border-[#E2E8F0] text-[#2563EB]"
              />
              <span className="text-xs text-[#172033]">Aktifkan Skor Parsial (Partial Credit)</span>
            </label>
          </div>
        )}

        {/* Subjective-Only Properties */}
        {!isObjective && (
          <div className="space-y-3 pt-3 border-t border-[#E2E8F0]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                Rubrik Penilaian Esai
              </span>
              <button
                type="button"
                onClick={() => {
                  const cur = question.rubric || {
                    title: 'Rubrik Penilaian Esai',
                    description: '',
                    criteria: [],
                  };
                  onChange({
                    rubric: {
                      ...cur,
                      criteria: [
                        ...(cur.criteria || []),
                        { criterionName: 'Kriteria Baru', description: '', weight: 25, maxScore: 5 },
                      ],
                    },
                  });
                }}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#2563EB] hover:underline"
              >
                <Plus className="w-3 h-3" /> Kriteria
              </button>
            </div>

            <div className="space-y-2">
              {(question.rubric?.criteria || []).map((c: any, cIdx: number) => (
                <div
                  key={cIdx}
                  className="p-2 rounded-lg border border-[#E2E8F0] bg-[#F7F9FC] space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-1">
                    <Input
                      value={c.criterionName}
                      onChange={(e) => {
                        const next = [...(question.rubric?.criteria || [])];
                        next[cIdx] = { ...next[cIdx], criterionName: e.target.value };
                        onChange({ rubric: { ...question.rubric, criteria: next } });
                      }}
                      className="h-7 text-[11px] bg-white"
                      placeholder="Nama kriteria"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const next = (question.rubric?.criteria || []).filter(
                          (_: any, idx: number) => idx !== cIdx
                        );
                        onChange({ rubric: { ...question.rubric, criteria: next } });
                      }}
                      className="p-1 text-rose-600 hover:bg-rose-50 rounded"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <span className="text-[10px] text-[#64748B]">Skor Maks</span>
                      <Input
                        type="number"
                        min={1}
                        value={c.maxScore ?? 10}
                        onChange={(e) => {
                          const next = [...(question.rubric?.criteria || [])];
                          next[cIdx] = { ...next[cIdx], maxScore: Number(e.target.value) || 1 };
                          onChange({ rubric: { ...question.rubric, criteria: next } });
                        }}
                        className="h-7 text-[11px] bg-white"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-[#64748B]">Bobot (%)</span>
                      <Input
                        type="number"
                        min={1}
                        value={c.weight ?? 25}
                        onChange={(e) => {
                          const next = [...(question.rubric?.criteria || [])];
                          next[cIdx] = { ...next[cIdx], weight: Number(e.target.value) || 1 };
                          onChange({ rubric: { ...question.rubric, criteria: next } });
                        }}
                        className="h-7 text-[11px] bg-white"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
