const STAGES = ['new_lead', 'follow_up', 'interested', 'test_scheduled', 'interview', 'admitted', 'lost'];
const CLOSED_STAGES = ['admitted', 'lost'];

module.exports = {
  STAGES,
  CLOSED_STAGES,
  OPEN_STAGES: STAGES.filter((s) => !CLOSED_STAGES.includes(s)),
  SOURCES: ['walk_in', 'phone_call', 'website', 'referral', 'social_media', 'newspaper', 'hoarding', 'school_event', 'other'],
  PRIORITIES: ['low', 'medium', 'high'],
  FOLLOWUP_KINDS: ['call', 'whatsapp', 'sms', 'email', 'visit', 'note'],
  PURPOSES: ['admission_enquiry', 'meet_teacher', 'meet_principal', 'fee_payment', 'collect_student', 'parent_meeting', 'vendor', 'official', 'interview', 'other'],
  // Only the last 3-4 characters of an ID are ever stored (privacy / DPDP).
  ID_TYPES: ['aadhaar', 'driving_licence', 'voter_id', 'pan', 'passport', 'school_id', 'other'],
  FIELD_TYPES: ['text', 'textarea', 'number', 'date', 'select', 'checkbox'],
  FIELD_SCOPES: ['enquiry', 'visitor'],
  MAX_FIELDS_PER_SCOPE: 20,
};