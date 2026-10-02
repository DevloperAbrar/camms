import api from './axios';

const B = '/fees';

export const getFeeMeta = () => api.get(`${B}/meta`);
export const getFeeDashboard = (params) => api.get(`${B}/analytics/dashboard`, { params });
export const getFeeStudents = (params) => api.get(`${B}/students`, { params });
export const getFeeLedger = (studentId) => api.get(`${B}/students/${studentId}/ledger`);
export const downloadFeeStatement = (studentId, params) => api.get(`${B}/students/${studentId}/statement-pdf`, { params, responseType: 'blob' });

export const collectFees = (data) => api.post(`${B}/collect`, data);
export const applyConcession = (data) => api.post(`${B}/concessions`, data);
export const generateFeeDues = (data = {}) => api.post(`${B}/dues/generate`, data);
export const addFeeCharge = (data) => api.post(`${B}/charges`, data);
export const deleteFeeCharge = (id) => api.delete(`${B}/charges/${id}`);

export const getFeeReceipts = (params) => api.get(`${B}/receipts`, { params });
export const downloadReceiptPdf = (id, params) => api.get(`${B}/receipts/${id}/pdf`, { params, responseType: 'blob' });
export const exportReceiptsCsv = (params) => api.get(`${B}/receipts/export`, { params, responseType: 'blob' });
export const downloadCollectionPdf = (params) => api.get(`${B}/receipts/collection-pdf`, { params, responseType: 'blob' });
export const cancelFeeReceipt = (id, data) => api.post(`${B}/receipts/${id}/cancel`, data);

export const exportDuesCsv = (params) => api.get(`${B}/dues/export`, { params, responseType: 'blob' });
export const downloadDuesPdf = (params) => api.get(`${B}/dues/pdf`, { params, responseType: 'blob' });
export const sendDueReminders = (data) => api.post(`${B}/dues/remind`, data);

// Admin: settings
export const getFeeSettings = () => api.get(`${B}/settings`);
export const updateFeeSettings = (data) => api.put(`${B}/settings`, data);
export const uploadFeeLogo = (file) => {
  const fd = new FormData();
  fd.append('logo', file);
  return api.post(`${B}/settings/logo`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
};
export const removeFeeLogo = () => api.delete(`${B}/settings/logo`);

// Admin: heads + structure
export const getFeeHeads = () => api.get(`${B}/heads`);
export const createFeeHead = (data) => api.post(`${B}/heads`, data);
export const updateFeeHead = (id, data) => api.patch(`${B}/heads/${id}`, data);
export const deleteFeeHead = (id) => api.delete(`${B}/heads/${id}`);
export const getFeeStructure = (params) => api.get(`${B}/structure`, { params });
export const createFeeStructure = (data) => api.post(`${B}/structure`, data);
export const updateFeeStructure = (id, data) => api.patch(`${B}/structure/${id}`, data);
export const deleteFeeStructure = (id) => api.delete(`${B}/structure/${id}`);
export const copyFeeStructure = (data) => api.post(`${B}/structure/copy`, data);

// Admin: fee collectors
export const getFeeStaff = () => api.get('/schooladmin/fee-staff');
export const createFeeStaff = (data) => api.post('/schooladmin/fee-staff', data);
export const updateFeeStaff = (id, data) => api.patch(`/schooladmin/fee-staff/${id}`, data);
export const setFeeStaffPassword = (id, data) => api.post(`/schooladmin/fee-staff/${id}/password`, data);
export const deleteFeeStaff = (id) => api.delete(`/schooladmin/fee-staff/${id}`);