import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import axios from 'axios';
import { API, useAuth } from '../App';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { ScrollArea } from '../components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Settings, Search, Download, DollarSign, Trash2, Loader2, Users, CheckCircle, ClipboardPaste, FileSpreadsheet, Calendar, Eye, Pencil, X, Mail } from 'lucide-react';

const fmt = (n) => '$' + (n || 0).toLocaleString();

export default function AdminPage() {
  const { user } = useAuth();
  const [tournaments, setTournaments] = useState([]);
  const [espnEvents, setEspnEvents] = useState([]);
  const [searchYear, setSearchYear] = useState('2026');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [oddsDialog, setOddsDialog] = useState({ open: false, slot: null });
  const [oddsText, setOddsText] = useState('');
  const [teamsDialog, setTeamsDialog] = useState({ open: false, tournament: null, teams: [] });
  const [editingTeam, setEditingTeam] = useState(null);
  const [editGolfers, setEditGolfers] = useState([]);
  const [payoutDialog, setPayoutDialog] = useState({ open: false, slot: null });
  const [payoutText, setPayoutText] = useState(``);
  const [currentPayouts, setCurrentPayouts] = useState([]);

  const fetchTournaments = async () => {
    try {
      const r = await axios.get(`${API}/admin/tournaments?user_id=${user.id}`);
      setTournaments(r.data);
    } catch {}
  };

  useEffect(() => { fetchTournaments().finally(() => setLoading(false)); }, []);

  const searchEspn = async () => {
    setActionLoading(p => ({ ...p, search: true }));
    try {
      const r = await axios.post(`${API}/admin/espn-search?user_id=${user.id}&year=${searchYear}`);
      setEspnEvents(r.data.events || []);
      toast.success(`Found ${r.data.events?.length || 0} events`);
    } catch (e) { toast.error(e.response?.data?.detail || 'Search failed'); }
    finally { setActionLoading(p => ({ ...p, search: false })); }
  };

  const handleEventSelect = (slot, espnId) => {
    const ev = espnEvents.find(e => e.espn_id === espnId);
    updateTournament(slot, {
      espn_event_id: espnId,
      start_date: ev?.date || '',
      end_date: ev?.end_date || ''
    });
  };

  const updateTournament = async (slot, data) => {
    try {
      await axios.put(`${API}/admin/tournaments/${slot}?user_id=${user.id}`, data);
      await fetchTournaments();
    } catch (e) { toast.error(e.response?.data?.detail || 'Update failed'); }
  };

  const fetchGolfers = async (slot) => {
    setActionLoading(p => ({ ...p, [`golfers_${slot}`]: true }));
    try {
      await axios.post(`${API}/admin/fetch-golfers/${slot}?user_id=${user.id}`);
      await fetchTournaments();
      toast.success('Golfers loaded!');
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to fetch golfers'); }
    finally { setActionLoading(p => ({ ...p, [`golfers_${slot}`]: false })); }
  };

  const submitOdds = async () => {
    if (!oddsText.trim()) { toast.error('Paste odds data first'); return; }
    setActionLoading(p => ({ ...p, [`odds_${oddsDialog.slot}`]: true }));
    try {
      await axios.post(`${API}/admin/fetch-odds/${oddsDialog.slot}?user_id=${user.id}`, { odds_text: oddsText });
      await fetchTournaments();
      toast.success('Odds imported & prices set!');
      setOddsDialog({ open: false, slot: null });
      setOddsText('');
    } catch (e) { toast.error(e.response?.data?.detail || 'Import failed'); }
    finally { setActionLoading(p => ({ ...p, [`odds_${oddsDialog.slot}`]: false })); }
  };

  const setDefaultPrices = async (slot) => {
    setActionLoading(p => ({ ...p, [`prices_${slot}`]: true }));
    try {
      await axios.post(`${API}/admin/set-default-prices/${slot}?user_id=${user.id}`);
      await fetchTournaments();
      toast.success('Default prices set!');
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
    finally { setActionLoading(p => ({ ...p, [`prices_${slot}`]: false })); }
  };

  const openPayoutDialog = async (slot) => {
    setPayoutText(``);
    setCurrentPayouts([]);
    setPayoutDialog({ open: true, slot });
    try {
      const r = await axios.get(`${API}/admin/payout-schedule/${slot}?user_id=${user.id}`);
      const sched = r.data.schedule || [];
      setCurrentPayouts(sched);
      if (sched.length > 0) {
        setPayoutText(sched.map(p => `${p.place}: ${p.amount}`).join("\n"));
      }
    } catch {}
  };

  const submitPayout = async () => {
    if (!payoutText.trim()) { toast.error("Paste payout data first"); return; }
    setActionLoading(p => ({ ...p, [`payout_${payoutDialog.slot}`]: true }));
    try {
      const r = await axios.post(`${API}/admin/payout-schedule/${payoutDialog.slot}?user_id=${user.id}`, { payout_text: payoutText });
      toast.success(r.data.message || "Payout schedule saved!");
      setCurrentPayouts(r.data.schedule || []);
      await fetchTournaments();
    } catch (e) { toast.error(e.response?.data?.detail || "Save failed"); }
    finally { setActionLoading(p => ({ ...p, [`payout_${payoutDialog.slot}`]: false })); }
  };

  const resetTournament = async (slot) => {
    if (!window.confirm('Reset this tournament? All teams, scores, and data will be deleted.')) return;
    setActionLoading(p => ({ ...p, [`reset_${slot}`]: true }));
    try {
      await axios.delete(`${API}/admin/tournaments/${slot}?user_id=${user.id}`);
      await fetchTournaments();
      toast.success('Tournament reset!');
    } catch (e) { toast.error(e.response?.data?.detail || 'Reset failed'); }
    finally { setActionLoading(p => ({ ...p, [`reset_${slot}`]: false })); }
  };

  const viewTeams = async (tournament) => {
    if (!tournament.id) { toast.error('Tournament not set up yet'); return; }
    setActionLoading(p => ({ ...p, [`teams_${tournament.slot}`]: true }));
    try {
      const r = await axios.get(`${API}/admin/teams/${tournament.id}?user_id=${user.id}`);
      setTeamsDialog({ open: true, tournament: r.data.tournament, teams: r.data.teams });
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to load teams'); }
    finally { setActionLoading(p => ({ ...p, [`teams_${tournament.slot}`]: false })); }
  };

  const startEditTeam = (team) => {
    setEditingTeam(team);
    setEditGolfers([...team.golfers]);
  };

  const removeGolferFromEdit = (idx) => {
    const newGolfers = [...editGolfers];
    newGolfers.splice(idx, 1);
    setEditGolfers(newGolfers);
  };

  const addGolferToEdit = (golfer) => {
    if (editGolfers.length >= 5) { toast.error('Team is full'); return; }
    if (editGolfers.some(g => g.name === golfer.name)) { toast.error('Already on team'); return; }
    setEditGolfers([...editGolfers, golfer]);
  };

  const saveEditedTeam = async () => {
    if (editGolfers.length !== 5) { toast.error('Must have exactly 5 golfers'); return; }
    setActionLoading(p => ({ ...p, saveEdit: true }));
    try {
      await axios.put(`${API}/admin/teams/${editingTeam.id}?user_id=${user.id}`, { golfers: editGolfers });
      toast.success('Team updated!');
      // Refresh teams list
      const r = await axios.get(`${API}/admin/teams/${teamsDialog.tournament.id}?user_id=${user.id}`);
      setTeamsDialog(p => ({ ...p, teams: r.data.teams }));
      setEditingTeam(null);
      setEditGolfers([]);
    } catch (e) { toast.error(e.response?.data?.detail || 'Update failed'); }
    finally { setActionLoading(p => ({ ...p, saveEdit: false })); }
  };

  const deleteTeam = async (teamId) => {
    if (!window.confirm('Delete this team?')) return;
    try {
      await axios.delete(`${API}/admin/teams/${teamId}?user_id=${user.id}`);
      toast.success('Team deleted!');
      // Refresh teams list
      const r = await axios.get(`${API}/admin/teams/${teamsDialog.tournament.id}?user_id=${user.id}`);
      setTeamsDialog(p => ({ ...p, teams: r.data.teams }));
    } catch (e) { toast.error(e.response?.data?.detail || 'Delete failed'); }
  };


  const exportEmails = () => {
    const seen = new Set();
    const emails = teamsDialog.teams
      .map(t => t.user_email)
      .filter(e => e && !seen.has(e) && seen.add(e));
    if (emails.length === 0) { toast.error('No emails found'); return; }
    // Download as .csv
    const csv = 'Email\n' + emails.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${teamsDialog.tournament?.name || 'tournament'}-emails.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${emails.length} emails`);
  };


  const togglePaid = async (teamId, currentPaid) => {
    try {
      const r = await axios.patch(`${API}/admin/teams/${teamId}/paid?user_id=${user.id}&paid=${!currentPaid}`);
      setTeamsDialog(p => ({
        ...p,
        teams: p.teams.map(t => t.id === teamId ? { ...t, paid: r.data.paid } : t)
      }));
    } catch (e) { toast.error('Failed to update payment status'); }
  };

  const allSlots = [1].map(slot => {
    const t = tournaments.find(x => x.slot === slot);
    return t || { slot, name: '', status: 'setup', golfers: [] };
  });

  if (loading) return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="w-8 h-8 text-[#1B4332] animate-spin" /></div>;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto animate-fade-in-up" data-testid="admin-page">
      <div className="mb-6">
        <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-[#0F172A] tracking-tight">ADMIN</h1>
        <p className="text-slate-500 text-sm mt-1">Tournament Setup & Management</p>
      </div>

      {/* ESPN Event Search */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 mb-6" data-testid="espn-search-panel">
        <h3 className="font-heading font-bold text-sm text-[#0F172A] uppercase tracking-wider mb-3">
          <Search className="w-4 h-4 inline mr-1.5" />Search ESPN Events
        </h3>
        <div className="flex gap-2 flex-wrap">
          <Input data-testid="espn-search-year" value={searchYear} onChange={e => setSearchYear(e.target.value)}
            placeholder="Year" className="w-24 h-9" />
          <Button onClick={searchEspn} disabled={actionLoading.search} data-testid="espn-search-btn"
            className="h-9 bg-[#1B4332] text-white hover:bg-[#2D6A4F]">
            {actionLoading.search ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Search className="w-4 h-4 mr-1" />Search</>}
          </Button>
          {espnEvents.length > 0 && <Badge variant="outline" className="text-xs">{espnEvents.length} events found</Badge>}
        </div>
      </div>

      {/* Tournament Slots */}
      <div className="space-y-4 stagger">
        {allSlots.map(t => (
          <div key={t.slot} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden animate-fade-in-up"
            data-testid={`admin-slot-${t.slot}`}>
            <div className="bg-gradient-to-r from-[#1B4332] to-[#2D6A4F] px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-white font-heading font-bold text-sm uppercase tracking-wider">Masters</span>
                {t.status === 'prices_set' && <Badge className="bg-[#CCFF00] text-[#0F172A] text-[10px]"><CheckCircle className="w-3 h-3 mr-0.5" />Ready</Badge>}
                {t.status === 'golfers_loaded' && <Badge className="bg-blue-400 text-white text-[10px]">Golfers Loaded</Badge>}
              </div>
              <div className="flex items-center gap-2">
                {t.id && (
                  <Button size="sm" variant="ghost" onClick={() => viewTeams(t)} 
                    disabled={actionLoading[`teams_${t.slot}`]}
                    className="h-7 px-2 text-white/80 hover:text-white hover:bg-white/10" data-testid={`view-teams-${t.slot}`}>
                    {actionLoading[`teams_${t.slot}`] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Eye className="w-3.5 h-3.5 mr-1" />Teams</>}
                  </Button>
                )}
                <button onClick={() => resetTournament(t.slot)} 
                  disabled={actionLoading[`reset_${t.slot}`]}
                  className="text-white/50 hover:text-white transition-colors disabled:opacity-30" data-testid={`reset-slot-${t.slot}`}>
                  {actionLoading[`reset_${t.slot}`] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Tournament Name</label>
                <Input data-testid={`slot-name-${t.slot}`} defaultValue={t.name}
                  onBlur={e => { if (e.target.value !== t.name) updateTournament(t.slot, { name: e.target.value }); }}
                  placeholder="e.g., Masters 2026" className="h-9" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">ESPN Event</label>
                <div className="flex gap-2 flex-wrap">
                  {espnEvents.length > 0 ? (
                    <Select value={t.espn_event_id || ''} onValueChange={val => handleEventSelect(t.slot, val)}>
                      <SelectTrigger className="h-9 flex-1 min-w-[200px]" data-testid={`espn-select-${t.slot}`}>
                        <SelectValue placeholder="Select ESPN event..." />
                      </SelectTrigger>
                      <SelectContent>
                        {espnEvents.map(ev => (
                          <SelectItem key={ev.espn_id} value={ev.espn_id}>
                            {ev.name} ({ev.status?.replace('STATUS_','')})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input data-testid={`espn-id-${t.slot}`} defaultValue={t.espn_event_id || ''}
                      onBlur={e => updateTournament(t.slot, { espn_event_id: e.target.value })}
                      placeholder="Search ESPN events above first" className="h-9 flex-1" />
                  )}
                  <Button onClick={() => fetchGolfers(t.slot)} disabled={!t.espn_event_id || actionLoading[`golfers_${t.slot}`]}
                    data-testid={`fetch-golfers-${t.slot}`}
                    className="h-9 bg-[#2D6A4F] text-white hover:bg-[#1B4332]">
                    {actionLoading[`golfers_${t.slot}`] ? <Loader2 className="w-4 h-4 animate-spin" /> :
                      <><Download className="w-4 h-4 mr-1" />Fetch Golfers</>}
                  </Button>
                </div>
              </div>
              {/* Pricing */}
              {t.golfers?.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Pricing</label>
                  <div className="flex gap-2 flex-wrap">
                    <Button onClick={() => { setOddsDialog({ open: true, slot: t.slot }); setOddsText(''); }}
                      disabled={!t.golfers?.length} data-testid={`paste-odds-${t.slot}`}
                      className="h-9 bg-[#1B4332] text-white hover:bg-[#2D6A4F]">
                      <ClipboardPaste className="w-4 h-4 mr-1" />Paste Odds
                    </Button>
                    <Button onClick={() => setDefaultPrices(t.slot)} variant="outline" disabled={!t.golfers?.length || actionLoading[`prices_${t.slot}`]}
                      data-testid={`default-prices-${t.slot}`} className="h-9">
                      {actionLoading[`prices_${t.slot}`] ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Auto-Price'}
                    </Button>
                    <Button onClick={() => {
                      window.open(`${API}/admin/export-csv/${t.slot}?user_id=${user.id}`, '_blank');
                    }} variant="outline" disabled={!t.golfers?.length}
                      data-testid={`export-csv-${t.slot}`} className="h-9">
                      <FileSpreadsheet className="w-4 h-4 mr-1" />CSV
                    </Button>
                  </div>
                </div>
              )}
              {/* Payout Schedule */}
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  <DollarSign className="w-3 h-3 inline mr-1" />Payout Schedule
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button onClick={() => openPayoutDialog(t.slot)}
                    className="h-9 bg-emerald-700 text-white hover:bg-emerald-600"
                    data-testid={`payout-btn-${t.slot}`}>
                    <DollarSign className="w-4 h-4 mr-1" />
                    {t.payout_schedule?.length > 0 ? `Edit Payouts (${t.payout_schedule.length} places)` : Set Payout Schedule}
                  </Button>
                  {t.payout_schedule?.length > 0 && (
                    <span className="text-xs text-emerald-700 font-semibold">✓ {t.payout_schedule.length} places configured</span>
                  )}
                </div>
              </div>
              {/* Entry Deadline */}
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  <Calendar className="w-3 h-3 inline mr-1" />Entry Deadline
                </label>
                <Input 
                  type="datetime-local" 
                  data-testid={`deadline-${t.slot}`}
                  defaultValue={t.deadline ? t.deadline.slice(0, 16) : ''}
                  onBlur={e => {
                    const val = e.target.value;
                    if (val) {
                      const isoDate = new Date(val).toISOString();
                      if (isoDate !== t.deadline) {
                        updateTournament(t.slot, { deadline: isoDate });
                        toast.success('Deadline updated');
                      }
                    }
                  }}
                  className="h-9 max-w-xs"
                />
                {t.deadline && (
                  <p className="text-xs text-slate-400 mt-1">
                    Current: {new Date(t.deadline).toLocaleString()}
                  </p>
                )}
              </div>
              {t.golfers?.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t.golfers.length} Golfers</span>
                    {t.golfers[0]?.price && <Badge variant="outline" className="text-[10px]">Prices Set</Badge>}
                  </div>
                  <ScrollArea className="h-40">
                    <div className="divide-y divide-slate-50">
                      {t.golfers.slice(0, 50).map((g, i) => (
                        <div key={i} className="flex items-center py-1.5 text-xs px-1">
                          <span className="w-6 font-numbers font-bold text-slate-300">{i + 1}</span>
                          <span className="flex-1 text-slate-700">{g.name}</span>
                          {g.price && <span className="font-numbers font-bold text-[#2D6A4F]">{fmt(g.price)}</span>}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Odds Import Dialog */}
      <Dialog open={oddsDialog.open} onOpenChange={(open) => { if (!open) setOddsDialog({ open: false, slot: null }); }}>
        <DialogContent className="sm:max-w-lg" data-testid="odds-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading font-bold text-xl">Import Odds</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-500">Go to FanDuel, DraftKings, or any sportsbook. Copy the golfer names and their tournament winner odds. Paste below.</p>
            <p className="text-xs text-slate-400">Supported formats: <code className="bg-slate-100 px-1 rounded">Name +450</code> or <code className="bg-slate-100 px-1 rounded">Name, +450</code> or <code className="bg-slate-100 px-1 rounded">Name{'\t'}4.50</code></p>
            <textarea data-testid="odds-textarea" value={oddsText} onChange={e => setOddsText(e.target.value)}
              placeholder={"Scottie Scheffler +450\nRory McIlroy +800\nJon Rahm +1200\n..."}
              className="w-full h-48 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]/20 focus:border-[#1B4332] resize-none" />
            <Button data-testid="odds-submit" onClick={submitOdds} disabled={actionLoading[`odds_${oddsDialog.slot}`]}
              className="w-full h-10 bg-[#1B4332] text-white hover:bg-[#2D6A4F] font-bold">
              {actionLoading[`odds_${oddsDialog.slot}`] ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <DollarSign className="w-4 h-4 mr-1" />}
              Import & Set Prices
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payout Schedule Dialog */}
      <Dialog open={payoutDialog.open} onOpenChange={(open) => { if (!open) setPayoutDialog({ open: false, slot: null }); }}>
        <DialogContent className="sm:max-w-lg" data-testid="payout-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading font-bold text-xl">Payout Schedule</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-500">Enter the payout for each finishing position, one per line. Supports up to 70 places. Players who miss the cut automatically receive a flat $10,000.</p>
            <p className="text-xs text-slate-400">Format: <code className="bg-slate-100 px-1 rounded">1: 3600000</code> or <code className="bg-slate-100 px-1 rounded">1 3600000</code> (no commas or $ signs needed, but they are accepted)</p>
            <textarea data-testid="payout-textarea" value={payoutText} onChange={e => setPayoutText(e.target.value)}
              placeholder={"1: 3600000\n2: 2160000\n3: 1350000\n4: 960000\n5: 800000\n..."}
              className="w-full h-64 border border-slate-200 rounded-xl p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 resize-none" />
            {currentPayouts.length > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <p className="text-xs font-bold text-emerald-700 mb-1">Currently saved: {currentPayouts.length} places</p>
                <p className="text-xs text-emerald-600">1st: ${currentPayouts[0]?.amount?.toLocaleString()} → {currentPayouts[currentPayouts.length-1]?.place}th: ${currentPayouts[currentPayouts.length-1]?.amount?.toLocaleString()}</p>
              </div>
            )}
            <Button data-testid="payout-submit" onClick={submitPayout} disabled={actionLoading[`payout_${payoutDialog.slot}`]}
              className="w-full h-10 bg-emerald-700 text-white hover:bg-emerald-600 font-bold">
              {actionLoading[`payout_${payoutDialog.slot}`] ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <DollarSign className="w-4 h-4 mr-1" />}
              Save Payout Schedule
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Teams Dialog */}
      <Dialog open={teamsDialog.open} onOpenChange={(open) => { if (!open) { setTeamsDialog({ open: false, tournament: null, teams: [] }); setEditingTeam(null); setEditGolfers([]); } }}>
        <DialogContent className="sm:max-w-2xl h-[85vh] flex flex-col" data-testid="teams-dialog">
          <DialogHeader>
            <div className="flex items-center justify-between pr-8">
              <DialogTitle className="font-heading font-bold text-xl">
                {teamsDialog.tournament?.name} - Teams ({teamsDialog.teams.length})
              </DialogTitle>
              {!editingTeam && teamsDialog.teams.length > 0 && (
                <Button size="sm" variant="outline" onClick={exportEmails}
                  className="h-8 px-3 text-xs font-bold flex items-center gap-1.5 border-[#1B4332] text-[#1B4332] hover:bg-[#1B4332] hover:text-white">
                  <Mail className="w-3.5 h-3.5" />Export Emails
                </Button>
              )}
            </div>
          </DialogHeader>
          
          {editingTeam ? (
            // Edit mode
            <div className="flex-1 overflow-auto">
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-sm">Editing: {editingTeam.user_name} #{editingTeam.team_number}</h4>
                  <Button size="sm" variant="ghost" onClick={() => { setEditingTeam(null); setEditGolfers([]); }}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 space-y-2 mb-4">
                  <p className="text-xs text-slate-500 font-semibold uppercase">Current Team ({editGolfers.length}/5)</p>
                  {editGolfers.map((g, i) => (
                    <div key={i} className="flex items-center justify-between bg-white rounded px-2 py-1">
                      <span className="text-sm">{g.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-numbers text-[#2D6A4F]">{fmt(g.price)}</span>
                        <button onClick={() => removeGolferFromEdit(i)} className="text-red-400 hover:text-red-600">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {editGolfers.length < 5 && (
                    <p className="text-xs text-slate-400 italic">Select {5 - editGolfers.length} more golfer(s) below</p>
                  )}
                </div>
                <p className="text-xs text-slate-500 font-semibold uppercase mb-2">Available Golfers</p>
                <ScrollArea className="h-48">
                  <div className="space-y-1">
                    {teamsDialog.tournament?.golfers?.filter(g => g.price).map((g, i) => {
                      const onTeam = editGolfers.some(eg => eg.name === g.name);
                      return (
                        <div key={i} className={`flex items-center justify-between px-2 py-1 rounded ${onTeam ? 'bg-green-50' : 'hover:bg-slate-50'}`}>
                          <span className={`text-sm ${onTeam ? 'text-green-700 font-medium' : ''}`}>{g.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-numbers text-[#2D6A4F]">{fmt(g.price)}</span>
                            {!onTeam && (
                              <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => addGolferToEdit(g)}>
                                Add
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
                <Button onClick={saveEditedTeam} disabled={editGolfers.length !== 5 || actionLoading.saveEdit}
                  className="w-full mt-4 bg-[#1B4332] text-white hover:bg-[#2D6A4F]">
                  {actionLoading.saveEdit ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Save Changes
                </Button>
              </div>
            </div>
          ) : (
            // List mode
            <ScrollArea className="flex-1 min-h-0">
              {teamsDialog.teams.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <Users className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>No teams entered yet</p>
                </div>
              ) : (
                <div className="space-y-3 pr-2">
                  {teamsDialog.teams.map(team => (
                    <div key={team.id} className="bg-slate-50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="font-bold text-sm text-[#0F172A]">{team.user_name} #{team.team_number}</span>
                          <span className="text-xs text-slate-400 ml-2">{team.user_email}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {/* Paid toggle */}
                          <button
                            onClick={() => togglePaid(team.id, team.paid)}
                            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold border transition-colors ${
                              team.paid
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                : 'bg-red-50 text-red-500 border-red-200 hover:bg-red-100'
                            }`}
                            title={team.paid ? 'Mark as unpaid' : 'Mark as paid'}
                          >
                            {team.paid ? '✓ Paid' : '✗ Unpaid'}
                          </button>
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => startEditTeam(team)} data-testid={`edit-team-${team.id}`}>
                            <Pencil className="w-3.5 h-3.5 mr-1" />Edit
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-red-500 hover:text-red-700" onClick={() => deleteTeam(team.id)} data-testid={`delete-team-${team.id}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {team.golfers.map((g, i) => (
                          <div key={i} className="flex items-center text-xs">
                            <span className="w-5 text-slate-400">{i + 1}.</span>
                            <span className="flex-1 text-slate-700">{g.name}</span>
                            <span className="font-numbers text-[#2D6A4F]">{fmt(g.price)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 pt-2 border-t border-slate-200 flex justify-between text-xs">
                        <span className="text-slate-400">Total Cost:</span>
                        <span className="font-numbers font-bold text-[#1B4332]">{fmt(team.total_cost)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
