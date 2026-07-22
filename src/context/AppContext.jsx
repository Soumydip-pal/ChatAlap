/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  getChats,
  getCurrentUser,
  getMessages,
  getToken,
  SOCKET_URL,
  updateLastSeen,
} from "../config/api";

export const AppContext = createContext();

const AppContextProvider = ({ children }) => {
  const [userData, setUserData]       = useState(null);
  const [chatData, setChatData]       = useState([]);
  const [messagesId, setMessagesId]   = useState(null);
  const [messages, setMessages]       = useState([]);
  const [chatUser, setChatUser]       = useState(null);
  const [chatVisible, setChatVisible] = useState(false);
  const [authReady, setAuthReady]     = useState(false);
  const [socketReady, setSocketReady] = useState(false);
  const [socketInstance, setSocketInstance] = useState(null);
  const [typingUsers, setTypingUsers] = useState({});
  const socketRef = useRef(null);
  const messagesIdRef = useRef(null);

  useEffect(() => {
    messagesIdRef.current = messagesId;
  }, [messagesId]);

  const loadUserData = async () => {
    try {
      const { user } = await getCurrentUser();
      setUserData(user);
      setAuthReady(true);
      return user;
    } catch (error) {
      console.error("loadUserData error:", error);
      setUserData(null);
      setChatData([]);
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocketInstance(null);
      setAuthReady(true);
      return null;
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      setAuthReady(false);
      if (getToken()) await loadUserData();
      else {
        setUserData(null);
        setChatData([]);
        setAuthReady(true);
      }
    };

    bootstrap();
    window.addEventListener("chatalap-auth-change", bootstrap);
    return () => window.removeEventListener("chatalap-auth-change", bootstrap);
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!userData?.id || !token) return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;
    const instanceTimeout = setTimeout(() => setSocketInstance(socket), 0);

    socket.on("connect", () => setSocketReady(true));
    socket.on("disconnect", () => setSocketReady(false));
    socket.on("chats:refresh", async () => {
      try {
        const chats = await getChats();
        setChatData(chats);
      } catch (error) {
        console.error("socket chat refresh error:", error);
      }
    });
    socket.on("message:new", ({ messageId, message }) => {
      if (messageId !== messagesIdRef.current) return;
      setMessages((current) => {
        const exists = current.some(
          (item) => (message.id && item.id === message.id) || (item.createdAt === message.createdAt && item.sId === message.sId)
        );
        return exists ? current : [...current, message];
      });
    });
    socket.on("message:update", ({ messageId, message }) => {
      if (messageId !== messagesIdRef.current) return;
      setMessages((current) =>
        current.map((item) => (item.id === message.id ? message : item))
      );
    });
    socket.on("message:seen", ({ messageId, readerId, seenAt }) => {
      if (messageId !== messagesIdRef.current) return;
      setMessages((current) =>
        current.map((message) =>
          message.sId !== readerId && !message.seenAt ? { ...message, seenAt } : message
        )
      );
    });
    socket.on("thread:typing", ({ messageId, user, typing }) => {
      setTypingUsers((current) => ({
        ...current,
        [messageId]: typing
          ? { id: user.id, name: user.name || user.username }
          : null,
      }));
    });
    socket.on("presence:update", ({ userId, status, lastseen }) => {
      setChatData((current) =>
        current.map((chat) =>
          chat.userData?.id === userId
            ? { ...chat, userData: { ...chat.userData, status, lastseen } }
            : chat
        )
      );
      setChatUser((current) =>
        current?.id === userId ? { ...current, status, lastseen } : current
      );
    });

    return () => {
      socket.disconnect();
      clearTimeout(instanceTimeout);
      if (socketRef.current === socket) {
        socketRef.current = null;
        setSocketInstance(null);
      }
    };
  }, [userData?.id]);

  // Update last seen every 60s
  useEffect(() => {
    if (!userData) return;
    const interval = setInterval(async () => {
      try {
        await updateLastSeen();
      } catch {
        // Presence refresh is best-effort.
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [userData?.id]);

  useEffect(() => {
    if (!userData?.id) return;
    let ignore = false;
    const loadChats = async () => {
      try {
        const chats = await getChats();
        if (!ignore) setChatData(chats);
      } catch (error) {
        console.error("loadChats error:", error);
      }
    };

    loadChats();
    const interval = setInterval(loadChats, socketReady ? 30000 : 4000);
    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, [userData?.id]);

  useEffect(() => {
    if (!messagesId) return;
    let ignore = false;
    const loadMessages = async () => {
      try {
        const nextMessages = await getMessages(messagesId);
        if (!ignore) setMessages(nextMessages);
      } catch (error) {
        console.error("loadMessages error:", error);
      }
    };

    loadMessages();
    socketRef.current?.emit("thread:join", messagesId);
    const interval = setInterval(loadMessages, socketReady ? 45000 : 5000);
    return () => {
      ignore = true;
      socketRef.current?.emit("thread:leave", messagesId);
      clearInterval(interval);
    };
  }, [messagesId, socketReady]);

  const value = {
    userData, setUserData,
    chatData, setChatData,
    messagesId, setMessagesId,
    messages, setMessages,
    chatUser, setChatUser,
    chatVisible, setChatVisible,
    authReady, loadUserData,
    socket: socketInstance,
    socketReady,
    typingUsers,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => useContext(AppContext);
export default AppContextProvider;
