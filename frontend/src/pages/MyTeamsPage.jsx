import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import axios from 'axios';
import { API, useAuth } from '../App';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import { Search, Minus, Trash2, Save, DollarSign, Loader2, AlertTriangle, Lock, LogIn, UserPlus } from 'lucide-react';
import AuthModal from '../components/AuthModal';
import PaymentBanner from '../components/PaymentBanner';

const BUDGET = 1000000;
const fmt = (n) => '$' + (n || 0).toLocaleString();
const isLocked = (dl) => { if (!dl) return false; try { return new Date() > new Date(dl); } catch { return false; } };

export default function MyTeamsPage() {
  const { user } = useAuth();
  const [tournament, setTournament] = useState(null);
  const [userTeams, setUserTeams] = useState([]);
  const [team1, setTeam1] = useState([null, null, null, null, null]);
  const [team2, setTeam2] = useState([null, null, null, null, null]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTeam, setActiveTeam] = useState(1);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');

  useEffect(() => {
    // Always load Masters (slot 1)
    axios.get(`${API}/tournaments`)
      .then(r => {
        const masters = r.data.find(x => x.slot === 1);
        if (!masters?.id) { setLoading(false); return; }
        axios.get(`${API}/tournaments/${masters.id}`)
          .then(r2 => setTournament(r2.data))
          .catch(() => setTournament(null));
        if (user) {
          axios.get(`${API}/teams/user/${user.id}`).then(r2 => {
            setUserTeams(r2.data);
            const t1 = r2.data.find(x => x.tournament_id === masters.id && x.team_number === 1);
            const t2 = r2.data.find(x => x.tournament_id === masters.id && x.team_number === 2);
            setTeam1(t1 ? [...t1.golfers, ...Array(5 - t1.golfers.length).fill(null)] : [null,null,null,null,null]);
            setTeam2(t2 ? [...t2.golfers, ...Array(5 - t2.golfers.length).fill(null)] : [null,null,null,null,null]);
          }).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const golferMap = useMemo(() => {
    if (!tournament?.golfers) return {};
    const map = {};
    tournament.golfers.forEach((g, i) => { map[g.name] = { ...g, world_ranking: g.world_ranking || i + 1 }; });
    return map;
  }, [tournament]);

  const golfers = useMemo(() => {
    if (!tournament?.golfers) return [];
    let list = tournament.golfers.filter(g => g.price);
    if (search) list = list.filter(g => g.name.toLowerCase().includes(search.toLowerCase()));
    return list.sort((a, b) => (b.price || 0) - (a.price || 0));
  }, [tournament, search]);

  const team1Cost = team1.reduce((s, g) => s + (g?.price || 0), 0);
  const team2Cost = team2.reduce((s, g) => s + (g?.price || 0), 0);
  const locked = isLocked(tournament?.deadline);

  const currentTeam = activeTeam === 1 ? team1 : team2;
  const currentCost = activeTeam === 1 ? team1Cost : team2Cost;
  const setCurrentTeam = activeTeam === 1 ? setTeam1 : setTeam2;
  const currentFull = currentTeam.filter(Boolean).length >= 5;
  const remaining = BUDGET - currentCost;

  const addGolfer = (golfer) => {
    if (locked) { toast.error('Teams are locked!'); return false; }
    const team = [...currentTeam];
    if (team.some(g => g?.name === golfer.name)) { toast.error('Already on this team'); return false; }
    const slot = team.findIndex(g => g === null);
    if (slot === -1) { toast.error('Team is full'); return false; }
    team[slot] = { name: golfer.name, espn_id: golfer.espn_id, price: golfer.price, world_ranking: golfer.world_ranking };
    setCurrentTeam(team);
    return true;
  };

  const removeGolfer = (idx) => {
    if (locked) return;
    const team = [...currentTeam];
    team[idx] = null;
    const filled = team.filter(Boolean);
    setCurrentTeam([...filled, ...Array(5 - filled.length).fill(null)]);
  };

  const removeGolferByName = (name) => {
    if (locked) return;
    const team = [...currentTeam];
    const idx = team.findIndex(g => g?.name === name);
    if (idx === -1) return;
    team[idx] = null;
    const filled = team.filter(Boolean);
    setCurrentTeam([...filled, ...Array(5 - filled.length).fill(null)]);
  };

  const clearTeam = () => { if (!locked) setCurrentTeam([null,null,null,null,null]); };

  const saveTeam = async () => {
    if (!user) { setAuthMode('login'); setAuthOpen(true); return; }
    const filled = currentTeam.filter(Boolean);
    if (filled.length === 0) {
      const existing = userTeams.find(t => t.tournament_id === tournament.id && t.team_number === activeTeam);
      if (existing) {
        try {
          await axios.delete(`${API}/teams/${existing.id}?user_id=${user.id}`);
          toast.success(`Team #${activeTeam} deleted`);
          setUserTeams((await axios.get(`${API}/teams/user/${user.id}`)).data);
        } catch (e) { toast.error(e.response?.data?.detail || 'Delete failed'); }
      }
      return;
    }
    if (filled.length !== 5) { toast.error('Select exactly 5 golfers'); return; }
    if (currentCost > BUDGET) { toast.error('Over budget!'); return; }
    setSaving(true);
    try {
      await axios.post(`${API}/teams`, { user_id: user.id, tournament_id: tournament.id, team_number: activeTeam, golfers: filled });
      toast.success(`Team #${activeTeam} saved!`);
      setUserTeams((await axios.get(`${API}/teams/user/${user.id}`)).data);
    } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleAuthSuccess = async (loggedInUser) => {
    if (!tournament?.id) return;
    try {
      const r = await axios.get(`${API}/teams/user/${loggedInUser.id}`);
      setUserTeams(r.data);
      const t1 = r.data.find(x => x.tournament_id === tournament.id && x.team_number === 1);
      const t2 = r.data.find(x => x.tournament_id === tournament.id && x.team_number === 2);
      if (t1) setTeam1([...t1.golfers, ...Array(5 - t1.golfers.length).fill(null)]);
      if (t2) setTeam2([...t2.golfers, ...Array(5 - t2.golfers.length).fill(null)]);
    } catch {}
  };

  if (loading) return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="w-8 h-8 text-[#1B4332] animate-spin" /></div>;

  const over = currentCost > BUDGET;
  const pct = Math.min((currentCost / BUDGET) * 100, 100);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto animate-fade-in-up" data-testid="my-teams-page">
      <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-[#0F172A] tracking-tight mb-1">MY TEAMS</h1>
      <p className="text-slate-500 text-sm mb-4">Masters — Schoonover Invitational</p>

      {/* Guest banner */}
      {!user && (
        <div className="bg-[#1B4332]/5 border border-[#1B4332]/20 rounded-xl p-4 mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-bold text-[#1B4332]">Build your team — no account needed</p>
            <p className="text-xs text-slate-500 mt-0.5">Sign in or create a free account to save your picks and compete.</p>
          </div>
          <button onClick={() => { setAuthMode('login'); setAuthOpen(true); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1B4332] text-white text-xs font-bold hover:bg-[#2D6A4F] transition-colors flex-shrink-0">
            <LogIn className="w-3.5 h-3.5" />Sign In / Create Account
          </button>
        </div>
      )}

      <div className="mb-4">
        <PaymentBanner compact={true} />
      </div>

      {!tournament || !tournament.golfers?.some(g => g.price) ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center" data-testid="no-golfers-message">
          <p className="text-slate-400 text-lg font-medium">Golfers Not Available</p>
          <p className="text-slate-400 text-sm mt-1">Please come back later when the field and prices have been set.</p>
        </div>
      ) : (
        <>
          {locked && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-700 text-sm font-medium mb-4">
              <Lock className="w-4 h-4" /> Teams are locked. Deadline has passed.
            </div>
          )}

          <div className="mb-4">
            <div className="flex items-center gap-2 bg-slate-100 rounded-xl p-1 w-fit">
              <button onClick={() => setActiveTeam(1)} data-testid="toggle-team-1"
                className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTeam === 1 ? 'bg-[#1B4332] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                Team 1
              </button>
              <button onClick={() => setActiveTeam(2)} data-testid="toggle-team-2"
                className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTeam === 2 ? 'bg-[#2D6A4F] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                Team 2
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Team Panel */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden" data-testid={`team-${activeTeam}-panel`}>
              <div className={`px-4 py-3 flex items-center justify-between ${activeTeam === 1 ? 'bg-gradient-to-r from-[#1B4332] to-[#2D6A4F]' : 'bg-gradient-to-r from-[#2D6A4F] to-[#1B4332]'}`}>
                <span className="text-white font-heading font-bold text-sm uppercase tracking-wider">
                  {user ? `${user.name}'s` : 'Your'} Team {activeTeam}
                </span>
                {!locked && <button onClick={clearTeam} className="text-white/60 hover:text-white" data-testid={`clear-team-${activeTeam}`}><Trash2 className="w-4 h-4" /></button>}
              </div>

              <div className="divide-y divide-slate-50">
                {currentTeam.map((g, i) => (
                  <div key={i} className="flex items-center px-4 py-3 min-h-[52px]" data-testid={`team-${activeTeam}-slot-${i}`}>
                    <span className="w-6 text-sm font-bold text-slate-400 font-numbers">{i + 1}</span>
                    {g ? (
                      <>
                        <span className="w-10 text-xs font-bold text-slate-500 font-numbers">#{golferMap[g.name]?.world_ranking || g.world_ranking || '?'}</span>
                        <span className="flex-1 text-sm font-medium text-[#0F172A] truncate">{g.name}</span>
                        <span className="text-xs font-bold font-numbers text-[#2D6A4F] ml-2 mr-3">{fmt(g.price)}</span>
                        {!locked && <button onClick={() => removeGolfer(i)} className="text-red-400 hover:text-red-600" data-testid={`remove-golfer-${activeTeam}-${i}`}><Minus className="w-4 h-4" /></button>}
                      </>
                    ) : (
                      <span className="flex-1 text-sm text-slate-300 italic">Empty slot</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Budget bar */}
              <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">
                <div className="flex justify-between text-xs font-semibold mb-1.5">
                  <span className={over ? 'text-red-500' : 'text-slate-500'}><DollarSign className="w-3.5 h-3.5 inline" />{fmt(currentCost)} / {fmt(BUDGET)}</span>
                  <span className={over ? 'text-red-500 font-bold' : 'text-[#1B4332] font-bold'}>
                    {over ? <><AlertTriangle className="w-3.5 h-3.5 inline mr-0.5" />OVER {fmt(currentCost - BUDGET)}</> : `${fmt(remaining)} left`}
                  </span>
                </div>
                <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full budget-bar ${over ? 'bg-red-500' : 'bg-[#1B4332]'}`} style={{ width: `${pct}%` }} />
                </div>
              </div>

              {/* Save / Auth button */}
              {!locked && (
                <div className="p-4 border-t border-slate-100">
                  {user ? (
                    <Button onClick={saveTeam} disabled={saving} data-testid={`save-team-${activeTeam}`}
                      className={`w-full h-11 font-bold text-base ${activeTeam === 1 ? 'bg-[#1B4332] hover:bg-[#2D6A4F]' : 'bg-[#2D6A4F] hover:bg-[#1B4332]'} text-white`}>
                      {saving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Save className="w-5 h-5 mr-2" />}
                      Save Team {activeTeam}
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <Button onClick={() => { setAuthMode('register'); setAuthOpen(true); }}
                        className="w-full h-11 font-bold text-base bg-[#1B4332] hover:bg-[#2D6A4F] text-white">
                        <UserPlus className="w-5 h-5 mr-2" />Create Account to Save
                      </Button>
                      <button onClick={() => { setAuthMode('login'); setAuthOpen(true); }}
                        className="w-full text-center text-xs text-slate-500 hover:text-[#1B4332] font-medium py-1 transition-colors">
                        Already have an account? Sign in →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Golfer List */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-3 border-b border-slate-100 flex items-center gap-2">
                <Search className="w-4 h-4 text-slate-400" />
                <Input data-testid="golfer-search" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search golfers..." className="h-9 border-0 shadow-none focus-visible:ring-0 text-sm" />
                <Badge variant="outline" className="text-xs whitespace-nowrap">{golfers.length}</Badge>
              </div>
              <ScrollArea className="h-[450px] lg:h-[500px]">
                <div className="divide-y divide-slate-50">
                  {golfers.map((g, i) => {
                    const onT1 = team1.some(t => t?.name === g.name);
                    const onT2 = team2.some(t => t?.name === g.name);
                    const onCurrentTeam = currentTeam.some(t => t?.name === g.name);
                    const wouldExceedBudget = !onCurrentTeam && (currentCost + (g.price || 0) > BUDGET);
                    const cantAdd = !onCurrentTeam && (currentFull || wouldExceedBudget);
                    return (
                      <div key={g.espn_id || i}
                        className={`flex items-center px-3 py-2.5 transition-colors ${onCurrentTeam ? 'bg-green-50' : cantAdd ? 'opacity-40' : 'hover:bg-slate-50'}`}
                        data-testid={`golfer-row-${i}`}>
                        <span className="w-9 text-xs font-bold text-slate-600 font-numbers">#{g.world_ranking || i+1}</span>
                        <div className="flex-1 min-w-0 mr-2">
                          <span className="text-sm font-medium text-[#0F172A] block truncate">{g.name}</span>
                          <span className={`text-xs font-bold font-numbers ${wouldExceedBudget ? 'text-red-400' : 'text-[#2D6A4F]'}`}>
                            {fmt(g.price)}{wouldExceedBudget && <span className="font-normal ml-1">· over budget</span>}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {onT1 && <span className="text-[9px] font-bold bg-[#1B4332] text-white rounded px-1.5 py-0.5">T1</span>}
                          {onT2 && <span className="text-[9px] font-bold bg-[#2D6A4F] text-white rounded px-1.5 py-0.5">T2</span>}
                          {!locked && onCurrentTeam && (
                            <button onClick={() => removeGolferByName(g.name)} data-testid={`remove-from-list-${i}`}
                              className="h-8 px-3 rounded-md bg-red-50 text-red-500 hover:bg-red-100 text-xs font-bold flex items-center gap-1 transition-colors">
                              <Minus className="w-3 h-3" />Remove
                            </button>
                          )}
                          {!locked && !onCurrentTeam && (
                            <Button size="sm" onClick={() => addGolfer(g)} disabled={cantAdd}
                              data-testid={`add-golfer-${i}`}
                              className={`h-8 px-4 ${activeTeam === 1 ? 'bg-[#1B4332] hover:bg-[#2D6A4F]' : 'bg-[#2D6A4F] hover:bg-[#1B4332]'} text-white text-xs font-bold disabled:opacity-30`}>
                              Add
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>
        </>
      )}

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={handleAuthSuccess}
        defaultMode={authMode}
      />
    </div>
  );
}
