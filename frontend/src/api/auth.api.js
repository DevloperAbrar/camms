import api from './axios';

export const getMe = () => api.get('/auth/me');

export const superadminLogin = (data) => api.post('/auth/superadmin/login', data);
export const schoolPasswordLogin = (data) => api.post('/auth/school/password-login', data);

export const logoutSuperadmin = () => api.post('/auth/superadmin/logout');
export const logoutSchool = () => api.post('/auth/school/logout');