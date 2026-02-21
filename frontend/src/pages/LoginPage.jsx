import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import axios from 'axios';
import { API, useAuth } from '../App';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../components/ui/input-otp';
import { Trophy, UserPlus, LogIn } from 'lucide-react';

export default function LoginPage() {
  const [mode, setMode] = useState('login');
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async () => {
    if (pin.length !== 4) { toast.error('Enter your 4-digit PIN'); return; }
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/auth/login`, { pin });
      login(data);
      toast.success(`Welcome back, ${data.name}!`);
      navigate('/home');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Invalid PIN');
    } finally { setLoading(false); }
  };

  const handleRegister = async () => {
    if (!name.trim()) { toast.error('Enter your name'); return; }
    if (!email.trim()) { toast.error('Enter your email'); return; }
    if (pin.length !== 4) { toast.error('Enter a 4-digit PIN'); return; }
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/auth/register`, { name: name.trim(), email: email.trim(), pin });
      login(data);
      toast.success(`Welcome to Schoonover Invitational, ${data.name}!`);
      navigate('/home');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Registration failed');
    } finally { setLoading(false); }
  };

  const handlePinChange = (val) => {
    setPin(val);
  };

  const handlePinComplete = (val) => {
    if (val.length === 4 && mode === 'login') {
      setPin(val);
      setTimeout(() => handleLogin(), 100);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-[#1B4332] to-[#081C15] relative overflow-hidden">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-[#CCFF00] blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full bg-[#2D6A4F] blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-sm animate-scale-in">
        <div className="text-center mb-8">
          <div className="mb-4">
            <img 
              src="https://images.vexels.com/media/users/3/134963/isolated/preview/7521d9cc865d48ec2dfb2a8a6286c13e-bridge-circle-icon-03.png" 
              alt="Schoonover Invitational" 
              className="w-40 h-40 mx-auto object-contain"
              data-testid="login-logo"
            />
          </div>
          <h1 className="font-heading font-extrabold text-4xl text-white tracking-tight" data-testid="app-title">
            SCHOONOVER INVITATIONAL
          </h1>
          <p className="text-[#CCFF00] mt-2 text-sm font-bold tracking-wider">MASTERS OF THE FOX VALLEY</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-6 space-y-5">
          <div className="flex bg-slate-100 rounded-lg p-1 gap-1">
            <button data-testid="login-tab"
              onClick={() => { setMode('login'); setPin(''); }}
              className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${mode === 'login' ? 'bg-[#1B4332] text-white shadow-sm' : 'text-slate-500'}`}>
              <LogIn className="w-4 h-4 inline mr-1.5 -mt-0.5" />Sign In
            </button>
            <button data-testid="register-tab"
              onClick={() => { setMode('register'); setPin(''); }}
              className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${mode === 'register' ? 'bg-[#1B4332] text-white shadow-sm' : 'text-slate-500'}`}>
              <UserPlus className="w-4 h-4 inline mr-1.5 -mt-0.5" />Create Account
            </button>
          </div>

          {mode === 'register' && (
            <div className="space-y-3 animate-fade-in">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Full Name</label>
                <Input data-testid="register-name" value={name} onChange={e => setName(e.target.value)}
                  placeholder="John Smith" className="h-11 bg-slate-50 border-slate-200 focus:border-[#1B4332]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Email</label>
                <Input data-testid="register-email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="john@example.com" className="h-11 bg-slate-50 border-slate-200 focus:border-[#1B4332]" />
              </div>
            </div>
          )}

          <div className="text-center">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 block">
              {mode === 'login' ? 'Enter Your PIN' : 'Choose a 4-Digit PIN'}
            </label>
            <div className="flex justify-center" data-testid="pin-input">
              <InputOTP maxLength={4} value={pin} onChange={handlePinChange} onComplete={handlePinComplete}>
                <InputOTPGroup className="gap-3">
                  {[0,1,2,3].map(i => (
                    <InputOTPSlot key={i} index={i}
                      className="w-14 h-14 text-2xl font-bold font-heading border-2 border-slate-200 rounded-xl focus:border-[#1B4332] focus:ring-2 focus:ring-[#1B4332]/20" />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>

          <Button data-testid="auth-submit" className="w-full h-12 bg-[#1B4332] hover:bg-[#2D6A4F] text-white font-bold uppercase tracking-wider rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
            onClick={mode === 'login' ? handleLogin : handleRegister} disabled={loading}>
            {loading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </Button>
        </div>
      </div>
    </div>
  );
}
