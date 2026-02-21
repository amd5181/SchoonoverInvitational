import { useState } from 'react';
import { toast } from 'sonner';
import axios from 'axios';
import { API, useAuth } from '../App';
import { Dialog, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from './ui/input-otp';
import { LogIn, UserPlus } from 'lucide-react';

export default function AuthModal({ open, onClose, onSuccess, defaultMode = 'login' }) {
  const [mode, setMode] = useState(defaultMode);
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const reset = () => { setPin(''); setName(''); setEmail(''); setLoading(false); };

  const handleClose = () => { reset(); onClose(); };

  const handleLogin = async () => {
    if (pin.length !== 4) { toast.error('Enter your 4-digit PIN'); return; }
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/auth/login`, { pin });
      login(data);
      toast.success(`Welcome back, ${data.name}!`);
      reset();
      onSuccess?.(data);
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Invalid PIN');
    } finally { setLoading(false); }
  };

  const handleRegister = async () => {
    if (!name.trim()) { toast.error('Enter your name'); return; }
    if (!email.trim()) { toast.error('Enter your email'); return; }
    if (pin.length !== 4) { toast.error('Choose a 4-digit PIN'); return; }
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/auth/register`, { name: name.trim(), email: email.trim(), pin });
      login(data);
      toast.success(`Welcome to Schoonover Invitational, ${data.name}!`);
      reset();
      onSuccess?.(data);
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Registration failed');
    } finally { setLoading(false); }
  };

  const handlePinComplete = (val) => {
    if (val.length === 4 && mode === 'login') setTimeout(handleLogin, 100);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-sm p-0 overflow-hidden rounded-2xl">
        {/* Header */}
        <div className="bg-gradient-to-br from-[#1B4332] to-[#081C15] px-6 pt-6 pb-5 text-center">
          <img
            src="https://images.vexels.com/media/users/3/134963/isolated/preview/7521d9cc865d48ec2dfb2a8a6286c13e-bridge-circle-icon-03.png"
            alt="Schoonover Invitational"
            className="w-14 h-14 mx-auto mb-2 object-contain"
          />
          <h2 className="font-heading font-extrabold text-xl text-white tracking-tight">SCHOONOVER INVITATIONAL</h2>
          <p className="text-[#CCFF00] text-xs font-bold tracking-wider mt-0.5">MASTERS OF THE FOX VALLEY</p>
        </div>

        {/* Form */}
        <div className="p-6 space-y-4">
          {/* Tab switcher */}
          <div className="flex bg-slate-100 rounded-lg p-1 gap-1">
            <button onClick={() => { setMode('login'); setPin(''); }}
              className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${mode === 'login' ? 'bg-[#1B4332] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <LogIn className="w-4 h-4 inline mr-1.5 -mt-0.5" />Sign In
            </button>
            <button onClick={() => { setMode('register'); setPin(''); }}
              className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${mode === 'register' ? 'bg-[#1B4332] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <UserPlus className="w-4 h-4 inline mr-1.5 -mt-0.5" />Create Account
            </button>
          </div>

          {mode === 'register' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Full Name</label>
                <Input value={name} onChange={e => setName(e.target.value)}
                  placeholder="John Smith" className="h-11 bg-slate-50 border-slate-200" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Email</label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="john@example.com" className="h-11 bg-slate-50 border-slate-200" />
              </div>
            </div>
          )}

          <div className="text-center">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 block">
              {mode === 'login' ? 'Enter Your PIN' : 'Choose a 4-Digit PIN'}
            </label>
            <div className="flex justify-center">
              <InputOTP maxLength={4} value={pin} onChange={setPin} onComplete={handlePinComplete}>
                <InputOTPGroup className="gap-3">
                  {[0,1,2,3].map(i => (
                    <InputOTPSlot key={i} index={i}
                      className="w-12 h-12 text-xl font-bold font-heading border-2 border-slate-200 rounded-xl focus:border-[#1B4332]" />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>

          <Button onClick={mode === 'login' ? handleLogin : handleRegister} disabled={loading}
            className="w-full h-12 bg-[#1B4332] hover:bg-[#2D6A4F] text-white font-bold uppercase tracking-wider rounded-xl">
            {loading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Create Account & Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
