import './notes.css';

// The HTML is whitelisted on the server before it is saved, so it is safe to render here.
export default function NoteContent({ html }) {
  if (!html || html === '<p></p>') return <p className="text-sm text-[#94a3b8]">No content.</p>;
  return <div className="note-content" dangerouslySetInnerHTML={{ __html: html }} />;
}