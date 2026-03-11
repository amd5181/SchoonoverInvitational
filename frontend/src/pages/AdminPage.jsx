import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import axios from 'axios';
import { API, useAuth } from '../App';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { ScrollArea } from '../components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Settings, Search, Download, DollarSign, Trash2, Loader2, Users, CheckCircle,
  ClipboardPaste, FileSpreadsheet, Calendar, Eye, Pencil, X, Mail, BarChart2,
  TrendingUp, Star, Upload, RefreshCw, Link, Unlink, AlertCircle, Plus, Ban
} from 'lucide-react';

const fmt = (n) => '$' + (n || 0).toLocaleString();
const fmtK = (n) => n >= 1_000_000 ? '$' + (n / 1_000_000).toFixed(2) + 'M' : '$' + Math.round(n / 1000) + 'K';

function toEasternInputValue(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(d);
    const get = t => parts.find(p => p.type === t)?.value ?? '00';
    const h = get('hour') === '24' ? '00' : get('hour');
    return `${get('year')}-${get('month')}-${get('day')}T${h}:${get('minute')}`;
  } catch { return isoStr.slice(0, 16); }
}

function easternInputToISO(val) {
  if (!val) return '';
  try {
    const [datePart, timePart] = val.split('T');
    const [y, mo, d] = datePart.split('-').map(Number);
    const [h, m] = timePart.split(':').map(Number);
    const utcGuess = new Date(Date.UTC(y, mo - 1, d, h, m));
    const fmtParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(utcGuess);
    const get = t => Number(fmtParts.find(p => p.type === t)?.value);
    const easternHour = get('hour') === 24 ? 0 : get('hour');
    const offsetMs = ((h - easternHour) * 60 + (m - get('minute'))) * 60000;
    return new Date(utcGuess.getTime() + offsetMs).toISOString();
  } catch { return new Date(val).toISOString(); }
}

// ── Mapping status badge ──
function MappingBadge({ status }) {
  if (!status || status === 'manual') return null;
  const config = {
    auto_mapped: { label: 'ESPN ✓', cls: 'bg-blue-100 text-blue-700' },
    manually_mapped: { label: 'Mapped', cls: 'bg-purple-100 text-purple-700' },
    not_in_field: { label: 'Not in Field', cls: 'bg-red-100 text-red-700 font-bold' },
  };
  const c = config[status];
  if (!c) return null;
  return <span className={`text-[9px] px-1.5 py-0.5 rounded ${c.cls}`}>{c.label}</span>;
}

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
  const [statsDialog, setStatsDialog] = useState({ open: false, tournament: null, teams: [] });
  const [editingTeam, setEditingTeam] = useState(null);
  const [editGolfers, setEditGolfers] = useState([]);
  const [payoutDialog, setPayoutDialog] = useState({ open: false, slot: null });
  const [payoutText, setPayoutText] = useState('');
  const [currentPayouts, setCurrentPayouts] = useState([]);

  // ── New upload/sync state ──
  const [uploadDialog, setUploadDialog] = useState({ open: false, slot: null });
  const [uploadText, setUploadText] = useState('');
  const [syncDialog, setSyncDialog] = useState({ open: false, slot: null, data: null });
  // Local sync decisions (before confirming)
  const [syncDecisions, setSyncDecisions] = useState({
    unmapped: new Set(),          // player_ids to unmap from auto_mapped_new
    manualMappings: {},           // player_id -> {espn_id, espn_name, short_name} | null
    espnAdditions: {},            // espn_id -> price string
    espnDiscards: new Set(),      // espn_ids to discard
  });

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

  // ── Upload manual players ──
  const openUploadDialog = (slot) => {
    setUploadText('');
    setUploadDialog({ open: true, slot });
  };

  const submitUpload = async () => {
    if (!uploadText.trim()) { toast.error('Paste player list first'); return; }
    const slot = uploadDialog.slot;
    setActionLoading(p => ({ ...p, [`upload_${slot}`]: true }));
    try {
      await axios.post(`${API}/admin/upload-players/${slot}?user_id=${user.id}`, { players_text: uploadText });
      await fetchTournaments();
      toast.success('Players uploaded!');
      setUploadDialog({ open: false, slot: null });
      setUploadText('');
    } catch (e) { toast.error(e.response?.data?.detail || 'Upload failed'); }
    finally { setActionLoading(p => ({ ...p, [`upload_${slot}`]: false })); }
  };

  // ── ESPN Sync ──
  const syncEspn = async (slot) => {
    setActionLoading(p => ({ ...p, [`sync_${slot}`]: true }));
    try {
      const r = await axios.post(`${API}/admin/sync-espn/${slot}?user_id=${user.id}`);
      setSyncDecisions({ unmapped: new Set(), manualMappings: {}, espnAdditions: {}, espnDiscards: new Set() });
      setSyncDialog({ open: true, slot, data: r.data });
      toast.success(r.data.message);
    } catch (e) { toast.error(e.response?.data?.detail || 'Sync failed'); }
    finally { setActionLoading(p => ({ ...p, [`sync_${slot}`]: false })); }
  };

  const handleUnmap = (playerId) => {
    setSyncDecisions(prev => {
      const unmapped = new Set(prev.unmapped);
      unmapped.add(playerId);
      return { ...prev, unmapped };
    });
  };

  const handleReunmap = (playerId) => {
    setSyncDecisions(prev => {
      const unmapped = new Set(prev.unmapped);
      unmapped.delete(playerId);
      return { ...prev, unmapped };
    });
  };

  const handleManualMapping = (playerId, espnData) => {
    setSyncDecisions(prev => ({
      ...prev,
      manualMappings: { ...prev.manualMappings, [playerId]: espnData }
    }));
  };

  const handleEspnPrice = (espnId, price) => {
    setSyncDecisions(prev => ({
      ...prev,
      espnAdditions: { ...prev.espnAdditions, [espnId]: price }
    }));
  };

  const handleEspnDiscard = (espnId) => {
    setSyncDecisions(prev => {
      const espnDiscards = new Set(prev.espnDiscards);
      if (espnDiscards.has(espnId)) espnDiscards.delete(espnId);
      else espnDiscards.add(espnId);
      return { ...prev, espnDiscards };
    });
  };

  const confirmSync = async () => {
    const slot = syncDialog.slot;
    setActionLoading(p => ({ ...p, [`confirmSync_${slot}`]: true }));
    try {
      // Convert espn_additions: filter out empty prices and convert to int
      const espnAdditions = {};
      for (const [eid, priceStr] of Object.entries(syncDecisions.espnAdditions)) {
        const price = parseInt(String(priceStr).replace(/[$,]/g, ''), 10);
        if (price > 0) espnAdditions[eid] = price;
      }
      await axios.post(`${API}/admin/confirm-sync/${slot}?user_id=${user.id}`, {
        manual_mappings: syncDecisions.manualMappings,
        espn_additions: espnAdditions,
        espn_discards: Array.from(syncDecisions.espnDiscards),
        unmap_player_ids: Array.from(syncDecisions.unmapped),
      });
      await fetchTournaments();
      toast.success('Sync confirmed! Golfers updated.');
      setSyncDialog({ open: false, slot: null, data: null });
    } catch (e) { toast.error(e.response?.data?.detail || 'Confirm failed'); }
    finally { setActionLoading(p => ({ ...p, [`confirmSync_${slot}`]: false })); }
  };

  const unmapPlayer = async (slot, playerId, playerName) => {
    if (!window.confirm(`Unmap "${playerName}" and return to manual mapping pool?`)) return;
    setActionLoading(p => ({ ...p, [`unmap_${playerId}`]: true }));
    try {
      await axios.post(`${API}/admin/unmap-player/${slot}?user_id=${user.id}`, { player_id: playerId });
      await fetchTournaments();
      toast.success('Player unmapped');
    } catch (e) { toast.error(e.response?.data?.detail || 'Unmap failed'); }
    finally { setActionLoading(p => ({ ...p, [`unmap_${playerId}`]: false })); }
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
    setPayoutText('');
    setCurrentPayouts([]);
    setPayoutDialog({ open: true, slot });
    try {
      const r = await axios.get(`${API}/admin/payout-schedule/${slot}?user_id=${user.id}`);
      const sched = r.data.schedule || [];
      setCurrentPayouts(sched);
      if (sched.length > 0) {
        setPayoutText(sched.map(p => `${p.place}: ${p.amount}`).join('\n'));
      }
    } catch {}
  };

  const submitPayout = async () => {
    if (!payoutText.trim()) { toast.error('Paste payout data first'); return; }
    setActionLoading(p => ({ ...p, [`payout_${payoutDialog.slot}`]: true }));
    try {
      const r = await axios.post(`${API}/admin/payout-schedule/${payoutDialog.slot}?user_id=${user.id}`, { payout_text: payoutText });
      toast.success(r.data.message || 'Payout schedule saved!');
      setCurrentPayouts(r.data.schedule || []);
      await fetchTournaments();
    } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); }
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

  const viewStats = async (tournament) => {
    if (!tournament.id) { toast.error('Tournament not set up yet'); return; }
    setActionLoading(p => ({ ...p, [`stats_${tournament.slot}`]: true }));
    try {
      const r = await axios.get(`${API}/admin/teams/${tournament.id}?user_id=${user.id}`);
      setStatsDialog({ open: true, tournament: r.data.tournament, teams: r.data.teams });
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to load stats'); }
    finally { setActionLoading(p => ({ ...p, [`stats_${tournament.slot}`]: false })); }
  };

  const startEditTeam = (team) => {
    setEditingTeam(team);
    setEditGolfers([...team.golfers]);
  };

  const removeGolferFromEdit = (idx) => {
    const ng = [...editGolfers];
    ng.splice(idx, 1);
    setEditGolfers(ng);
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

  const statsData = useMemo(() => {
    const { teams, tournament } = statsDialog;
    if (!teams || teams.length === 0) return null;
    const teamCount = teams.length;
    const allPicks = teams.flatMap(t => t.golfers || []);
    const uniqueCount = new Set(allPicks.map(g => g.name)).size;
    const teamSalaries = teams.map(t => (t.golfers || []).reduce((s, g) => s + (g.price || 0), 0));
    const avgSalary = teamSalaries.reduce((a, b) => a + b, 0) / teamCount;
    const pickCounts = {};
    allPicks.forEach(g => { pickCounts[g.name] = (pickCounts[g.name] || 0) + 1; });
    const mostPicked = Object.entries(pickCounts)
      .map(([name, count]) => ({ name, count, pct: Math.round((count / teamCount) * 100) }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 8);
    const minSalary = Math.min(...teamSalaries);
    const lowestTeam = teams[teamSalaries.indexOf(minSalary)];
    const pickedNames = new Set(allPicks.map(g => g.name.toLowerCase()));
    const unpicked = (tournament?.golfers || [])
      .filter(g => g.price && !pickedNames.has(g.name.toLowerCase()))
      .sort((a, b) => (a.world_ranking || 999) - (b.world_ranking || 999))
      .slice(0, 5);
    return { teamCount, uniqueCount, avgSalary, mostPicked, lowestTeam, lowestSalary: minSalary, unpicked };
  }, [statsDialog]);

  // Build "not in field" lookup from tournament golfers
  const notInFieldNames = useMemo(() => {
    const set = new Set();
    if (teamsDialog.tournament?.golfers) {
      teamsDialog.tournament.golfers.forEach(g => {
        if (g.mapping_status === 'not_in_field') set.add(g.name.toLowerCase());
      });
    }
    return set;
  }, [teamsDialog.tournament]);

  const allSlots = [1].map(slot => {
    const t = tournaments.find(x => x.slot === slot);
    return t || { slot, name: '', status: 'setup', golfers: [] };
  });

  // ── Sync dialog computed values ──
  const syncData = syncDialog.data;
  const autoMappedVisible = useMemo(() => {
    if (!syncData) return [];
    return (syncData.auto_mapped_new || []).filter(p => !syncDecisions.unmapped.has(p.player_id));
  }, [syncData, syncDecisions.unmapped]);

  const unmappedToManual = useMemo(() => {
    if (!syncData) return [];
    return (syncData.auto_mapped_new || []).filter(p => syncDecisions.unmapped.has(p.player_id));
  }, [syncData, syncDecisions.unmapped]);

  const pendingManualAll = useMemo(() => {
    if (!syncData) return [];
    return [...(syncData.pending_manual || []), ...unmappedToManual];
  }, [syncData, unmappedToManual]);

  const pendingEspnVisible = useMemo(() => {
    if (!syncData) return [];
    return (syncData.pending_espn || []).filter(ep => !syncDecisions.espnDiscards.has(ep.espn_id));
  }, [syncData, syncDecisions.espnDiscards]);

  if (loading) return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="w-8 h-8 text-[#1B4332] animate-spin" /></div>;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto animate-fade-in-up" data-testid="admin-page">
      <div className="mb-6">
        <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-[#0F172A] tracking-tight">ADMIN</h1>
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
                {t.status === 'manually_loaded' && <Badge className="bg-amber-400 text-white text-[10px]"><Upload className="w-3 h-3 mr-0.5" />Manual Upload</Badge>}
              </div>
              <div className="flex items-center gap-2">
                {t.id && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => viewTeams(t)}
                      disabled={actionLoading[`teams_${t.slot}`]}
                      className="h-7 px-2 text-white/80 hover:text-white hover:bg-white/10" data-testid={`view-teams-${t.slot}`}>
                      {actionLoading[`teams_${t.slot}`] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Eye className="w-3.5 h-3.5 mr-1" />Teams</>}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => viewStats(t)}
                      disabled={actionLoading[`stats_${t.slot}`]}
                      title="Entry Stats Snapshot"
                      className="h-7 px-2 text-white/80 hover:text-white hover:bg-white/10">
                      {actionLoading[`stats_${t.slot}`] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BarChart2 className="w-3.5 h-3.5" />}
                    </Button>
                  </>
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
                            {ev.name} ({ev.status?.replace('STATUS_', '')})
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
                      <><Download className="w-4 h-4 mr-1" />Fetch from ESPN</>}
                  </Button>
                </div>
              </div>

              {/* Manual Upload + ESPN Sync section */}
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  <Upload className="w-3 h-3 inline mr-1" />Early Player Entry
                </label>
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={() => openUploadDialog(t.slot)}
                    className="h-9 bg-indigo-600 text-white hover:bg-indigo-700"
                    data-testid={`upload-players-${t.slot}`}>
                    <Upload className="w-4 h-4 mr-1" />Upload Players &amp; Prices
                  </Button>
                  {(t.status === 'manually_loaded' || t.status === 'prices_set') && t.espn_event_id && (
                    <Button onClick={() => syncEspn(t.slot)} disabled={actionLoading[`sync_${t.slot}`]}
                      className="h-9 bg-purple-600 text-white hover:bg-purple-700"
                      data-testid={`sync-espn-${t.slot}`}>
                      {actionLoading[`sync_${t.slot}`] ? <Loader2 className="w-4 h-4 animate-spin" /> :
                        <><RefreshCw className="w-4 h-4 mr-1" />Sync with ESPN</>}
                    </Button>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Upload the field manually on Monday with prices. On Tuesday, sync with ESPN to map ESPN IDs for live scoring.
                </p>
              </div>

              {/* Pricing (only show when golfers loaded via ESPN direct fetch) */}
              {t.golfers?.length > 0 && t.status === 'golfers_loaded' && (
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
                    <Button onClick={() => window.open(`${API}/admin/export-csv/${t.slot}?user_id=${user.id}`, '_blank')}
                      variant="outline" disabled={!t.golfers?.length}
                      data-testid={`export-csv-${t.slot}`} className="h-9">
                      <FileSpreadsheet className="w-4 h-4 mr-1" />CSV
                    </Button>
                  </div>
                </div>
              )}

              {/* Pricing for manually_loaded/prices_set with manual upload */}
              {t.golfers?.length > 0 && ['manually_loaded', 'prices_set'].includes(t.status) && (
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={() => window.open(`${API}/admin/export-csv/${t.slot}?user_id=${user.id}`, '_blank')}
                    variant="outline" disabled={!t.golfers?.length}
                    data-testid={`export-csv-${t.slot}`} className="h-9">
                    <FileSpreadsheet className="w-4 h-4 mr-1" />CSV
                  </Button>
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
                    {t.payout_schedule?.length > 0 ? `Edit Payouts (${t.payout_schedule.length} places)` : 'Set Payout Schedule'}
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
                  defaultValue={toEasternInputValue(t.deadline)}
                  onBlur={e => {
                    const val = e.target.value;
                    if (val) {
                      const isoDate = easternInputToISO(val);
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
                    Current: {new Date(t.deadline).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} ET
                  </p>
                )}
              </div>

              {/* Golfer list */}
              {t.golfers?.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t.golfers.length} Golfers</span>
                    {t.golfers[0]?.price && <Badge variant="outline" className="text-[10px]">Prices Set</Badge>}
                    {t.status === 'manually_loaded' && (
                      <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-600">Needs ESPN Sync</Badge>
                    )}
                  </div>
                  <ScrollArea className="h-48">
                    <div className="divide-y divide-slate-50">
                      {t.golfers.slice(0, 60).map((g, i) => (
                        <div key={i} className={`flex items-center py-1.5 text-xs px-1 gap-2 ${g.mapping_status === 'not_in_field' ? 'opacity-50' : ''}`}>
                          <span className="w-6 font-numbers font-bold text-slate-300">{g.mapping_status !== 'not_in_field' ? i + 1 : '–'}</span>
                          <span className={`flex-1 text-slate-700 ${g.mapping_status === 'not_in_field' ? 'line-through' : ''}`}>{g.name}</span>
                          <MappingBadge status={g.mapping_status} />
                          {g.price && g.mapping_status !== 'not_in_field' && (
                            <span className="font-numbers font-bold text-[#2D6A4F]">{fmt(g.price)}</span>
                          )}
                          {g.mapping_status === 'not_in_field' && (
                            <span className="text-red-500 text-[9px] font-bold">Not in field</span>
                          )}
                          {(g.mapping_status === 'auto_mapped' || g.mapping_status === 'manually_mapped') && (
                            <button
                              onClick={() => unmapPlayer(t.slot, g.player_id, g.name)}
                              disabled={actionLoading[`unmap_${g.player_id}`]}
                              title="Unmap from ESPN"
                              className="text-slate-300 hover:text-red-400 transition-colors"
                            >
                              {actionLoading[`unmap_${g.player_id}`] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3 h-3" />}
                            </button>
                          )}
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

      {/* ── Upload Players Dialog ── */}
      <Dialog open={uploadDialog.open} onOpenChange={(open) => { if (!open) setUploadDialog({ open: false, slot: null }); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading font-bold text-xl">Upload Players &amp; Prices</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Paste the field with prices — one player per line. This allows team building before ESPN publishes the official field (usually Tuesday).
            </p>
            <p className="text-xs text-slate-400">
              Formats accepted: <code className="bg-slate-100 px-1 rounded">Name, Price</code> or <code className="bg-slate-100 px-1 rounded">Name\tPrice</code> or <code className="bg-slate-100 px-1 rounded">Name $300,000</code>
            </p>
            <textarea
              value={uploadText}
              onChange={e => setUploadText(e.target.value)}
              placeholder={"Scottie Scheffler, 300000\nRory McIlroy, 280000\nJon Rahm, 250000\n..."}
              className="w-full h-56 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none font-mono"
            />
            <Button onClick={submitUpload} disabled={actionLoading[`upload_${uploadDialog.slot}`]}
              className="w-full h-10 bg-indigo-600 text-white hover:bg-indigo-700 font-bold">
              {actionLoading[`upload_${uploadDialog.slot}`] ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-1" />}
              Upload Players
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── ESPN Sync Dialog ── */}
      <Dialog open={syncDialog.open} onOpenChange={(open) => { if (!open) setSyncDialog({ open: false, slot: null, data: null }); }}>
        <DialogContent className="sm:max-w-3xl h-[90vh] flex flex-col p-0 overflow-hidden">
          <div className="bg-gradient-to-r from-purple-700 to-purple-500 px-6 py-4">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-white" />
              <h2 className="font-heading font-bold text-white text-lg">ESPN Sync</h2>
            </div>
            {syncData && (
              <p className="text-purple-200 text-xs mt-1">{syncData.message}</p>
            )}
          </div>

          {syncData && (
            <Tabs defaultValue="auto" className="flex flex-col flex-1 min-h-0">
              <TabsList className="mx-4 mt-3 flex-shrink-0">
                <TabsTrigger value="auto" className="flex-1">
                  Auto-Mapped ({autoMappedVisible.length + (syncData.already_mapped?.length || 0)})
                </TabsTrigger>
                <TabsTrigger value="manual" className="flex-1 relative">
                  Needs Mapping ({pendingManualAll.length})
                  {pendingManualAll.length > 0 && (
                    <span className="ml-1 w-4 h-4 bg-amber-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center">{pendingManualAll.length}</span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="espn" className="flex-1">
                  ESPN Only ({pendingEspnVisible.length})
                </TabsTrigger>
              </TabsList>

              {/* Tab: Auto-Mapped */}
              <TabsContent value="auto" className="flex-1 min-h-0 overflow-hidden mx-4 mb-4">
                <ScrollArea className="h-full">
                  <p className="text-xs text-slate-500 mb-3">These players were matched with 99%+ confidence. Use <Unlink className="w-3 h-3 inline" /> to move to manual mapping.</p>

                  {/* Previously confirmed mappings */}
                  {(syncData.already_mapped?.length || 0) > 0 && (
                    <div className="mb-3">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Previously Confirmed</p>
                      <div className="space-y-1">
                        {syncData.already_mapped.map(p => (
                          <div key={p.player_id} className="flex items-center gap-2 bg-slate-50 rounded px-2 py-1.5 text-xs">
                            <CheckCircle className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            <span className="flex-1 font-medium">{p.name}</span>
                            <span className="text-slate-400">→</span>
                            <span className="text-blue-600">{p.espn_name}</span>
                            <Badge className={`text-[9px] ${p.mapping_status === 'auto_mapped' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                              {p.mapping_status === 'auto_mapped' ? 'ESPN ✓' : 'Manual'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* New auto-mapped */}
                  {autoMappedVisible.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">New Auto-Matches</p>
                      <div className="space-y-1">
                        {autoMappedVisible.map(p => (
                          <div key={p.player_id} className="flex items-center gap-2 bg-green-50 border border-green-100 rounded px-2 py-1.5 text-xs">
                            <Link className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                            <span className="flex-1 font-medium">{p.name}</span>
                            <span className="text-slate-400">→</span>
                            <span className="text-green-700 font-medium">{p.espn_name}</span>
                            <span className="text-[9px] text-green-500">{fmt(p.price)}</span>
                            <button onClick={() => handleUnmap(p.player_id)}
                              title="Move to manual mapping"
                              className="text-slate-300 hover:text-amber-500 transition-colors ml-1">
                              <Unlink className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {autoMappedVisible.length === 0 && (syncData.already_mapped?.length || 0) === 0 && (
                    <div className="text-center py-8 text-slate-400 text-sm">No auto-mapped players yet</div>
                  )}
                </ScrollArea>
              </TabsContent>

              {/* Tab: Needs Manual Mapping */}
              <TabsContent value="manual" className="flex-1 min-h-0 overflow-hidden mx-4 mb-4">
                <ScrollArea className="h-full">
                  {pendingManualAll.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
                      <p className="text-sm">All players mapped!</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-slate-500">For each player, select their ESPN counterpart or mark as "Not in Field".</p>
                      {pendingManualAll.map(p => {
                        const decided = syncDecisions.manualMappings[p.player_id];
                        return (
                          <div key={p.player_id} className={`border rounded-lg p-3 ${decided === null ? 'border-red-200 bg-red-50' : decided ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <p className="text-sm font-bold text-slate-800">{p.name}</p>
                                <p className="text-xs text-slate-500">{fmt(p.price)}</p>
                              </div>
                              {decided === null && <Badge className="bg-red-100 text-red-700 text-[9px]">Not in Field</Badge>}
                              {decided && <Badge className="bg-green-100 text-green-700 text-[9px]">Mapped → {decided.espn_name}</Badge>}
                            </div>
                            <div className="flex gap-2 flex-wrap">
                              <Select
                                value={decided ? decided.espn_id : ''}
                                onValueChange={val => {
                                  const candidate = (p.candidates || []).find(c => c.espn_id === val);
                                  if (candidate) handleManualMapping(p.player_id, { espn_id: candidate.espn_id, espn_name: candidate.espn_name, short_name: candidate.short_name || '' });
                                }}
                              >
                                <SelectTrigger className="h-8 flex-1 text-xs">
                                  <SelectValue placeholder="Select ESPN player..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {(p.candidates || []).map(c => (
                                    <SelectItem key={c.espn_id} value={c.espn_id}>
                                      {c.espn_name} {c.score >= 0.99 ? '✓' : c.score >= 0.8 ? '~' : '?'}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <button
                                onClick={() => handleManualMapping(p.player_id, null)}
                                className={`h-8 px-3 rounded text-xs font-bold border transition-colors ${decided === null ? 'bg-red-500 text-white border-red-500' : 'border-red-300 text-red-500 hover:bg-red-50'}`}
                              >
                                <Ban className="w-3 h-3 inline mr-1" />Not in Field
                              </button>
                              {decided !== undefined && (
                                <button onClick={() => {
                                  const { [p.player_id]: _, ...rest } = syncDecisions.manualMappings;
                                  setSyncDecisions(prev => ({ ...prev, manualMappings: rest }));
                                }} className="h-8 px-2 rounded text-xs text-slate-400 hover:text-slate-600">
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                            {syncDecisions.unmapped.has(p.player_id) && (
                              <button onClick={() => handleReunmap(p.player_id)} className="text-[10px] text-purple-500 hover:text-purple-700 mt-1">
                                ↩ Re-add to auto-mapped
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              {/* Tab: ESPN Only */}
              <TabsContent value="espn" className="flex-1 min-h-0 overflow-hidden mx-4 mb-4">
                <ScrollArea className="h-full">
                  <p className="text-xs text-slate-500 mb-3">
                    These players are in the ESPN field but not in your manual list. Add them with a price or discard them.
                  </p>
                  {pendingEspnVisible.length === 0 && syncDecisions.espnDiscards.size === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm">No unmatched ESPN players</div>
                  ) : (
                    <div className="space-y-2">
                      {pendingEspnVisible.map(ep => {
                        const price = syncDecisions.espnAdditions[ep.espn_id] || '';
                        const isAdded = price && parseInt(String(price).replace(/[$,]/g, ''), 10) > 0;
                        return (
                          <div key={ep.espn_id} className={`border rounded-lg px-3 py-2 flex items-center gap-2 text-xs ${isAdded ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-white'}`}>
                            <span className="flex-1 font-medium text-slate-700">{ep.espn_name}</span>
                            <Input
                              value={price}
                              onChange={e => handleEspnPrice(ep.espn_id, e.target.value)}
                              placeholder="Price (e.g. 75000)"
                              className="h-7 w-36 text-xs"
                            />
                            {isAdded && <span className="text-green-600 font-bold text-[10px]">Will add</span>}
                            <button
                              onClick={() => handleEspnDiscard(ep.espn_id)}
                              title="Discard this ESPN player"
                              className="text-slate-300 hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                      {syncDecisions.espnDiscards.size > 0 && (
                        <p className="text-[10px] text-slate-400 mt-2">{syncDecisions.espnDiscards.size} player(s) marked for discard</p>
                      )}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}

          <div className="px-4 pb-4 border-t border-slate-100 pt-3 flex-shrink-0">
            <div className="flex items-center gap-3">
              {pendingManualAll.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-amber-600">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{pendingManualAll.filter(p => syncDecisions.manualMappings[p.player_id] === undefined).length} players still unresolved</span>
                </div>
              )}
              <Button onClick={confirmSync}
                disabled={actionLoading[`confirmSync_${syncDialog.slot}`]}
                className="ml-auto bg-purple-600 text-white hover:bg-purple-700 font-bold px-6">
                {actionLoading[`confirmSync_${syncDialog.slot}`] ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-1" />}
                Confirm Sync
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Odds Import Dialog ── */}
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

      {/* ── Payout Schedule Dialog ── */}
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
                <p className="text-xs text-emerald-600">1st: ${currentPayouts[0]?.amount?.toLocaleString()} → {currentPayouts[currentPayouts.length - 1]?.place}th: ${currentPayouts[currentPayouts.length - 1]?.amount?.toLocaleString()}</p>
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

      {/* ── Entry Stats Snapshot Dialog ── */}
      <Dialog open={statsDialog.open} onOpenChange={(open) => !open && setStatsDialog({ open: false, tournament: null, teams: [] })}>
        <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto p-0">
          <div className="bg-gradient-to-r from-[#1B4332] to-[#2D6A4F] px-6 py-4 rounded-t-xl">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-[#CCFF00]" />
              <h2 className="font-heading font-bold text-white text-lg">Entry Snapshot</h2>
              <span className="text-white/50 text-sm">— {statsDialog.tournament?.name}</span>
            </div>
          </div>
          <div className="p-5 space-y-5">
            {!statsData ? (
              <div className="text-center py-10 text-slate-400">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No teams entered yet</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-[#1B4332] rounded-xl p-3 text-center">
                    <p className="text-[#CCFF00] font-numbers font-extrabold text-3xl">{statsData.teamCount}</p>
                    <p className="text-white/70 text-[10px] uppercase tracking-wide mt-0.5 font-bold">Teams</p>
                  </div>
                  <div className="bg-[#2D6A4F] rounded-xl p-3 text-center">
                    <p className="text-[#CCFF00] font-numbers font-extrabold text-3xl">{statsData.uniqueCount}</p>
                    <p className="text-white/70 text-[10px] uppercase tracking-wide mt-0.5 font-bold">Unique Picks</p>
                  </div>
                  <div className="bg-amber-500 rounded-xl p-3 text-center">
                    <p className="text-white font-numbers font-extrabold text-2xl leading-tight">{fmtK(statsData.avgSalary)}</p>
                    <p className="text-white/80 text-[10px] uppercase tracking-wide mt-0.5 font-bold">Avg Salary</p>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 mb-3">
                    <TrendingUp className="w-4 h-4 text-[#1B4332]" />
                    <h3 className="font-bold text-sm text-[#0F172A] uppercase tracking-wide">Most Popular Picks</h3>
                  </div>
                  <div className="space-y-2">
                    {statsData.mostPicked.map((p, i) => (
                      <div key={p.name} className="flex items-center gap-2">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${
                          i === 0 ? 'bg-yellow-400 text-yellow-900' :
                          i === 1 ? 'bg-slate-200 text-slate-600' :
                          i === 2 ? 'bg-amber-200 text-amber-800' : 'bg-slate-100 text-slate-500'
                        }`}>{i + 1}</span>
                        <span className="text-xs font-medium text-[#0F172A] w-36 truncate flex-shrink-0">{p.name}</span>
                        <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-[#1B4332] to-[#2D6A4F] rounded-full flex items-center justify-end pr-1.5 transition-all"
                            style={{ width: `${p.pct}%`, minWidth: '2rem' }}>
                            <span className="text-[9px] font-bold text-white">{p.pct}%</span>
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-400 w-10 text-right flex-shrink-0">{p.count}/{statsData.teamCount}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <div className="flex items-center gap-1.5 mb-2">
                      <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                      <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Tightest Budget</h3>
                    </div>
                    <p className="font-bold text-sm text-[#0F172A] truncate">{statsData.lowestTeam?.user_name} #{statsData.lowestTeam?.team_number}</p>
                    <p className="font-numbers font-bold text-[#1B4332] text-base mt-0.5">{fmt(statsData.lowestSalary)}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Star className="w-3.5 h-3.5 text-slate-400" />
                      <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Overlooked Elites</h3>
                    </div>
                    <div className="space-y-1">
                      {statsData.unpicked.map(g => (
                        <div key={g.name} className="flex items-center gap-2">
                          <span className="text-[9px] font-bold bg-[#1B4332] text-[#CCFF00] rounded px-1.5 py-0.5 flex-shrink-0">#{g.world_ranking}</span>
                          <span className="text-xs text-[#0F172A] truncate">{g.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── View Teams Dialog ── */}
      <Dialog open={teamsDialog.open} onOpenChange={(open) => {
        if (!open) { setTeamsDialog({ open: false, tournament: null, teams: [] }); setEditingTeam(null); setEditGolfers([]); }
      }}>
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
                    {teamsDialog.tournament?.golfers?.filter(g => g.price && g.mapping_status !== 'not_in_field').map((g, i) => {
                      const onTeam = editGolfers.some(eg => eg.name === g.name);
                      return (
                        <div key={i} className={`flex items-center justify-between px-2 py-1 rounded ${onTeam ? 'bg-green-50' : 'hover:bg-slate-50'}`}>
                          <span className={`text-sm ${onTeam ? 'text-green-700 font-medium' : ''}`}>{g.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-numbers text-[#2D6A4F]">{fmt(g.price)}</span>
                            {!onTeam && (
                              <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => addGolferToEdit(g)}>Add</Button>
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
                          <button onClick={() => togglePaid(team.id, team.paid)}
                            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold border transition-colors ${
                              team.paid ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                        : 'bg-red-50 text-red-500 border-red-200 hover:bg-red-100'
                            }`}
                            title={team.paid ? 'Mark as unpaid' : 'Mark as paid'}>
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
                        {team.golfers.map((g, i) => {
                          const nif = notInFieldNames.has(g.name?.toLowerCase());
                          return (
                            <div key={i} className="flex items-center text-xs">
                              <span className="w-5 text-slate-400">{i + 1}.</span>
                              <span className={`flex-1 ${nif ? 'font-bold text-red-600' : 'text-slate-700'}`}>{g.name}</span>
                              {nif && <span className="text-[9px] font-bold text-red-500 mr-2">Not in field</span>}
                              <span className="font-numbers text-[#2D6A4F]">{fmt(g.price)}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-2 pt-2 border-t border-slate-200 flex justify-between text-xs">
                        <span className="text-slate-400">Total Cost:</span>
                        <span className="font-numbers font-bold text-[#1B4332]">{fmt(team.total_cost)}</span>
                      </div>
                      {/* Warn if team has not-in-field players */}
                      {team.golfers.some(g => notInFieldNames.has(g.name?.toLowerCase())) && (
                        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-red-500 bg-red-50 rounded px-2 py-1">
                          <AlertCircle className="w-3 h-3 flex-shrink-0" />
                          <span>This team has player(s) not in the field. Notify this manager.</span>
                        </div>
                      )}
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
