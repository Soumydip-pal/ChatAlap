import React, { useContext } from 'react'
import { Route, Routes, Navigate } from 'react-router-dom'
import Login from './pages/Login/Login'
import Chat from './pages/Chat/Chat'
import ProfileUpdate from './pages/ProfileUpdate/ProfileUpdate'
import { ToastContainer } from 'react-toastify'
import "react-toastify/dist/ReactToastify.css"
import { AppContext } from './context/AppContext'

// Route guard components
const PrivateRoute = ({ children }) => {
  const { userData, authReady } = useContext(AppContext);
  if (!authReady) return <div className="loading-screen"><div className="loader" /></div>;
  if (!userData) return <Navigate to="/" replace />;
  return children;
};

const ProfileRoute = ({ children }) => {
  const { userData, authReady } = useContext(AppContext);
  if (!authReady) return <div className="loading-screen"><div className="loader" /></div>;
  if (!userData) return <Navigate to="/" replace />;
  return children;
};

const PublicRoute = ({ children }) => {
  const { userData, authReady } = useContext(AppContext);
  if (!authReady) return <div className="loading-screen"><div className="loader" /></div>;
  if (userData) {
    // Redirect to profile setup if name not set, else to chat
    return <Navigate to={userData.name ? '/Chat' : '/ProfileUpdate'} replace />;
  }
  return children;
};

const App = () => {
  return (
    <>
      <ToastContainer position="top-right" autoClose={3000} />
      <Routes>
        <Route path='/' element={
          <PublicRoute><Login /></PublicRoute>
        } />
        <Route path='/Chat' element={
          <PrivateRoute><Chat /></PrivateRoute>
        } />
        <Route path='/ProfileUpdate' element={
          <ProfileRoute><ProfileUpdate /></ProfileRoute>
        } />
        <Route path='*' element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default App
