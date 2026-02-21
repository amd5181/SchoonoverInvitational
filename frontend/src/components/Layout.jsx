import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Home, Users, BarChart2, BookOpen, Settings, UserCog, Trophy, LogIn } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { useAuth } from '../App';
import { useState } from 'react';
import ProfileModal from './ProfileModal';
import AuthModal from './AuthModal';

const NAV_ITEMS = [
  { path: '/home',        icon: Home,     label: 'Home' },
  { path: '/teams',       icon: Users,    label: 'My Teams' },
  { path: '/leaderboard', icon: BarChart2, label: 'Leaderboard' },
  { path: '/legacy',      icon: Trophy,   label: 'Hall of Fame' },
  { path: '/rules',       icon: BookOpen, label: 'Rules' },
];

export default function Layout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  const allItems = user?.is_admin
    ? [...NAV_ITEMS, { path: '/admin', icon: Settings, label: 'Admin' }]
    : NAV_ITEMS;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-background pt-16">

        <header className="fixed top-0 left-0 right-0 z-50 glass shadow-sm h-16 flex items-center px-3 md:px-6" data-testid="top-nav">

          <div className="flex items-center gap-2 cursor-pointer flex-shrink-0" onClick={() => navigate('/home')}>
            <img
              src="https://res.cloudinary.com/dsvpfi9te/image/upload/v1771684811/ChatGPT_Image_Feb_21_2026_09_39_17_AM_arjiwr.png"
              alt="Schoonover Invitational"
              className="h-8 w-8 md:h-10 md:w-10 object-contain"
            />
            <div className="flex flex-col">
              <span className="font-heading font-bold text-sm md:text-lg tracking-tight text-[#1B4332] leading-tight">SCHOONOVER INVITATIONAL</span>
              <span className="text-[6px] md:text-[8px] font-bold text-[#0F172A] tracking-wider leading-none">MASTERS OF THE FOX VALLEY</span>
            </div>
          </div>

          <nav className="flex items-center gap-0.5 ml-auto">
            {allItems.map(item => {
              const active = location.pathname === item.path;
              return (
                <Tooltip key={item.path}>
                  <TooltipTrigger asChild>
                    <button
                      data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, '-')}`}
                      onClick={() => navigate(item.path)}
                      className={`flex items-center gap-1.5 px-2 md:px-3 py-2 rounded-lg transition-all ${
                        active ? 'bg-[#1B4332] text-white' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <item.icon className={`w-4 h-4 flex-shrink-0 ${active ? 'stroke-[2.5]' : ''}`} />
                      <span className="hidden md:inline text-sm font-medium">{item.label}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{item.label}</TooltipContent>
                </Tooltip>
              );
            })}

            <div className="w-px h-5 bg-slate-200 mx-1" />

            {user ? (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button data-testid="nav-profile" onClick={() => setProfileOpen(true)}
                      className="flex items-center gap-1.5 px-2 md:px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-all">
                      <UserCog className="w-4 h-4" />
                      <span className="hidden md:inline text-sm font-medium">{user.name?.split(' ')[0]}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Profile & Log Out</TooltipContent>
                </Tooltip>
              </>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button data-testid="nav-signin" onClick={() => setAuthOpen(true)}
                    className="flex items-center gap-1.5 px-2 md:px-3 py-2 rounded-lg bg-[#1B4332] text-white hover:bg-[#2D6A4F] transition-all">
                    <LogIn className="w-4 h-4" />
                    <span className="hidden md:inline text-sm font-medium">Sign In</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>Sign In / Create Account</TooltipContent>
              </Tooltip>
            )}
          </nav>
        </header>

        <main>
          <Outlet />
        </main>
      </div>

      {user && <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />}
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </TooltipProvider>
  );
}
