import api from './axios';

export const getFacultyDashboard     = ()       => api.get('/faculty/dashboard');
export const getMyAssignments        = ()       => api.get('/faculty/attendance/my-assignments');
export const getRosterForAttendance  = (params) => api.get('/faculty/attendance/roster', { params });
export const markAttendance          = (data)   => api.post('/faculty/attendance/mark', data);
export const getAttendanceHistory    = (params) => api.get('/faculty/attendance/history', { params });
export const getMyExamSubjects       = (params) => api.get('/faculty/marks/exam-subjects', { params });
export const getRosterForMarks       = (params) => api.get('/faculty/marks/roster', { params });
export const enterMarks              = (data)   => api.post('/faculty/marks/enter', data);
export const requestCorrection       = (data)   => api.post('/faculty/corrections/request', data);
export const getMyCorrectionRequests = ()       => api.get('/faculty/corrections/my-requests');

// Analytics
export const getAnalyticsOverview    = (params) => api.get('/faculty/analytics/overview', { params });
export const getDailyAttendance      = (params) => api.get('/faculty/analytics/daily', { params });
export const getWeeklyAttendance     = (params) => api.get('/faculty/analytics/weekly', { params });
export const getAttendanceTrend      = (params) => api.get('/faculty/analytics/trend', { params });
export const getStudentStats         = (params) => api.get('/faculty/analytics/students', { params });
export const getMarksSummary         = (params) => api.get('/faculty/analytics/marks-summary', { params });
export const getSectionComparison    = (params) => api.get('/faculty/analytics/section-comparison', { params });