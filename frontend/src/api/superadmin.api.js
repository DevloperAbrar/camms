import api from './axios';

export const getSADashboard  = ()     => api.get('/superadmin/dashboard');
export const getSchools      = ()     => api.get('/superadmin/schools');
export const createSchool    = (data) => api.post('/superadmin/schools', data);
export const updateSchool    = (id, data) => api.patch(`/superadmin/schools/${id}`, data);
export const suspendSchool   = (id)   => api.patch(`/superadmin/schools/${id}/suspend`);
export const reactivateSchool= (id)   => api.patch(`/superadmin/schools/${id}/reactivate`);
export const getPlans        = ()     => api.get('/superadmin/plans');
export const createPlan      = (data) => api.post('/superadmin/plans', data);
export const getSubscriptions= ()     => api.get('/superadmin/subscriptions');
export const renewSubscription=(id,data)=> api.post(`/superadmin/subscriptions/${id}/renew`, data);