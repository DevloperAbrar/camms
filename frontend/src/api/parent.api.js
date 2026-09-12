import api from './axios';

export const getMyChildren           = ()       => api.get('/parent/children');
export const getAttendanceCalendar   = (params) => api.get('/parent/attendance/calendar', { params });
export const getSubjectWiseAttendance= (params) => api.get('/parent/attendance/subject-wise', { params });
export const getMarksByExamType      = (params) => api.get('/parent/marks/by-exam-type', { params });
export const getConsolidatedReportCard = (params) => api.get('/parent/marks/report-card', { params });
export const getNotices              = (params) => api.get('/parent/notices', { params });