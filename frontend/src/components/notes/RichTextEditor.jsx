import { useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered, Quote, Link2, Table as TableIcon,
  ImagePlus, Undo2, Redo2, Heading2, Heading3, Minus,
} from 'lucide-react';
import './notes.css';

// The image keeps the server asset id, so the saved note never stores an expiring URL.
const NoteImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      assetId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-asset-id'),
        renderHTML: (attrs) => (attrs.assetId ? { 'data-asset-id': attrs.assetId } : {}),
      },
    };
  },
});

function Btn({ onClick, active, disabled, title, children }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 rounded-md text-sm transition-colors disabled:opacity-40 ${active ? 'bg-orange-100 text-[#f97316]' : 'text-[#475569] hover:bg-[#f1f5f9]'}`}
    >
      {children}
    </button>
  );
}

// onUploadImage(file) must resolve to { assetId, url }
export default function RichTextEditor({ value, onChange, onUploadImage, onError, disabled = false }) {
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const pickRef = useRef(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true } }),
      NoteImage.configure({ allowBase64: false }),
      Table.configure({ resizable: false }),
      TableRow, TableHeader, TableCell,
    ],
    content: value || '',
    editable: !disabled,
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
    editorProps: {
      handlePaste: (view, event) => {
        const f = [...(event.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
        if (f) { event.preventDefault(); pickRef.current(f); return true; }
        return false;
      },
      handleDrop: (view, event) => {
        const f = [...(event.dataTransfer?.files || [])].find((x) => x.type.startsWith('image/'));
        if (f) { event.preventDefault(); pickRef.current(f); return true; }
        return false;
      },
    },
  });

  // Re-assigned on every render so it always sees the latest editor + callbacks
  pickRef.current = async (file) => {
    if (!editor) return;
    setBusy(true);
    try {
      const img = await onUploadImage(file);
      if (img) editor.chain().focus().setImage({ src: img.url, alt: '', assetId: img.assetId }).run();
    } catch (err) {
      if (onError) onError(err);
    } finally {
      setBusy(false);
    }
  };

  if (!editor) return null;
  const c = () => editor.chain().focus();

  const setLink = () => {
    const prev = editor.getAttributes('link').href || '';
    const url = window.prompt('Link URL (https://...)', prev);
    if (url === null) return;
    if (url.trim() === '') { c().extendMarkRange('link').unsetLink().run(); return; }
    if (!/^(https?:\/\/|mailto:)/i.test(url.trim())) { window.alert('Only http, https or mailto links are allowed.'); return; }
    c().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  return (
    <div className="note-editor border border-[#e2e8f0] rounded-xl bg-white overflow-hidden">
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-[#e2e8f0] bg-[#f8fafc]">
        <Btn title="Heading" active={editor.isActive('heading', { level: 2 })} onClick={() => c().toggleHeading({ level: 2 }).run()}><Heading2 size={16} /></Btn>
        <Btn title="Sub-heading" active={editor.isActive('heading', { level: 3 })} onClick={() => c().toggleHeading({ level: 3 }).run()}><Heading3 size={16} /></Btn>
        <span className="w-px h-5 bg-[#e2e8f0] mx-1" />
        <Btn title="Bold" active={editor.isActive('bold')} onClick={() => c().toggleBold().run()}><Bold size={16} /></Btn>
        <Btn title="Italic" active={editor.isActive('italic')} onClick={() => c().toggleItalic().run()}><Italic size={16} /></Btn>
        <Btn title="Underline" active={editor.isActive('underline')} onClick={() => c().toggleUnderline().run()}><UnderlineIcon size={16} /></Btn>
        <Btn title="Strike" active={editor.isActive('strike')} onClick={() => c().toggleStrike().run()}><Strikethrough size={16} /></Btn>
        <span className="w-px h-5 bg-[#e2e8f0] mx-1" />
        <Btn title="Bullet list" active={editor.isActive('bulletList')} onClick={() => c().toggleBulletList().run()}><List size={16} /></Btn>
        <Btn title="Numbered list" active={editor.isActive('orderedList')} onClick={() => c().toggleOrderedList().run()}><ListOrdered size={16} /></Btn>
        <Btn title="Quote" active={editor.isActive('blockquote')} onClick={() => c().toggleBlockquote().run()}><Quote size={16} /></Btn>
        <Btn title="Divider" onClick={() => c().setHorizontalRule().run()}><Minus size={16} /></Btn>
        <span className="w-px h-5 bg-[#e2e8f0] mx-1" />
        <Btn title="Link" active={editor.isActive('link')} onClick={setLink}><Link2 size={16} /></Btn>
        <Btn title="Insert table" onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon size={16} /></Btn>
        <Btn title="Insert image" disabled={busy} onClick={() => fileRef.current && fileRef.current.click()}><ImagePlus size={16} /></Btn>
        <span className="w-px h-5 bg-[#e2e8f0] mx-1" />
        <Btn title="Undo" disabled={!editor.can().undo()} onClick={() => c().undo().run()}><Undo2 size={16} /></Btn>
        <Btn title="Redo" disabled={!editor.can().redo()} onClick={() => c().redo().run()}><Redo2 size={16} /></Btn>
        {editor.isActive('table') && (
          <>
            <span className="w-px h-5 bg-[#e2e8f0] mx-1" />
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => c().addRowAfter().run()} className="text-xs px-2 py-1 rounded hover:bg-[#f1f5f9] text-[#475569]">+ Row</button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => c().addColumnAfter().run()} className="text-xs px-2 py-1 rounded hover:bg-[#f1f5f9] text-[#475569]">+ Col</button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => c().deleteRow().run()} className="text-xs px-2 py-1 rounded hover:bg-[#f1f5f9] text-[#475569]">- Row</button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => c().deleteColumn().run()} className="text-xs px-2 py-1 rounded hover:bg-[#f1f5f9] text-[#475569]">- Col</button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => c().deleteTable().run()} className="text-xs px-2 py-1 rounded hover:bg-red-50 text-red-600">Delete table</button>
          </>
        )}
        {busy && <span className="ml-auto text-xs text-[#f97316] font-medium">Uploading image...</span>}
      </div>
      <EditorContent editor={editor} />
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) pickRef.current(f); }}
      />
    </div>
  );
}