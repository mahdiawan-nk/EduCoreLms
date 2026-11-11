import React, { useState, useEffect, useCallback } from 'react';
import { useEditor, EditorContent, Node, mergeAttributes } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import {
  Table,
  TableRow,
  TableCell,
  TableHeader,
} from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Youtube from '@tiptap/extension-youtube';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import { common, createLowlight } from 'lowlight';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Minus,
  Code2,
  Table as TableIcon,
  Image as ImageIcon,
  Link as LinkIcon,
  Video,
  Undo2,
  Redo2,
  Search,
  Highlighter,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button, Input, ModalDialog } from './ui/primitives';
import { toast } from 'sonner';

const lowlight = createLowlight(common);

// Custom Resizable & Captioned Image Extension
const CustomImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: '100%',
        parseHTML: (element) => element.getAttribute('data-width') || '100%',
        renderHTML: (attributes) => ({
          'data-width': attributes.width,
          style: `width: ${attributes.width}; max-width: 100%;`,
        }),
      },
      caption: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-caption') || '',
        renderHTML: (attributes) => ({
          'data-caption': attributes.caption,
          title: attributes.caption,
        }),
      },
    };
  },
});

// Validated Custom Vimeo Embed Node
export const VimeoEmbedNode = Node.create({
  name: 'vimeoEmbed',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      videoId: { default: '' },
      title: { default: 'Vimeo Video' },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-vimeo-video]' }];
  },
  renderHTML({ HTMLAttributes }) {
    const videoId = String(HTMLAttributes.videoId || '').replace(
      /[^0-9]/g,
      ''
    );
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-vimeo-video': videoId,
        class:
          'my-4 aspect-video w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-950',
      }),
      [
        'iframe',
        {
          src: `https://player.vimeo.com/video/${videoId}`,
          class: 'h-full w-full',
          frameborder: '0',
          allow: 'autoplay; fullscreen; picture-in-picture',
          allowfullscreen: 'true',
        },
      ],
    ];
  },
});

// Custom Uploaded Video Node inside Tiptap Document
export const UploadedVideoNode = Node.create({
  name: 'uploadedVideo',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      src: { default: '' },
      title: { default: 'Video Materi' },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-uploaded-video]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-uploaded-video': 'true',
        class:
          'my-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-950 p-2',
      }),
      [
        'video',
        {
          src: HTMLAttributes.src,
          controls: 'true',
          preload: 'metadata',
          class: 'w-full max-h-[420px] rounded',
        },
      ],
    ];
  },
});

export function getTiptapExtensions(placeholderText?: string) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      codeBlock: false,
    }),
    Underline,
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({
      types: ['heading', 'paragraph'],
    }),
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    Table.configure({
      resizable: true,
    }),
    TableRow,
    TableHeader,
    TableCell,
    CustomImage.configure({
      inline: false,
      allowBase64: false,
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
    }),
    Youtube.configure({
      controls: true,
      nocookie: true,
    }),
    VimeoEmbedNode,
    UploadedVideoNode,
    CodeBlockLowlight.configure({
      lowlight,
    }),
    Placeholder.configure({
      placeholder:
        placeholderText ||
        'Tuliskan materi perkuliahan lengkap, rumus, tabel praktikum, blok kode, atau sematkan gambar dan video...',
    }),
  ];
}

export function TiptapMaterialEditor({
  contentJson: contentJsonProp,
  initialJson,
  onChange,
  onUploadInlineFile,
  onUploadImageFile,
  onUploadVideoFile,
}: {
  contentJson?: Record<string, any>;
  initialJson?: Record<string, any>;
  onChange: (json: Record<string, any>, html: string, text: string) => void;
  onUploadInlineFile?: (file: File) => Promise<{ url: string; mimeType?: string } | null>;
  onUploadImageFile?: (file: File) => Promise<{ url: string; title?: string } | null>;
  onUploadVideoFile?: (file: File) => Promise<{ url: string; title?: string } | null>;
}) {
  const contentJson = contentJsonProp || initialJson || { type: 'doc', content: [{ type: 'paragraph' }] };
  const resolvedUploadHandler =
    onUploadInlineFile ||
    (async (file: File) => {
      if (file.type.startsWith('video/') && onUploadVideoFile) {
        const res = await onUploadVideoFile(file);
        return res ? { url: res.url, mimeType: file.type } : null;
      }
      if (onUploadImageFile) {
        const res = await onUploadImageFile(file);
        return res ? { url: res.url, mimeType: file.type } : null;
      }
      return null;
    });

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');

  // Modal states for structured media insertion
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [imageCaption, setImageCaption] = useState('');
  const [imageWidth, setImageWidth] = useState('100%');

  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [videoProvider, setVideoProvider] = useState<'YOUTUBE' | 'VIMEO'>('YOUTUBE');
  const [videoEmbedInput, setVideoEmbedInput] = useState('');

  const [selectionActive, setSelectionActive] = useState(false);

  const editor = useEditor({
    extensions: getTiptapExtensions(),
    content:
      contentJson && Object.keys(contentJson).length > 0
        ? contentJson
        : {
            type: 'doc',
            content: [{ type: 'paragraph' }],
          },
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getJSON() as Record<string, any>, ed.getHTML(), ed.getText());
    },
    onSelectionUpdate: ({ editor: ed }) => {
      const { from, to } = ed.state.selection;
      setSelectionActive(to - from > 0);
    },
    editorProps: {
      handleDrop: (view, event, _slice, moved) => {
        if (
          !moved &&
          event.dataTransfer &&
          event.dataTransfer.files &&
          event.dataTransfer.files[0] &&
          resolvedUploadHandler
        ) {
          const file = event.dataTransfer.files[0];
          if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
            event.preventDefault();
            resolvedUploadHandler(file).then((uploaded) => {
              if (!uploaded) return;
              if (file.type.startsWith('image/')) {
                const { schema } = view.state;
                const coordinates = view.posAtCoords({
                  left: event.clientX,
                  top: event.clientY,
                });
                const node = schema.nodes.image.create({
                  src: uploaded.url,
                  caption: file.name,
                  width: '100%',
                });
                if (coordinates) {
                  const transaction = view.state.tr.insert(
                    coordinates.pos,
                    node
                  );
                  view.dispatch(transaction);
                }
              }
            });
            return true;
          }
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items || !resolvedUploadHandler) return false;
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
              event.preventDefault();
              resolvedUploadHandler(file).then((uploaded) => {
                if (uploaded && editor) {
                  editor
                    .chain()
                    .focus()
                    .setImage({ src: uploaded.url, alt: file.name })
                    .run();
                }
              });
              return true;
            }
          }
        }
        return false;
      },
    },
  });

  // Sync external initial contentJson if loaded asynchronously
  useEffect(() => {
    if (!editor || !contentJson) return;
    const currentStr = JSON.stringify(editor.getJSON());
    const incomingStr = JSON.stringify(contentJson);
    if (
      currentStr !== incomingStr &&
      editor.getText().trim() === '' &&
      Array.isArray(contentJson.content) &&
      contentJson.content.length > 0
    ) {
      editor.commands.setContent(contentJson, { emitUpdate: false });
    }
  }, [contentJson, editor]);

  const handleSearchAndReplace = useCallback(() => {
    if (!editor || !searchTerm.trim()) return;
    const html = editor.getHTML();
    if (!html.includes(searchTerm)) {
      toast.info(`Kata "${searchTerm}" tidak ditemukan di dalam dokumen.`);
      return;
    }
    const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const updatedHtml = html.replace(new RegExp(escaped, 'g'), replaceTerm);
    editor.commands.setContent(updatedHtml, { emitUpdate: true });
    toast.success(`Berhasil mengganti "${searchTerm}" dengan "${replaceTerm}"`);
  }, [editor, searchTerm, replaceTerm]);

  if (!editor) return null;

  const plainText = editor.getText();
  const wordCount = plainText.trim()
    ? plainText.trim().split(/\s+/).length
    : 0;
  const charCount = plainText.length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Grouped Primary Rich Text Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-3 py-2">
        {/* Group 1: Undo / Redo */}
        <div className="flex items-center gap-0.5 pr-2 border-r border-slate-200">
          <button
            type="button"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            className="p-1.5 rounded hover:bg-slate-200 text-slate-700 disabled:opacity-40 cursor-pointer"
            title="Undo"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            className="p-1.5 rounded hover:bg-slate-200 text-slate-700 disabled:opacity-40 cursor-pointer"
            title="Redo"
          >
            <Redo2 className="h-4 w-4" />
          </button>
        </div>

        {/* Group 2: Headings H1-H4 & Paragraph */}
        <div className="flex items-center gap-1 px-2 border-r border-slate-200">
          <select
            value={
              editor.isActive('heading', { level: 1 })
                ? 'h1'
                : editor.isActive('heading', { level: 2 })
                  ? 'h2'
                  : editor.isActive('heading', { level: 3 })
                    ? 'h3'
                    : editor.isActive('heading', { level: 4 })
                      ? 'h4'
                      : 'p'
            }
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'p') {
                editor.chain().focus().setParagraph().run();
              } else {
                const level = Number(val.replace('h', '')) as 1 | 2 | 3 | 4;
                editor.chain().focus().toggleHeading({ level }).run();
              }
            }}
            className="h-8 rounded border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800"
          >
            <option value="p">Paragraf Normal</option>
            <option value="h1">Heading 1 (H1)</option>
            <option value="h2">Heading 2 (H2)</option>
            <option value="h3">Heading 3 (H3)</option>
            <option value="h4">Heading 4 (H4)</option>
          </select>
        </div>

        {/* Group 3: Inline Formatting */}
        <div className="flex items-center gap-0.5 px-2 border-r border-slate-200">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-1.5 rounded cursor-pointer ${
              editor.isActive('bold')
                ? 'bg-slate-900 text-white'
                : 'hover:bg-slate-200 text-slate-700'
            }`}
            title="Bold"
          >
            <Bold className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-1.5 rounded cursor-pointer ${
              editor.isActive('italic')
                ? 'bg-slate-900 text-white'
                : 'hover:bg-slate-200 text-slate-700'
            }`}
            title="Italic"
          >
            <Italic className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`p-1.5 rounded cursor-pointer ${
              editor.isActive('underline')
                ? 'bg-slate-900 text-white'
                : 'hover:bg-slate-200 text-slate-700'
            }`}
            title="Underline"
          >
            <UnderlineIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={`p-1.5 rounded cursor-pointer ${
              editor.isActive('strike')
                ? 'bg-slate-900 text-white'
                : 'hover:bg-slate-200 text-slate-700'
            }`}
            title="Strikethrough"
          >
            <Strikethrough className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() =>
              editor.chain().focus().toggleHighlight({ color: '#fef08a' }).run()
            }
            className={`p-1.5 rounded cursor-pointer ${
              editor.isActive('highlight')
                ? 'bg-amber-200 text-slate-900'
                : 'hover:bg-slate-200 text-slate-700'
            }`}
            title="Highlight"
          >
            <Highlighter className="h-4 w-4" />
          </button>
          <input
            type="color"
            aria-label="Warna Teks"
            title="Warna Teks"
            defaultValue="#0f172a"
            onChange={(e) =>
              editor.chain().focus().setColor(e.target.value).run()
            }
            className="h-6 w-6 rounded border border-slate-200 cursor-pointer bg-white p-0.5"
          />
        </div>

        {/* Group 4: Text Alignment */}
        <div className="flex items-center gap-0.5 px-2 border-r border-slate-200">
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            className={`p-1.5 rounded cursor-pointer ${
              editor.isActive({ textAlign: 'left' })
                ? 'bg-slate-900 text-white'
                : 'hover:bg-slate-200 text-slate-700'
            }`}
            title="Rata Kiri"
          >
            <AlignLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            className={`p-1.5 rounded cursor-pointer ${
              editor.isActive({ textAlign: 'center' })
                ? 'bg-slate-900 text-white'
                : 'hover:bg-slate-200 text-slate-700'
            }`}
            title="Rata Tengah"
          >
            <AlignCenter className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            className={`p-1.5 rounded cursor-pointer ${
              editor.isActive({ textAlign: 'right' })
                ? 'bg-slate-900 text-white'
                : 'hover:bg-slate-200 text-slate-700'
            }`}
            title="Rata Kanan"
          >
            <AlignRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('justify').run()}
            className={`p-1.5 rounded cursor-pointer ${
              editor.isActive({ textAlign: 'justify' })
                ? 'bg-slate-900 text-white'
                : 'hover:bg-slate-200 text-slate-700'
            }`}
            title="Rata Kiri-Kanan"
          >
            <AlignJustify className="h-4 w-4" />
          </button>
        </div>

        {/* Group 5: Lists & Blocks */}
        <div className="flex items-center gap-0.5 px-2 border-r border-slate-200">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-1.5 rounded cursor-pointer ${
              editor.isActive('bulletList')
                ? 'bg-slate-900 text-white'
                : 'hover:bg-slate-200 text-slate-700'
            }`}
            title="Bullet List"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-1.5 rounded cursor-pointer ${
              editor.isActive('orderedList')
                ? 'bg-slate-900 text-white'
                : 'hover:bg-slate-200 text-slate-700'
            }`}
            title="Ordered List"
          >
            <ListOrdered className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            className={`p-1.5 rounded cursor-pointer ${
              editor.isActive('taskList')
                ? 'bg-slate-900 text-white'
                : 'hover:bg-slate-200 text-slate-700'
            }`}
            title="Checklist Tugas"
          >
            <CheckSquare className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={`p-1.5 rounded cursor-pointer ${
              editor.isActive('blockquote')
                ? 'bg-slate-900 text-white'
                : 'hover:bg-slate-200 text-slate-700'
            }`}
            title="Kutipan (Blockquote)"
          >
            <Quote className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            className="p-1.5 rounded hover:bg-slate-200 text-slate-700 cursor-pointer"
            title="Garis Pemisah"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className={`p-1.5 rounded cursor-pointer ${
              editor.isActive('codeBlock')
                ? 'bg-slate-900 text-white'
                : 'hover:bg-slate-200 text-slate-700'
            }`}
            title="Blok Kode (Syntax Highlighting)"
          >
            <Code2 className="h-4 w-4" />
          </button>
        </div>

        {/* Group 6: Tables, Images, Links, Videos & Search */}
        <div className="flex items-center gap-0.5 pl-1">
          <button
            type="button"
            onClick={() =>
              editor
                .chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run()
            }
            className="p-1.5 rounded hover:bg-slate-200 text-slate-700 cursor-pointer"
            title="Sisipkan Tabel 3x3"
          >
            <TableIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setImageModalOpen(true)}
            className="p-1.5 rounded hover:bg-slate-200 text-slate-700 cursor-pointer"
            title="Sisipkan Gambar & Caption"
          >
            <ImageIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setLinkModalOpen(true)}
            className="p-1.5 rounded hover:bg-slate-200 text-slate-700 cursor-pointer"
            title="Sisipkan Tautan (Hyperlink)"
          >
            <LinkIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setVideoModalOpen(true)}
            className="p-1.5 rounded hover:bg-slate-200 text-slate-700 cursor-pointer"
            title="Sematkan Video YouTube / Vimeo"
          >
            <Video className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen((prev) => !prev)}
            className={`p-1.5 rounded cursor-pointer ${
              searchOpen
                ? 'bg-slate-900 text-white'
                : 'hover:bg-slate-200 text-slate-700'
            }`}
            title="Cari & Ganti Teks"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Contextual Table Editing Controls Bar */}
      {editor.isActive('table') && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-amber-50/70 px-3 py-1.5 text-xs">
          <span className="font-semibold text-slate-800">Kontrol Tabel:</span>
          <button
            type="button"
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            className="rounded border border-slate-300 bg-white px-2 py-0.5 hover:bg-slate-100 cursor-pointer"
          >
            + Kolom
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().deleteColumn().run()}
            className="rounded border border-slate-300 bg-white px-2 py-0.5 hover:bg-slate-100 cursor-pointer"
          >
            - Hapus Kolom
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().addRowAfter().run()}
            className="rounded border border-slate-300 bg-white px-2 py-0.5 hover:bg-slate-100 cursor-pointer"
          >
            + Baris
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().deleteRow().run()}
            className="rounded border border-slate-300 bg-white px-2 py-0.5 hover:bg-slate-100 cursor-pointer"
          >
            - Hapus Baris
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().deleteTable().run()}
            className="rounded border border-red-300 bg-red-50 text-red-700 px-2 py-0.5 hover:bg-red-100 cursor-pointer"
          >
            Hapus Tabel
          </button>
        </div>
      )}

      {/* Contextual Selection Bubble Bar */}
      {selectionActive && (
        <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-900 px-3 py-1 text-xs text-white">
          <span className="text-slate-400 mr-2">Menu Seleksi Cepat:</span>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className="px-2 py-0.5 rounded hover:bg-slate-800 font-bold cursor-pointer"
          >
            B
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className="px-2 py-0.5 rounded hover:bg-slate-800 italic cursor-pointer"
          >
            I
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className="px-2 py-0.5 rounded hover:bg-slate-800 underline cursor-pointer"
          >
            U
          </button>
          <button
            type="button"
            onClick={() =>
              editor.chain().focus().toggleHighlight({ color: '#fef08a' }).run()
            }
            className="px-2 py-0.5 rounded hover:bg-slate-800 text-amber-300 cursor-pointer"
          >
            Sorot
          </button>
        </div>
      )}

      {/* Search & Replace Bar */}
      {searchOpen && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-100 px-3 py-2 text-xs">
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari kata..."
            className="h-8 w-44 text-xs"
          />
          <Input
            value={replaceTerm}
            onChange={(e) => setReplaceTerm(e.target.value)}
            placeholder="Ganti dengan..."
            className="h-8 w-44 text-xs"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleSearchAndReplace}
          >
            Ganti Semua
          </Button>
        </div>
      )}

      {/* Main Editor Content Canvas */}
      <div className="tiptap-content p-6 min-h-[380px]">
        <EditorContent editor={editor} />
      </div>

      {/* Footer: Floating Quick-Insert & Word/Character Counter */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <span>Sisip Cepat:</span>
          <button
            type="button"
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            className="rounded border border-slate-200 bg-white px-2 py-0.5 text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            + Subjudul H2
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            className="rounded border border-slate-200 bg-white px-2 py-0.5 text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            + Daftar Tugas
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className="rounded border border-slate-200 bg-white px-2 py-0.5 text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            + Blok Kode
          </button>
        </div>

        <div className="flex items-center gap-3 font-mono tabular-nums">
          <span>{wordCount} kata</span>
          <span aria-hidden="true">·</span>
          <span>{charCount} karakter</span>
        </div>
      </div>

      {/* Image Insert / Upload Modal */}
      <ModalDialog
        open={imageModalOpen}
        onClose={() => setImageModalOpen(false)}
        title="Sisipkan Gambar dengan Ukuran & Keterangan (Caption)"
      >
        <div className="space-y-4">
          {(onUploadInlineFile || onUploadImageFile) && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Unggah Berkas Gambar ke Penyimpanan S3 Privat
              </label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const res = await resolvedUploadHandler(f);
                  if (res?.url) {
                    setImageUrl(res.url);
                    if (!imageCaption) setImageCaption(f.name);
                  }
                }}
                className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              URL Gambar Terotorisasi
            </label>
            <Input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="/api/v1/s3-presigned/object?..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Lebar Tampilan (Resize)
              </label>
              <select
                value={imageWidth}
                onChange={(e) => setImageWidth(e.target.value)}
                className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="100%">100% (Penuh)</option>
                <option value="75%">75% (Sedang)</option>
                <option value="50%">50% (Setengah)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Caption / Keterangan Gambar
              </label>
              <Input
                value={imageCaption}
                onChange={(e) => setImageCaption(e.target.value)}
                placeholder="Gambar 1. Diagram Arsitektur..."
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setImageModalOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!imageUrl.trim()) return;
                editor
                  .chain()
                  .focus()
                  .insertContent({
                    type: 'image',
                    attrs: {
                      src: imageUrl.trim(),
                      alt: imageCaption,
                      title: imageCaption,
                      width: imageWidth,
                      caption: imageCaption,
                    },
                  })
                  .run();
                setImageUrl('');
                setImageCaption('');
                setImageModalOpen(false);
              }}
            >
              Sisipkan Gambar
            </Button>
          </div>
        </div>
      </ModalDialog>

      {/* Link Modal */}
      <ModalDialog
        open={linkModalOpen}
        onClose={() => setLinkModalOpen(false)}
        title="Sisipkan Hyperlink Referensi"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              URL Tujuan (https://...)
            </label>
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://poltek-kampar.ac.id"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                editor.chain().focus().unsetLink().run();
                setLinkModalOpen(false);
              }}
            >
              Hapus Tautan
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (linkUrl.trim()) {
                  editor
                    .chain()
                    .focus()
                    .extendMarkRange('link')
                    .setLink({ href: linkUrl.trim() })
                    .run();
                }
                setLinkUrl('');
                setLinkModalOpen(false);
              }}
            >
              Terapkan Tautan
            </Button>
          </div>
        </div>
      </ModalDialog>

      {/* Embed Video inside Editor Modal */}
      <ModalDialog
        open={videoModalOpen}
        onClose={() => setVideoModalOpen(false)}
        title="Sematkan Video Pembelajaran di Dalam Dokumen"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Platform Video
            </label>
            <select
              value={videoProvider}
              onChange={(e) =>
                setVideoProvider(e.target.value as 'YOUTUBE' | 'VIMEO')
              }
              className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="YOUTUBE">YouTube (Domain Tervalidasi)</option>
              <option value="VIMEO">Vimeo (Custom Node Tervalidasi)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              URL Video
            </label>
            <Input
              value={videoEmbedInput}
              onChange={(e) => setVideoEmbedInput(e.target.value)}
              placeholder={
                videoProvider === 'YOUTUBE'
                  ? 'https://www.youtube.com/watch?v=b2F-DItXtZs'
                  : 'https://vimeo.com/76979871'
              }
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setVideoModalOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="button"
              onClick={() => {
                const raw = videoEmbedInput.trim();
                if (!raw) return;
                if (videoProvider === 'YOUTUBE') {
                  editor.commands.setYoutubeVideo({
                    src: raw,
                    width: 640,
                    height: 360,
                  });
                } else {
                  const match = raw.match(/vimeo\.com\/(?:video\/)?(\d{5,15})/);
                  if (!match) {
                    toast.error('URL Vimeo tidak valid');
                    return;
                  }
                  editor
                    .chain()
                    .focus()
                    .insertContent({
                      type: 'vimeoEmbed',
                      attrs: { videoId: match[1] },
                    })
                    .run();
                }
                setVideoEmbedInput('');
                setVideoModalOpen(false);
              }}
            >
              Sematkan Video
            </Button>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
}

// Read-Only Renderer for Student Material Viewer & Preview Mode
export function TiptapReadOnlyRenderer({
  contentJson,
  fallbackHtml,
}: {
  contentJson: Record<string, any>;
  fallbackHtml?: string | null;
}) {
  const editor = useEditor({
    editable: false,
    extensions: getTiptapExtensions(),
    content:
      contentJson && Object.keys(contentJson).length > 0
        ? contentJson
        : fallbackHtml
          ? fallbackHtml
          : {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Konten materi belum tersedia.' }],
                },
              ],
            },
  });

  useEffect(() => {
    if (editor && contentJson && Object.keys(contentJson).length > 0) {
      editor.commands.setContent(contentJson, { emitUpdate: false });
    } else if (editor && fallbackHtml) {
      editor.commands.setContent(fallbackHtml, { emitUpdate: false });
    }
  }, [contentJson, fallbackHtml, editor]);

  if (!editor) return null;

  return (
    <div className="tiptap-content tiptap-readonly">
      <EditorContent editor={editor} />
    </div>
  );
}
