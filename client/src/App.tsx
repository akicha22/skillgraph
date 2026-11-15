import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import ProtectedRoute from "./components/ProtectedRoute";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import CandidateDashboard from "./pages/CandidateDashboard";
import RecruiterDashboard from "./pages/RecruiterDashboard";
import MySkills from "./pages/MySkills";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register/candidate" element={<Register key="candidate" role="CANDIDATE" />} />
          <Route
  path="/candidate/skills"
  element={
    <ProtectedRoute role="CANDIDATE">
      <MySkills />
    </ProtectedRoute>
  }
/>
          <Route path="/register/recruiter" element={<Register key="recruiter" role="RECRUITER" />} />
          <Route
            path="/candidate"
            element={
              <ProtectedRoute role="CANDIDATE">
                <CandidateDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/recruiter"
            element={
              <ProtectedRoute role="RECRUITER">
                <RecruiterDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}