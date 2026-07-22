import { toast } from "react-toastify";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const SOCKET_URL = API_URL.replace(/\/api\/?$/, "");
const TOKEN_KEY = "chatalap_token";

const getToken = () => localStorage.getItem(TOKEN_KEY);

const setToken = (token) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};

const request = async (path, options = {}) => {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) setToken(null);
    throw new Error(data.message || "Request failed");
  }
  return data;
};

const fileToBase64 = (file, maxDimension = 400, quality = 0.75) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;

        if (width > height && width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }

        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const signup = async (username, email, password) => {
  if (!username.trim()) return toast.error("Username is required");
  if (!email.trim()) return toast.error("Email is required");
  if (!email.includes("@")) return toast.error("Please enter a valid email address");
  if (password.length < 6) return toast.error("Password must be at least 6 characters");

  try {
    const data = await request("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ username, email, password }),
    });
    setToken(data.token);
    toast.success("Account created! Please set up your profile.");
    window.dispatchEvent(new Event("chatalap-auth-change"));
  } catch (error) {
    toast.error(error.message);
  }
};

const login = async (email, password) => {
  try {
    const data = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    window.dispatchEvent(new Event("chatalap-auth-change"));
  } catch (error) {
    toast.error(error.message);
  }
};

const logout = () => {
  setToken(null);
  window.dispatchEvent(new Event("chatalap-auth-change"));
  toast.success("Logged out successfully");
};

const getCurrentUser = async () => request("/auth/me");

const updateLastSeen = async () => request("/users/last-seen", { method: "PATCH" });

const updateProfile = async (_uid, name, bio, imageFile) => {
  try {
    const payload = { name: name.trim(), bio: bio.trim() };
    if (imageFile) payload.avatar = await fileToBase64(imageFile, 400, 0.75);
    const data = await request("/users/profile", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    toast.success("Profile updated!");
    return data.user;
  } catch (error) {
    toast.error("Failed to update profile: " + error.message);
    return null;
  }
};

const searchUser = async (username) => {
  try {
    const data = await request(`/users/search?username=${encodeURIComponent(username.trim())}`);
    return data.user;
  } catch {
    return null;
  }
};

const getChats = async () => {
  const data = await request("/chats");
  return data.chats;
};

const startChat = async (_currentUid, targetUser) => {
  try {
    const data = await request("/chats", {
      method: "POST",
      body: JSON.stringify({ targetUserId: targetUser.id }),
    });
    return data.messageId;
  } catch (error) {
    toast.error(error.message || "Could not start chat");
    return null;
  }
};

const getMessages = async (messagesId) => {
  const data = await request(`/messages/${messagesId}`);
  return data.messages;
};

const sendMessage = async (messagesId, _senderId, text, replyTo = null) => {
  if (!text.trim()) return;
  try {
    const data = await request(`/messages/${messagesId}/text`, {
      method: "POST",
      body: JSON.stringify({ text: text.trim(), replyTo }),
    });
    return data.message;
  } catch (error) {
    toast.error(error.message || "Failed to send message");
  }
};

const editMessage = async (messagesId, itemId, text) => {
  const data = await request(`/messages/${messagesId}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ text }),
  });
  return data.message;
};

const deleteMessage = async (messagesId, itemId) => {
  const data = await request(`/messages/${messagesId}/items/${itemId}`, {
    method: "DELETE",
  });
  return data.message;
};

const reactToMessage = async (messagesId, itemId, emoji) => {
  const data = await request(`/messages/${messagesId}/items/${itemId}/reactions`, {
    method: "POST",
    body: JSON.stringify({ emoji }),
  });
  return data.message;
};

const pinMessage = async (messagesId, itemId, pinned) => {
  const data = await request(`/messages/${messagesId}/items/${itemId}/pin`, {
    method: "PATCH",
    body: JSON.stringify({ pinned }),
  });
  return data.message;
};

const sendImageMessage = async (messagesId, _senderId, imageFile) => {
  try {
    toast.info("Uploading image...");
    const image = await fileToBase64(imageFile, 800, 0.7);
    const data = await request(`/messages/${messagesId}/image`, {
      method: "POST",
      body: JSON.stringify({ image }),
    });
    return data.message;
  } catch (error) {
    toast.error(error.message || "Failed to send image");
  }
};

const sendFileMessage = async (messagesId, _senderId, file) => {
  try {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File must be 10MB or less");
      return null;
    }
    toast.info("Uploading attachment...");
    const dataUrl = file.type.startsWith("image/")
      ? await fileToBase64(file, 1200, 0.75)
      : await fileToDataUrl(file);
    const data = await request(`/messages/${messagesId}/file`, {
      method: "POST",
      body: JSON.stringify({
        dataUrl,
        name: file.name,
        mime: file.type || "application/octet-stream",
        size: file.size,
      }),
    });
    return data.message;
  } catch (error) {
    toast.error(error.message || "Failed to send attachment");
    return null;
  }
};

const updateChatPreview = async () => {};

const markAsSeen = async (_currentUid, messagesId) => {
  try {
    await request(`/messages/${messagesId}/seen`, { method: "PATCH" });
  } catch {
    // Read receipts are best-effort.
  }
};

const updateStatus = async (status) => {
  const data = await request("/users/status", {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  return data.user;
};

const getSmartSuggestions = async (text, topic) => {
  const data = await request("/ai/suggestions", {
    method: "POST",
    body: JSON.stringify({ text, topic }),
  });
  return data;
};

const getClassrooms = async () => {
  const data = await request("/classrooms");
  return data.classrooms;
};

const createClassroom = async (payload) => {
  const data = await request("/classrooms", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.classroom;
};

const joinClassroom = async (classroomId) => {
  const data = await request(`/classrooms/${classroomId}/join`, { method: "POST" });
  return data.ok;
};

const leaveClassroom = async (classroomId) => {
  const data = await request(`/classrooms/${classroomId}/leave`, { method: "POST" });
  return data.ok;
};

const startClassroomCall = async (classroomId, media) => {
  const data = await request(`/classrooms/${classroomId}/call`, {
    method: "POST",
    body: JSON.stringify({ media }),
  });
  return data;
};

const sendClassroomMessage = async (classroomId, text) => {
  const data = await request(`/classrooms/${classroomId}/messages`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
  return data.message;
};

export {
  API_URL,
  SOCKET_URL,
  getToken,
  signup,
  login,
  logout,
  getCurrentUser,
  updateLastSeen,
  updateProfile,
  searchUser,
  getChats,
  startChat,
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  reactToMessage,
  pinMessage,
  sendImageMessage,
  sendFileMessage,
  updateChatPreview,
  markAsSeen,
  updateStatus,
  getSmartSuggestions,
  getClassrooms,
  createClassroom,
  joinClassroom,
  leaveClassroom,
  startClassroomCall,
  sendClassroomMessage,
};
