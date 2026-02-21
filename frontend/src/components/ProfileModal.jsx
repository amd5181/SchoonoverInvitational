import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import axios from 'axios';
import { API, useAuth } from '../App';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../components/ui/input-otp';

export default function ProfileModal({ open, onClose }) {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user && open) {
      setName(user.name || '');
      setEmail(user.email || '');
      setPin(user.pin || '');
    }
  }, [user, open]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (!email.trim()) { toast.error('Email is required'); return; }
    if (pin.length !== 4) { toast.error('PIN must be 4 digits'); return; }
    setSaving(true);
    try {
      const { data } = await axios.put(`${API}/auth/profile/${user.id}`, { name: name.trim(), email: email.trim(), pin });
      updateUser(data);
      toast.success('Profile updated!');
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Update failed');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" data-testid="profile-modal">
        <DialogHeader>
          <DialogTitle className="font-heading font-bold text-xl">Edit Profile</DialogTitle>
          <DialogDescription>Update your name, email, or PIN. Changes to email and PIN must be unique.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Full Name</label>
            <Input data-testid="profile-name" value={name} onChange={e => setName(e.target.value)}
              className="h-11 bg-slate-50 focus:border-[#1B4332]" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Email</label>
            <Input data-testid="profile-email" type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="h-11 bg-slate-50 focus:border-[#1B4332]" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">PIN</label>
            <div className="flex justify-center" data-testid="profile-pin">
              <InputOTP maxLength={4} value={pin} onChange={setPin}>
                <InputOTPGroup className="gap-3">
                  {[0,1,2,3].map(i => (
                    <InputOTPSlot key={i} index={i}
                      className="w-12 h-12 text-xl font-bold font-heading border-2 border-slate-200 rounded-xl" />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>
          <Button data-testid="profile-save" className="w-full h-11 bg-[#1B4332] hover:bg-[#2D6A4F] text-white font-bold uppercase tracking-wider rounded-xl"
            onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
          <div className="border-t border-slate-100 pt-3 mt-1">
            <button
              onClick={() => { logout(); navigate('/home'); onClose(); }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-red-500 hover:bg-red-50 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Log Out
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
