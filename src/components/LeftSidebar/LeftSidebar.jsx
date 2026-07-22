import React, { useContext, useEffect, useMemo, useState } from 'react'
import './LeftSidebar.css'
import assets from '../../assets/assets'
import { useNavigate } from 'react-router-dom'
import { AppContext } from '../../context/AppContext'
import { logout, searchUser, startChat, updateStatus } from '../../config/api'

const LeftSidebar = () => {
  const navigate = useNavigate();
  const {
    userData,
    chatData,
    setMessagesId,
    setChatUser,
    setChatVisible,
    messagesId,
    loadUserData,
  } = useContext(AppContext);

  const [searchInput, setSearchInput] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [chatSearch, setChatSearch] = useState('');
  const [chatFilter, setChatFilter] = useState('all');
  const [now, setNow] = useState(0);

  useEffect(() => {
    const refreshNow = () => setNow(Date.now());
    const timeout = setTimeout(refreshNow, 0);
    const interval = setInterval(refreshNow, 30000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  const handleSearch = async (e) => {
    const val = e.target.value;
    setSearchInput(val);
    if (val.trim().length < 2) {
      setSearchResult(null);
      setShowSearch(false);
      return;
    }
    setShowSearch(true);
    setSearching(true);
    const result = await searchUser(val.trim());
    setSearchResult(result && result.id !== userData.id ? result : null);
    setSearching(false);
  };

  const handleAddChat = async (targetUser) => {
    const msgId = await startChat(userData.id, targetUser);
    if (msgId) {
      setMessagesId(msgId);
      setChatUser({ ...targetUser, messageId: msgId });
      setSearchInput('');
      setSearchResult(null);
      setShowSearch(false);
      setChatVisible(true);
    }
  };

  const handleSelectChat = async (chat) => {
    setMessagesId(chat.messageId);
    setChatUser(chat.userData ? { ...chat.userData, messageId: chat.messageId } : null);
    setChatVisible(true);
    // Mark as seen
    if (!chat.messageSeen) {
      // handled in context
    }
  };

  const handleStatusChange = async (e) => {
    const user = await updateStatus(e.target.value);
    if (user) loadUserData();
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const filteredChats = useMemo(() => {
    const q = chatSearch.trim().toLowerCase();
    return chatData.filter((chat) => {
      const displayName = `${chat.userData?.name || ''} ${chat.userData?.username || ''} ${chat.lastMessage || ''}`.toLowerCase();
      const online = chat.userData?.lastseen && now - chat.userData.lastseen < 5 * 60 * 1000;
      const matchesSearch = !q || displayName.includes(q);
      const matchesFilter =
        chatFilter === 'all' ||
        (chatFilter === 'unread' && !chat.messageSeen) ||
        (chatFilter === 'online' && online);
      return matchesSearch && matchesFilter;
    });
  }, [chatData, chatFilter, chatSearch, now]);

  return (
    <div className="ls">
      <div className="ls-top">
        <div className="ls-nav">
          <img src={assets.ChatAlap_logo2} alt="logo" className="logo" />
          <div className="menu">
            <img src={assets.menu_icon} alt="menu" />
            <div className="sub-menu">
              <p onClick={() => navigate('/ProfileUpdate')}>Edit Profile</p>
              <hr />
              <p onClick={logout}>Logout</p>
            </div>
          </div>
        </div>
        <div className="ls-search">
          <img src={assets.search_icon} alt="search" />
          <input
            type="text"
            placeholder='Search username to add'
            value={searchInput}
            onChange={handleSearch}
          />
        </div>
        <div className="status-card">
          <img src={userData?.avatar || assets.avatar_icon} alt="me" />
          <div>
            <p>{userData?.name || userData?.username}</p>
            <select value={userData?.status || 'available'} onChange={handleStatusChange}>
              <option value="available">Available</option>
              <option value="busy">Busy</option>
              <option value="class">In class</option>
              <option value="offline">Invisible</option>
            </select>
          </div>
        </div>
        <div className="chat-filter-box">
          <input
            value={chatSearch}
            onChange={(e) => setChatSearch(e.target.value)}
            placeholder="Filter conversations"
          />
          <div className="filter-tabs">
            {['all', 'unread', 'online'].map((item) => (
              <button
                key={item}
                type="button"
                className={chatFilter === item ? 'active' : ''}
                onClick={() => setChatFilter(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>

      {showSearch && (
        <div className="search-results">
          {searching ? (
            <p className="search-status">Searching...</p>
          ) : searchResult ? (
            <div className="search-user" onClick={() => handleAddChat(searchResult)}>
              <img
                src={searchResult.avatar || assets.avatar_icon}
                alt="avatar"
              />
              <div>
                <p>{searchResult.name || searchResult.username}</p>
                <span>@{searchResult.username}</span>
              </div>
              <img src={assets.add_icon} alt="add" className="add-icon" />
            </div>
          ) : (
            <p className="search-status">No user found</p>
          )}
        </div>
      )}

      <div className="ls-list">
        {chatData.length === 0 ? (
          <div className="empty-chats">
            <p>No chats yet.</p>
            <span>Search a username above to start!</span>
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="empty-chats">
            <p>No matching chats.</p>
            <span>Try another filter or search.</span>
          </div>
        ) : (
          filteredChats.map((chat, index) => (
            <div
              key={index}
              className={`friends ${messagesId === chat.messageId ? 'active' : ''}`}
              onClick={() => handleSelectChat(chat)}
            >
              <div className="friend-avatar-wrap">
                <img
                  src={chat.userData?.avatar || assets.avatar_icon}
                  alt="avatar"
                />
                {!chat.messageSeen && <span className="unread-dot" />}
              </div>
              <div className="friend-info">
                <p>{chat.userData?.name || chat.userData?.username || 'Unknown'}</p>
                <span>{chat.lastMessage || 'Start a conversation'}</span>
              </div>
              <div className="friend-time">
                {formatTime(chat.updatedAt)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default LeftSidebar
