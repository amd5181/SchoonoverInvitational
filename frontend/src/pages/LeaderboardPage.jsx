import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API, useAuth } from '../App';
import { Button } from '../components/ui/button';
import { Medal, RefreshCw, Loader2, Clock, ChevronDown, ChevronUp, BarChart2, List, LayoutList, Lock, DollarSign } from 'lucide-react';

const fmtMoney = (n) => {
  if (!n && n !== 0) return '-';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Number(n).toLocaleString()}`;
};

const abbrevName = (name) => {
  if (!name) return '';
  const parts = name.trim().split(' ');
  if (parts.length < 2) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
};

const renderThruCell = (golfer) => {
  if (golfer.is_cut) return <span className="text-red-400 font-bold text-[10px]">CUT</span>;
  const thru = golfer.thru?.toString() || '';
  if (golfer.is_active) {
    if (thru === '18' || thru === 'F') return <span className="text-slate-500 font-numbers text-xs">F</span>;
    if (thru) return <span className="text-green-600 font-bold font-numbers text-xs">{thru}</span>;
    if (golfer.tee_time) {
      const t = new Date(golfer.tee_time);
      return <span className="text-slate-400 text-[10px]">{t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>;
    }
    return <span className="text-green-600 font-bold text-[10px]">▶</span>;
  }
  if (thru === 'F' || thru === '18') return <span className="text-slate-400 font-numbers text-xs">F</span>;
  if (thru) return <span className="text-slate-400 font-numbers text-xs">{thru}</span>;
  return <span className="text-slate-300 text-xs">—</span>;
};

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [selectedTid, setSelectedTid] = useState(null);
  const [currentTournament, setCurrentTournament] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedStandings, setExpandedStandings] = useState(false);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    axios.get(`${API}/tournaments`)
      .then(r => {
        const masters = r.data.find(x => x.slot === 1);
        if (masters?.id) {
          setSelectedTid(masters.id);
          setCurrentTournament(masters);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const fetchLeaderboard = useCallback(async () => {
    if (!selectedTid) return;
    try {
      const r = await axios.get(`${API}/leaderboard/${selectedTid}`);
      setData(r.data);
    } catch { setData(null); }
  }, [selectedTid]);

  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

  useEffect(() => {
    if (!data || !selectedTid || !currentTournament) return;
    if (currentTournament.status === 'completed') return;
    if (currentTournament.start_date) {
      try {
        const now = new Date();
        const start = new Date(currentTournament.start_date);
        const end = currentTournament.end_date ? new Date(currentTournament.end_date) : new Date(start.getTime() + 4 * 86400000);
        if (now >= start && now <= end) {
          const interval = setInterval(fetchLeaderboard, 300000);
          return () => clearInterval(interval);
        }
      } catch {}
    }
  }, [data, selectedTid, currentTournament, fetchLeaderboard]);

  const handleRefresh = async () => {
    if (!selectedTid || !user) return;
    setRefreshing(true);
    try {
      await axios.post(`${API}/scores/refresh/${selectedTid}?user_id=${user.id}`);
      await fetchLeaderboard();
    } catch (e) { console.error('Refresh failed:', e); }
    setRefreshing(false);
  };

  if (loading) return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="w-8 h-8 text-[#1B4332] animate-spin" /></div>;

  const standings = data?.team_standings || [];
  const allScores = data?.tournament_standings || [];
  const finalized = data?.is_finalized;
  const hasPayouts = data?.has_payouts;
  const winners = finalized ? standings.slice(0, 3) : [];

  const isBeforeDeadline = currentTournament?.deadline
    ? new Date() < new Date(currentTournament.deadline)
    : false;

  const renderRounds = (golfer) => {
    const rounds = golfer.rounds || [];
    const isCut = golfer.is_cut;
    return Array.from({ length: 4 }, (_, ri) => {
      const round = rounds[ri];
      const hasScore = round && round.score && round.score !== '-' && round.score !== '';
      if (isCut && ri >= 2) return <span key={ri} className="w-6 text-center font-numbers text-[10px] text-red-400 font-bold">CUT</span>;
      if (hasScore) {
        const isCurrentRound = golfer.is_active && ri === rounds.length - 1;
        return <span key={ri} className={`w-6 text-center font-numbers text-[10px] ${isCurrentRound ? 'text-green-600 font-bold' : 'text-slate-400'}`}>{round.score}</span>;
      }
      return <span key={ri} className="w-6 text-center font-numbers text-[10px] text-slate-200">-</span>;
    });
  };

  const TournamentStandingsBox = ({ isMobile }) => {
    const maxExpanded = Math.min(25, allScores.length);
    const displayScores = expandedStandings ? allScores.slice(0, 25) : allScores.slice(0, 5);
    const canExpand = allScores.length > 5;
    return (
      <div className={`bg-gradient-to-br from-[#1B4332] to-[#2D6A4F] rounded-xl shadow-lg overflow-hidden ${isMobile ? 'mb-4' : 'sticky top-20'}`} data-testid="tournament-standings">
        <div className="px-4 py-3 flex items-center justify-between border-b border-white/10">
          <h3 className="font-heading font-bold text-sm text-white uppercase tracking-wider">
            Tournament Top {expandedStandings ? maxExpanded : Math.min(5, allScores.length)}
          </h3>
          {canExpand && (
            <Button size="sm" variant="ghost" onClick={() => setExpandedStandings(!expandedStandings)}
              className="h-7 px-2 text-white/70 hover:text-white hover:bg-white/10" data-testid="expand-standings">
              {expandedStandings ? <><ChevronUp className="w-4 h-4 mr-1" />Top 5</> : <><ChevronDown className="w-4 h-4 mr-1" />Top 25</>}
            </Button>
          )}
        </div>
        <div className={`divide-y divide-white/5 ${expandedStandings ? 'max-h-[500px] overflow-y-auto' : ''}`}>
          {displayScores.length === 0 && <div className="p-4 text-center text-xs text-white/50">No scores available</div>}
          {displayScores.map((g, i) => (
            <div key={i} className="flex items-center px-4 py-2 gap-2">
              <span className={`w-7 font-numbers font-bold text-xs flex-shrink-0 ${i < 3 ? 'text-[#CCFF00]' : 'text-white/50'}`}>{g.position || i + 1}</span>
              <span className="flex-1 text-sm font-medium text-white truncate">{g.name}</span>
              {g.is_active && <span className="text-[9px] font-bold text-green-400 flex-shrink-0">LIVE</span>}
              <span className={`font-numbers font-bold text-sm flex-shrink-0 ${g.total_score?.toString().startsWith('-') ? 'text-[#CCFF00]' : 'text-white/70'}`}>{g.total_score}</span>
              {hasPayouts && g.earnings > 0 && (
                <span className="text-[10px] font-bold text-[#CCFF00]/80 flex-shrink-0">{fmtMoney(g.earnings)}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const CollapsedRow = ({ team }) => (
    <div className="flex items-center px-4 py-2.5 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center font-numbers font-bold text-xs mr-3 flex-shrink-0 ${
        team.rank === 1 ? 'bg-yellow-100 text-yellow-700' :
        team.rank === 2 ? 'bg-slate-100 text-slate-600' :
        team.rank === 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-50 text-slate-400'
      }`}>{team.rank}</div>
      <div className="flex-1 flex items-center gap-1.5 min-w-0 mr-2">
        <span className="text-sm font-medium text-[#0F172A] truncate">{team.team_name}</span>
        {team.paid
          ? <span className="flex-shrink-0 text-[9px] font-bold bg-emerald-100 text-emerald-700 rounded-full px-1.5 py-0.5 border border-emerald-200">PAID</span>
          : <span className="flex-shrink-0 text-[9px] font-bold bg-red-100 text-red-500 rounded-full px-1.5 py-0.5 border border-red-200 animate-pulse">UNPAID</span>
        }
      </div>
      <span className="font-numbers font-bold text-sm text-[#1B4332]">
        {hasPayouts ? team.total_earnings_fmt : '—'}
      </span>
    </div>
  );

  return (
    <>
      <div className="p-4 md:p-8 max-w-5xl mx-auto" data-testid="leaderboard-page">

        <div className="flex items-center justify-between mb-1">
          <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-[#0F172A] tracking-tight">LEADERBOARD</h1>
        </div>
        <p className="text-slate-500 text-sm mb-4">Masters — Schoonover Invitational</p>

        {!hasPayouts && standings.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-amber-700 text-sm flex items-center gap-2">
            <DollarSign className="w-4 h-4 flex-shrink-0" />
            Payout schedule not yet configured — earnings will show $0 until an admin sets the payouts.
          </div>
        )}

        {data?.last_updated && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-4">
            <Clock className="w-3 h-3" />
            Last updated: {new Date(data.last_updated).toLocaleTimeString()}
          </div>
        )}

        {!data || (!standings.length && !allScores.length) ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center" data-testid="no-leaderboard">
            <BarChart2 className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-lg font-medium">Nothing to display yet</p>
            <p className="text-slate-400 text-sm mt-1">Check back when the tournament begins.</p>
          </div>
        ) : (
          <>
            <div className="lg:hidden">
              <TournamentStandingsBox isMobile={true} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-3">

                {/* Winners Banner */}
                {finalized && winners.length > 0 && (
                  <div className="bg-gradient-to-r from-[#1B4332] to-[#2D6A4F] rounded-xl p-4 text-white" data-testid="winners-banner">
                    <h3 className="font-heading font-bold text-sm uppercase tracking-wider mb-3 text-[#CCFF00]">
                      {data.tournament?.name} Champions
                    </h3>
                    <div className="flex gap-4 flex-wrap">
                      {winners.map((w, i) => (
                        <div key={w.team_id} className="flex items-center gap-2">
                          <Medal className={`w-5 h-5 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : 'text-amber-500'}`} />
                          <span className="font-bold text-sm">{w.team_name}</span>
                          <span className="text-xs text-white/60 font-numbers">{w.total_earnings_fmt}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {isBeforeDeadline ? (
                  <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
                    <Lock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-700 text-lg font-bold mb-1">Standings Locked</p>
                    <p className="text-slate-400 text-sm">Team standings will be revealed after the deadline.</p>
                    {currentTournament?.deadline && (
                      <p className="text-xs text-slate-500 mt-2">
                        Unlocks: {new Date(currentTournament.deadline).toLocaleString('en-US', {
                          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                        })}
                      </p>
                    )}
                  </div>
                ) : standings.length === 0 ? (
                  <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
                    <BarChart2 className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm">No fantasy teams entered yet</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400 font-semibold">{standings.length} teams</span>
                      <button
                        onClick={() => setExpanded(e => !e)}
                        className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border-2 transition-all ${
                          expanded
                            ? 'bg-white text-[#1B4332] border-[#1B4332] hover:bg-[#1B4332] hover:text-white'
                            : 'bg-[#1B4332] text-white border-[#1B4332] hover:bg-[#2D6A4F]'
                        }`}
                      >
                        {expanded ? <><List className="w-3.5 h-3.5" />Collapse</> : <><LayoutList className="w-3.5 h-3.5" />Expand</>}
                      </button>
                    </div>

                    {!expanded && (
                      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                        {standings.map(team => <CollapsedRow key={team.team_id} team={team} />)}
                      </div>
                    )}

                    {expanded && standings.map(team => (
                      <div key={team.team_id} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden"
                        data-testid={`team-standing-${team.rank}`}>
                        <div className="flex items-center px-4 py-3 border-b border-slate-50">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-numbers font-bold text-sm mr-3 flex-shrink-0 ${
                            team.rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                            team.rank === 2 ? 'bg-slate-100 text-slate-600' :
                            team.rank === 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-50 text-slate-400'
                          }`}>{team.rank}</div>
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <span className="font-bold text-sm text-[#0F172A] truncate">{team.team_name}</span>
                            {team.paid
                              ? <span className="flex-shrink-0 text-[9px] font-bold bg-emerald-100 text-emerald-700 rounded-full px-1.5 py-0.5 border border-emerald-200">PAID</span>
                              : <span className="flex-shrink-0 text-[9px] font-bold bg-red-100 text-red-500 rounded-full px-1.5 py-0.5 border border-red-200 animate-pulse">UNPAID</span>
                            }
                          </div>
                          <div className="flex items-center gap-1 ml-2" data-testid={`team-points-${team.rank}`}>
                            <span className="font-numbers font-bold text-lg text-[#1B4332]">
                              {hasPayouts ? team.total_earnings_fmt : '—'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center px-4 py-1 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          <span className="hidden sm:block w-10">Pos</span>
                          <span className="flex-1">Player</span>
                          <div className="flex gap-0.5 mr-1">
                            <span className="w-6 text-center">R1</span>
                            <span className="w-6 text-center">R2</span>
                            <span className="w-6 text-center">R3</span>
                            <span className="w-6 text-center">R4</span>
                          </div>
                          <span className="w-8 text-right">Tot</span>
                          <span className="w-9 text-center">Thru</span>
                          <span className="w-16 text-right">Earnings</span>
                        </div>

                        <div className="divide-y divide-slate-50">
                          {team.golfers.map((g, i) => (
                            <div key={i} className="flex items-center px-4 py-1.5 text-xs">
                              <span className={`hidden sm:block w-10 font-numbers font-bold flex-shrink-0 ${g.is_cut ? 'text-red-400' : g.is_active ? 'text-green-500 pulse-active' : 'text-slate-500'}`}>
                                {g.is_cut ? 'CUT' : g.position || '-'}{g.is_active && !g.is_cut && '*'}
                              </span>
                              <span className="flex-1 font-medium text-[#0F172A] truncate min-w-0 mr-1">
                                <span className="sm:hidden">{abbrevName(g.name)}</span>
                                <span className="hidden sm:inline">{g.name}</span>
                              </span>
                              <div className="flex gap-0.5 mr-1 flex-shrink-0">
                                {renderRounds(g)}
                              </div>
                              <span className={`w-8 text-right font-numbers flex-shrink-0 ${g.total_score === '-' ? 'text-slate-300' : 'text-slate-600'}`}>
                                {g.total_score}
                              </span>
                              <span className="w-9 text-center flex-shrink-0 flex items-center justify-center">
                                {renderThruCell(g)}
                              </span>
                              <span className={`w-16 text-right font-numbers font-bold flex-shrink-0 ${g.is_cut ? 'text-slate-400' : 'text-[#1B4332]'}`}>
                                {hasPayouts ? (g.earnings_fmt || '$0') : '—'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>

              <div className="hidden lg:block lg:col-span-1">
                <TournamentStandingsBox isMobile={false} />
              </div>
            </div>
          </>
        )}

        <div className="h-20" />
      </div>

      <button
        onClick={handleRefresh}
        disabled={refreshing}
        data-testid="refresh-leaderboard"
        title="Refresh scores"
        className="fixed bottom-6 right-6 z-[9999] w-14 h-14 rounded-full bg-[#CCFF00] hover:bg-yellow-300 text-[#1B4332] shadow-xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 disabled:opacity-60 border-2 border-[#1B4332]/20"
      >
        <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
      </button>
    </>
  );
}