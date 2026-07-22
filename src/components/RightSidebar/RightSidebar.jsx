import React, { useContext, useEffect, useMemo, useState } from 'react'
import './RightSidebar.css'
import { Copy, Lock, LogOut, MessageSquare, Phone, Plus, ShieldCheck, Users, Video } from 'lucide-react'
import assets from '../../assets/assets'
import { AppContext } from '../../context/AppContext'
import { createClassroom, getClassrooms, joinClassroom, leaveClassroom, logout, sendClassroomMessage, startClassroomCall } from '../../config/api'

const RightSidebar = () => {
  const { chatUser, messages, userData, socket } = useContext(AppContext);
  const [classrooms, setClassrooms] = useState([]);
  const [newRoom, setNewRoom] = useState('');
  const [privateRoom, setPrivateRoom] = useState(false);
  const [activeRoom, setActiveRoom] = useState(null);
  const [roomInput, setRoomInput] = useState('');
  const [classroomSearch, setClassroomSearch] = useState('');
  const [classroomFilter, setClassroomFilter] = useState('all');
  const [classroomNotice, setClassroomNotice] = useState('');
  const [now, setNow] = useState(0);

  const attachments = (messages || []).filter((m) => m.image || m.attachment);

  const loadRooms = async () => {
    try {
      setClassrooms(await getClassrooms());
    } catch (error) {
      console.error('classrooms error:', error);
    }
  };

  useEffect(() => {
    if (!userData?.id) return;
    let ignore = false;
    const load = async () => {
      try {
        const rooms = await getClassrooms();
        if (!ignore) setClassrooms(rooms);
      } catch (error) {
        console.error('classrooms error:', error);
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, [userData?.id]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => loadRooms();
    const notify = ({ message }) => {
      if (!message) return;
      setClassroomNotice(message);
      setTimeout(() => setClassroomNotice(''), 4500);
      loadRooms();
    };
    socket.on('classrooms:refresh', refresh);
    socket.on('classroom:notify', notify);
    return () => {
      socket.off('classrooms:refresh', refresh);
      socket.off('classroom:notify', notify);
    };
  }, [socket]);

  useEffect(() => {
    if (!socket || !activeRoom?.id) return;
    socket.emit('classroom:join', activeRoom.id);
    const handleMessage = ({ classroomId, message }) => {
      if (classroomId !== activeRoom.id) return;
      setActiveRoom((current) =>
        current
          ? { ...current, messages: [...(current.messages || []), message] }
          : current
      );
    };
    socket.on('classroom:message', handleMessage);
    return () => socket.off('classroom:message', handleMessage);
  }, [socket, activeRoom?.id]);

  useEffect(() => {
    const refreshNow = () => setNow(Date.now());
    const timeout = setTimeout(refreshNow, 0);
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  const handleCreateRoom = async () => {
    if (newRoom.trim().length < 3) return;
    await createClassroom({
      title: newRoom.trim(),
      subject: 'Community classroom',
      description: 'Live class chat, meeting room, and shared resources.',
      isPrivate: privateRoom,
    });
    setNewRoom('');
    setPrivateRoom(false);
    loadRooms();
  };

  const handleJoinRoom = async (room) => {
    try {
      await joinClassroom(room.id);
    } catch (error) {
      setClassroomNotice(error.message || 'Could not join classroom');
      return;
    }
    const rooms = await getClassrooms();
    setClassrooms(rooms);
    setActiveRoom(rooms.find((item) => item.id === room.id) || room);
  };

  const handleLeaveRoom = async () => {
    if (!activeRoom?.id || activeRoom.isAdmin) return;
    await leaveClassroom(activeRoom.id);
    const rooms = await getClassrooms();
    setClassrooms(rooms);
    setActiveRoom(null);
  };

  const handleSendRoomMessage = async () => {
    const text = roomInput.trim();
    if (!text || !activeRoom?.id) return;
    setRoomInput('');
    await sendClassroomMessage(activeRoom.id, text);
  };

  const copyRoomId = async (room) => {
    if (!room?.meetingRoomId) return;
    await navigator.clipboard?.writeText(room.meetingRoomId);
    setClassroomNotice(`Room ID copied: ${room.meetingRoomId}`);
  };

  const launchClassroomCall = async (media) => {
    if (!activeRoom?.meetingRoomId) return;
    await startClassroomCall(activeRoom.id, media);
    window.dispatchEvent(new CustomEvent('chatalap-start-room', {
      detail: { roomId: activeRoom.meetingRoomId, media },
    }));
  };

  const filteredClassrooms = useMemo(() => {
    const q = classroomSearch.trim().toLowerCase();
    return classrooms.filter((room) => {
      const text = `${room.title || ''} ${room.subject || ''} ${room.meetingRoomId || ''}`.toLowerCase();
      const matchesSearch = !q || text.includes(q);
      const matchesFilter =
        classroomFilter === 'all' ||
        (classroomFilter === 'private' && room.isPrivate) ||
        (classroomFilter === 'joined' && room.isMember) ||
        (classroomFilter === 'public' && !room.isPrivate);
      return matchesSearch && matchesFilter;
    });
  }, [classroomFilter, classroomSearch, classrooms]);

  const isOnline = (lastseen) => {
    if (!lastseen) return false;
    return now - lastseen < 5 * 60 * 1000;
  };

  const renderMediaThumb = (msg, idx) => {
    const file = msg.attachment;
    if (msg.image || file?.type === 'image') {
      return (
        <img
          key={idx}
          src={msg.image || file.url}
          alt={`media-${idx}`}
          onClick={() => window.open(msg.image || file.url, '_blank')}
        />
      );
    }
    return (
      <a key={idx} href={file?.url} target="_blank" rel="noreferrer" className="media-file">
        <MessageSquare size={16} />
        <span>{file?.type || 'file'}</span>
      </a>
    );
  };

  return (
    <div className='rs'>
      {chatUser ? (
        <>
          <div className="rs-profile">
            <img src={chatUser.avatar || assets.avatar_icon} alt="avatar" />
            <h3>
              {chatUser.name || chatUser.username}
              {isOnline(chatUser.lastseen) && <img src={assets.green_dot} className='dot' alt="online" />}
            </h3>
            <p>{chatUser.bio || 'No bio yet'}</p>
            <span className="profile-status">{chatUser.status || 'available'}</span>
          </div>
          <hr />
          <div className="rs-media">
            <p>Shared Files</p>
            <div>
              {attachments.length > 0
                ? attachments.map(renderMediaThumb)
                : <span className="no-media">No files shared yet</span>
              }
            </div>
          </div>
        </>
      ) : (
        <div className="rs-placeholder">
          <img src={assets.ChatAlap_logo2} alt="logo" />
          <p>Select a chat to see user info</p>
        </div>
      )}

      <div className="classroom-panel">
        <div className="panel-title">
          <Users size={16} />
          <p>Classrooms</p>
        </div>
        {classroomNotice && <div className="classroom-notice">{classroomNotice}</div>}
        <div className="classroom-filters">
          <input
            value={classroomSearch}
            onChange={(e) => setClassroomSearch(e.target.value)}
            placeholder="Filter classes or room ID"
          />
          <div>
            {['all', 'public', 'private', 'joined'].map((item) => (
              <button
                key={item}
                type="button"
                className={classroomFilter === item ? 'active' : ''}
                onClick={() => setClassroomFilter(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="room-create">
          <input
            value={newRoom}
            onChange={(e) => setNewRoom(e.target.value)}
            placeholder="New classroom"
          />
          <label>
            <input
              type="checkbox"
              checked={privateRoom}
              onChange={(e) => setPrivateRoom(e.target.checked)}
            />
            Private
          </label>
          <button type="button" onClick={handleCreateRoom} title="Create classroom"><Plus size={16} /></button>
        </div>
        <div className="room-list">
          {filteredClassrooms.slice(0, 8).map((room) => (
            <div className={`room-card ${activeRoom?.id === room.id ? 'active' : ''}`} key={room.id}>
              <div>
                <p>
                  {room.title}
                  {room.isAdmin && <span className="admin-chip"><ShieldCheck size={11} />Admin</span>}
                </p>
                <span>{room.memberCount} members | {room.meetingRoomId}</span>
              </div>
              {room.isPrivate ? <Lock size={14} /> : <Video size={14} />}
              <button type="button" className="copy-room-btn" onClick={() => copyRoomId(room)} title="Copy classroom ID">
                <Copy size={13} /> Copy ID
              </button>
              <button
                type="button"
                onClick={() => handleJoinRoom(room)}
                disabled={room.isPrivate && !room.isAdmin && !room.isMember}
              >
                {room.isMember ? 'Open' : room.isPrivate && !room.isAdmin ? 'Locked' : 'Join'}
              </button>
            </div>
          ))}
          {classrooms.length === 0 && <span className="no-media">No classrooms yet</span>}
          {classrooms.length > 0 && filteredClassrooms.length === 0 && <span className="no-media">No matching classrooms</span>}
        </div>
        {activeRoom && (
          <div className="classroom-chat">
            <div className="classroom-chat-head">
              <div>
                <p>
                  {activeRoom.title}
                  {activeRoom.isAdmin && <span className="admin-chip"><ShieldCheck size={11} />Admin</span>}
                </p>
                <span>{activeRoom.isPrivate ? 'Private classroom' : 'Community classroom'}</span>
              </div>
              <button type="button" onClick={() => copyRoomId(activeRoom)} title="Copy classroom ID"><Copy size={14} /></button>
              <button type="button" onClick={() => launchClassroomCall('audio')} title="Start classroom voice call"><Phone size={14} /></button>
              <button type="button" onClick={() => launchClassroomCall('video')} title="Start classroom video class"><Video size={14} /></button>
              {!activeRoom.isAdmin && (
                <button type="button" onClick={handleLeaveRoom} title="Leave classroom"><LogOut size={14} /></button>
              )}
            </div>
            <div className="classroom-messages">
              {(activeRoom.messages || []).slice(-6).map((message, index) => (
                <div key={`${message.createdAt}-${index}`} className={message.sId === userData.id ? 'own-room-msg' : ''}>
                  <p>{message.text}</p>
                </div>
              ))}
              {(activeRoom.messages || []).length === 0 && <span className="no-media">No classroom messages yet</span>}
            </div>
            <div className="classroom-input">
              <input
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendRoomMessage();
                }}
                placeholder="Classroom message"
              />
              <button type="button" onClick={handleSendRoomMessage}>Send</button>
            </div>
          </div>
        )}
      </div>

      <button className="logout-btn" onClick={logout}>Logout</button>
    </div>
  )
}

export default RightSidebar
