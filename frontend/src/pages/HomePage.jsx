import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API } from '../App';
import { Calendar, Users, Clock, ChevronRight, Loader2, ExternalLink, Newspaper, MapPin, Trophy } from 'lucide-react';
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

function timeAgo(dateStr) {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (h < 1) return 'Just now';
    if (h < 24) return `${h}h ago`;
    if (d < 7) return `${d}d ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

function parseRssXml(xml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  const items = Array.from(doc.querySelectorAll('item')).slice(0, 4);
  return items.map(item => {
    const title = item.querySelector('title')?.textContent || '';
    const link = item.querySelector('link')?.textContent ||
                 item.querySelector('link')?.nextSibling?.textContent || '#';
    const pubDate = item.querySelector('pubDate')?.textContent || '';
    const source = item.querySelector('source')?.textContent?.trim() ||
                   item.querySelector('category')?.textContent?.trim() || 'ESPN';
    return { title: title.trim(), link: link.trim(), pubDate, source };
  });
}

async function fetchMastersNews() {
  // ESPN Golf RSS — CORS-friendly, no proxy needed
  const feeds = [
    'https://www.espn.com/espn/rss/golf/news',
    'https://feeds.bbci.co.uk/sport/golf/rss.xml',
  ];

  for (const feedUrl of feeds) {
    try {
      const r = await fetch(feedUrl, { signal: AbortSignal.timeout(6000) });
      if (!r.ok) continue;
      const text = await r.text();
      if (text.includes('<item>') || text.includes('<item ')) {
        const items = parseRssXml(text);
        if (items.length > 0) return items;
      }
    } catch { /* try next */ }
  }
  return [];
}

export default function HomePage() {
  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(true);
  const [news, setNews] = useState([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    axios.get(`${API}/tournaments`)
      .then(r => {
        const masters = r.data.find(x => x.slot === 1) || {
          slot: 1, name: 'Masters', status: 'setup',
          team_count: 0, golfer_count: 0, start_date: '', end_date: '', deadline: ''
        };
        setTournament(masters);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    fetchMastersNews()
      .then(setNews)
      .catch(() => setNews([]))
      .finally(() => setNewsLoading(false));
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

      {/* Hero */}
      <div className="relative bg-gradient-to-br from-[#1B4332] via-[#2D6A4F] to-[#081C15] rounded-2xl overflow-hidden mb-6 shadow-xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-[#CCFF00]/5 rounded-full translate-y-1/2 -translate-x-1/2" />

        <div className="relative px-6 py-8 md:px-10 md:py-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <p className="text-[#CCFF00] font-bold text-xs uppercase tracking-widest mb-1">Schoonover Invitational</p>
              <h1 className="font-heading font-extrabold text-4xl sm:text-5xl text-white tracking-tight mb-2" data-testid="home-title">
                THE MASTERS
              </h1>
              <div className="flex items-center gap-2 text-white/60 text-sm mb-4">
                <MapPin className="w-3.5 h-3.5" />
                <span>Augusta National Golf Club · Augusta, Georgia</span>
              </div>
              <Badge className={badge.cls + ' text-xs font-bold px-3 py-1'}>{badge.text}</Badge>
            </div>

            <div className="flex gap-4 md:gap-6 flex-wrap">
              <div className="text-center">
                <p className="text-[#CCFF00] font-numbers font-extrabold text-2xl">
                  {t?.start_date ? new Date(t.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Apr'}
                </p>
                <p className="text-white/50 text-xs mt-0.5">Start Date</p>
              </div>
              <div className="w-px bg-white/10 hidden md:block" />
              <div className="text-center">
                <p className="text-[#CCFF00] font-numbers font-extrabold text-2xl">{t?.team_count ?? 0}</p>
                <p className="text-white/50 text-xs mt-0.5">Teams Entered</p>
              </div>
              <div className="w-px bg-white/10 hidden md:block" />
              <div className="text-center">
                <p className="text-[#CCFF00] font-numbers font-extrabold text-2xl">{t?.golfer_count ?? 0}</p>
                <p className="text-white/50 text-xs mt-0.5">In the Field</p>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                <Calendar className="w-4 h-4 text-[#CCFF00]" />
              </div>
              <div>
                <p className="text-white/40 text-[10px] uppercase tracking-wider font-bold">Tournament Dates</p>
                <p className="text-white text-sm font-medium">
                  {t?.start_date ? `${formatDate(t.start_date)} – ${formatDate(t.end_date)}` : 'TBD'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                <Clock className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <p className="text-white/40 text-[10px] uppercase tracking-wider font-bold">Entry Deadline</p>
                <p className="text-white text-sm font-medium">{formatDeadline(t?.deadline)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                <Trophy className="w-4 h-4 text-[#CCFF00]" />
              </div>
              <div>
                <p className="text-white/40 text-[10px] uppercase tracking-wider font-bold">Prize Purse</p>
                <p className="text-white text-sm font-medium">$21,000,000</p>
              </div>
            </div>
          </div>

          {t?.id && t?.has_prices && (
            <button
              onClick={() => navigate('/teams')}
              className="mt-6 flex items-center gap-2 bg-[#CCFF00] hover:bg-yellow-300 text-[#1B4332] font-bold text-sm px-5 py-2.5 rounded-xl transition-all hover:scale-105 active:scale-95 shadow-lg"
              data-testid="build-team-cta"
            >
              Build Your Team <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="mb-6">
        <PaymentBanner />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Newspaper className="w-4 h-4 text-[#1B4332]" />
              <h2 className="font-heading font-bold text-sm text-[#0F172A] uppercase tracking-wider">Latest Masters News</h2>
            </div>
            <a href="https://www.masters.com/en_US/news/index.html" target="_blank" rel="noopener noreferrer"
              className="text-xs text-slate-400 hover:text-[#1B4332] flex items-center gap-1 transition-colors">
              masters.com <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="space-y-2">
            {newsLoading && [1,2,3,4].map(i => (
              <div key={i} className="bg-white rounded-xl border border-slate-100 p-4 animate-pulse">
                <div className="h-3 bg-slate-100 rounded w-3/4 mb-2" />
                <div className="h-2 bg-slate-50 rounded w-1/3" />
              </div>
            ))}
            {!newsLoading && news.length === 0 && (
              <div className="bg-white rounded-xl border border-slate-100 p-6 text-center text-slate-400 text-sm">
                News unavailable — <a href="https://www.masters.com/en_US/news/index.html" target="_blank" rel="noopener noreferrer" className="text-[#1B4332] underline">visit masters.com</a>
              </div>
            )}
            {!newsLoading && news.map((item, i) => (
              <a key={i} href={item.link} target="_blank" rel="noopener noreferrer"
                className="block bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:border-[#1B4332]/30 hover:shadow-md transition-all group">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-[#0F172A] group-hover:text-[#1B4332] transition-colors leading-snug line-clamp-2">{item.title}</p>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-[#1B4332] flex-shrink-0 mt-0.5 transition-colors" />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{item.source}</span>
                  <span className="text-slate-200">·</span>
                  <span className="text-[10px] text-slate-400">{timeAgo(item.pubDate)}</span>
                </div>
              </a>
            ))}
          </div>
        </div>

        <div>
          <h2 className="font-heading font-bold text-sm text-[#0F172A] uppercase tracking-wider mb-3">Augusta National</h2>
          <div className="space-y-2">
            {[
              { label: 'Official Site', url: 'https://www.masters.com', desc: 'masters.com' },
              { label: 'Live Scoring', url: 'https://www.masters.com/en_US/scores/index.html', desc: 'Official leaderboard' },
              { label: 'The Field', url: 'https://www.masters.com/en_US/players/index.html', desc: 'Player profiles' },
              { label: 'Course Map', url: 'https://www.masters.com/en_US/course/index.html', desc: 'Hole-by-hole' },
              { label: 'TV Schedule', url: 'https://www.masters.com/en_US/tournament/schedule.html', desc: 'Broadcast info' },
            ].map(link => (
              <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-between bg-white border border-slate-100 rounded-xl px-4 py-3 hover:border-[#1B4332]/30 hover:shadow-sm transition-all group">
                <div>
                  <p className="text-sm font-semibold text-[#0F172A] group-hover:text-[#1B4332] transition-colors">{link.label}</p>
                  <p className="text-[10px] text-slate-400">{link.desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-[#1B4332] transition-colors" />
              </a>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}