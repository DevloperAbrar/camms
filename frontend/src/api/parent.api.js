import api from './axios';

export const getMyChildren       = ()       => api.get('/parent/children');
export const getChildAttendance  = (params) => api.get('/parent/attendance', { params });
export const getChildMarks       = (params) => api.get('/parent/marks', { params });
export const getNotices          = ()       => api.get('/parent/notices');