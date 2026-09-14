import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Trophy, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { getMyChildren, getMarksByExamType, getConsolidatedReportCard } from '../../api/parent.api';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';

const statusVariant = { Pass: 'success', Fail: 'danger', Pending: 'default' };

function ExamCard({ examData }) {
  const [open, setOpen] = useState(true);
  const allSubmitted = examData.subjects.every((s) => s.marksObtained !== null);
  const totalObtained = examData.subjects.reduce((a, s) => a + (s.marksObtained ? Number(s.marksObtained) : 0), 0);
  const totalMax = examData.subjects.reduce((a, s) => a + Number(s.maxMarks), 0);
  const pct = allSubmitted && totalMax > 0 ? ((totalObtained / totalMax) * 100).toFixed(1) : null;

  return (
    <Card padding={false}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 sm:px-5 py-4 hover:bg-[#f8fafc] transition-colors rounded-xl gap-2"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
            <BookOpen size={16} className="text-[#f97316]" />
          </div>
          <div className="text-left min-w-0">
            <p className="font-bold text-[#1e293b] truncate">{examData.examType}</p>
            <p className="text-xs text-[#64748b]">{examData.subjects.length} subject(s)</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {pct !== null && (
            <span className={`text-sm font-bold ${Number(pct) >= 75 ? 'text-green-600' : Number(pct) >= 35 ? 'text-amber-600' : 'text-red-600'}`}>
              {pct}%
            </span>
          )}
          {open ? <ChevronUp size={16} className="text-[#94a3b8]" /> : <ChevronDown size={16} className="text-[#94a3b8]" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-[#e2e8f0] overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="bg-[#f8fafc]">
                <th className="px-4 sm:px-5 py-2.5 text-left text-xs font-semibold text-[#64748b] uppercase">Subject</th>
                <th className="px-4 sm:px-5 py-2.5 text-center text-xs font-semibold text-[#64748b] uppercase">Max</th>
                <th className="px-4 sm:px-5 py-2.5 text-center text-xs font-semibold text-[#64748b] uppercase">Pass</th>
                <th className="px-4 sm:px-5 py-2.5 text-center text-xs font-semibold text-[#64748b] uppercase">Obtained</th>
                <th className="px-4 sm:px-5 py-2.5 text-center text-xs font-semibold text-[#64748b] uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {examData.subjects.map((s, i) => (
                <tr key={i} className="hover:bg-[#fafafa]">
                  <td className="px-4 sm:px-5 py-3 font-medium text-[#1e293b]">{s.subject}</td>
                  <td className="px-4 sm:px-5 py-3 text-center text-[#64748b]">{s.maxMarks}</td>
                  <td className="px-4 sm:px-5 py-3 text-center text-[#64748b]">{s.passingMarks}</td>
                  <td className="px-4 sm:px-5 py-3 text-center font-bold text-[#1e293b]">
                    {s.marksObtained !== null ? Number(s.marksObtained) : <span className="text-[#94a3b8]">—</span>}
                  </td>
                  <td className="px-4 sm:px-5 py-3 text-center">
                    <Badge label={s.status} variant={statusVariant[s.status] || 'default'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default function ParentMarks() {
  const [childId, setChildId] = useState('');
  const [activeTab, setActiveTab] = useState('exam'); // 'exam' | 'report'

  const { data: children = [], isLoading: loadingChildren } = useQuery({
    queryKey: ['my-children'],
    queryFn: () => getMyChildren().then((r) => r.data.data ?? []),
  });

  const activeChildId = childId || children[0]?.id || '';

  const { data: examMarks = [], isLoading: loadingMarks, isError: marksError } = useQuery({
    queryKey: ['marks-by-exam', activeChildId],
    queryFn: () => getMarksByExamType({ studentId: activeChildId }).then((r) => r.data.data ?? []),
    enabled: !!activeChildId,
  });

  const { data: reportCard, isLoading: loadingReport, isError: reportError } = useQuery({
    queryKey: ['report-card', activeChildId],
    queryFn: () => getConsolidatedReportCard({ studentId: activeChildId }).then((r) => r.data.data),
    enabled: !!activeChildId,
  });

  const overall = reportCard?.overallPercentage ?? null;
  const overallColor = overall === null
    ? 'text-[#94a3b8]'
    : overall >= 75 ? 'text-green-600'
    : overall >= 35 ? 'text-amber-600'
    : 'text-red-600';

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-[#1e293b]">Marks & Report Card</h1>
        <p className="text-sm text-[#64748b] mt-1">View exam results and consolidated performance.</p>
      </div>

      {children.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {children.map((c) => (
            <button
              key={c.id}
              onClick={() => setChildId(c.id)}
              className={`px-3 sm:px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${
                activeChildId === c.id
                  ? 'border-[#f97316] bg-orange-50 text-[#f97316]'
                  : 'border-[#e2e8f0] text-[#64748b] hover:border-[#f97316]'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {loadingChildren ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !activeChildId ? (
        <Card><p className="text-sm text-[#94a3b8] text-center py-8">No children found.</p></Card>
      ) : (
        <>
          <div className="flex gap-1 bg-[#f1f5f9] rounded-xl p-1 w-full sm:w-fit overflow-x-auto">
            {[
              { key: 'exam',   label: 'Exam-wise Marks' },
              { key: 'report', label: 'Report Card' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'bg-white text-[#1e293b] shadow-sm'
                    : 'text-[#64748b] hover:text-[#1e293b]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'exam' && (
            <div className="space-y-4">
              {loadingMarks ? (
                <div className="flex justify-center py-16"><Spinner /></div>
              ) : marksError ? (
                <div className="flex items-center gap-2 text-xs sm:text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  <AlertTriangle size={16} className="shrink-0" /> No active enrollment found. Contact school admin.
                </div>
              ) : examMarks.length === 0 ? (
                <Card>
                  <div className="text-center py-10">
                    <BookOpen size={36} className="text-[#e2e8f0] mx-auto mb-2" />
                    <p className="text-sm text-[#94a3b8]">No marks available yet.</p>
                  </div>
                </Card>
              ) : (
                examMarks.map((et, i) => <ExamCard key={i} examData={et} />)
              )}
            </div>
          )}

          {activeTab === 'report' && (
            <div className="space-y-4">
              {loadingReport ? (
                <div className="flex justify-center py-16"><Spinner /></div>
              ) : reportError ? (
                <div className="flex items-center gap-2 text-xs sm:text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  <AlertTriangle size={16} className="shrink-0" /> No active enrollment found. Contact school admin.
                </div>
              ) : !reportCard ? (
                <Card>
                  <div className="text-center py-10">
                    <Trophy size={36} className="text-[#e2e8f0] mx-auto mb-2" />
                    <p className="text-sm text-[#94a3b8]">Report card not available yet.</p>
                  </div>
                </Card>
              ) : (
                <>
                  <Card className="p-4 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <h2 className="text-base sm:text-lg font-bold text-[#1e293b] truncate">{reportCard.student}</h2>
                        <p className="text-xs text-[#64748b] mt-1">
                          {reportCard.class} · {reportCard.section} · #{reportCard.enrollmentNumber}
                        </p>
                      </div>
                      <div className="text-center shrink-0">
                        <div className={`text-3xl sm:text-4xl font-extrabold ${overallColor}`}>{overall ?? '—'}%</div>
                        <p className="text-xs text-[#64748b] mt-1">Overall Performance</p>
                        {overall !== null && (
                          <Badge
                            label={overall >= 75 ? 'Excellent' : overall >= 60 ? 'Good' : overall >= 35 ? 'Average' : 'Needs Improvement'}
                            variant={overall >= 75 ? 'success' : overall >= 60 ? 'info' : overall >= 35 ? 'warning' : 'danger'}
                          />
                        )}
                      </div>
                    </div>
                  </Card>

                  {(reportCard.reportCard ?? []).map((et, i) => (
                    <Card key={i} padding={false}>
                      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc] rounded-t-xl">
                        <p className="font-bold text-[#1e293b]">{et.examType}</p>
                        {et.weightagePercent && (
                          <span className="text-xs bg-orange-100 text-[#f97316] font-semibold px-2 py-1 rounded-full">
                            Weightage: {et.weightagePercent}%
                          </span>
                        )}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[400px]">
                          <thead>
                            <tr className="bg-[#f8fafc]">
                              <th className="px-4 sm:px-5 py-2.5 text-left text-xs font-semibold text-[#64748b] uppercase">Subject</th>
                              <th className="px-4 sm:px-5 py-2.5 text-center text-xs font-semibold text-[#64748b] uppercase">Max</th>
                              <th className="px-4 sm:px-5 py-2.5 text-center text-xs font-semibold text-[#64748b] uppercase">Obtained</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#f1f5f9]">
                            {et.subjects.map((s, j) => (
                              <tr key={j} className="hover:bg-[#fafafa]">
                                <td className="px-4 sm:px-5 py-3 font-medium text-[#1e293b]">{s.subject}</td>
                                <td className="px-4 sm:px-5 py-3 text-center text-[#64748b]">{s.maxMarks}</td>
                                <td className="px-4 sm:px-5 py-3 text-center font-bold text-[#1e293b]">
                                  {s.marksObtained !== null ? Number(s.marksObtained) : <span className="text-[#94a3b8]">—</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  ))}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}