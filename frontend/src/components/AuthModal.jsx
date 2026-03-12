import { useState } from 'react';
import { toast } from 'sonner';
import axios from 'axios';
import { API, useAuth } from '../App';
import { Dialog, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ArrowRight, ArrowLeft } from 'lucide-react';

export default function AuthModal({ open, onClose, onSuccess }) {
  const [step, setStep] = useState(1); // 1 = email lookup, 2 = create account
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const reset = () => { setStep(1); setEmail(''); setName(''); setLoading(false); };
  const handleClose = () => { reset(); onClose(); };

  const handleEmailSubmit = async () => {
    const trimmed = email.trim();
    if (!trimmed) { toast.error('Enter your email'); return; }
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/auth/login`, { email: trimmed });
      login(data);
      toast.success(`Welcome back, ${data.name}!`);
      reset();
      onSuccess?.(data);
      onClose();
    } catch (e) {
      if (e.response?.status === 404) {
        setStep(2);
      } else {
        toast.error(e.response?.data?.detail || 'Something went wrong');
      }
    } finally { setLoading(false); }
  };

  const handleRegister = async () => {
    if (!name.trim()) { toast.error('Enter your full name'); return; }
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/auth/register`, { name: name.trim(), email: email.trim() });
      login(data);
      toast.success(`Welcome, ${data.name}!`);
      reset();
      onSuccess?.(data);
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Registration failed');
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-sm p-0 overflow-hidden rounded-2xl">
        {/* Header */}
        <div className="bg-gradient-to-br from-[#1B4332] to-[#081C15] px-6 pt-6 pb-5 text-center">
          <img
            src="https://res.cloudinary.com/dsvpfi9te/image/upload/v1771684811/ChatGPT_Image_Feb_21_2026_09_39_17_AM_arjiwr.png"
            alt="Schoonover Invitational"
            className="w-14 h-14 mx-auto mb-2 object-contain"
          />
          <h2 className="font-heading font-extrabold text-xl text-white tracking-tight">SCHOONOVER INVITATIONAL</h2>
          <p className="text-[#CCFF00] text-xs font-bold tracking-wider mt-0.5">MASTERS OF THE FOX VALLEY</p>
        </div>

        <div className="p-6 space-y-4">
          {step === 1 && (
            <>
              <p className="text-sm text-slate-500 text-center">Enter your email to sign in. If you don't have an account, we'll create one.</p>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleEmailSubmit()}
                  placeholder="john@example.com"
                  className="h-11 bg-slate-50 border-slate-200"
                />
              </div>
              <Button onClick={handleEmailSubmit} disabled={loading}
                className="w-full h-12 bg-[#1B4332] hover:bg-[#2D6A4F] text-white font-bold uppercase tracking-wider rounded-xl">
                {loading ? 'Checking...' : <span className="flex items-center justify-center gap-2">Continue <ArrowRight className="w-4 h-4" /></span>}
              </Button>
            </>
          )}

          {step === 2 && (
            <>
              <div className="text-center">
                <p className="text-sm text-slate-500">No account found for</p>
                <p className="text-sm text-[#1B4332] font-bold break-all">{email}</p>
                <p className="text-xs text-slate-400 mt-1">Enter your name to create an account.</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Full Name</label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleRegister()}
                  placeholder="John Smith"
                  className="h-11 bg-slate-50 border-slate-200"
                />
              </div>
              <Button onClick={handleRegister} disabled={loading}
                className="w-full h-12 bg-[#1B4332] hover:bg-[#2D6A4F] text-white font-bold uppercase tracking-wider rounded-xl">
                {loading ? 'Creating...' : 'Create Account'}
              </Button>
              <button onClick={() => setStep(1)}
                className="w-full text-xs text-slate-400 hover:text-slate-600 flex items-center justify-center gap-1 transition-colors">
                <ArrowLeft className="w-3 h-3" /> Use a different email
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
