import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import './ChatBox.css'
import { Bot, CheckCheck, Download, Edit3, FileText, FolderOpen, GraduationCap, Mic, MonitorUp, Paperclip, Phone, Pin, Radio, Reply, Search, Send, ShieldCheck, Sparkles, Square, Trash2, Users, Video, X } from 'lucide-react'
import assets from '../../assets/assets'
import { AppContext } from '../../context/AppContext'
import {
  deleteMessage,
  editMessage,
  getSmartSuggestions,
  markAsSeen,
  pinMessage,
  reactToMessage,
  sendFileMessage,
  sendMessage,
  updateStatus,
  updateChatPreview,
} from '../../config/api'

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const ChatBox = () => {
  const {
    userData,
    chatData,
    messagesId,
    messages,
    chatUser,
    chatVisible,
    setChatVisible,
    socket,
    socketReady,
    typingUsers,
    loadUserData,
  } = useContext(AppContext);

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [assistantReply, setAssistantReply] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [instantRoomInput, setInstantRoomInput] = useState('');
  const [meeting, setMeeting] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [recording, setRecording] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState('');
  const [incomingCall, setIncomingCall] = useState(null);
  const [now, setNow] = useState(0);
  const bottomRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRefs = useRef({});
  const peerConnectionsRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const cameraStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const roomId = useMemo(() => meeting?.roomId || (messagesId ? `dm-${messagesId}` : null), [meeting?.roomId, messagesId]);
  const dashboardRoomId = useMemo(
    () => instantRoomInput.trim() || `lobby-${userData?.id || 'guest'}`,
    [instantRoomInput, userData?.id]
  );

  const closePeerConnection = useCallback(() => {
    peerConnectionsRef.current.forEach((peerConnection) => peerConnection.close());
    peerConnectionsRef.current.clear();
    setRemoteStreams({});
  }, []);

  const getPeerConnection = useCallback((peerSocketId) => {
    if (peerConnectionsRef.current.has(peerSocketId)) {
      return peerConnectionsRef.current.get(peerSocketId);
    }
    const peerConnection = new RTCPeerConnection(rtcConfig);

    peerConnection.onicecandidate = (event) => {
      if (event.candidate && roomId) {
        socket?.emit('call:signal', {
          roomId,
          to: peerSocketId,
          signal: { type: 'ice-candidate', candidate: event.candidate },
        });
      }
    };

    peerConnection.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) {
        setRemoteStreams((current) => ({ ...current, [peerSocketId]: stream }));
      }
    };

    peerConnection.onconnectionstatechange = () => {
      setMeeting((current) =>
        current
          ? { ...current, connectionState: peerConnection.connectionState }
          : current
      );
    };

    localStreamRef.current?.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStreamRef.current);
    });

    peerConnectionsRef.current.set(peerSocketId, peerConnection);
    return peerConnection;
  }, [roomId, socket]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (messagesId && userData) markAsSeen(userData.id, messagesId);
  }, [messagesId, messages, userData]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, meeting]);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    Object.entries(remoteStreams).forEach(([peerSocketId, stream]) => {
      if (remoteVideoRefs.current[peerSocketId]) {
        remoteVideoRefs.current[peerSocketId].srcObject = stream;
      }
    });
  }, [remoteStreams, meeting]);

  useEffect(() => () => {
    localStream?.getTracks().forEach((track) => track.stop());
  }, [localStream]);

  useEffect(() => {
    if (!socket || !roomId) return;

    const handleExistingPeers = ({ peers = [], limit = 5 }) => {
      setMeeting((current) =>
        current ? { ...current, participants: peers.length + 1, limit } : current
      );
    };

    const handlePeerJoined = async ({ socketId, media }) => {
      if (!localStreamRef.current) return;
      setMeeting((current) =>
        current ? { ...current, media, connectionState: 'calling', participants: (current.participants || 1) + 1 } : current
      );
      const peerConnection = getPeerConnection(socketId);
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit('call:signal', {
        roomId,
        to: socketId,
        signal: { type: 'offer', description: offer },
      });
    };

    const handleSignal = async ({ from, signal }) => {
      if (!localStreamRef.current || !signal) return;
      const peerConnection = getPeerConnection(from);

      if (signal.type === 'offer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.description));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('call:signal', {
          roomId,
          to: from,
          signal: { type: 'answer', description: answer },
        });
      }

      if (signal.type === 'answer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.description));
      }

      if (signal.type === 'ice-candidate' && signal.candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    };

    const handlePeerLeft = ({ socketId }) => {
      peerConnectionsRef.current.get(socketId)?.close();
      peerConnectionsRef.current.delete(socketId);
      setRemoteStreams((current) => {
        const next = { ...current };
        delete next[socketId];
        return next;
      });
      setMeeting((current) =>
        current ? { ...current, connectionState: 'peer-left', participants: Math.max((current.participants || 1) - 1, 1) } : current
      );
    };

    const handleRoomFull = ({ limit }) => {
      setMeeting((current) =>
        current ? { ...current, blocked: true, connectionState: `Room limit reached (${limit})` } : current
      );
    };

    socket.on('call:peers', handleExistingPeers);
    socket.on('call:peer-joined', handlePeerJoined);
    socket.on('call:signal', handleSignal);
    socket.on('call:peer-left', handlePeerLeft);
    socket.on('call:full', handleRoomFull);

    return () => {
      socket.off('call:peers', handleExistingPeers);
      socket.off('call:peer-joined', handlePeerJoined);
      socket.off('call:signal', handleSignal);
      socket.off('call:peer-left', handlePeerLeft);
      socket.off('call:full', handleRoomFull);
    };
  }, [closePeerConnection, getPeerConnection, socket, roomId]);

  useEffect(() => () => clearTimeout(typingTimeoutRef.current), []);

  useEffect(() => {
    if (!socket) return;
    const handleClassroomCall = (call) => {
      if (!call?.roomId || call.caller?.id === userData?.id) return;
      setIncomingCall(call);
      setChatVisible(true);
    };
    socket.on('classroom:call', handleClassroomCall);
    return () => socket.off('classroom:call', handleClassroomCall);
  }, [socket, setChatVisible, userData?.id]);

  useEffect(() => {
    const refreshNow = () => setNow(Date.now());
    const timeout = setTimeout(refreshNow, 0);
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  const handleSend = async (textOverride) => {
    const text = (textOverride || input).trim();
    if (!text || !messagesId || sending) return;
    setSending(true);
    setInput('');
    if (editingMessage) {
      await editMessage(messagesId, editingMessage.id, text);
      setEditingMessage(null);
    } else {
      await sendMessage(messagesId, userData.id, text, replyTo);
      setReplyTo(null);
    }
    await updateChatPreview(messagesId, userData.id, chatUser?.id, text);
    setSending(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    if (!socket || !messagesId) return;
    socket.emit('thread:typing', { messageId: messagesId, typing: true });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('thread:typing', { messageId: messagesId, typing: false });
    }, 1200);
  };

  const startEdit = (msg) => {
    if (msg.deletedAt || msg.sId !== userData.id || !msg.text) return;
    setEditingMessage(msg);
    setReplyTo(null);
    setInput(msg.text);
  };

  const startReply = (msg) => {
    if (msg.deletedAt) return;
    setReplyTo({
      id: msg.id,
      text: msg.text || msg.attachment?.name || msg.kind || 'Message',
      senderName: msg.sId === userData.id ? 'You' : (chatUser.name || chatUser.username),
    });
    setEditingMessage(null);
  };

  const handleDelete = async (msg) => {
    if (msg.sId !== userData.id || !msg.id) return;
    await deleteMessage(messagesId, msg.id);
  };

  const handleReaction = async (msg, emoji) => {
    if (!msg.id || msg.deletedAt) return;
    await reactToMessage(messagesId, msg.id, emoji);
  };

  const handlePin = async (msg) => {
    if (!msg.id || msg.deletedAt) return;
    await pinMessage(messagesId, msg.id, !msg.pinned);
  };

  const handleFileSend = async (e) => {
    const file = e.target.files[0];
    if (!file || !messagesId) return;
    setSending(true);
    await sendFileMessage(messagesId, userData.id, file);
    await updateChatPreview(messagesId, userData.id, chatUser?.id, file.name);
    setSending(false);
    e.target.value = '';
  };

  const loadSuggestions = async () => {
    const data = await getSmartSuggestions(input, chatUser?.name || chatUser?.username || 'chat');
    setSuggestions(data.suggestions || []);
    setAssistantReply(data.assistantReply || '');
  };

  const startMeeting = async (media, customRoomId = null) => {
    const targetRoomId = customRoomId || (messagesId ? `dm-${messagesId}` : `lobby-${userData.id}`);
    if (!targetRoomId) return;
    const constraints = {
      audio: true,
      video: media === 'video',
    };
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      cameraStreamRef.current = stream;
      setLocalStream(stream);
      setRemoteStreams({});
      setRecordingUrl('');
      closePeerConnection();
      setMeeting({ media, roomId: targetRoomId, muted: false, cameraOff: media !== 'video', connectionState: 'waiting', participants: 1, limit: 5, sharingScreen: false });
      const nextStatus = targetRoomId.startsWith('class-') ? 'class' : 'busy';
      await updateStatus(nextStatus);
      await loadUserData();
      socket?.emit('call:join', { roomId: targetRoomId, messageId: messagesId || null, media });
      if (messagesId) {
        await sendMessage(
          messagesId,
          userData.id,
          `${media === 'video' ? 'Video meeting' : 'Voice call'} is live. Join room ${targetRoomId}.`
        );
      }
    } catch {
      setMeeting({ media, roomId: targetRoomId, muted: false, cameraOff: media !== 'video', blocked: true });
    }
  };

  useEffect(() => {
    const handleRoomLaunch = (event) => {
      const { roomId: launchRoomId, media = 'video' } = event.detail || {};
      if (launchRoomId) {
        setChatVisible(true);
        startMeeting(media, launchRoomId);
      }
    };
    window.addEventListener('chatalap-start-room', handleRoomLaunch);
    return () => window.removeEventListener('chatalap-start-room', handleRoomLaunch);
  });

  const endMeeting = async () => {
    if (recording) stopRecording();
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    closePeerConnection();
    localStream?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    cameraStreamRef.current = null;
    setLocalStream(null);
    socket?.emit('call:leave', { roomId });
    setMeeting(null);
    await updateStatus('available');
    await loadUserData();
  };

  const toggleAudio = () => {
    localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    setMeeting((current) => current && { ...current, muted: !current.muted });
  };

  const toggleVideo = () => {
    if (meeting?.sharingScreen) return;
    localStream?.getVideoTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    setMeeting((current) => current && { ...current, cameraOff: !current.cameraOff });
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const messageStatus = (msg) => {
    if (msg.sId !== userData.id) return null;
    if (msg.seenAt) return 'Read';
    if (msg.deliveredAt) return 'Delivered';
    return 'Sent';
  };

  const isOnline = (lastseen) => {
    if (!lastseen) return false;
    return now - lastseen < 5 * 60 * 1000;
  };

  const renderAttachment = (msg) => {
    const file = msg.attachment;
    if (!file) return msg.image ? <img className='msg-img' src={msg.image} alt="shared" /> : null;
    if (file.type === 'image') return <img className='msg-img' src={file.url} alt={file.name || 'shared'} />;
    if (file.type === 'video') return <video className='msg-video' src={file.url} controls />;
    if (file.type === 'audio') return <audio className='msg-audio' src={file.url} controls />;
    return (
      <a className="file-bubble" href={file.url} download={file.name} target="_blank" rel="noreferrer">
        <FileText size={18} />
        <span>{file.name || 'Download file'}</span>
      </a>
    );
  };

  const visibleMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((msg) =>
      [msg.text, msg.attachment?.name, msg.replyTo?.text]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(q))
    );
  }, [messages, searchQuery]);

  const pinnedMessages = useMemo(
    () => messages.filter((msg) => msg.pinned && !msg.deletedAt).slice(-3),
    [messages]
  );

  const groupedReactions = (reactions = []) =>
    reactions.reduce((acc, reaction) => {
      acc[reaction.emoji] = (acc[reaction.emoji] || 0) + 1;
      return acc;
    }, {});

  const activeFiles = messages.filter((msg) => msg.attachment || msg.image).length;
  const remoteEntries = Object.entries(remoteStreams);
  const hasRemotePeers = remoteEntries.length > 0;
  const participantCount = meeting ? Math.min((meeting.participants || 1), 5) : 0;

  const replaceOutgoingVideoTrack = (track) => {
    peerConnectionsRef.current.forEach((peerConnection) => {
      const sender = peerConnection.getSenders().find((item) => item.track?.kind === 'video');
      if (sender) sender.replaceTrack(track);
    });
  };

  const startScreenShare = async () => {
    if (!meeting || meeting.media !== 'video' || !navigator.mediaDevices.getDisplayMedia) return;
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const [screenTrack] = screenStream.getVideoTracks();
    screenStreamRef.current = screenStream;
    replaceOutgoingVideoTrack(screenTrack);
    const mixedLocal = new MediaStream([
      screenTrack,
      ...(localStreamRef.current?.getAudioTracks() || []),
    ]);
    setLocalStream(mixedLocal);
    setMeeting((current) => current && { ...current, sharingScreen: true, cameraOff: false });
    screenTrack.onended = () => stopScreenShare();
  };

  const stopScreenShare = () => {
    const cameraTrack = cameraStreamRef.current?.getVideoTracks()?.[0];
    if (cameraTrack) replaceOutgoingVideoTrack(cameraTrack);
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    if (cameraStreamRef.current) setLocalStream(cameraStreamRef.current);
    setMeeting((current) => current && { ...current, sharingScreen: false });
  };

  const startRecording = () => {
    if (!localStreamRef.current || recording) return;
    const mixedStream = new MediaStream([
      ...localStreamRef.current.getTracks(),
      ...Object.values(remoteStreams).flatMap((stream) => stream.getTracks()),
    ]);
    recordingChunksRef.current = [];
    const recorder = new MediaRecorder(
      mixedStream,
      MediaRecorder.isTypeSupported('video/webm') ? { mimeType: 'video/webm' } : undefined
    );
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordingChunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(recordingChunksRef.current, { type: 'video/webm' });
      setRecordingUrl(URL.createObjectURL(blob));
      setRecording(false);
    };
    mediaRecorderRef.current = recorder;
    recorder.start(1000);
    setRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
  };

  const acceptIncomingCall = () => {
    if (!incomingCall) return;
    const call = incomingCall;
    setIncomingCall(null);
    setChatVisible(true);
    startMeeting(call.media, call.roomId);
  };

  const incomingCallBanner = incomingCall && (
    <div className="incoming-call">
      <div>
        <strong>{incomingCall.media === 'video' ? 'Class video call' : 'Class voice call'}</strong>
        <span>
          {incomingCall.caller?.name || incomingCall.caller?.username || 'Class admin'} is calling in {incomingCall.title}
        </span>
      </div>
      <button type="button" onClick={acceptIncomingCall}>
        {incomingCall.media === 'video' ? <Video size={16} /> : <Phone size={16} />}
        Join
      </button>
      <button type="button" className="ghost" onClick={() => setIncomingCall(null)}>Ignore</button>
    </div>
  );

  const renderCallStage = (emptyText) => (
    <>
      <div className="call-stage multi-call-stage">
        <div className="video-tile local-tile">
          {meeting?.media === 'video' ? (
            <video ref={localVideoRef} className="remote-video" muted autoPlay playsInline />
          ) : (
            <div className="voice-avatar"><Mic size={24} /><span>You</span></div>
          )}
          <span className="tile-name">{meeting?.sharingScreen ? 'Your screen' : 'You'}</span>
        </div>
        {remoteEntries.map(([peerSocketId, stream]) => (
          <div className="video-tile" key={peerSocketId}>
            <video
              ref={(node) => {
                if (node) {
                  remoteVideoRefs.current[peerSocketId] = node;
                  node.srcObject = stream;
                }
              }}
              className="remote-video"
              autoPlay
              playsInline
            />
            <span className="tile-name">Participant</span>
          </div>
        ))}
        {!hasRemotePeers && (
          <div className="video-tile waiting-tile">
            <span>{emptyText}</span>
          </div>
        )}
      </div>
      <div className="call-meta">
        <span>{participantCount}/5 participants</span>
        {recordingUrl && (
          <a href={recordingUrl} download="chatalap-recording.webm">
            <Download size={14} /> Recording
          </a>
        )}
      </div>
    </>
  );

  if (!chatVisible || !chatUser) {
    return (
      <div className='chat-box chat-box-empty'>
        {incomingCallBanner}
        {meeting && (
          <div className="meeting-strip dashboard-meeting">
            <div>
              <strong>{meeting.media === 'video' ? 'Instant video room' : 'Instant voice room'}</strong>
              <span>
                {meeting.blocked
                  ? 'Camera or microphone permission is blocked'
                  : `${meeting.roomId} | ${hasRemotePeers ? 'Connected' : meeting.connectionState || 'Waiting for peer'}`}
              </span>
            </div>
            {renderCallStage('Share this room code with up to 4 more signed-in users')}
            <div className="call-controls">
              <button type="button" onClick={toggleAudio}><Mic size={16} />{meeting.muted ? 'Unmute' : 'Mute'}</button>
              {meeting.media === 'video' && <button type="button" onClick={toggleVideo}><Video size={16} />{meeting.cameraOff ? 'Camera on' : 'Camera off'}</button>}
              {meeting.media === 'video' && <button type="button" onClick={meeting.sharingScreen ? stopScreenShare : startScreenShare}><MonitorUp size={16} />{meeting.sharingScreen ? 'Stop share' : 'Share screen'}</button>}
              <button type="button" onClick={recording ? stopRecording : startRecording}><Square size={16} />{recording ? 'Stop rec' : 'Record'}</button>
              <button type="button" className="danger" onClick={endMeeting}>End</button>
            </div>
          </div>
        )}
        <div className="workspace-home">
          <div className="home-hero">
            <div className="home-logo">
              <img src={assets.ChatAlap_logo2} alt="logo" />
            </div>
            <div>
              <span className="home-kicker">{socketReady ? 'Realtime network online' : 'Realtime network connecting'}</span>
              <h2>ChatAlap workspace</h2>
              <p>Chats, live rooms, classes, AI suggestions, and media sharing in one place.</p>
            </div>
          </div>

          <div className="home-stats">
            <div><strong>{chatData?.length || 0}</strong><span>Conversations</span></div>
            <div><strong>{userData?.status || 'available'}</strong><span>Status</span></div>
            <div><strong>{activeFiles}</strong><span>Shared files</span></div>
          </div>

          <div className="instant-room">
            <div>
              <Radio size={18} />
              <strong>Instant live room</strong>
            </div>
            <input
              value={instantRoomInput}
              onChange={(e) => setInstantRoomInput(e.target.value)}
              placeholder={dashboardRoomId}
            />
            <button type="button" onClick={() => startMeeting('audio', dashboardRoomId)}><Phone size={16} />Voice</button>
            <button type="button" onClick={() => startMeeting('video', dashboardRoomId)}><Video size={16} />Video</button>
          </div>

          <div className="feature-board">
            <div><Users size={21} /><strong>Community</strong><span>Public and private classroom spaces</span></div>
            <div><Video size={21} /><strong>Meetings</strong><span>Voice and video rooms with live presence</span></div>
            <div><FolderOpen size={21} /><strong>Media Vault</strong><span>Image, audio, video, PDF, and file sharing</span></div>
            <div><Sparkles size={21} /><strong>AI Assist</strong><span>Smart reply and conversation prompts</span></div>
            <div><GraduationCap size={21} /><strong>Classes</strong><span>Room chat for lessons and cohorts</span></div>
            <div><ShieldCheck size={21} /><strong>Control</strong><span>Status, read receipts, pins, edits, and deletes</span></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='chat-box'>
      {incomingCallBanner}
      <div className="chat-user">
        <img src={chatUser.avatar || assets.avatar_icon} alt="avatar" />
        <div className="chat-title">
          <p>
            {chatUser.name || chatUser.username}
            {isOnline(chatUser.lastseen) && <img src={assets.green_dot} className='dot' alt="online" />}
          </p>
          <span>
            {socketReady ? 'Realtime connected' : 'Syncing'}
            {chatUser.status ? ` | ${chatUser.status}` : ''}
          </span>
        </div>
        <div className="call-actions">
          <div className="chat-search">
            <Search size={14} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search"
            />
          </div>
          <button type="button" title="Voice call" onClick={() => startMeeting('audio')}><Phone size={18} /></button>
          <button type="button" title="Video meeting" onClick={() => startMeeting('video')}><Video size={18} /></button>
          <button type="button" title="AI suggestions" onClick={loadSuggestions}><Sparkles size={18} /></button>
        </div>
        <button className="back-btn" onClick={() => setChatVisible(false)}><X size={18} /></button>
      </div>

      {meeting && (
        <div className="meeting-strip">
          <div>
            <strong>{meeting.media === 'video' ? 'Live video room' : 'Live voice room'}</strong>
            <span>
              {meeting.blocked
                ? 'Camera or microphone permission is blocked'
                : `${roomId} | ${hasRemotePeers ? 'Connected' : meeting.connectionState || 'Waiting for peer'}`}
            </span>
          </div>
          {renderCallStage('Waiting for classmates or chat partner to join')}
          <div className="call-controls">
            <button type="button" onClick={toggleAudio}><Mic size={16} />{meeting.muted ? 'Unmute' : 'Mute'}</button>
            {meeting.media === 'video' && <button type="button" onClick={toggleVideo}><Video size={16} />{meeting.cameraOff ? 'Camera on' : 'Camera off'}</button>}
            {meeting.media === 'video' && <button type="button" onClick={meeting.sharingScreen ? stopScreenShare : startScreenShare}><MonitorUp size={16} />{meeting.sharingScreen ? 'Stop share' : 'Share screen'}</button>}
            <button type="button" onClick={recording ? stopRecording : startRecording}><Square size={16} />{recording ? 'Stop rec' : 'Record'}</button>
            <button type="button" className="danger" onClick={endMeeting}>End</button>
          </div>
        </div>
      )}

      {pinnedMessages.length > 0 && (
        <div className="pinned-bar">
          <Pin size={14} />
          <div>
            {pinnedMessages.map((msg) => (
              <span key={msg.id}>{msg.text || msg.attachment?.name || 'Pinned message'}</span>
            ))}
          </div>
        </div>
      )}

      {(suggestions.length > 0 || assistantReply) && (
        <div className="ai-panel">
          <div className="ai-panel-head"><Bot size={16} /> Smart assistant</div>
          {assistantReply && <p>{assistantReply}</p>}
          <div className="suggestion-row">
            {suggestions.map((item) => (
              <button key={item} type="button" onClick={() => handleSend(item)}>{item}</button>
            ))}
          </div>
        </div>
      )}

      <div className="chat-msg">
        {visibleMessages.map((msg, idx) => {
          const isMine = msg.sId === userData.id;
          const status = messageStatus(msg);
          const reactionCounts = groupedReactions(msg.reactions);
          return (
            <div key={`${msg.createdAt}-${idx}`} className={isMine ? 's-msg' : 'r-msg'}>
              <div className="message-wrap">
                {msg.replyTo?.text && (
                  <div className="reply-preview">
                    <strong>{msg.replyTo.senderName}</strong>
                    <span>{msg.replyTo.text}</span>
                  </div>
                )}
                {msg.attachment || msg.image ? renderAttachment(msg) : <p className={`msg ${msg.deletedAt ? 'deleted-msg' : ''}`}>{msg.text}</p>}
                {msg.editedAt && !msg.deletedAt && <span className="edited-label">edited</span>}
                {Object.keys(reactionCounts).length > 0 && (
                  <div className="reaction-row">
                    {Object.entries(reactionCounts).map(([emoji, count]) => (
                      <button key={emoji} type="button" onClick={() => handleReaction(msg, emoji)}>
                        {emoji} {count}
                      </button>
                    ))}
                  </div>
                )}
                {!msg.deletedAt && (
                  <div className="message-actions">
                    {['👍', '❤️', '😂'].map((emoji) => (
                      <button key={emoji} type="button" onClick={() => handleReaction(msg, emoji)}>{emoji}</button>
                    ))}
                    <button type="button" title="Reply" onClick={() => startReply(msg)}><Reply size={13} /></button>
                    <button type="button" title={msg.pinned ? 'Unpin' : 'Pin'} onClick={() => handlePin(msg)}><Pin size={13} /></button>
                    {isMine && msg.text && <button type="button" title="Edit" onClick={() => startEdit(msg)}><Edit3 size={13} /></button>}
                    {isMine && <button type="button" title="Delete" onClick={() => handleDelete(msg)}><Trash2 size={13} /></button>}
                  </div>
                )}
              </div>
              <div>
                <img
                  src={isMine
                    ? userData.avatar || assets.avatar_icon
                    : chatUser.avatar || assets.avatar_icon}
                  alt="avatar"
                />
                <p>{formatTime(msg.createdAt)}</p>
                {status && <span className="msg-status"><CheckCheck size={11} />{status}</span>}
              </div>
            </div>
          );
        })}
        {typingUsers?.[messagesId] && typingUsers[messagesId]?.id !== userData.id && (
          <div className="typing-indicator">{typingUsers[messagesId].name} is typing...</div>
        )}
        <div ref={bottomRef} />
      </div>

      {(replyTo || editingMessage) && (
        <div className="composer-context">
          <div>
            <strong>{editingMessage ? 'Editing message' : `Replying to ${replyTo.senderName}`}</strong>
            <span>{editingMessage?.text || replyTo?.text}</span>
          </div>
          <button type="button" onClick={() => {
            setReplyTo(null);
            setEditingMessage(null);
            setInput('');
          }}><X size={16} /></button>
        </div>
      )}

      <div className="chat-input">
        <input
          type="text"
          placeholder='Send a message...'
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          disabled={sending}
        />
        <input
          type="file"
          id='attachment'
          accept='image/*,video/*,audio/*,application/pdf'
          hidden
          onChange={handleFileSend}
        />
        <label htmlFor="attachment" title="Attach image, video, audio, or PDF">
          <Paperclip size={22} />
        </label>
        <button type="button" onClick={() => handleSend()} disabled={sending} title="Send message">
          <Send size={20} />
        </button>
      </div>
    </div>
  )
}

export default ChatBox
