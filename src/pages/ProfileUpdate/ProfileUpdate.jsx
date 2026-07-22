import React, { useContext, useEffect, useState } from 'react'
import './ProfileUpdate.css'
import assets from '../../assets/assets'
import { useNavigate } from 'react-router-dom'
import { AppContext } from '../../context/AppContext'
import { updateProfile } from '../../config/api'
import { toast } from 'react-toastify'
import { Camera, MessageSquare, ShieldCheck } from 'lucide-react'

const ProfileUpdate = () => {
  const navigate = useNavigate();
  const { userData, setUserData } = useContext(AppContext);
  const [image, setImage] = useState(null);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState('');

  useEffect(() => {
    if (!userData) return;
    const timeout = setTimeout(() => {
      setName(userData.name || '');
      setBio(userData.bio || 'Hey, There I am using ChatAlap');
      setPreview(userData.avatar || '');
    }, 0);
    return () => clearTimeout(timeout);
  }, [userData]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image too large. Please choose an image under 5MB.");
      return;
    }
    setImage(file);
    setPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setLoading(true);
    try {
      const updatedUser = await updateProfile(userData.id, name.trim(), bio.trim(), image || null);
      if (updatedUser) {
        setUserData(updatedUser);
        toast.success("Profile saved! Redirecting...");
        setTimeout(() => navigate('/Chat'), 1000);
      }
    } catch (err) {
      toast.error("Something went wrong: " + err.message);
    }
    setLoading(false);
  };

  return (
    <div className='profile'>
      <div className="profile-container">
        <form onSubmit={handleSubmit}>
          <div className="profile-heading">
            <p>Profile setup</p>
            <h3>Make your account recognizable</h3>
            <span>This name and photo appear in chats, calls, and classrooms.</span>
          </div>
          <label htmlFor="avatar">
            <input
              onChange={handleImageChange}
              type="file"
              id='avatar'
              accept='image/png, image/jpg, image/jpeg, image/webp'
              hidden
            />
            <img src={preview || assets.avatar_icon} alt="avatar" />
            <span><Camera size={16} /> Upload Profile Image</span>
          </label>
          <input
            type="text"
            placeholder='Your full name'
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <textarea
            placeholder='Write something about you...'
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
          />
          <button type='submit' disabled={loading}>
            {loading ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
        <aside className="profile-preview">
          <img className='profile-pic' src={preview || assets.ChatAlap_logo2} alt="preview" />
          <h4>{name || 'Your name'}</h4>
          <p>{bio || 'Your short profile bio will show here.'}</p>
          <div className="preview-list">
            <span><MessageSquare size={15} /> Realtime messaging</span>
            <span><ShieldCheck size={15} /> Private classroom identity</span>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default ProfileUpdate
