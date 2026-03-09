import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Home, Users, BarChart2, BookOpen, Settings, UserCog, Trophy, LogIn } from 'lucide-react';
import { useAuth } from '../App';
import { useState } from 'react';
import ProfileModal from './ProfileModal';
import AuthModal from './AuthModal';

const NAV_ITEMS = [
  { path: '/home',        icon: Home,      label: 'Home',         shortLabel: 'Home' },
  { path: '/teams',       icon: Users,     label: 'My Teams',     shortLabel: 'Teams' },
  { path: '/leaderboard', icon: BarChart2, label: 'Leaderboard',  shortLabel: 'Leaders' },
  { path: '/legacy',      icon: Trophy,    label: 'Hall of Fame', shortLabel: 'Legacy' },
  { path: '/rules',       icon: BookOpen,  label: 'Rules',        shortLabel: 'Rules' },
];

export default function Layout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  const allItems = user?.is_admin
    ? [...NAV_ITEMS, { path: '/admin', icon: Settings, label: 'Admin', shortLabel: 'Admin' }]
    : NAV_ITEMS;

  return (
    <>
      <div className="min-h-screen bg-background pt-16">
        <header className="fixed top-0 left-0 right-0 z-50 glass shadow-sm h-16 flex items-center" data-testid="top-nav">

          {/* Desktop (lg+): logo on left, nav items with text labels on right */}
          <div className="hidden lg:flex items-center w-full px-6">
            <div className="flex items-center gap-2 cursor-pointer flex-shrink-0" onClick={() => navigate('/home')}>
              <img
                src="https://res.cloudinary.com/dsvpfi9te/image/upload/v1771684811/ChatGPT_Image_Feb_21_2026_09_39_17_AM_arjiwr.png"
                alt="Schoonover Invitational"
                className="h-10 w-10 object-contain"
              />
              <div className="flex flex-col leading-none">
                <span className="text-[10px] font-bold text-[#0F172A] tracking-wider">MASTERS OF</span>
                <span className="text-[10px] font-bold text-[#0F172A] tracking-wider">THE FOX VALLEY</span>
              </div>
            </div>

            <nav className="flex items-center gap-0.5 ml-auto">
              {allItems.map(item => {
                const active = location.pathname === item.path;
                return (
                  <button
                    key={item.path}
                    data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, '-')}`}
                    onClick={() => navigate(item.path)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all whitespace-nowrap ${
                      active ? 'bg-[#1B4332] text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <item.icon className={`w-4 h-4 flex-shrink-0 ${active ? 'stroke-[2.5]' : ''}`} />
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                );
              })}

              <div className="w-px h-5 bg-slate-200 mx-1" />

              {user ? (
                <button
                  data-testid="nav-profile"
                  onClick={() => setProfileOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-all whitespace-nowrap"
                >
                  <UserCog className="w-4 h-4" />
                  <span className="text-sm font-medium">{user.name?.split(' ')[0]}</span>
                </button>
              ) : (
                <button
                  data-testid="nav-signin"
                  onClick={() => setAuthOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1B4332] text-white hover:bg-[#2D6A4F] transition-all whitespace-nowrap"
                >
                  <LogIn className="w-4 h-4" />
                  <span className="text-sm font-medium">Sign In</span>
                </button>
              )}
            </nav>
          </div>

          {/* Mobile (below lg): full-width, evenly spaced, icon + label stacked (ESPN-style) */}
          <nav className="flex lg:hidden items-center w-full h-full">
            {allItems.map(item => {
              const active = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, '-')}`}
                  onClick={() => navigate(item.path)}
                  className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-all ${
                    active ? 'text-[#1B4332]' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <item.icon className={`w-5 h-5 ${active ? 'stroke-[2.5]' : ''}`} />
                  <span className="text-[9px] font-medium leading-tight">{item.shortLabel}</span>
                </button>
              );
            })}

            {user ? (
              <button
                data-testid="nav-profile"
                onClick={() => setProfileOpen(true)}
                className="flex flex-col items-center justify-center flex-1 h-full gap-0.5 text-slate-400 hover:text-slate-600 transition-all"
              >
                <UserCog className="w-5 h-5" />
                <span className="text-[9px] font-medium leading-tight">{user.name?.split(' ')[0]}</span>
              </button>
            ) : (
              <button
                data-testid="nav-signin"
                onClick={() => setAuthOpen(true)}
                className="flex flex-col items-center justify-center flex-1 h-full gap-0.5 text-[#1B4332] transition-all"
              >
                <LogIn className="w-5 h-5" />
                <span className="text-[9px] font-medium leading-tight">Sign In</span>
              </button>
            )}
          </nav>

        </header>

        <main>
          <Outlet />
        </main>
      </div>

      {user && <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />}
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}
