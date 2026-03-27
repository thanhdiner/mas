"use client";

import { useEffect, useState, useRef } from "react";
import {
  User,
  Mail,
  Save,
  Loader2,
  Shield,
  Key,
  CheckCircle,
  Calendar,
  AlertTriangle,
  Eye,
  EyeOff,
  Camera,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import type { UserProfile } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ProfilePage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile form
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Password visibility
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Avatar upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [deletingAvatar, setDeletingAvatar] = useState(false);
  const [optimisticAvatar, setOptimisticAvatar] = useState<string | null>(null);

  useEffect(() => {
    api.auth
      .me()
      .then((u) => {
        setUser(u);
        setFullName(u.full_name || "");
        setEmail(u.email);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);

    try {
      const updated = await api.auth.updateProfile({
        full_name: fullName,
        email,
      });
      setUser(updated);
      setProfileMsg({ type: "success", text: "Profile updated successfully" });
    } catch (err: any) {
      setProfileMsg({
        type: "error",
        text: err.message || "Failed to update profile",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: "error", text: "New passwords do not match" });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMsg({
        type: "error",
        text: "Password must be at least 6 characters",
      });
      return;
    }

    setSavingPassword(true);
    try {
      await api.auth.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPasswordMsg({
        type: "success",
        text: "Password changed successfully",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPasswordMsg({
        type: "error",
        text: err.message || "Failed to change password",
      });
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <div
        className="flex items-center justify-center py-20 text-sm"
        style={{ color: "var(--on-surface-dim)" }}
      >
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading profile...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-20">
        <p className="text-lg font-heading font-medium mb-4">
          Could not load profile
        </p>
      </div>
    );
  }

  const initials = (user.full_name || user.email)
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    setOptimisticAvatar(objectUrl);
    setUploadingAvatar(true);
    setProfileMsg(null);
    try {
      const updated = await api.auth.uploadAvatar(file);
      setUser(updated);
      setProfileMsg({ type: "success", text: "Avatar updated successfully" });
    } catch (err: any) {
      setProfileMsg({ type: "error", text: err.message || "Failed to upload avatar" });
      setOptimisticAvatar(null); // Revert on failure
    } finally {
      setUploadingAvatar(false);
      URL.revokeObjectURL(objectUrl);
      setOptimisticAvatar(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteAvatar = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user?.avatar_url) return;
    
    setDeletingAvatar(true);
    setProfileMsg(null);
    try {
      const updated = await api.auth.deleteAvatar();
      setUser(updated);
      setProfileMsg({ type: "success", text: "Avatar removed successfully" });
    } catch (err: any) {
      setProfileMsg({ type: "error", text: err.message || "Failed to remove avatar" });
    } finally {
      setDeletingAvatar(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Profile"
        description="Manage your account settings and security"
      />

      <div className="max-w-3xl space-y-6">
        {/* User Card */}
        <div
          className="relative rounded-2xl p-6 overflow-hidden"
          style={{ background: "var(--surface-container)" }}
        >
          <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-br from-[#7bd0ff]/20 via-[#008abb]/10 to-transparent" />

          <div className="relative flex items-center gap-5">
            {/* Avatar */}
            <div className="relative group shrink-0">
              {(optimisticAvatar || user.avatar_url) ? (
                <>
                  <img
                    src={optimisticAvatar || user.avatar_url!}
                    alt="Avatar"
                    className={`w-20 h-20 rounded-2xl object-cover shadow-lg ${(uploadingAvatar || deletingAvatar) ? "opacity-50" : ""}`}
                  />
                  {!uploadingAvatar && !deletingAvatar && (
                    <button
                      type="button"
                      onClick={handleDeleteAvatar}
                      className="absolute -top-2 -right-2 bg-[#ffb4ab] hover:bg-[#ff897d] text-[#93000a] rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all z-10 shadow-sm"
                      title="Remove avatar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              ) : (
                <div className={`w-20 h-20 rounded-2xl gradient-primary flex items-center justify-center text-2xl font-heading font-bold text-[#060e20] shadow-lg ${(uploadingAvatar || deletingAvatar) ? "opacity-50" : ""}`}>
                  {initials}
                </div>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar || deletingAvatar}
                className="absolute inset-0 rounded-2xl flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                {(uploadingAvatar || deletingAvatar) ? (
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                ) : (
                  <Camera className="w-5 h-5 text-white" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-heading font-semibold text-foreground truncate">
                {user.full_name || "No name set"}
              </h2>
              <p
                className="text-sm mt-0.5 flex items-center gap-1.5"
                style={{ color: "var(--on-surface-dim)" }}
              >
                <Mail className="w-3.5 h-3.5" />
                {user.email}
              </p>
              <div className="flex items-center gap-4 mt-2">
                <span
                  className="text-[11px] flex items-center gap-1 px-2 py-0.5 rounded-full"
                  style={{
                    background: user.is_active
                      ? "rgba(78, 222, 163, 0.15)"
                      : "rgba(255, 180, 171, 0.15)",
                    color: user.is_active ? "#4edea3" : "#ffb4ab",
                  }}
                >
                  <Shield className="w-3 h-3" />
                  {user.is_active ? "Active" : "Inactive"}
                </span>
                <span
                  className="text-[11px] flex items-center gap-1"
                  style={{ color: "var(--on-surface-dim)" }}
                >
                  <Calendar className="w-3 h-3" />
                  Joined {new Date(user.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Profile Settings */}
        <div
          className="rounded-2xl p-6"
          style={{ background: "var(--surface-container)" }}
        >
          <h3 className="text-sm font-heading font-semibold text-foreground mb-5 flex items-center gap-2">
            <User className="w-4 h-4 text-accent-cyan" />
            Profile Information
          </h3>

          {profileMsg && (
            <div
              className={`mb-5 p-3 rounded-lg text-sm flex items-center gap-2 ${
                profileMsg.type === "success"
                  ? "text-[#4edea3]"
                  : "text-[#ffb4ab]"
              }`}
              style={{
                background:
                  profileMsg.type === "success"
                    ? "rgba(78, 222, 163, 0.1)"
                    : "rgba(255, 180, 171, 0.1)",
              }}
            >
              {profileMsg.type === "success" ? (
                <CheckCircle className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              {profileMsg.text}
            </div>
          )}

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label
                  htmlFor="fullName"
                  className="text-[11px] uppercase tracking-[0.05rem]"
                  style={{ color: "var(--on-surface-dim)" }}
                >
                  Full Name
                </Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your name"
                  className="bg-surface-lowest border-0 text-foreground h-11"
                />
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="profileEmail"
                  className="text-[11px] uppercase tracking-[0.05rem]"
                  style={{ color: "var(--on-surface-dim)" }}
                >
                  Email Address
                </Label>
                <Input
                  id="profileEmail"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="bg-surface-lowest border-0 text-foreground h-11"
                />
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={savingProfile}
                className="gradient-primary text-[#060e20] font-medium border-0 hover:opacity-90 px-6"
              >
                {savingProfile ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Changes
              </Button>
            </div>
          </form>
        </div>

        {/* Change Password */}
        <div
          className="rounded-2xl p-6"
          style={{ background: "var(--surface-container)" }}
        >
          <h3 className="text-sm font-heading font-semibold text-foreground mb-5 flex items-center gap-2">
            <Key className="w-4 h-4 text-accent-cyan" />
            Change Password
          </h3>

          {passwordMsg && (
            <div
              className={`mb-5 p-3 rounded-lg text-sm flex items-center gap-2 ${
                passwordMsg.type === "success"
                  ? "text-[#4edea3]"
                  : "text-[#ffb4ab]"
              }`}
              style={{
                background:
                  passwordMsg.type === "success"
                    ? "rgba(78, 222, 163, 0.1)"
                    : "rgba(255, 180, 171, 0.1)",
              }}
            >
              {passwordMsg.type === "success" ? (
                <CheckCircle className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              {passwordMsg.text}
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label
                htmlFor="currentPwd"
                className="text-[11px] uppercase tracking-[0.05rem]"
                style={{ color: "var(--on-surface-dim)" }}
              >
                Current Password
              </Label>
              <div className="relative max-w-md">
                <Input
                  id="currentPwd"
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="bg-surface-lowest border-0 text-foreground h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-dim hover:text-foreground transition-colors"
                >
                  {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label
                  htmlFor="newPwd"
                  className="text-[11px] uppercase tracking-[0.05rem]"
                  style={{ color: "var(--on-surface-dim)" }}
                >
                  New Password
                </Label>
                <div className="relative">
                  <Input
                    id="newPwd"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="bg-surface-lowest border-0 text-foreground h-11 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-dim hover:text-foreground transition-colors"
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="confirmPwd"
                  className="text-[11px] uppercase tracking-[0.05rem]"
                  style={{ color: "var(--on-surface-dim)" }}
                >
                  Confirm New Password
                </Label>
                <div className="relative">
                  <Input
                    id="confirmPwd"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="bg-surface-lowest border-0 text-foreground h-11 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-dim hover:text-foreground transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={savingPassword}
                className="bg-surface-high text-foreground font-medium border-0 hover:bg-surface-highest px-6"
              >
                {savingPassword ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Key className="w-4 h-4 mr-2" />
                )}
                Change Password
              </Button>
            </div>
          </form>
        </div>

        {/* Account Info */}
        <div
          className="rounded-2xl p-6"
          style={{ background: "var(--surface-container)" }}
        >
          <h3 className="text-sm font-heading font-semibold text-foreground mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-accent-cyan" />
            Account Details
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <InfoCard label="User ID" value={user.id} mono />
            <InfoCard
              label="Status"
              value={user.is_active ? "Active" : "Inactive"}
              color={user.is_active ? "#4edea3" : "#ffb4ab"}
            />
            <InfoCard
              label="Member Since"
              value={new Date(user.created_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            />
          </div>
        </div>
      </div>
    </>
  );
}

function InfoCard({
  label,
  value,
  mono,
  color,
}: {
  label: string;
  value: string;
  mono?: boolean;
  color?: string;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--surface-lowest)" }}
    >
      <p
        className="text-[10px] font-bold uppercase tracking-widest mb-1.5"
        style={{ color: "var(--on-surface-dim)" }}
      >
        {label}
      </p>
      <p
        className={`text-sm font-medium truncate ${mono ? "font-mono text-[11px]" : ""}`}
        style={{ color: color || "var(--foreground)" }}
      >
        {value}
      </p>
    </div>
  );
}
