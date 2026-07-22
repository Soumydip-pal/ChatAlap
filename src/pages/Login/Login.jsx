import React, { useState } from "react";
import "./Login.css";
import assets from "../../assets/assets";
import { signup, login } from "../../config/api";
import { FileText, GraduationCap, MessageCircle, ShieldCheck, Video } from "lucide-react";

const Login = () => {
  const [currState, setCurrState] = useState("Sign up");
  const [userName, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const onSubmitHandler = (e) => {
    e.preventDefault();
    if (currState === "Sign up") {
      signup(userName, email, password);
    } else {
      login(email, password);
    }
  };

  return (
    <div className="Login">
      <div className="brand-panel">
        <div className="brand-lockup">
          <img src={assets.ChatAlap_logo2} alt="ChatAlap" />
          <div>
            <h1>ChatAlap</h1>
            <p>Realtime chat, classrooms, meetings, and secure file sharing.</p>
          </div>
        </div>
        <div className="feature-grid">
          <div><MessageCircle size={20} /><span>Live chat</span></div>
          <div><Video size={20} /><span>Video rooms</span></div>
          <div><GraduationCap size={20} /><span>Classrooms</span></div>
          <div><FileText size={20} /><span>PDF and media</span></div>
        </div>
        <div className="trust-strip">
          <ShieldCheck size={18} />
          <span>JWT auth, MongoDB persistence, and real-time delivery ready.</span>
        </div>
      </div>

      <div className="auth-card">
        <form onSubmit={onSubmitHandler} className="Login-form">
          <div className="form-heading">
            <p>{currState === "Sign up" ? "Create workspace" : "Welcome back"}</p>
            <h2>{currState === "Sign up" ? "Start using ChatAlap" : "Login to ChatAlap"}</h2>
          </div>
          {currState === "Sign up" ? (
            <input
              onChange={(e) => setUserName(e.target.value)}
              value={userName}
              type="text"
              placeholder="Username"
              className="form-input"
              required
            />
          ) : null}
          <input
            onChange={(e) => setEmail(e.target.value)}
            value={email}
            type="email"
            placeholder="Email address"
            className="form-input"
            required
          />
          <input
            onChange={(e) => setPassword(e.target.value)}
            value={password}
            type="password"
            placeholder="Password"
            className="form-input"
            required
          />
          <button type="submit">
            {currState === "Sign up" ? "Create Account" : "Login now"}
          </button>
          <div className="login-term">
            <input type="checkbox" required />
            <p>Agree to the terms of use and privacy policy</p>
          </div>
          <div className="login-forget">
            {currState === "Sign up" ? (
              <p className="login-toggle">
                Already have an account{" "}
                <span onClick={() => setCurrState("Login")}> Click Here</span>
              </p>
            ) : (
              <p className="login-toggle">
                Create an account
                <span onClick={() => setCurrState("Sign up")}> Click Here</span>
              </p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
