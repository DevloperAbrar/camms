import api from './axios';

export const getMyChildren           = ()       => api.get('/parent/children');
export const getAttendanceCalendar   = (params) => api.get('/parent/attendance/calendar', { params });
export const getSubjectWiseAttendance= (params) => api.get('/parent/attendance/subject-wise', { params });
export const getMarksByExamType      = (params) => api.get('/parent/marks/by-exam-type', { params });
export const getConsolidatedReportCard = (params) => api.get('/parent/marks/report-card', { params });
export const getNotices              = (params) => api.get('/parent/notices', { params });

// Fees
export const getParentFees           = (params) => api.get('/parent/fees', { params });
export const downloadParentReceipt   = (receiptId, params) => api.get(`/parent/fees/receipts/${receiptId}/pdf`, { params, responseType: 'blob' });
export const downloadParentStatement = (params) => api.get('/parent/fees/statement-pdf', { params, responseType: 'blob' });


// Academic Calendar
export const getParentCalendar    = (params) => api.get('/parent/calendar', { params });
export const exportParentCalendar = (params) => api.get('/parent/calendar/export', { params, responseType: 'blob' });