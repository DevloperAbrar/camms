import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';

// Auth Pages
import SuperAdminLogin from './pages/auth/SuperAdminLogin';
import AdminLogin from './pages/auth/AdminLogin';
import GoogleAuthCallback from './pages/auth/GoogleAuthCallback';

// Layouts
import SuperAdminLayout from './layouts/SuperAdminLayout';
import SchoolAdminLayout from './layouts/SchoolAdminLayout';
import FacultyLayout from './layouts/FacultyLayout';
import ParentLayout from './layouts/ParentLayout';
import FeeLayout from './layouts/FeeLayout';

// Super Admin Pages
import SADashboard from './pages/superadmin/Dashboard';
import SASchools from './pages/superadmin/Schools';
import SAPlans from './pages/superadmin/Plans';

// School Admin Pages
import AdminDashboard from './pages/admin/Dashboard';
import AdminSessions from './pages/admin/Sessions';
import AdminClasses from './pages/admin/Classes';
import AdminFaculty from './pages/admin/Faculty';
import AdminStudents from './pages/admin/Students';
import AdminExamTypes from './pages/admin/ExamTypes';
import AdminAnalytics from './pages/admin/Analytics';
import AdminReports from './pages/admin/Reports';
import AdminMarksLock from './pages/admin/MarksLock';
import AdminCalendar from './pages/admin/Calendar';

// Fee Management Pages
import FeeShell from './pages/fees/FeeShell';
import FeeDashboard from './pages/fees/FeeDashboard';
import FeeCollect from './pages/fees/FeeCollect';
import FeeReceipts from './pages/fees/FeeReceipts';
import FeeDues from './pages/fees/FeeDues';
import FeeAnalytics from './pages/fees/FeeAnalytics';
import FeeSetup from './pages/fees/FeeSetup';
import FeeSettings from './pages/fees/FeeSettings';
import FeeStaff from './pages/fees/FeeStaff';

// Faculty Pages
import FacultyDashboard from './pages/faculty/Dashboard';
import FacultyAttendance from './pages/faculty/Attendance';
import FacultyMarks from './pages/faculty/Marks';
import FacultyAnalytics from './pages/faculty/Analytics';
import FacultyReports from './pages/faculty/Reports';
import FacultyCalendar from './pages/faculty/Calendar';

// Parent Pages
import ParentDashboard from './pages/parent/Dashboard';
import ParentAttendance from './pages/parent/Attendance';
import ParentMarks from './pages/parent/Marks';
import ParentFees from './pages/parent/Fees';
import ParentCalendar from './pages/parent/Calendar';

// The same fee screens are used by the school admin (/admin/fees/*) and the fee collector (/fees/*)
const feePages = (
  <>
    <Route path="dashboard" element={<FeeDashboard />} />
    <Route path="collect" element={<FeeCollect />} />
    <Route path="collect/:studentId" element={<FeeCollect />} />
    <Route path="receipts" element={<FeeReceipts />} />
    <Route path="dues" element={<FeeDues />} />
    <Route path="analytics" element={<FeeAnalytics />} />
  </>
);

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Auth */}
        <Route path="/login" element={<AdminLogin />} />
        <Route path="/superadmin/login" element={<SuperAdminLogin />} />
        <Route path="/faculty/login" element={<Navigate to="/login" replace />} />
        <Route path="/parent/login" element={<Navigate to="/login" replace />} />
        <Route path="/auth/callback" element={<GoogleAuthCallback />} />

        {/* Super Admin */}
        <Route path="/superadmin" element={<ProtectedRoute allowedRoles={['superadmin']}><SuperAdminLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<SADashboard />} />
          <Route path="schools" element={<SASchools />} />
          <Route path="plans" element={<SAPlans />} />
        </Route>

        {/* School Admin */}
        <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']}><SchoolAdminLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="sessions" element={<AdminSessions />} />
          <Route path="calendar" element={<AdminCalendar />} />
          <Route path="classes" element={<AdminClasses />} />
          <Route path="faculty" element={<AdminFaculty />} />
          <Route path="students" element={<AdminStudents />} />
          <Route path="exams" element={<AdminExamTypes />} />
          <Route path="marks-lock" element={<AdminMarksLock />} />
          <Route path="analytics" element={<AdminAnalytics />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="calendar" element={<FacultyCalendar />} />

          <Route path="fees" element={<FeeShell />}>
          <Route path="calendar" element={<ParentCalendar />} />
            <Route index element={<Navigate to="dashboard" replace />} />
            {feePages}
            <Route path="setup" element={<FeeSetup />} />
            <Route path="settings" element={<FeeSettings />} />
            <Route path="staff" element={<FeeStaff />} />
          </Route>
        </Route>

        {/* Fee Collector (receptionist) */}
        <Route path="/fees" element={<ProtectedRoute allowedRoles={['fee_collector']}><FeeLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          {feePages}
        </Route>

        {/* Faculty */}
        <Route path="/faculty" element={<ProtectedRoute allowedRoles={['faculty']}><FacultyLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<FacultyDashboard />} />
          <Route path="attendance" element={<FacultyAttendance />} />
          <Route path="marks" element={<FacultyMarks />} />
          <Route path="analytics" element={<FacultyAnalytics />} />
          <Route path="reports" element={<FacultyReports />} />
        </Route>

        {/* Parent */}
        <Route path="/parent" element={<ProtectedRoute allowedRoles={['parent']}><ParentLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<ParentDashboard />} />
          <Route path="attendance" element={<ParentAttendance />} />
          <Route path="marks" element={<ParentMarks />} />
          <Route path="fees" element={<ParentFees />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}