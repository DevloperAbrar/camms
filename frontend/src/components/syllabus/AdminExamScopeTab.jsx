import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSyllabusExamScope, saveSyllabusExamScope } from '../../api/schooladmin.api';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Spinner from '../ui/Spinner';
import { errMsg } from '../calendar/calendarUtils';
import { Notice, Select } from './SyllabusUI';

export default function AdminExamScopeTab({ structure }) {
  const qc = useQueryClient();
  const exams = structure?.examTypes || [];
  const classNames = Object.fromEntries((structure?.classes || []).map((c) => [c.id, c.name]));
  const [examTypeId, setExamTypeId] = useState('');
  const [sel, setSel] = useState({});
  const [savingId, setSavingId] = useState('');
  const [notice, setNotice] = useState(null);
  const activeId = examTypeId || exams[0]?.id || '';

  const { data, isLoading } = useQuery({
    queryKey: ['syl-scope', activeId],
    queryFn: () => getSyllabusExamScope({ examTypeId: activeId }).then((r) => r.data.data),
    enabled: !!activeId,
  });

  const current = (sub) => sel[sub.id] ?? sub.chapters.filter((c) => c.selected).map((c) => c.id);
  const setFor = (sub, ids) => setSel((s) => ({ ...s, [sub.id]: ids }));
  const toggle = (sub, id) => {
    const cur = current(sub);
    setFor(sub, cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  };

  async function save(sub) {
    setSavingId(sub.id);
    setNotice(null);
    try {
      await saveSyllabusExamScope({ examTypeId: activeId, subjectId: sub.id, chapterIds: current(sub) });
      setSel((s) => { const n = { ...s }; delete n[sub.id]; return n; });
      await qc.invalidateQueries({ queryKey: ['syl-scope'] });
      qc.invalidateQueries({ queryKey: ['syl-readiness'] });
      setNotice({ type: 'success', text: `${sub.name}: exam syllabus saved.` });
    } catch (e) {
      setNotice({ type: 'error', text: errMsg(e, 'Could not save exam syllabus.') });
    } finally {
      setSavingId('');
    }
  }

  if (!exams.length) {
    return <Card><p className="text-sm text-[#94a3b8] text-center py-10">No exams have been created for this session yet.</p></Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Select value={activeId} onChange={(v) => { setExamTypeId(v); setSel({}); }} className="min-w-[240px]">
          {exams.map((e) => <option key={e.id} value={e.id}>{e.name} · {classNames[e.classId] || ''}</option>)}
        </Select>
        <p className="text-xs text-[#64748b]">Tick the chapters this exam covers, then save each subject.</p>
      </div>
      <Notice notice={notice} onClose={() => setNotice(null)} />

      {isLoading || !data ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        data.subjects.map((sub) => {
          const cur = current(sub);
          const dirty = sel[sub.id] !== undefined;
          return (
            <Card key={sub.id} padding={false}>
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[#e2e8f0] bg-[#f8fafc] rounded-t-xl">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-[#1e293b]">{sub.name}</p>
                  {!sub.inExam && <Badge label="Not in this exam's subject list" variant="default" />}
                  <span className="text-xs text-[#64748b]">{cur.length} of {sub.chapters.length} chapters selected</span>
                </div>
                {sub.chapters.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setFor(sub, sub.chapters.map((c) => c.id))}>All</Button>
                    <Button variant="ghost" size="sm" onClick={() => setFor(sub, [])}>None</Button>
                    <Button size="sm" disabled={!dirty} loading={savingId === sub.id} onClick={() => save(sub)}>Save</Button>
                  </div>
                )}
              </div>
              {sub.chapters.length === 0 ? (
                <p className="text-sm text-[#94a3b8] px-4 py-5">No chapters added for this subject yet. Add them in "Chapters & setup".</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-x-6 px-4 py-3">
                  {sub.chapters.map((c, i) => (
                    <label key={c.id} className="flex items-start gap-2 py-1.5 text-sm text-[#1e293b] cursor-pointer">
                      <input type="checkbox" checked={cur.includes(c.id)} onChange={() => toggle(sub, c.id)} className="mt-0.5 accent-[#f97316]" />
                      <span>{i + 1}. {c.title}</span>
                    </label>
                  ))}
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}