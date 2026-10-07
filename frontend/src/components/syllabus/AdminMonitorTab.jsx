import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Download, Eye } from 'lucide-react';
import {
  getSyllabusOverview, getSyllabusSectionTracker, saveSyllabusProgressAdmin, sendSyllabusReminder, exportSyllabusCsv,
} from '../../api/schooladmin.api';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';
import { saveBlob, errMsg } from '../calendar/calendarUtils';
import { ProgressBar, PaceBadge, StatCard, Notice, Select, ChapterTracker } from './SyllabusUI';
import { PACE_META, fmtPct, updatedLabel, teacherNames } from './syllabusUtils';

function DrillModal({ row, sessionId, onClose, onSaved }) {
  const qc = useQueryClient();
  const params = { sessionId, classId: row.classId, sectionId: row.sectionId, subjectId: row.subjectId };
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['syl-admin-tracker', params],
    queryFn: () => getSyllabusSectionTracker(params).then((r) => r.data.data),
  });

  const save = useMutation({
    mutationFn: (updates) => saveSyllabusProgressAdmin({ ...params, updates }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['syl-admin-tracker'] });
      onSaved();
    },
  });

  async function onSave(updates) {
    setError('');
    try {
      await save.mutateAsync(updates);
      return true;
    } catch (e) {
      setError(errMsg(e, 'Could not save progress.'));
      return false;
    }
  }

  return (
    <Modal open onClose={onClose} size="xl" title={`${row.className} ${row.sectionName} · ${row.subjectName}`}>
      <div className="space-y-4">
        <p className="text-xs text-[#64748b]">Teacher: {teacherNames(row.teachers)}. Changes you make here are recorded in the audit log.</p>
        {error && <Notice notice={{ type: 'error', text: error }} />}
        {isLoading || !data ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : (
          <>
            <div className="flex items-center gap-4">
              <div className="flex-1"><ProgressBar pct={data.summary.coveragePct} expected={data.summary.expectedPct} /></div>
              <span className="text-sm font-bold text-[#1e293b]">{fmtPct(data.summary.coveragePct)}</span>
              <PaceBadge pace={data.summary.pace} />
            </div>
            <ChapterTracker chapters={data.chapters} editable saving={save.isPending} onSave={onSave} />
          </>
        )}
      </div>
    </Modal>
  );
}

export default function AdminMonitorTab({ sessionId, structure, goTo }) {
  const [classId, setClassId] = useState('');
  const [sortBy, setSortBy] = useState('worst');
  const [only, setOnly] = useState('all');
  const [notice, setNotice] = useState(null);
  const [drill, setDrill] = useState(null);
  const [remindingKey, setRemindingKey] = useState('');
  const [exporting, setExporting] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['syl-overview', sessionId, classId],
    queryFn: () => getSyllabusOverview({ sessionId, ...(classId ? { classId } : {}) }).then((r) => r.data.data),
    enabled: !!sessionId,
    placeholderData: (prev) => prev,
  });

  const remind = useMutation({
    mutationFn: (row) => sendSyllabusReminder({ sessionId, sectionId: row.sectionId, subjectId: row.subjectId }),
    onSuccess: (res) => setNotice({ type: 'success', text: res.data.message }),
    onError: (e) => setNotice({ type: 'error', text: errMsg(e, 'Could not send the reminder.') }),
    onSettled: () => setRemindingKey(''),
  });

  async function doExport() {
    setExporting(true);
    try {
      const res = await exportSyllabusCsv({ sessionId, ...(classId ? { classId } : {}) });
      saveBlob(res.data, 'Syllabus-Progress.csv');
    } catch {
      setNotice({ type: 'error', text: 'Download failed. Please try again.' });
    } finally {
      setExporting(false);
    }
  }

  const rows = data?.rows || [];
  const summary = data?.summary;
  const attention = (r) => r.pace === 'behind' || r.pace === 'slightly_behind' || r.stale;
  let list = rows.filter((r) => r.setUp);
  if (only === 'attention') list = list.filter(attention);
  if (sortBy === 'worst') list = [...list].sort((a, b) => (b.lagPct ?? -100) - (a.lagPct ?? -100) || a.coveragePct - b.coveragePct);

  const notSetUp = Object.values(
    rows.filter((r) => !r.setUp).reduce((acc, r) => {
      const k = `${r.classId}|${r.subjectId}`;
      acc[k] = { className: r.className, subjectName: r.subjectName };
      return acc;
    }, {}),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <Select value={classId} onChange={setClassId}>
            <option value="">All classes</option>
            {structure?.classes?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select value={only} onChange={setOnly}>
            <option value="all">All sections</option>
            <option value="attention">Needs attention only</option>
          </Select>
          <Select value={sortBy} onChange={setSortBy}>
            <option value="worst">Most behind first</option>
            <option value="class">Class order</option>
          </Select>
        </div>
        <Button variant="outline" size="sm" icon={Download} loading={exporting} onClick={doExport}>Export CSV</Button>
      </div>

      <Notice notice={notice} onClose={() => setNotice(null)} />

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : isError ? (
        <Notice notice={{ type: 'error', text: errMsg(error, 'Could not load syllabus progress.') }} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Average coverage" value={fmtPct(summary.avgCoveragePct)} hint={`${summary.tracked} section-subjects tracked`} />
            <StatCard label="Behind plan" value={summary.behind + summary.slightlyBehind} hint={`${summary.behind} badly, ${summary.slightlyBehind} slightly`} tone={summary.behind ? 'danger' : summary.slightlyBehind ? 'warning' : 'success'} />
            <StatCard label="Not updated" value={summary.stale} hint="No update in 2+ weeks" tone={summary.stale ? 'warning' : 'success'} />
            <StatCard label="No syllabus set" value={summary.subjectsNotSetUp} hint="class-subjects without chapters" tone={summary.subjectsNotSetUp ? 'warning' : 'success'} />
          </div>

          {notSetUp.length > 0 && (
            <Card className="!p-4 border-amber-200 bg-amber-50/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <p className="text-sm text-amber-800">
                  <span className="font-semibold">Syllabus not set up for: </span>
                  {notSetUp.slice(0, 6).map((x) => `${x.className} ${x.subjectName}`).join(', ')}
                  {notSetUp.length > 6 && ` and ${notSetUp.length - 6} more`}
                </p>
                <Button size="sm" onClick={() => goTo('setup')}>Set up now</Button>
              </div>
            </Card>
          )}

          {list.length === 0 ? (
            <Card><p className="text-sm text-[#94a3b8] text-center py-10">{only === 'attention' ? 'Everything is on track. Nothing needs attention.' : 'No syllabus progress to show yet. Add chapters in the setup tab first.'}</p></Card>
          ) : (
            <Card padding={false}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[860px]">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-[#64748b] bg-[#f8fafc] border-b border-[#e2e8f0]">
                      <th className="px-4 py-3 font-semibold">Class</th>
                      <th className="px-4 py-3 font-semibold">Subject / Teacher</th>
                      <th className="px-4 py-3 font-semibold w-56">Coverage <span className="normal-case text-[#94a3b8]">(| = plan)</span></th>
                      <th className="px-4 py-3 font-semibold">Chapters</th>
                      <th className="px-4 py-3 font-semibold">Pace</th>
                      <th className="px-4 py-3 font-semibold">Last update</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1f5f9]">
                    {list.map((r) => {
                      const key = `${r.sectionId}|${r.subjectId}`;
                      return (
                        <tr key={key} className="hover:bg-[#f8fafc]">
                          <td className="px-4 py-3 font-semibold text-[#1e293b] whitespace-nowrap">{r.className} {r.sectionName}</td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-[#1e293b]">{r.subjectName}</p>
                            <p className="text-xs text-[#64748b]">{teacherNames(r.teachers)}</p>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex-1"><ProgressBar pct={r.coveragePct} expected={r.expectedPct} color={(PACE_META[r.pace] || PACE_META.no_plan).bar} /></div>
                              <span className="w-12 text-right font-bold text-[#1e293b]">{fmtPct(r.coveragePct)}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[#475569] whitespace-nowrap">{r.completedChapters} / {r.totalChapters}</td>
                          <td className="px-4 py-3"><PaceBadge pace={r.pace} /></td>
                          <td className={`px-4 py-3 text-xs whitespace-nowrap ${r.stale ? 'text-amber-600 font-semibold' : 'text-[#64748b]'}`}>{updatedLabel(r.daysSinceUpdate)}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1">
                              {attention(r) && r.teachers.length > 0 && (
                                <Button variant="ghost" size="sm" icon={Bell} loading={remindingKey === key} onClick={() => { setRemindingKey(key); remind.mutate(r); }}>Remind</Button>
                              )}
                              <Button variant="ghost" size="sm" icon={Eye} onClick={() => setDrill(r)}>Open</Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {drill && (
        <DrillModal
          row={drill}
          sessionId={sessionId}
          onClose={() => setDrill(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['syl-overview'] })}
        />
      )}
    </div>
  );
}