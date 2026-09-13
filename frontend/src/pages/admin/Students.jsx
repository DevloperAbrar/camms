import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Search, Upload, Download, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, Pencil, Ban, CheckCircle } from 'lucide-react';
import {
  getStudents, createStudent, updateStudent, deactivateStudent, getCsvTemplate, previewCsvUpload, commitCsvUpload,
  getSessions, getClasses,
} from '../../api/schooladmin.api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import Table from '../../components/ui/Table';
import Modal from '../../components/ui/Modal';

const editStudentSchema = z.object({
  name: z.string().min(2, 'Name required'),
  dob: z.string().optional(),
  gender: z.string().optional(),
  parentName: z.string().optional(),
  parentEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  parentPhone: z.string().optional(),
  secondaryParentPhone: z.string().optional(),
  address: z.string().optional(),
  admissionDate: z.string().optional(),
  rollNumber: z.string().optional(),
});

const studentSchema = z.object({
  name: z.string().min(2, 'Name required'),
  enrollmentNumber: z.string().min(1, 'Enrollment number required'),
  dob: z.string().optional(),
  gender: z.string().optional(),
  parentName: z.string().optional(),
  parentEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  parentPhone: z.string().optional(),
  secondaryParentPhone: z.string().optional(),
  address: z.string().optional(),
  admissionDate: z.string().optional(),
  rollNumber: z.string().optional(),
  sessionId: z.string().min(1, 'Select a session'),
  classId: z.string().min(1, 'Select a class'),
  sectionId: z.string().min(1, 'Select a section'),
});

export default function AdminStudents() {
  const qc = useQueryClient();

  const [sessionId, setSessionId] = useState('');
  const [classId, setClassId]     = useState('');
  const [sectionId, setSectionId] = useState('');
  const [search, setSearch]       = useState('');
  const [page, setPage]           = useState(1);

  const [showAdd, setShowAdd]         = useState(false);
  const [showUpload, setShowUpload]   = useState(false);

  const [csvSessionId, setCsvSessionId]   = useState('');
  const [csvFile, setCsvFile]             = useState(null);
  const [previewResult, setPreviewResult] = useState(null);
  const [commitResult, setCommitResult]   = useState(null);

  const { data: sessions } = useQuery({
    queryKey: ['ad-sessions'],
    queryFn: () => getSessions().then((r) => r.data.data),
  });

  useEffect(() => {
    if (!sessionId && sessions?.length) {
      const active = sessions.find((s) => s.isActive) || sessions[0];
      setSessionId(active.id);
      setCsvSessionId(active.id);
    }
  }, [sessions]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: classes } = useQuery({
    queryKey: ['ad-classes'],
    queryFn: () => getClasses().then((r) => r.data.data),
  });

  const classesForSession = (classes || []).filter((c) => c.sessionId === sessionId);
  const selectedClass = classesForSession.find((c) => c.id === classId);

  const { data: studentsData, isLoading } = useQuery({
    queryKey: ['ad-students', sessionId, classId, sectionId, search, page],
    queryFn: () => getStudents({
      sessionId,
      classId: classId || undefined,
      sectionId: sectionId || undefined,
      search: search || undefined,
      page,
      limit: 20,
    }).then((r) => r.data.data),
    enabled: !!sessionId,
  });

  const students   = studentsData?.students || [];
  const totalPages = studentsData?.totalPages || 1;

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm({ resolver: zodResolver(studentSchema) });
  const [editStudentTarget, setEditStudentTarget] = useState(null);
  const [deactivateTarget, setDeactivateTarget]   = useState(null);

  const editForm = useForm({ resolver: zodResolver(editStudentSchema) });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => {
      const payload = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== '' && v !== undefined));
      return updateStudent(id, payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ad-students'] }); setEditStudentTarget(null); editForm.reset(); },
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateStudent,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ad-students'] }); setDeactivateTarget(null); },
  });

  const openEditStudent = (student) => {
    setEditStudentTarget(student);
    editForm.reset({
      name: student.name,
      dob: student.dob ? student.dob.slice(0, 10) : '',
      gender: student.gender || '',
      parentName: student.parentName || '',
      parentEmail: student.parentEmail || '',
      parentPhone: student.parentPhone || '',
      secondaryParentPhone: student.secondaryParentPhone || '',
      address: student.address || '',
      admissionDate: student.admissionDate ? student.admissionDate.slice(0, 10) : '',
      rollNumber: student.enrollments?.[0]?.rollNumber || '',
    });
  };
  const formSessionId = watch('sessionId');
  const formClassId   = watch('classId');
  const formClassesForSession = (classes || []).filter((c) => c.sessionId === formSessionId);
  const formSelectedClass = formClassesForSession.find((c) => c.id === formClassId);

  const createMutation = useMutation({
    mutationFn: (data) => {
      const payload = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== '' && v !== undefined));
      return createStudent(payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ad-students'] }); setShowAdd(false); reset(); },
  });

  const previewMutation = useMutation({
    mutationFn: () => {
      const formData = new FormData();
      formData.append('file', csvFile);
      formData.append('sessionId', csvSessionId);
      return previewCsvUpload(formData).then((r) => r.data.data);
    },
    onSuccess: (data) => setPreviewResult(data),
  });

  const commitMutation = useMutation({
    mutationFn: () => commitCsvUpload({ validRows: previewResult.validRows }).then((r) => r.data.data),
    onSuccess: (data) => { setCommitResult(data); qc.invalidateQueries({ queryKey: ['ad-students'] }); },
  });

  const handleDownloadTemplate = async () => {
    const res = await getCsvTemplate();
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'student_upload_template.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const closeUploadModal = () => {
    setShowUpload(false);
    setCsvFile(null);
    setPreviewResult(null);
    setCommitResult(null);
  };

  const columns = [
    { key: 'name', label: 'Student', render: (r) => (
      <div>
        <p className="font-semibold text-[#1e293b]">{r.name}</p>
        <p className="text-xs text-[#94a3b8]">{r.enrollmentNumber}</p>
      </div>
    )},
    { key: 'class', label: 'Class / Section', render: (r) => {
      const enr = r.enrollments?.[0];
      return enr ? <Badge label={`${enr.class?.name} - ${enr.section?.name}`} variant="navy" /> : <Badge label="Not enrolled" variant="default" />;
    }},
    { key: 'rollNumber', label: 'Roll No.', render: (r) => r.enrollments?.[0]?.rollNumber || '-' },
    { key: 'parentName', label: 'Parent' },
    { key: 'parentPhone', label: 'Contact' },
    { key: 'status', label: 'Status', render: (r) => (
      <Badge label={r.status.charAt(0).toUpperCase() + r.status.slice(1)} variant={r.status === 'active' ? 'success' : 'default'} />
    )},
    { key: 'actions', label: 'Actions', render: (r) => (
      <div className="flex items-center gap-1 flex-wrap">
        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => openEditStudent(r)}>Edit</Button>
        {r.status === 'active' ? (
          <Button size="sm" variant="ghost" icon={Ban} onClick={() => setDeactivateTarget(r)} className="text-red-500 hover:text-red-600">Deactivate</Button>
        ) : (
          <Button size="sm" variant="ghost" icon={CheckCircle} loading={deactivateMutation.isPending}
            onClick={() => deactivateMutation.mutate(r.id)}>Reactivate</Button>
        )}
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1e293b]">Students</h1>
          <p className="text-sm text-[#64748b] mt-1">Enroll students manually or bulk-upload with a CSV</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" icon={Upload} onClick={() => setShowUpload(true)}>Bulk Upload</Button>
          <Button icon={Plus} onClick={() => setShowAdd(true)}>Add Student</Button>
        </div>
      </div>

      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <select value={sessionId} onChange={(e) => { setSessionId(e.target.value); setClassId(''); setSectionId(''); setPage(1); }}
            className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b]">
            <option value="">Select session</option>
            {(sessions || []).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <select value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(''); setPage(1); }} disabled={!sessionId}
            className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b] disabled:bg-[#f1f5f9]">
            <option value="">All Classes</option>
            {classesForSession.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={sectionId} onChange={(e) => { setSectionId(e.target.value); setPage(1); }} disabled={!classId}
            className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b] disabled:bg-[#f1f5f9]">
            <option value="">All Sections</option>
            {(selectedClass?.sections || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
            <input
              placeholder="Search by name..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-[#e2e8f0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#f97316] focus:border-transparent"
            />
          </div>
        </div>
      </Card>

      <Table columns={columns} data={students} loading={isLoading} emptyMessage={sessionId ? 'No students found.' : 'Select a session to view students.'} />

      {studentsData && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#64748b]">Page {studentsData.page} of {totalPages}, {studentsData.total} students total</p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" icon={ChevronLeft} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
            <Button size="sm" variant="ghost" icon={ChevronRight} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Add Student Modal */}
      <Modal open={showAdd} onClose={() => { setShowAdd(false); reset(); }} title="Add Student" size="lg">
        <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-[#374151]">Session <span className="text-red-500">*</span></label>
              <select {...register('sessionId')} className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b]">
                <option value="">Select session</option>
                {(sessions || []).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              {errors.sessionId && <p className="text-xs text-red-500">{errors.sessionId.message}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-[#374151]">Class <span className="text-red-500">*</span></label>
              <select {...register('classId')} disabled={!formSessionId} className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b] disabled:bg-[#f1f5f9]">
                <option value="">Select class</option>
                {formClassesForSession.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {errors.classId && <p className="text-xs text-red-500">{errors.classId.message}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-[#374151]">Section <span className="text-red-500">*</span></label>
              <select {...register('sectionId')} disabled={!formClassId} className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b] disabled:bg-[#f1f5f9]">
                <option value="">Select section</option>
                {(formSelectedClass?.sections || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {errors.sectionId && <p className="text-xs text-red-500">{errors.sectionId.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Full Name" name="name" register={register} error={errors.name} required placeholder="e.g. Aditya Sharma" />
            <Input label="Enrollment Number" name="enrollmentNumber" register={register} error={errors.enrollmentNumber} required placeholder="e.g. ENR2026001" />
            <Input label="Roll Number" name="rollNumber" register={register} error={errors.rollNumber} placeholder="e.g. 12" />
            <Input label="Date of Birth" name="dob" type="date" register={register} error={errors.dob} />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-[#374151]">Gender</label>
              <select {...register('gender')} className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b]">
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <Input label="Admission Date" name="admissionDate" type="date" register={register} error={errors.admissionDate} />
            <Input label="Parent Name" name="parentName" register={register} error={errors.parentName} placeholder="e.g. Ramesh Sharma" />
            <Input label="Parent Email" name="parentEmail" type="email" register={register} error={errors.parentEmail} placeholder="parent@example.com" />
            <Input label="Parent Phone" name="parentPhone" register={register} error={errors.parentPhone} placeholder="+91 9999999999" />
            <Input label="Secondary Contact" name="secondaryParentPhone" register={register} error={errors.secondaryParentPhone} placeholder="Optional" />
            <Input label="Address" name="address" register={register} error={errors.address} className="sm:col-span-2" placeholder="City, State" />
          </div>

          {createMutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
              {createMutation.error?.response?.data?.message || 'Failed to add student.'}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => { setShowAdd(false); reset(); }}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending}>Add Student</Button>
          </div>
        </form>
      </Modal>

      {/* Bulk Upload Modal */}
      <Modal open={showUpload} onClose={closeUploadModal} title="Bulk Upload Students" size="lg">
        <div className="space-y-5">
          {!previewResult && !commitResult && (
            <>
              <div className="flex items-center justify-between bg-[#f8fafc] border border-[#e2e8f0] rounded-lg px-4 py-3">
                <p className="text-sm text-[#64748b]">Download the CSV template with the exact expected columns first.</p>
                <Button size="sm" variant="outline" icon={Download} onClick={handleDownloadTemplate}>Template</Button>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-[#374151]">Session <span className="text-red-500">*</span></label>
                <select value={csvSessionId} onChange={(e) => setCsvSessionId(e.target.value)}
                  className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b]">
                  <option value="">Select session</option>
                  {(sessions || []).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-[#374151]">CSV File <span className="text-red-500">*</span></label>
                <input type="file" accept=".csv" onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                  className="text-sm text-[#374151] file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-[#f97316] file:text-white hover:file:bg-[#ea6c0a] file:cursor-pointer" />
              </div>

              {previewMutation.isError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
                  {previewMutation.error?.response?.data?.message || 'Failed to validate CSV.'}
                </div>
              )}

              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={closeUploadModal}>Cancel</Button>
                <Button disabled={!csvFile || !csvSessionId} loading={previewMutation.isPending} onClick={() => previewMutation.mutate()}>
                  Validate CSV
                </Button>
              </div>
            </>
          )}

          {previewResult && !commitResult && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center gap-3">
                  <CheckCircle2 size={20} className="text-green-600" />
                  <div>
                    <p className="text-lg font-extrabold text-green-700">{previewResult.validRows.length}</p>
                    <p className="text-xs text-green-700">Ready to import</p>
                  </div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-3">
                  <AlertTriangle size={20} className="text-red-500" />
                  <div>
                    <p className="text-lg font-extrabold text-red-600">{previewResult.errors.length}</p>
                    <p className="text-xs text-red-600">Rows with errors</p>
                  </div>
                </div>
              </div>

              {previewResult.errors.length > 0 && (
                <div className="max-h-52 overflow-y-auto border border-[#e2e8f0] rounded-lg divide-y divide-[#f1f5f9]">
                  {previewResult.errors.map((e, i) => (
                    <div key={i} className="px-4 py-2.5 text-sm">
                      <p className="font-semibold text-[#1e293b]">Row {e.row}</p>
                      <p className="text-red-600 text-xs mt-0.5">{e.errors.join(', ')}</p>
                    </div>
                  ))}
                </div>
              )}

              {commitMutation.isError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
                  {commitMutation.error?.response?.data?.message || 'Failed to commit students.'}
                </div>
              )}

              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={closeUploadModal}>Cancel</Button>
                <Button variant="ghost" onClick={() => setPreviewResult(null)}>Back</Button>
                <Button
                  disabled={previewResult.validRows.length === 0}
                  loading={commitMutation.isPending}
                  onClick={() => commitMutation.mutate()}
                >
                  Import {previewResult.validRows.length} Students
                </Button>
              </div>
            </>
          )}

          {commitResult && (
            <div className="space-y-4 text-center py-4">
              <CheckCircle2 size={40} className="text-green-600 mx-auto" />
              <p className="text-lg font-bold text-[#1e293b]">{commitResult.created} students imported successfully</p>
              {commitResult.errors.length > 0 && (
                <p className="text-sm text-red-600">{commitResult.errors.length} rows failed during import</p>
              )}
              <Button onClick={closeUploadModal}>Done</Button>
            </div>
          )}
        </div>
      </Modal>
            {/* Edit Student */}
            <Modal open={!!editStudentTarget} onClose={() => { setEditStudentTarget(null); editForm.reset(); }} title={`Edit — ${editStudentTarget?.name || ''}`} size="lg">
        <form onSubmit={editForm.handleSubmit((d) => updateMutation.mutate({ id: editStudentTarget.id, data: d }))} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Full Name" name="name" register={editForm.register} error={editForm.formState.errors.name} required />
            <Input label="Roll Number" name="rollNumber" register={editForm.register} error={editForm.formState.errors.rollNumber} />
            <Input label="Date of Birth" name="dob" type="date" register={editForm.register} error={editForm.formState.errors.dob} />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-[#374151]">Gender</label>
              <select {...editForm.register('gender')} className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b]">
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <Input label="Admission Date" name="admissionDate" type="date" register={editForm.register} error={editForm.formState.errors.admissionDate} />
            <Input label="Parent Name" name="parentName" register={editForm.register} error={editForm.formState.errors.parentName} />
            <Input label="Parent Email" name="parentEmail" type="email" register={editForm.register} error={editForm.formState.errors.parentEmail} />
            <Input label="Parent Phone" name="parentPhone" register={editForm.register} error={editForm.formState.errors.parentPhone} />
            <Input label="Secondary Contact" name="secondaryParentPhone" register={editForm.register} error={editForm.formState.errors.secondaryParentPhone} />
            <Input label="Address" name="address" register={editForm.register} error={editForm.formState.errors.address} className="sm:col-span-2" />
          </div>

          <p className="text-xs text-[#94a3b8]">Enrollment number and class/section transfer aren't editable here — use Promotion for moving a student between classes.</p>

          {updateMutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
              {updateMutation.error?.response?.data?.message || 'Failed to update student.'}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => { setEditStudentTarget(null); editForm.reset(); }}>Cancel</Button>
            <Button type="submit" loading={updateMutation.isPending}>Save Changes</Button>
          </div>
        </form>
      </Modal>

      {/* Deactivate Student */}
      <Modal open={!!deactivateTarget} onClose={() => setDeactivateTarget(null)} title={`Deactivate — ${deactivateTarget?.name}`} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-[#64748b]">
            This marks the student inactive. Their attendance and marks history stays intact, and you can reactivate anytime.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setDeactivateTarget(null)}>Cancel</Button>
            <Button variant="danger" loading={deactivateMutation.isPending} onClick={() => deactivateMutation.mutate(deactivateTarget.id)}>
              Confirm Deactivate
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}