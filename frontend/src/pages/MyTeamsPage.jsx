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
  const [savedTeam1, setSavedTeam1] = useState([null, null, null, null, null]);
  const [savedTeam2, setSavedTeam2] = useState([null, null, null, null, null]);
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
            const loaded1 = t1 ? [...t1.golfers, ...Array(5 - t1.golfers.length).fill(null)] : [null,null,null,null,null];
            const loaded2 = t2 ? [...t2.golfers, ...Array(5 - t2.golfers.length).fill(null)] : [null,null,null,null,null];
            setTeam1(loaded1);
            setTeam2(loaded2);
            setSavedTeam1(loaded1);
            setSavedTeam2(loaded2);
          }).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  // Golfer map with ranks computed by price (most expensive = #1)
  const golferMap = useMemo(() => {
    if (!tournament?.golfers) return {};
    const sorted = [...tournament.golfers].filter(g => g.price && g.mapping_status !== 'not_in_field').sort((a, b) => (b.price || 0) - (a.price || 0));
    const map = {};
    sorted.forEach((g, i) => { map[g.name] = { ...g, world_ranking: i + 1 }; });
    tournament.golfers.filter(g => !g.price && g.mapping_status !== 'not_in_field').forEach(g => { if (!map[g.name]) map[g.name] = { ...g }; });
    return map;
  }, [tournament]);

  // Set of player names that are "not in field"
  const notInFieldNames = useMemo(() => {
    const s = new Set();
    (tournament?.golfers || []).forEach(g => {
      if (g.mapping_status === 'not_in_field') s.add(g.name?.toLowerCase());
    });
    return s;
  }, [tournament]);

  const golfers = useMemo(() => {
    if (!tournament?.golfers) return [];
    let list = tournament.golfers.filter(g => g.price && g.mapping_status !== 'not_in_field');
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

  const isDirty = JSON.stringify(team1) !== JSON.stringify(savedTeam1) ||
                  JSON.stringify(team2) !== JSON.stringify(savedTeam2);

  const addGolfer = (golfer) => {
    if (locked) { toast.error('Teams are locked!'); return false; }
    const team = [...currentTeam];
    if (team.some(g => g?.name === golfer.name)) { toast.error('Already on this team'); return false; }
    const slot = team.findIndex(g => g === null);
    if (slot === -1) { toast.error('Team is full'); return false; }
    team[slot] = { name: golfer.name, espn_id: golfer.espn_id, price: golfer.price, world_ranking: golferMap[golfer.name]?.world_ranking || golfer.world_ranking };
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

  const saveTeams = async () => {
    if (!user) { setAuthMode('login'); setAuthOpen(true); return; }

    const filled1 = team1.filter(Boolean);
    const filled2 = team2.filter(Boolean);

    if (filled1.length > 0 && filled1.length !== 5) { toast.error('Team 1 must have exactly 5 golfers (or be empty)'); return; }
    if (filled2.length > 0 && filled2.length !== 5) { toast.error('Team 2 must have exactly 5 golfers (or be empty)'); return; }
    if (team1Cost > BUDGET) { toast.error('Team 1 is over budget!'); return; }
    if (team2Cost > BUDGET) { toast.error('Team 2 is over budget!'); return; }

    setSaving(true);
    try {
      const ops = [];

      const existing1 = userTeams.find(t => t.tournament_id === tournament.id && t.team_number === 1);
      if (filled1.length === 0 && existing1) {
        ops.push(axios.delete(`${API}/teams/${existing1.id}?user_id=${user.id}`));
      } else if (filled1.length === 5) {
        ops.push(axios.post(`${API}/teams`, { user_id: user.id, tournament_id: tournament.id, team_number: 1, golfers: filled1 }));
      }

      const existing2 = userTeams.find(t => t.tournament_id === tournament.id && t.team_number === 2);
      if (filled2.length === 0 && existing2) {
        ops.push(axios.delete(`${API}/teams/${existing2.id}?user_id=${user.id}`));
      } else if (filled2.length === 5) {
        ops.push(axios.post(`${API}/teams`, { user_id: user.id, tournament_id: tournament.id, team_number: 2, golfers: filled2 }));
      }

      await Promise.all(ops);
      toast.success('Teams saved!');
      const updated = (await axios.get(`${API}/teams/user/${user.id}`)).data;
      setUserTeams(updated);
      setSavedTeam1([...team1]);
      setSavedTeam2([...team2]);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleAuthSuccess = async (loggedInUser) => {
    if (!tournament?.id) return;
    try {
      const r = await axios.get(`${API}/teams/user/${loggedInUser.id}`);
      setUserTeams(r.data);
      const t1 = r.data.find(x => x.tournament_id === tournament.id && x.team_number === 1);
      const t2 = r.data.find(x => x.tournament_id === tournament.id && x.team_number === 2);
      const loaded1 = t1 ? [...t1.golfers, ...Array(5 - t1.golfers.length).fill(null)] : [null,null,null,null,null];
      const loaded2 = t2 ? [...t2.golfers, ...Array(5 - t2.golfers.length).fill(null)] : [null,null,null,null,null];
      if (t1) setTeam1(loaded1);
      if (t2) setTeam2(loaded2);
      setSavedTeam1(loaded1);
      setSavedTeam2(loaded2);
    } catch {}
  };

  if (loading) return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="w-8 h-8 text-[#1B4332] animate-spin" /></div>;

  const over = currentCost > BUDGET;
  const pct = Math.min((currentCost / BUDGET) * 100, 100);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto animate-fade-in-up" data-testid="my-teams-page">
      <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-[#0F172A] tracking-tight mb-4">MY TEAMS</h1>

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

      {!tournament || !tournament.golfers?.some(g => g.price && g.mapping_status !== 'not_in_field') ? (
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Team Panel */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden" data-testid={`team-${activeTeam}-panel`}>
              {/* Header with integrated team toggle */}
              <div className="px-4 py-2.5 flex items-center justify-between bg-gradient-to-r from-[#1B4332] to-[#2D6A4F]">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-white/80 text-xs font-semibold whitespace-nowrap">
                    {user ? `${user.name}'s` : 'Your'}
                  </span>
                  <div className="flex items-center bg-white/15 rounded-lg p-0.5">
                    <button onClick={() => setActiveTeam(1)} data-testid="toggle-team-1"
                      className={`px-2.5 py-1 rounded-md text-xs font-bold whitespace-nowrap transition-all ${activeTeam === 1 ? 'bg-white text-[#1B4332] shadow-sm' : 'text-white/70 hover:text-white'}`}>
                      Team 1
                    </button>
                    <button onClick={() => setActiveTeam(2)} data-testid="toggle-team-2"
                      className={`px-2.5 py-1 rounded-md text-xs font-bold whitespace-nowrap transition-all ${activeTeam === 2 ? 'bg-white text-[#2D6A4F] shadow-sm' : 'text-white/70 hover:text-white'}`}>
                      Team 2
                    </button>
                  </div>
                </div>
                {!locked && <button onClick={clearTeam} className="text-white/60 hover:text-white" data-testid={`clear-team-${activeTeam}`}><Trash2 className="w-4 h-4" /></button>}
              </div>

              <div className="divide-y divide-slate-50">
                {currentTeam.map((g, i) => {
                  const nif = g && notInFieldNames.has(g.name?.toLowerCase());
                  return (
                    <div key={i} className={`flex items-center px-4 py-3 min-h-[52px] ${nif ? 'bg-red-50' : ''}`} data-testid={`team-${activeTeam}-slot-${i}`}>
                      <span className="w-6 text-sm font-bold text-slate-400 font-numbers">{i + 1}</span>
                      {g ? (
                        <>
                          <span className="w-10 text-xs font-bold text-slate-500 font-numbers">#{golferMap[g.name]?.world_ranking || '?'}</span>
                          <div className="flex-1 min-w-0 mr-2 flex items-center gap-2">
                            <span className={`text-sm font-medium truncate ${nif ? 'font-bold text-red-600' : 'text-[#0F172A]'}`}>{g.name}</span>
                            {nif && <span className="text-[10px] font-bold text-red-500 whitespace-nowrap flex-shrink-0">Not in field</span>}
                          </div>
                          <span className="text-xs font-bold font-numbers text-[#2D6A4F] mr-3">{fmt(g.price)}</span>
                          {!locked && <button onClick={() => removeGolfer(i)} className="text-red-400 hover:text-red-600 flex-shrink-0" data-testid={`remove-golfer-${activeTeam}-${i}`}><Minus className="w-4 h-4" /></button>}
                        </>
                      ) : (
                        <span className="flex-1 text-sm text-slate-300 italic">Empty slot</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Budget bar with save button */}
              <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">
                <div className="flex justify-between text-xs font-semibold mb-1.5">
                  <span className={over ? 'text-red-500' : 'text-slate-500'}><DollarSign className="w-3.5 h-3.5 inline" />{fmt(currentCost)} / {fmt(BUDGET)}</span>
                  <span className={over ? 'text-red-500 font-bold' : 'text-[#1B4332] font-bold'}>
                    {over ? <><AlertTriangle className="w-3.5 h-3.5 inline mr-0.5" />OVER {fmt(currentCost - BUDGET)}</> : `${fmt(remaining)} left`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full budget-bar ${over ? 'bg-red-500' : 'bg-[#1B4332]'}`} style={{ width: `${pct}%` }} />
                  </div>
                  {!locked && (
                    user ? (
                      <div className="relative flex-shrink-0">
                        {isDirty && (
                          <div className="absolute inset-0 rounded-full bg-yellow-400 animate-ping opacity-40" />
                        )}
                        <button
                          onClick={saveTeams}
                          disabled={saving}
                          data-testid="save-teams-btn"
                          className={`relative flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all disabled:opacity-50 ${
                            isDirty
                              ? 'bg-yellow-400 text-yellow-900 shadow-lg shadow-yellow-400/50'
                              : 'bg-yellow-600/30 text-yellow-900/50'
                          }`}
                        >
                          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                          Save
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAuthMode('register'); setAuthOpen(true); }}
                        className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-yellow-600/30 text-yellow-900/50 hover:bg-yellow-400 hover:text-yellow-900 transition-all"
                      >
                        <UserPlus className="w-3 h-3" />Save
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>

            {/* Golfer List */}
            <div className="bg-white rounded-xl border-2 border-slate-300 shadow-md overflow-hidden">
              <div className="p-3 bg-slate-200 border-b-2 border-slate-400 flex items-center gap-2">
                <Search className="w-4 h-4 text-slate-400" />
                <Input data-testid="golfer-search" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search golfers..." className="h-9 border-0 shadow-none focus-visible:ring-0 text-sm" />
                <Badge variant="outline" className="text-xs whitespace-nowrap">{golfers.length}</Badge>
              </div>
              <ScrollArea className="h-[450px] lg:h-[500px]">
                <div className="divide-y divide-slate-100">
                  {golfers.map((g, i) => {
                    const rank = golferMap[g.name]?.world_ranking || i + 1;
                    const onT1 = team1.some(t => t?.name === g.name);
                    const onT2 = team2.some(t => t?.name === g.name);
                    const onCurrentTeam = currentTeam.some(t => t?.name === g.name);
                    const wouldExceedBudget = !onCurrentTeam && (currentCost + (g.price || 0) > BUDGET);
                    const cantAdd = !onCurrentTeam && (currentFull || wouldExceedBudget);
                    return (
                      <div key={g.espn_id || i}
                        className={`flex items-center px-3 py-2.5 transition-colors ${onCurrentTeam ? 'bg-green-50' : cantAdd ? 'opacity-40' : 'hover:bg-slate-50'}`}
                        data-testid={`golfer-row-${i}`}>
                        <span className="w-9 text-xs font-bold text-slate-600 font-numbers">#{rank}</span>
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
