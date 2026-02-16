import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useClerk } from "@clerk/clerk-react";
import { useAuth } from "../AuthContext.jsx";
import { api } from "../api.js";
import { ButtonPrimary, StatusAlert } from "../components/ui.jsx";

export default function AccountPage() {
  const { user, logout } = useAuth();
  const { openUserProfile } = useClerk();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [status, setStatus] = useState("");

  const [deleteConfirm, setDeleteConfirm] = useState("");

  useEffect(() => {
    loadProfile();
    loadAvatar();
  }, []);

  async function loadProfile() {
    try {
      const { data } = await api.getProfile();
      setProfile(data);
      setUsername(data.username);
    } catch {
      setStatus("Failed to load profile");
    }
  }

  async function loadAvatar() {
    try {
      const response = await api.getProfilePicture();
      setAvatarUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(response.data);
      });
    } catch {
      setAvatarUrl(null);
    }
  }

  async function updateProfile() {
    try {
      const { data } = await api.updateProfile({ username });
      setProfile(data);
      setStatus("Profile updated.");
    } catch (error) {
      setStatus(error?.response?.data?.message || "Update failed");
    }
  }

  async function uploadAvatar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      await api.uploadProfilePicture(formData);
      await loadAvatar();
      setStatus("Profile picture updated.");
    } catch (error) {
      setStatus(error?.response?.data?.message || "Upload failed");
    }
  }

  async function removeAvatar() {
    try {
      await api.deleteProfilePicture();
      setAvatarUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setStatus("Profile picture removed.");
    } catch (error) {
      setStatus(error?.response?.data?.message || "Failed to remove profile picture");
    }
  }

  async function deleteAccount() {
    if (deleteConfirm !== "DELETE") {
      setStatus("Type DELETE to confirm account deletion");
      return;
    }
    try {
      await api.deleteAccount();
      logout();
      navigate("/login");
    } catch (error) {
      setStatus(error?.response?.data?.message || "Failed to delete account");
    }
  }

  return (
    <div className="space-y-10 max-w-2xl">
      {/* Header */}
      <div>
        <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-neon mb-2">SETTINGS</p>
        <h1 className="text-4xl md:text-5xl font-sans font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Account
        </h1>
      </div>

      {/* Profile Section */}
      <div className="glass-panel rounded-2xl p-6 space-y-6">
        <p className="font-mono text-[10px] tracking-[0.3em] uppercase" style={{ color: "var(--text-muted)" }}>PROFILE</p>

        <div className="flex items-center gap-5">
          <div className="relative">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Profile" className="w-20 h-20 rounded-full object-cover border" style={{ borderColor: "var(--glass-border)" }} />
            ) : (
              <div className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-sans font-bold" style={{ background: "var(--glass-bg)", color: "var(--text-primary)", border: "1px solid var(--glass-border)" }}>
                {user?.username?.[0]?.toUpperCase() || "?"}
              </div>
            )}
            <label className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition border" style={{ background: "var(--bg-surface)", borderColor: "var(--glass-border)" }}>
              <span className="text-xs" style={{ color: "var(--text-primary)" }}>+</span>
              <input type="file" accept="image/*" onChange={uploadAvatar} className="hidden" />
            </label>
          </div>
          <div>
            <p className="font-sans font-semibold" style={{ color: "var(--text-primary)" }}>{profile?.username || user?.username}</p>
            <p className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>{profile?.email || user?.email}</p>
            <p className="font-mono text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
              Member since {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : "--"}
            </p>
            {avatarUrl && (
              <button type="button" onClick={removeAvatar} className="mt-2 font-mono text-[10px] tracking-wider text-rose-400 hover:text-rose-300 transition">
                REMOVE PICTURE
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-[0.3em] mb-1.5" style={{ color: "var(--text-muted)" }}>USERNAME</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} className="input-void w-full" />
          </div>
          <ButtonPrimary onClick={updateProfile}>Save Changes</ButtonPrimary>
          <StatusAlert text={status} variant="info" />
        </div>
      </div>

      {/* Security — managed by Clerk */}
      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <p className="font-mono text-[10px] tracking-[0.3em] uppercase" style={{ color: "var(--text-muted)" }}>SECURITY</p>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Password, email, and two-factor authentication are managed securely by Clerk.
        </p>
        <ButtonPrimary onClick={() => openUserProfile()}>Manage Security Settings</ButtonPrimary>
      </div>

      {/* Danger Zone */}
      <div className="glass-panel rounded-2xl p-6 border-rose-500/20 space-y-4">
        <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-rose-400">DANGER ZONE</p>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Deleting your account removes all runs, certificates, and data permanently.
        </p>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-[10px] font-mono uppercase tracking-[0.3em] mb-1.5" style={{ color: "var(--text-muted)" }}>TYPE DELETE TO CONFIRM</label>
            <input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder="DELETE" className="input-void w-full border-rose-500/20 focus:border-rose-500 focus:ring-rose-500/30" />
          </div>
          <button
            type="button"
            onClick={deleteAccount}
            disabled={deleteConfirm !== "DELETE"}
            className="font-mono text-[10px] tracking-wider text-rose-400 hover:text-rose-300 transition px-4 py-2.5 rounded-lg border border-rose-500/20 hover:border-rose-500/40 disabled:opacity-30"
          >
            DELETE ACCOUNT
          </button>
        </div>
      </div>
    </div>
  );
}
