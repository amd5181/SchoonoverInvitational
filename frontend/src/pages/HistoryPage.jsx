import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { API } from '../App';
import { Trophy, Medal, Loader2, Crown, Award } from 'lucide-react';

const MEDAL_COLORS = ['text-yellow-500', 'text-slate-400', 'text-slate-400'];
const MEDAL_BG = ['bg-yellow-50 border-yellow-200', 'bg-slate-50 border-slate-200', 'bg-white border-slate-200'];

export default function HistoryPage() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/history`).then(r => setHistory(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Calculate records from history data
  const records = useMemo(() => {
    if (!history.length) return null;

    // Count championships (1st place finishes)
    const championshipCounts = {};
    // Count top 3 finishes
    const top3Counts = {};
    // Track most recent year for each person
    const mostRecentChampionship = {};
    const mostRecentTop3 = {};

    history.forEach(year => {
      year.tournaments.forEach(tournament => {
        tournament.winners.forEach((winner, place) => {
          // Championship count (1st place only)
          if (place === 0) {
            championshipCounts[winner] = (championshipCounts[winner] || 0) + 1;
            if (!mostRecentChampionship[winner] || year.year > mostRecentChampionship[winner]) {
              mostRecentChampionship[winner] = year.year;
            }
          }
          // Top 3 count (1st, 2nd, 3rd)
          top3Counts[winner] = (top3Counts[winner] || 0) + 1;
          if (!mostRecentTop3[winner] || year.year > mostRecentTop3[winner]) {
            mostRecentTop3[winner] = year.year;
          }
        });
      });
    });

    // Get top 3 championship leaders (sort by count desc, then by most recent year desc)
    const championshipLeaders = Object.entries(championshipCounts)
      .map(([name, count]) => ({ name, count, recentYear: mostRecentChampionship[name] }))
      .sort((a, b) => b.count - a.count || b.recentYear - a.recentYear)
      .slice(0, 3);

    // Get top 3 top-3 finish leaders
    const top3Leaders = Object.entries(top3Counts)
      .map(([name, count]) => ({ name, count, recentYear: mostRecentTop3[name] }))
      .sort((a, b) => b.count - a.count || b.recentYear - a.recentYear)
      .slice(0, 3);

    return { championshipLeaders, top3Leaders };
  }, [history]);

  if (loading) return (
    <div className="flex items-center justify-center h-[60vh]">
      <Loader2 className="w-8 h-8 text-[#1B4332] animate-spin" />
    </div>
  );

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto animate-fade-in-up" data-testid="legacy-page">
      <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-[#0F172A] tracking-tight mb-2">HALL OF FAME</h1>
      <p className="text-slate-500 text-sm mb-6">Past Champions of the Schoonover Invitational.</p>

      {/* Records Section */}
      {records && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {/* Most Championships */}
          <div className="bg-gradient-to-br from-[#1B4332] to-[#2D6A4F] rounded-xl p-4 text-white" data-testid="most-championships">
            <div className="flex items-center gap-2 mb-3">
              <Crown className="w-5 h-5 text-[#CCFF00]" />
              <h3 className="font-heading font-bold text-sm uppercase tracking-wider">Most Championships</h3>
            </div>
            <div className="space-y-3">
              {records.championshipLeaders.map((leader, i) => (
                <div key={leader.name} className="flex items-center gap-2">
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${
                    i === 0 ? 'bg-yellow-400 text-yellow-900' : 
                    i === 1 ? 'bg-slate-300 text-slate-700' : 
                    'bg-amber-400 text-amber-900'
                  }`}>
                    {i + 1}
                  </span>
                  <span className="flex-1 font-medium text-xs truncate">{leader.name}</span>
                  <span className="font-numbers font-bold text-[#CCFF00] text-xs flex-shrink-0">{leader.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Most Top 3 Finishes */}
          <div className="bg-gradient-to-br from-[#2D6A4F] to-[#1B4332] rounded-xl p-4 text-white" data-testid="most-top3">
            <div className="flex items-center gap-2 mb-3">
              <Award className="w-5 h-5 text-[#CCFF00]" />
              <h3 className="font-heading font-bold text-sm uppercase tracking-wider">Most Top 3 Finishes</h3>
            </div>
            <div className="space-y-3">
              {records.top3Leaders.map((leader, i) => (
                <div key={leader.name} className="flex items-center gap-2">
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${
                    i === 0 ? 'bg-yellow-400 text-yellow-900' : 
                    i === 1 ? 'bg-slate-300 text-slate-700' : 
                    'bg-amber-400 text-amber-900'
                  }`}>
                    {i + 1}
                  </span>
                  <span className="flex-1 font-medium text-xs truncate">{leader.name}</span>
                  <span className="font-numbers font-bold text-[#CCFF00] text-xs flex-shrink-0">{leader.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6 stagger">
        {history.map(year => (
          <div key={year.year} className="animate-fade-in-up">
            <div className="flex items-center gap-3 mb-3">
              <span className="font-heading font-extrabold text-4xl text-[#1B4332]">{year.year}</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {year.tournaments.map(t => (
                <div key={t.name} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4" data-testid={`history-${year.year}-${t.name}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <Trophy className="w-4 h-4 text-[#1B4332]" />
                    <h3 className="font-heading font-bold text-sm text-[#0F172A] uppercase tracking-wide">{t.name}</h3>
                  </div>
                  <div className="space-y-1.5">
                    {t.winners.map((w, i) => (
                      <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${MEDAL_BG[i]}`}>
                        <Medal className={`w-4 h-4 ${MEDAL_COLORS[i]}`} />
                        <span className="text-sm font-semibold text-[#0F172A]">{w}</span>
                        <span className="text-xs text-slate-400 ml-auto">{i === 0 ? '1st' : i === 1 ? '2nd' : '3rd'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
