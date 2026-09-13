import api from './axios';

export const getSADashboard  = ()     => api.get('/superadmin/dashboard/stats');
export const getSchools      = (params) => api.get('/superadmin/schools', { params });
export const createSchool    = (data) => api.post('/superadmin/schools', data);
export const updateSchool    = (id, data) => api.patch(`/superadmin/schools/${id}`, data);
export const suspendSchool   = (id, data) => api.patch(`/superadmin/schools/${id}/suspend`, data);
export const reactivateSchool= (id)   => api.patch(`/superadmin/schools/${id}/reactivate`);
export const resetSchoolAdminPassword = (id) => api.post(`/superadmin/schools/${id}/reset-admin-password`);
export const getPlans        = ()     => api.get('/superadmin/plans');
export const createPlan      = (data) => api.post('/superadmin/plans', data);
export const updatePlan      = (id, data) => api.patch(`/superadmin/plans/${id}`, data);
export const deletePlan      = (id)   => api.delete(`/superadmin/plans/${id}`);
export const getSubscriptions= ()     => api.get('/superadmin/subscriptions');
export const renewSubscription=(id,data)=> api.post(`/superadmin/subscriptions/${id}/renew`, data);