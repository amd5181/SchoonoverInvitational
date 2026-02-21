import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API } from '../App';
import { Calendar, Users, Clock, ChevronRight, Loader2 } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import PaymentBanner from '../components/PaymentBanner';

function formatDate(dateStr) {
  if (!dateStr) return 'TBD';
  try { return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return 'TBD'; }
}

function formatDeadline(dateStr) {
  if (!dateStr) return 'TBD';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch { return 'TBD'; }
}

function getStatusBadge(status, deadline) {
  if (status === 'completed') return { text: 'Completed', cls: 'bg-slate-500 text-white' };
  if (status === 'prices_set') {
    if (deadline) { try { if (new Date() > new Date(deadline)) return { text: 'Locked', cls: 'bg-amber-500 text-white' }; } catch {} }
    return { text: 'Open', cls: 'bg-emerald-500 text-white' };
  }
  if (status === 'golfers_loaded') return { text: 'Setting Up', cls: 'bg-blue-500 text-white' };
  return { text: 'Coming Soon', cls: 'bg-slate-300 text-slate-700' };
}

export default function HomePage() {
  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    axios.get(`${API}/tournaments`)
      .then(r => {
        // Only show the Masters (slot 1)
        const masters = r.data.find(x => x.slot === 1) || { slot: 1, name: 'Masters', status: 'setup', team_count: 0, golfer_count: 0, start_date: '', end_date: '', deadline: '' };
        setTournament(masters);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-[60vh]">
      <Loader2 className="w-8 h-8 text-[#1B4332] animate-spin" />
    </div>
  );

  const t = tournament;
  const badge = t ? getStatusBadge(t.status, t.deadline) : { text: 'Coming Soon', cls: 'bg-slate-300 text-slate-700' };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto animate-fade-in-up">
      {/* Tournament */}
      <div className="mb-6">
        <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-[#0F172A] tracking-tight" data-testid="home-title">
          THE MASTERS
        </h1>
        <p className="text-slate-500 text-sm mt-1">One tournament. Infinite glory.</p>
      </div>

      <PaymentBanner />

      <div className="mt-4 mb-10" data-testid="tournament-grid">
        {t && (
          <div
            className="bg-white rounded-xl border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_24px_rgba(27,67,50,0.12)] transition-all duration-300 overflow-hidden group cursor-pointer max-w-md"
            data-testid="tournament-card-1"
            onClick={() => t.id ? navigate('/teams') : null}
          >
            <div className="h-2 bg-gradient-to-r from-[#1B4332] to-[#2D6A4F]" />
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className="font-heading font-bold text-xs text-slate-400 uppercase tracking-widest">Schoonover Invitational</span>
                  <h2 className="font-heading font-bold text-xl text-[#0F172A] mt-0.5">{t.name || 'Masters'}</h2>
                </div>
                <Badge className={badge.cls + ' text-xs font-bold'}>{badge.text}</Badge>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-slate-500">
                  <Calendar className="w-4 h-4 text-[#2D6A4F]" />
                  <span>{formatDate(t.start_date)} - {formatDate(t.end_date)}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <span>Deadline: <strong className="text-[#0F172A]">{formatDeadline(t.deadline)}</strong></span>
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                  <Users className="w-4 h-4 text-[#1B4332]" />
                  <span><strong className="text-[#0F172A] font-numbers">{t.team_count}</strong> teams entered</span>
                </div>
              </div>
              {t.id && t.has_prices && (
                <div className="mt-4 flex items-center text-[#1B4332] text-sm font-bold group-hover:translate-x-1 transition-transform">
                  Build Your Team <ChevronRight className="w-4 h-4 ml-1" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
