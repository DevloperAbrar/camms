import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';

// Auth Pages
import SuperAdminLogin from './pages/auth/SuperAdminLogin';
import AdminLogin from './pages/auth/AdminLogin';
import FacultyLogin from './pages/auth/FacultyLogin';
import ParentLogin from './pages/auth/ParentLogin';

// Layouts
import SuperAdminLayout from './layouts/SuperAdminLayout';
import SchoolAdminLayout from './layouts/SchoolAdminLayout';
import FacultyLayout from './layouts/FacultyLayout';
import ParentLayout from './layouts/ParentLayout';

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

// Faculty Pages
import FacultyDashboard from './pages/faculty/Dashboard';
import FacultyAttendance from './pages/faculty/Attendance';
import FacultyMarks from './pages/faculty/Marks';

// Parent Pages
import ParentDashboard from './pages/parent/Dashboard';
import ParentAttendance from './pages/parent/Attendance';
import ParentMarks from './pages/parent/Marks';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Auth */}
        <Route path="/login" element={<AdminLogin />} />
        <Route path="/superadmin/login" element={<SuperAdminLogin />} />
        <Route path="/faculty/login" element={<FacultyLogin />} />
        <Route path="/parent/login" element={<ParentLogin />} />

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
          <Route path="classes" element={<AdminClasses />} />
          <Route path="faculty" element={<AdminFaculty />} />
          <Route path="students" element={<AdminStudents />} />
          <Route path="exams" element={<AdminExamTypes />} />
          <Route path="analytics" element={<AdminAnalytics />} />
        </Route>

        {/* Faculty */}
        <Route path="/faculty" element={<ProtectedRoute allowedRoles={['faculty']}><FacultyLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<FacultyDashboard />} />
          <Route path="attendance" element={<FacultyAttendance />} />
          <Route path="marks" element={<FacultyMarks />} />
        </Route>

        {/* Parent */}
        <Route path="/parent" element={<ProtectedRoute allowedRoles={['parent']}><ParentLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<ParentDashboard />} />
          <Route path="attendance" element={<ParentAttendance />} />
          <Route path="marks" element={<ParentMarks />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}