import api from './axios';

export const getFacultyDashboard  = ()       => api.get('/faculty/dashboard');
export const getMyAssignments     = ()       => api.get('/faculty/attendance/my-assignments');
export const getRosterForAttendance = (params) => api.get('/faculty/attendance/roster', { params });
export const markAttendance       = (data)   => api.post('/faculty/attendance/mark', data);
export const getAttendanceHistory = (params) => api.get('/faculty/attendance/history', { params });
export const getMyExamSubjects    = (params) => api.get('/faculty/marks/exam-subjects', { params });
export const getRosterForMarks    = (params) => api.get('/faculty/marks/roster', { params });
export const enterMarks           = (data)   => api.post('/faculty/marks/enter', data);
export const requestCorrection    = (data)   => api.post('/faculty/corrections/request', data);
export const getMyCorrectionRequests = ()    => api.get('/faculty/corrections/my-requests');