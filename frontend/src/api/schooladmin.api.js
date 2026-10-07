import api from './axios';

// Sessions
export const getSessions    = ()     => api.get('/schooladmin/sessions');
export const createSession  = (data) => api.post('/schooladmin/sessions', data);
export const updateSession  = (id, data) => api.patch(`/schooladmin/sessions/${id}`, data);
export const activateSession= (id)   => api.post(`/schooladmin/sessions/${id}/activate`);
export const deleteSession  = (id)   => api.delete(`/schooladmin/sessions/${id}`);

// Classes
export const getClasses     = ()     => api.get('/schooladmin/classes');
export const createClass    = (data) => api.post('/schooladmin/classes', data);
export const updateClass    = (id, data) => api.patch(`/schooladmin/classes/${id}`, data);
export const deleteClass    = (id)   => api.delete(`/schooladmin/classes/${id}`);

//section
export const createSection  = (data) => api.post('/schooladmin/sections', data);
export const updateSection  = (id, data) => api.patch(`/schooladmin/sections/${id}`, data);
export const deleteSection  = (id)   => api.delete(`/schooladmin/sections/${id}`);

// Subjects
export const getSubjects    = (params) => api.get('/schooladmin/subjects', { params });
export const createSubject  = (data)   => api.post('/schooladmin/subjects', data);
export const updateSubject  = (id, data) => api.patch(`/schooladmin/subjects/${id}`, data);
export const copySubjects   = (data)   => api.post('/schooladmin/subjects/copy', data);
export const deleteSubject  = (id)     => api.delete(`/schooladmin/subjects/${id}`);

// Faculty
export const getFaculty         = ()     => api.get('/schooladmin/faculty');
export const createFaculty      = (data) => api.post('/schooladmin/faculty', data);
export const updateFaculty      = (id, data) => api.patch(`/schooladmin/faculty/${id}`, data);
export const deactivateFaculty  = (id)   => api.post(`/schooladmin/faculty/${id}/deactivate`);
export const resetFacultyPassword = (id) => api.post(`/schooladmin/faculty/${id}/reset-password`);
export const getFacultyAssignments = ()  => api.get('/schooladmin/faculty/assignments');
export const assignFaculty      = (data) => api.post('/schooladmin/faculty/assignments', data);
export const removeFacultyAssignment = (id) => api.delete(`/schooladmin/faculty/assignments/${id}`);
export const updateFacultyAssignment = (id, data) => api.patch(`/schooladmin/faculty/assignments/${id}`, data);

// Students
export const getStudents        = (params) => api.get('/schooladmin/students', { params });
export const createStudent      = (data)   => api.post('/schooladmin/students', data);
export const updateStudent      = (id, data) => api.patch(`/schooladmin/students/${id}`, data);
export const deactivateStudent  = (id)     => api.post(`/schooladmin/students/${id}/deactivate`);
export const deleteStudent      = (id)     => api.delete(`/schooladmin/students/${id}`);
export const getCsvTemplate     = ()       => api.get('/schooladmin/students/csv-template', { responseType: 'blob' });
export const previewCsvUpload   = (formData) => api.post('/schooladmin/students/csv-preview', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const commitCsvUpload    = (data)   => api.post('/schooladmin/students/csv-commit', data);

// Exam Types
export const getExamTypes       = (params) => api.get('/schooladmin/exam-types', { params });
export const createExamType     = (data)   => api.post('/schooladmin/exam-types', data);
export const addExamSubject     = (data)   => api.post('/schooladmin/exam-types/subjects', data);
export const updateExamSubject  = (id, data) => api.patch(`/schooladmin/exam-types/subjects/${id}`, data);
export const forceUnlockExamType = (id, data) => api.post(`/schooladmin/exam-types/${id}/force-unlock`, data);
export const copyExamConfig     = (data)   => api.post('/schooladmin/exam-types/copy', data);
export const copyExamSubjects   = (id, data) => api.post(`/schooladmin/exam-types/${id}/copy-subjects`, data);
export const updateExamType     = (id, data) => api.patch(`/schooladmin/exam-types/${id}`, data);
export const deleteExamType     = (id)     => api.delete(`/schooladmin/exam-types/${id}`);

// Marks Oversight
export const getMarksForExamSubject = (examSubjectId) => api.get(`/schooladmin/marks/exam-subject/${examSubjectId}`);
export const overrideMark       = (id, data) => api.patch(`/schooladmin/marks/${id}/override`, data);

// Analytics
export const getExamStats       = (examSubjectId) => api.get(`/schooladmin/analytics/exam-stats/${examSubjectId}`);
export const getReportCard      = (params) => api.get('/schooladmin/analytics/report-card', { params });
export const downloadReportCard = (params) => api.get('/schooladmin/analytics/report-card-pdf', { params, responseType: 'blob' });
export const getAttendanceDefaulters = (params) => api.get('/schooladmin/analytics/attendance-defaulters', { params });
export const getAttendanceReport     = (params) => api.get('/schooladmin/analytics/attendance-report', { params });
export const getMarksReport = (params) => api.get('/schooladmin/analytics/marks-report', { params });
export const getMarksDefaulters = (params) => api.get('/schooladmin/analytics/marks-defaulters', { params });
export const downloadBulkReportCardsZip = (params) => api.get('/schooladmin/analytics/bulk-report-cards-pdf', { params, responseType: 'blob' });

// Analytics — branded PDF downloads (same data as above, rendered server-side)
export const downloadAttendanceReportPDF     = (params) => api.get('/schooladmin/analytics/attendance-report-pdf', { params, responseType: 'blob' });
export const downloadMarksReportPDF          = (params) => api.get('/schooladmin/analytics/marks-report-pdf', { params, responseType: 'blob' });
export const downloadMarksDefaultersPDF      = (params) => api.get('/schooladmin/analytics/marks-defaulters-pdf', { params, responseType: 'blob' });
export const downloadAttendanceDefaultersPDF = (params) => api.get('/schooladmin/analytics/attendance-defaulters-pdf', { params, responseType: 'blob' });
export const downloadClassPerformancePDF     = (params) => api.get('/schooladmin/analytics/class-performance-pdf', { params, responseType: 'blob' });
export const downloadStudentProgressPDF      = (params) => api.get('/schooladmin/analytics/student-progress-pdf', { params, responseType: 'blob' });

// Analytics — dashboard additions (overview, comparisons, trends, performers, progress)
export const getAnalyticsOverview = (params) => api.get('/schooladmin/analytics/overview', { params });
export const getClassComparison   = (params) => api.get('/schooladmin/analytics/class-comparison', { params });
export const getSectionComparison = (params) => api.get('/schooladmin/analytics/section-comparison', { params });
export const getSubjectComparison = (params) => api.get('/schooladmin/analytics/subject-comparison', { params });
export const getAttendanceTrend   = (params) => api.get('/schooladmin/analytics/attendance-trend', { params });
export const getPerformers        = (params) => api.get('/schooladmin/analytics/performers', { params });
export const getStudentProgress   = (params) => api.get('/schooladmin/analytics/student-progress', { params });

// Corrections
export const getCorrections     = ()      => api.get('/schooladmin/corrections');
export const reviewCorrection   = (id, data) => api.patch(`/schooladmin/corrections/${id}/review`, data);

// Holidays
export const getHolidays        = (params) => api.get('/schooladmin/holidays', { params });
export const createHoliday      = (data)   => api.post('/schooladmin/holidays', data);
export const deleteHoliday      = (id)     => api.delete(`/schooladmin/holidays/${id}`);

// Marks Lock/Unlock
export const getMarksLockOverview = (params) => api.get('/schooladmin/marks-lock/overview', { params });
export const setMarksLockStatus   = (examSubjectId, data) => api.patch(`/schooladmin/marks-lock/exam-subject/${examSubjectId}`, data);
export const bulkLockByClass   = (data) => api.post('/schooladmin/marks-lock/bulk-by-class', data);
export const bulkLockBySession = (data) => api.post('/schooladmin/marks-lock/bulk-by-session', data);

// Academic Calendar
export const getCalendar            = (params)     => api.get('/schooladmin/calendar', { params });
export const exportCalendar         = (params)     => api.get('/schooladmin/calendar/export', { params, responseType: 'blob' });
export const createCalendarEvent    = (data)       => api.post('/schooladmin/calendar/events', data);
export const updateCalendarEvent    = (id, data)   => api.patch(`/schooladmin/calendar/events/${id}`, data);
export const deleteCalendarEvent    = (id)         => api.delete(`/schooladmin/calendar/events/${id}`);
export const markCalendarReviewed   = (data)       => api.post('/schooladmin/calendar/events/mark-reviewed', data);
export const saveCalendarSettings   = (data)       => api.put('/schooladmin/calendar/settings', data);
export const createCalendarCategory = (data)       => api.post('/schooladmin/calendar/categories', data);
export const updateCalendarCategory = (id, data)   => api.patch(`/schooladmin/calendar/categories/${id}`, data);
export const deleteCalendarCategory = (id)         => api.delete(`/schooladmin/calendar/categories/${id}`);
export const copyCalendar           = (data)       => api.post('/schooladmin/calendar/copy', data);

// Syllabus Tracker
export const getSyllabusStructure       = (params) => api.get('/schooladmin/syllabus/structure', { params });
export const getSyllabusOverview        = (params) => api.get('/schooladmin/syllabus/overview', { params });
export const exportSyllabusCsv          = (params) => api.get('/schooladmin/syllabus/export', { params, responseType: 'blob' });
export const getSyllabusSectionTracker  = (params) => api.get('/schooladmin/syllabus/tracker', { params });
export const saveSyllabusProgressAdmin  = (data)   => api.put('/schooladmin/syllabus/progress', data);
export const sendSyllabusReminder       = (data)   => api.post('/schooladmin/syllabus/remind', data);
export const getSyllabusChapters        = (params) => api.get('/schooladmin/syllabus/chapters', { params });
export const createSyllabusChapter      = (data)   => api.post('/schooladmin/syllabus/chapters', data);
export const bulkCreateSyllabusChapters = (data)   => api.post('/schooladmin/syllabus/chapters/bulk', data);
export const updateSyllabusChapter      = (id, data) => api.patch(`/schooladmin/syllabus/chapters/${id}`, data);
export const deleteSyllabusChapter      = (id, params) => api.delete(`/schooladmin/syllabus/chapters/${id}`, { params });
export const getSyllabusTemplates       = (params) => api.get('/schooladmin/syllabus/templates', { params });
export const saveSyllabusTemplate       = (data)   => api.post('/schooladmin/syllabus/templates', data);
export const applySyllabusTemplate      = (data)   => api.post('/schooladmin/syllabus/templates/apply', data);
export const deleteSyllabusTemplate     = (id)     => api.delete(`/schooladmin/syllabus/templates/${id}`);
export const getSyllabusCsvTemplate     = (params) => api.get('/schooladmin/syllabus/csv-template', { params, responseType: 'blob' });
export const importSyllabusCsv          = (formData) => api.post('/schooladmin/syllabus/import-csv', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const copySyllabus               = (data)   => api.post('/schooladmin/syllabus/copy', data);
export const autoScheduleSyllabus       = (data)   => api.post('/schooladmin/syllabus/schedule', data);
export const getSyllabusExamScope       = (params) => api.get('/schooladmin/syllabus/exam-scope', { params });
export const saveSyllabusExamScope      = (data)   => api.put('/schooladmin/syllabus/exam-scope', data);
export const getSyllabusExamReadiness   = (params) => api.get('/schooladmin/syllabus/exam-readiness', { params });