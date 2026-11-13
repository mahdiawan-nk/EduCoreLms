import React, { useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading2,
  Heading3,
  Pilcrow,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Link as LinkIcon,
  Unlink,
  Undo2,
  Redo2,
} from 'lucide-react';
import { ModalDialog, Button, Input } from './ui/primitives';

interface LightweightTiptapEditorProps {
  value?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
  disabled?: boolean;
}

export function LightweightTiptapEditor({
  value = '',
  onChange,
  placeholder = 'Tambahkan informasi pendukung mengenai mata kuliah, metode pembelajaran, ketentuan kelas, dan informasi penting lainnya...',
  minHeight = '140px',
  disabled = false,
}: LightweightTiptapEditorProps) {
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          class: 'text-blue-600 underline font-medium hover:text-blue-800',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: value || '',
    editable: !disabled,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange?.(html === '<p></p>' ? '' : html);
    },
  });

  // Synchronize external value updates
  useEffect(() => {
    if (editor && value !== undefined) {
      const currentHtml = editor.getHTML();
      const normalizedValue = value || '';
      const normalizedCurrent = currentHtml === '<p></p>' ? '' : currentHtml;
      if (normalizedValue !== normalizedCurrent) {
        editor.commands.setContent(normalizedValue);
      }
    }
  }, [value, editor]);

  if (!editor) {
    return (
      <div
        className="w-full rounded-lg border border-slate-200 bg-slate-50/50 p-4 animate-pulse"
        style={{ minHeight }}
      />
    );
  }

  const handleSetLink = () => {
    let formattedUrl = linkUrl.trim();
    if (!formattedUrl) {
      editor.chain().focus().unsetLink().run();
      setLinkModalOpen(false);
      return;
    }
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = `https://${formattedUrl}`;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: formattedUrl })
      .run();
    setLinkModalOpen(false);
    setLinkUrl('');
  };

  const charCount = editor.getText().length;

  return (
    <div className="w-full rounded-lg border border-slate-300 bg-white transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 shadow-2xs">
      {/* Lightweight Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50/80 px-2.5 py-1.5 rounded-t-lg">
        {/* Undo / Redo */}
        <button
          type="button"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className="p-1.5 rounded text-slate-600 hover:bg-slate-200/80 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className="p-1.5 rounded text-slate-600 hover:bg-slate-200/80 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
          title="Redo (Ctrl+Y)"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-slate-300 mx-1" />

        {/* Text Formats: Bold, Italic, Underline, Strikethrough */}
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-1.5 rounded transition-colors cursor-pointer ${
            editor.isActive('bold')
              ? 'bg-blue-100 text-blue-800 font-bold'
              : 'text-slate-700 hover:bg-slate-200/80'
          }`}
          title="Tebal (Bold)"
        >
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-1.5 rounded transition-colors cursor-pointer ${
            editor.isActive('italic')
              ? 'bg-blue-100 text-blue-800 font-bold'
              : 'text-slate-700 hover:bg-slate-200/80'
          }`}
          title="Miring (Italic)"
        >
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`p-1.5 rounded transition-colors cursor-pointer ${
            editor.isActive('underline')
              ? 'bg-blue-100 text-blue-800 font-bold'
              : 'text-slate-700 hover:bg-slate-200/80'
          }`}
          title="Garis Bawah (Underline)"
        >
          <UnderlineIcon className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={`p-1.5 rounded transition-colors cursor-pointer ${
            editor.isActive('strike')
              ? 'bg-blue-100 text-blue-800 font-bold'
              : 'text-slate-700 hover:bg-slate-200/80'
          }`}
          title="Coret (Strikethrough)"
        >
          <Strikethrough className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-slate-300 mx-1" />

        {/* Headings & Paragraph */}
        <button
          type="button"
          onClick={() => editor.chain().focus().setParagraph().run()}
          className={`px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
            editor.isActive('paragraph') && !editor.isActive('heading')
              ? 'bg-blue-100 text-blue-800 font-bold'
              : 'text-slate-700 hover:bg-slate-200/80'
          }`}
          title="Paragraf Biasa"
        >
          <Pilcrow className="w-3.5 h-3.5 inline mr-1" /> Normal
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`p-1.5 rounded transition-colors cursor-pointer ${
            editor.isActive('heading', { level: 2 })
              ? 'bg-blue-100 text-blue-800 font-bold'
              : 'text-slate-700 hover:bg-slate-200/80'
          }`}
          title="Judul Bab (Heading 2)"
        >
          <Heading2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={`p-1.5 rounded transition-colors cursor-pointer ${
            editor.isActive('heading', { level: 3 })
              ? 'bg-blue-100 text-blue-800 font-bold'
              : 'text-slate-700 hover:bg-slate-200/80'
          }`}
          title="Sub-judul (Heading 3)"
        >
          <Heading3 className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-slate-300 mx-1" />

        {/* Lists: Bullet & Numbered */}
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`p-1.5 rounded transition-colors cursor-pointer ${
            editor.isActive('bulletList')
              ? 'bg-blue-100 text-blue-800 font-bold'
              : 'text-slate-700 hover:bg-slate-200/80'
          }`}
          title="Daftar Butir (Bullet List)"
        >
          <List className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`p-1.5 rounded transition-colors cursor-pointer ${
            editor.isActive('orderedList')
              ? 'bg-blue-100 text-blue-800 font-bold'
              : 'text-slate-700 hover:bg-slate-200/80'
          }`}
          title="Daftar Nomor (Numbered List)"
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-slate-300 mx-1" />

        {/* Alignment */}
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          className={`p-1.5 rounded transition-colors cursor-pointer ${
            editor.isActive({ textAlign: 'left' })
              ? 'bg-blue-100 text-blue-800 font-bold'
              : 'text-slate-700 hover:bg-slate-200/80'
          }`}
          title="Rata Kiri"
        >
          <AlignLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          className={`p-1.5 rounded transition-colors cursor-pointer ${
            editor.isActive({ textAlign: 'center' })
              ? 'bg-blue-100 text-blue-800 font-bold'
              : 'text-slate-700 hover:bg-slate-200/80'
          }`}
          title="Rata Tengah"
        >
          <AlignCenter className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          className={`p-1.5 rounded transition-colors cursor-pointer ${
            editor.isActive({ textAlign: 'right' })
              ? 'bg-blue-100 text-blue-800 font-bold'
              : 'text-slate-700 hover:bg-slate-200/80'
          }`}
          title="Rata Kanan"
        >
          <AlignRight className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          className={`p-1.5 rounded transition-colors cursor-pointer ${
            editor.isActive({ textAlign: 'justify' })
              ? 'bg-blue-100 text-blue-800 font-bold'
              : 'text-slate-700 hover:bg-slate-200/80'
          }`}
          title="Rata Kanan-Kiri (Justify)"
        >
          <AlignJustify className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-slate-300 mx-1" />

        {/* Link / Unlink */}
        <button
          type="button"
          onClick={() => {
            const currentHref = editor.getAttributes('link').href || '';
            setLinkUrl(currentHref);
            setLinkModalOpen(true);
          }}
          className={`p-1.5 rounded transition-colors cursor-pointer ${
            editor.isActive('link')
              ? 'bg-blue-100 text-blue-800 font-bold'
              : 'text-slate-700 hover:bg-slate-200/80'
          }`}
          title="Sisipkan Tautan (Link)"
        >
          <LinkIcon className="w-3.5 h-3.5" />
        </button>
        {editor.isActive('link') && (
          <button
            type="button"
            onClick={() => editor.chain().focus().unsetLink().run()}
            className="p-1.5 rounded text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
            title="Hapus Tautan"
          >
            <Unlink className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Editor Content Area */}
      <div className="p-3">
        <EditorContent
          editor={editor}
          className="prose prose-sm max-w-none focus:outline-none min-h-[140px] text-slate-800 text-sm leading-relaxed"
          style={{ minHeight }}
        />
      </div>

      {/* Footer Guidance */}
      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-3 py-1.5 text-[11px] text-slate-400 rounded-b-lg">
        <span>Rich Text Format (HTML aman)</span>
        <span>{charCount} karakter</span>
      </div>

      {/* Link Modal */}
      <ModalDialog
        open={linkModalOpen}
        onClose={() => setLinkModalOpen(false)}
        title="Sisipkan Tautan Web"
        description="Masukkan alamat URL tujuan (misal: https://example.com/silabus.pdf)"
      >
        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Alamat URL
            </label>
            <Input
              type="url"
              placeholder="https://..."
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLinkModalOpen(false)}
            >
              Batal
            </Button>
            <Button type="button" size="sm" onClick={handleSetLink}>
              Terapkan Tautan
            </Button>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
}
