import api from './axios';

// ---- Faculty ----
export const getNotesMeta        = () => api.get('/faculty/notes/meta');
export const getNoteChapters     = (params) => api.get('/faculty/notes/chapters', { params });
export const getNoteStudents     = (params) => api.get('/faculty/notes/students', { params });
export const listMyNotes         = (params) => api.get('/faculty/notes', { params });
export const getMyNote           = (id) => api.get(`/faculty/notes/${id}`);
export const createNote          = (data) => api.post('/faculty/notes', data);
export const updateNote          = (id, data) => api.patch(`/faculty/notes/${id}`, data);
export const publishNote         = (id, data = {}) => api.post(`/faculty/notes/${id}/publish`, data);
export const unpublishNote       = (id) => api.post(`/faculty/notes/${id}/unpublish`);
export const deleteNote          = (id) => api.delete(`/faculty/notes/${id}`);
export const getNoteReaders      = (id) => api.get(`/faculty/notes/${id}/readers`);
export const initiateNoteUpload  = (id, data) => api.post(`/faculty/notes/${id}/uploads/initiate`, data);
export const confirmNoteUpload   = (id, attId) => api.post(`/faculty/notes/${id}/uploads/${attId}/confirm`);
export const addNoteLink         = (id, data) => api.post(`/faculty/notes/${id}/links`, data);
export const removeNoteAttachment = (id, attId) => api.delete(`/faculty/notes/${id}/attachments/${attId}`);
export const getMyNoteAttachmentUrl = (id, attId, params) => api.get(`/faculty/notes/${id}/attachments/${attId}/url`, { params });

// ---- Parent ----
export const getParentNotesMeta  = (params) => api.get('/parent/notes/meta', { params });
export const listParentNotes     = (params) => api.get('/parent/notes', { params });
export const getParentNote       = (id, params) => api.get(`/parent/notes/${id}`, { params });
export const getParentNoteAttachmentUrl = (id, attId, params) => api.get(`/parent/notes/${id}/attachments/${attId}/url`, { params });

// ---- School admin ----
export const getAdminNotesUsage  = () => api.get('/schooladmin/notes/usage');
export const listAdminNotes      = (params) => api.get('/schooladmin/notes', { params });
export const getAdminNote        = (id) => api.get(`/schooladmin/notes/${id}`);
export const takedownNote        = (id, data) => api.post(`/schooladmin/notes/${id}/takedown`, data);
export const restoreNote         = (id) => api.post(`/schooladmin/notes/${id}/restore`);
export const getAdminNoteAttachmentUrl = (id, attId, params) => api.get(`/schooladmin/notes/${id}/attachments/${attId}/url`, { params });

// ---- Super admin ----
export const listNotesSchools    = (params) => api.get('/superadmin/notes/schools', { params });
export const saveNotesSchool     = (id, data) => api.put(`/superadmin/notes/schools/${id}`, data);