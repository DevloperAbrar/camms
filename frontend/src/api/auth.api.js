import api from './axios';

export const getMe = () => api.get('/auth/me');

export const superadminLogin = (data) => api.post('/auth/superadmin/login', data);
export const adminPasswordLogin = (data) => api.post('/auth/admin/password-login', data);
export const facultyPasswordLogin = (data) => api.post('/auth/faculty/password-login', data);
export const parentRequestOtp = (data) => api.post('/auth/parent/request-otp', data);
export const parentVerifyOtp = (data) => api.post('/auth/parent/verify-otp', data);

export const logoutSuperadmin = () => api.post('/auth/superadmin/logout');
export const logoutAdmin = () => api.post('/auth/admin/logout');
export const logoutFaculty = () => api.post('/auth/faculty/logout');
export const logoutParent = () => api.post('/auth/parent/logout');