import api from './axios';

const B = '/reception';

export const getReceptionMeta = () => api.get(`${B}/meta`);
export const getReceptionDashboard = (params) => api.get(`${B}/dashboard`, { params });

// Enquiries
export const getEnquiries = (params) => api.get(`${B}/enquiries`, { params });
export const getEnquiry = (id) => api.get(`${B}/enquiries/${id}`);
export const createEnquiry = (data) => api.post(`${B}/enquiries`, data);
export const updateEnquiry = (id, data) => api.patch(`${B}/enquiries/${id}`, data);
export const deleteEnquiry = (id) => api.delete(`${B}/enquiries/${id}`);
export const changeEnquiryStage = (id, data) => api.post(`${B}/enquiries/${id}/stage`, data);
export const addEnquiryFollowUp = (id, data) => api.post(`${B}/enquiries/${id}/followups`, data);
export const convertEnquiry = (id, data) => api.post(`${B}/enquiries/${id}/convert`, data);
export const getConvertOptions = (params) => api.get(`${B}/enquiries/convert-options`, { params });
export const getFollowUps = (params) => api.get(`${B}/enquiries/followups`, { params });
export const exportEnquiriesCsv = (params) => api.get(`${B}/enquiries/export`, { params, responseType: 'blob' });

// Visitors
export const getVisitors = (params) => api.get(`${B}/visitors`, { params });
export const createVisitor = (data) => api.post(`${B}/visitors`, data);
export const checkoutVisitor = (id) => api.post(`${B}/visitors/${id}/checkout`);
export const checkoutAllVisitors = () => api.post(`${B}/visitors/checkout-all`);
export const deleteVisitor = (id) => api.delete(`${B}/visitors/${id}`);
export const exportVisitorsCsv = (params) => api.get(`${B}/visitors/export`, { params, responseType: 'blob' });

// Custom fields (admin manages, both read via meta)
export const getReceptionFields = (params) => api.get(`${B}/fields`, { params });
export const createReceptionField = (data) => api.post(`${B}/fields`, data);
export const updateReceptionField = (id, data) => api.patch(`${B}/fields/${id}`, data);
export const deleteReceptionField = (id) => api.delete(`${B}/fields/${id}`);
export const reorderReceptionFields = (data) => api.post(`${B}/fields/reorder`, data);

// Admin: receptionist logins
export const getReceptionStaff = () => api.get('/schooladmin/reception-staff');
export const createReceptionStaff = (data) => api.post('/schooladmin/reception-staff', data);
export const updateReceptionStaff = (id, data) => api.patch(`/schooladmin/reception-staff/${id}`, data);
export const setReceptionStaffPassword = (id, data) => api.post(`/schooladmin/reception-staff/${id}/password`, data);
export const deleteReceptionStaff = (id) => api.delete(`/schooladmin/reception-staff/${id}`);