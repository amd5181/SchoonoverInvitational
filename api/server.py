from fastapi import FastAPI, APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
import os
import logging
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import requests
import asyncio
import io
import csv
import httpx
from supabase_mongo_compat import SupabaseMongoCompat

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env', override=True)

client = SupabaseMongoCompat()
db = client

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

ADMIN_PIN = os.environ.get("ADMIN_PIN", "3669")
ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/golf/pga"
ODDS_API_BASE = "https://api.the-odds-api.com/v4"

def gen_id():
    return str(uuid.uuid4())

# ── Models ──
class UserCreate(BaseModel):
    name: str
    email: str
    pin: str

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    pin: Optional[str] = None

class TeamCreate(BaseModel):
    user_id: str
    tournament_id: str
    team_number: int
    golfers: List[Dict[str, Any]]

class TournamentSetup(BaseModel):
    name: Optional[str] = None
    espn_event_id: Optional[str] = None
    odds_sport_key: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    deadline: Optional[str] = None

# ── Scoring Engine ──
PLACE_POINTS = {1:300,2:200,3:175,4:150,5:125,6:100,7:90,8:80,9:70,10:60,
                11:55,12:54,13:53,14:52,15:51}

def calc_place_pts_single(pos):
    """Calculate place points for a single position number."""
    if pos <= 0:
        return 0
    if pos in PLACE_POINTS:
        return PLACE_POINTS[pos]
    if pos > 15:
        return max(0, 51 - (pos - 15))
    return 0

def calc_place_pts(pos_str):
    if not pos_str or pos_str in ('CUT','WD','DQ','MDF','-',''):
        return 0
    pos = pos_str.replace('T','').strip()
    try:
        pos = int(pos)
    except ValueError:
        return 0
    return calc_place_pts_single(pos)

def calc_stroke_pts(sb):
    if sb is None or sb < 0:
        return 0
    if sb == 0:
        return 100
    stroke_map = {1:85,2:80,3:75,4:70,5:65}
    if sb in stroke_map:
        return stroke_map[sb]
    if sb > 5:
        return max(0, 65 - (sb - 5) * 5)
    return 0

def calc_tied_scores(scores_list):
    """Calculate positions and averaged place/stroke points accounting for ties."""
    active = [s for s in scores_list if not s.get('is_cut', False) and s.get('score_int') is not None]
    active.sort(key=lambda x: (x.get('score_int', 999)))
    leader_score = active[0]['score_int'] if active else 0
    pos = 1
    i = 0
    result_map = {}
    while i < len(active):
        score = active[i]['score_int']
        j = i
        while j < len(active) and active[j]['score_int'] == score:
            j += 1
        num_tied = j - i
        positions = list(range(pos, pos + num_tied))
        total_place = sum(calc_place_pts_single(p) for p in positions)
        avg_place = total_place / num_tied
        sb = score - leader_score
        stroke_pts = calc_stroke_pts(sb)
        tied_pos = f'T{pos}' if num_tied > 1 else str(pos)
        for k in range(i, j):
            name_key = active[k].get('name','').lower()
            espn_key = active[k].get('espn_id','')
            result_map[name_key] = {'position': tied_pos, 'place_points': avg_place,
                                     'stroke_points': stroke_pts, 'strokes_behind': sb,
                                     'total_points': avg_place + stroke_pts}
            if espn_key:
                result_map[espn_key] = result_map[name_key]
        pos += num_tied
        i = j
    return result_map

def calc_prices(golfers):
    sorted_g = sorted(golfers, key=lambda x: x.get('odds', 999))
    price = 300000
    for g in sorted_g:
        g['price'] = max(75000, price)
        price -= 5000
    return sorted_g

def parse_score(s):
    if not s or s in ('-',''):
        return None
    s = str(s).strip()
    if s == 'E':
        return 0
    try:
        return int(s)
    except ValueError:
        return None

# ── ESPN Helpers ──
async def espn_get_events(year=None):
    try:
        url = f"{ESPN_BASE}/scoreboard"
        params = {}
        if year:
            params['dates'] = str(year)
        resp = await asyncio.to_thread(requests.get, url, params=params, timeout=15)
        data = resp.json()
        result = []
        for ev in data.get('events', []):
            comps = ev.get('competitions', [{}])
            comp = comps[0] if comps else {}
            result.append({
                'espn_id': ev.get('id', ''),
                'name': ev.get('name', ''),
                'short_name': ev.get('shortName', ''),
                'date': ev.get('date', ''),
                'end_date': ev.get('endDate', ev.get('date', '')),
                'status': ev.get('status', {}).get('type', {}).get('name', ''),
                'state': ev.get('status', {}).get('type', {}).get('state', ''),
                'competitor_count': len(comp.get('competitors', []))
            })
        return result
    except Exception as e:
        logger.error(f"ESPN events: {e}")
        return []

async def espn_get_field(event_id, event_date=None):
    try:
        url = f"{ESPN_BASE}/scoreboard"
        # Build params - use date for correct season lookup
        params = {}
        if event_date:
            try:
                dt = datetime.fromisoformat(str(event_date).replace('Z','+00:00'))
                params['dates'] = dt.strftime('%Y%m%d')
            except Exception:
                params['event'] = str(event_id)
        else:
            params['event'] = str(event_id)
        resp = await asyncio.to_thread(requests.get, url, params=params, timeout=15)
        data = resp.json()
        events = data.get('events', [])
        # Find the specific event by ID
        ev = None
        for e in events:
            if str(e.get('id','')) == str(event_id):
                ev = e
                break
        # Fallback: if not found with dates, try event param directly
        if not ev and 'dates' in params:
            params2 = {'event': str(event_id)}
            resp2 = await asyncio.to_thread(requests.get, url, params=params2, timeout=15)
            data2 = resp2.json()
            for e in data2.get('events', []):
                if str(e.get('id','')) == str(event_id):
                    ev = e
                    data = data2
                    break
        if not ev:
            # Last fallback: try years 2026, 2025
            for year in [2026, 2025]:
                resp3 = await asyncio.to_thread(requests.get, url, params={'dates': str(year)}, timeout=15)
                data3 = resp3.json()
                for e in data3.get('events', []):
                    if str(e.get('id','')) == str(event_id):
                        ev = e
                        data = data3
                        break
                if ev:
                    break
        if not ev:
            return [], data if data else {}
        comps = ev.get('competitions', [])
        if not comps:
            return [], data
        comp = comps[0]
        golfers = []
        for c in comp.get('competitors', []):
            ath = c.get('athlete', {})
            rounds = []
            for ls in c.get('linescores', []):
                rounds.append({
                    'round': ls.get('period', 0),
                    'score': ls.get('displayValue', ''),
                    'strokes': ls.get('value', None)
                })
            score_str = str(c.get('score', ''))
            # Detect cuts: Check if word "CUT" appears in any relevant ESPN field,
            # since ESPN may place "CUT" in the score, status type, status description,
            # or individual linescore displayValues depending on the tournament/round state.
            status_obj = c.get('status', {})
            status_name = ''
            status_desc = ''
            status_short = ''
            if isinstance(status_obj, dict):
                type_obj = status_obj.get('type', {})
                if isinstance(type_obj, dict):
                    status_name = str(type_obj.get('name', ''))
                    status_desc = str(type_obj.get('description', ''))
                    status_short = str(type_obj.get('shortDetail', ''))
            linescore_text = ' '.join(str(ls.get('displayValue', '')) for ls in c.get('linescores', []))
            combined_text = f"{score_str} {status_name} {status_desc} {status_short} {linescore_text}".upper()
            is_cut_by_text = 'CUT' in combined_text
            is_cut = is_cut_by_text
            
            golfers.append({
                'espn_id': str(ath.get('id', c.get('id', ''))),
                'name': ath.get('fullName', ath.get('displayName', '')),
                'short_name': ath.get('shortName', ''),
                'order': c.get('order', 999),
                'score': score_str,
                'score_int': parse_score(score_str),
                'rounds': rounds,
                'is_cut': is_cut,
                'status': c.get('status', {}).get('type', {}).get('name', '') if isinstance(c.get('status'), dict) else '',
                'thru': str(c.get('status', {}).get('thru', '')) if isinstance(c.get('status'), dict) else ''
            })
        
        # Second pass: Detect cuts by round count
        # If most players have 3+ rounds and some have only 2, those with 2 are cut
        if golfers:
            round_counts = {}
            for g in golfers:
                rc = len(g['rounds'])
                round_counts[rc] = round_counts.get(rc, 0) + 1
            
            # Find the maximum round count (what the leaders have)
            max_rounds = max(round_counts.keys()) if round_counts else 0
            
            # If tournament has progressed beyond round 2 (i.e., max_rounds >= 3)
            # then anyone with only 2 rounds is cut
            if max_rounds >= 3:
                for g in golfers:
                    if len(g['rounds']) == 2:
                        g['is_cut'] = True
        
        return golfers, data
    except Exception as e:
        logger.error(f"ESPN field: {e}")
        return [], {}

# ── Odds Helper ──
async def fetch_odds_api(sport_key):
    api_key = os.environ.get('ODDS_API_KEY', '')
    if not api_key:
        return None, "ODDS_API_KEY not configured. Sign up free at https://the-odds-api.com"
    try:
        url = f"{ODDS_API_BASE}/sports/{sport_key}/odds/"
        params = {'apiKey': api_key, 'regions': 'us', 'markets': 'outrights', 'oddsFormat': 'decimal'}
        resp = await asyncio.to_thread(requests.get, url, params=params, timeout=15)
        data = resp.json()
        if isinstance(data, dict) and data.get('message'):
            return None, data['message']
        golfer_odds = {}
        items = data if isinstance(data, list) else [data]
        for item in items:
            for bm in item.get('bookmakers', []):
                for mkt in bm.get('markets', []):
                    if mkt.get('key') == 'outrights':
                        for out in mkt.get('outcomes', []):
                            name = out['name']
                            price = out.get('price', 999)
                            if name not in golfer_odds or price < golfer_odds[name]:
                                golfer_odds[name] = price
        return golfer_odds, None
    except Exception as e:
        logger.error(f"Odds API: {e}")
        return None, str(e)

# ── Auth Routes ──
@api_router.post("/auth/register")
async def register(data: UserCreate):
    if len(data.pin) != 4 or not data.pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN must be exactly 4 digits")
    if await db.users.find_one({"email": data.email.lower()}, {"_id": 0}):
        raise HTTPException(status_code=400, detail="Email already in use")
    if await db.users.find_one({"pin": data.pin}, {"_id": 0}):
        raise HTTPException(status_code=400, detail="PIN already in use. Please choose a different PIN.")
    user = {
        "id": gen_id(), "name": data.name.strip(), "email": data.email.lower().strip(),
        "pin": data.pin, "is_admin": data.pin == ADMIN_PIN,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user)
    return {"id": user["id"], "name": user["name"], "email": user["email"], "pin": user["pin"], "is_admin": user["is_admin"]}

@api_router.post("/auth/login")
async def login(data: dict):
    pin = data.get('pin', '')
    user = await db.users.find_one({"pin": pin}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid PIN. No account found.")
    return {"id": user["id"], "name": user["name"], "email": user["email"], "pin": user["pin"], "is_admin": user.get("is_admin", False)}

@api_router.get("/auth/user/{user_id}")
async def get_user(user_id: str):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"id": user["id"], "name": user["name"], "email": user["email"], "pin": user["pin"], "is_admin": user.get("is_admin", False)}

@api_router.put("/auth/profile/{user_id}")
async def update_profile(user_id: str, data: UserUpdate):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    updates = {}
    if data.name is not None:
        updates["name"] = data.name.strip()
    if data.email is not None:
        new_email = data.email.lower().strip()
        if new_email != user["email"]:
            if await db.users.find_one({"email": new_email, "id": {"$ne": user_id}}, {"_id": 0}):
                raise HTTPException(status_code=400, detail="Email already in use")
            updates["email"] = new_email
    if data.pin is not None:
        if len(data.pin) != 4 or not data.pin.isdigit():
            raise HTTPException(status_code=400, detail="PIN must be exactly 4 digits")
        if data.pin != user["pin"]:
            if await db.users.find_one({"pin": data.pin, "id": {"$ne": user_id}}, {"_id": 0}):
                raise HTTPException(status_code=400, detail="PIN already in use")
            updates["pin"] = data.pin
            updates["is_admin"] = data.pin == ADMIN_PIN
    if updates:
        await db.users.update_one({"id": user_id}, {"$set": updates})
        if "name" in updates:
            await db.teams.update_many({"user_id": user_id}, {"$set": {"user_name": updates["name"]}})
        if "email" in updates:
            await db.teams.update_many({"user_id": user_id}, {"$set": {"user_email": updates["email"]}})
    updated = await db.users.find_one({"id": user_id}, {"_id": 0})
    return {"id": updated["id"], "name": updated["name"], "email": updated["email"], "pin": updated["pin"], "is_admin": updated.get("is_admin", False)}

# ── Admin Routes ──
async def check_admin(user_id):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user or not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")

@api_router.get("/admin/tournaments")
async def admin_get_tournaments(user_id: str = Query(...)):
    await check_admin(user_id)
    return await db.tournaments.find({}, {"_id": 0}).sort("slot", 1).to_list(4)

@api_router.put("/admin/tournaments/{slot}")
async def admin_update_tournament(slot: int, data: TournamentSetup, user_id: str = Query(...)):
    await check_admin(user_id)
    existing = await db.tournaments.find_one({"slot": slot}, {"_id": 0})
    updates = {}
    if data.name is not None: updates["name"] = data.name
    if data.espn_event_id is not None: updates["espn_event_id"] = data.espn_event_id
    if data.odds_sport_key is not None: updates["odds_sport_key"] = data.odds_sport_key
    if data.start_date is not None: updates["start_date"] = data.start_date
    if data.end_date is not None: updates["end_date"] = data.end_date
    if data.deadline is not None: updates["deadline"] = data.deadline
    if existing:
        await db.tournaments.update_one({"slot": slot}, {"$set": updates})
    else:
        doc = {"id": gen_id(), "slot": slot, "name": data.name or f"Tournament {slot}",
               "espn_event_id": "", "odds_sport_key": "", "start_date": "", "end_date": "",
               "deadline": "", "golfers": [], "status": "setup",
               "created_at": datetime.now(timezone.utc).isoformat()}
        doc.update(updates)
        await db.tournaments.insert_one(doc)
    return await db.tournaments.find_one({"slot": slot}, {"_id": 0})

@api_router.post("/admin/espn-search")
async def admin_espn_search(user_id: str = Query(...), year: int = Query(2026)):
    await check_admin(user_id)
    events = await espn_get_events(year)
    return {"events": events}

@api_router.post("/admin/fetch-golfers/{slot}")
async def admin_fetch_golfers(slot: int, user_id: str = Query(...)):
    await check_admin(user_id)
    t = await db.tournaments.find_one({"slot": slot}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")
    if not t.get("espn_event_id"):
        raise HTTPException(status_code=400, detail="Map an ESPN event first")
    event_date = t.get("start_date", "")
    golfers, raw = await espn_get_field(t["espn_event_id"], event_date)
    if not golfers:
        raise HTTPException(status_code=400, detail="Could not fetch golfers. Field may not be available yet.")
    golfer_list = [{"espn_id": g["espn_id"], "name": g["name"], "short_name": g.get("short_name",""),
                    "world_ranking": i+1, "odds": None, "price": None} for i,g in enumerate(golfers)]
    update_data = {"golfers": golfer_list, "status": "golfers_loaded"}
    # Find the correct event in raw data to get dates
    target_ev = None
    for ev_item in raw.get('events', []):
        if str(ev_item.get('id','')) == str(t["espn_event_id"]):
            target_ev = ev_item
            break
    if not target_ev and raw.get('events'):
        target_ev = raw['events'][0]
    if target_ev:
        update_data["start_date"] = target_ev.get("date", t.get("start_date", ""))
        update_data["end_date"] = target_ev.get("endDate", target_ev.get("date", t.get("end_date", "")))
        if not t.get("deadline"):
            update_data["deadline"] = target_ev.get("date", "")
    await db.tournaments.update_one({"slot": slot}, {"$set": update_data})
    return await db.tournaments.find_one({"slot": slot}, {"_id": 0})

@api_router.post("/admin/fetch-odds/{slot}")
async def admin_fetch_odds(slot: int, user_id: str = Query(...), body: dict = {}):
    """Import odds from pasted text data. Admin pastes golfer names with odds."""
    await check_admin(user_id)
    t = await db.tournaments.find_one({"slot": slot}, {"_id": 0})
    if not t: raise HTTPException(status_code=404, detail="Tournament not found")
    if not t.get("golfers"): raise HTTPException(status_code=400, detail="Fetch golfers first")
    odds_text = body.get("odds_text", "")
    if not odds_text:
        raise HTTPException(status_code=400, detail="Paste odds data from FanDuel/DraftKings")
    # Parse pasted odds text - supports formats like:
    # "Scottie Scheffler +450" or "Scottie Scheffler,+450" or "Scottie Scheffler 4.50"
    import re
    lines = [l.strip() for l in odds_text.strip().split('\n') if l.strip()]
    parsed_odds = {}
    for line in lines:
        # Try to extract name and odds value
        parts = re.split(r'[\t,]+', line)
        if len(parts) >= 2:
            name = parts[0].strip()
            odds_str = parts[-1].strip()
        else:
            match = re.match(r'(.+?)\s+([+-]?\d+\.?\d*)', line)
            if match:
                name = match.group(1).strip()
                odds_str = match.group(2).strip()
            else:
                continue
        try:
            odds_val = float(odds_str.replace('+',''))
            # Convert American odds to decimal if needed
            if odds_val > 50 or odds_val < -50:
                if odds_val > 0:
                    odds_val = (odds_val / 100) + 1
                else:
                    odds_val = (100 / abs(odds_val)) + 1
            parsed_odds[name] = odds_val
        except ValueError:
            continue
    if not parsed_odds:
        raise HTTPException(status_code=400, detail="Could not parse any odds from the pasted data")
    # Match to golfers
    golfers = t["golfers"]
    for g in golfers:
        name = g["name"]
        if name in parsed_odds:
            g["odds"] = parsed_odds[name]
        else:
            last = name.split()[-1] if name else ""
            matched = False
            for on, ov in parsed_odds.items():
                if last and last.lower() in on.lower():
                    g["odds"] = ov
                    matched = True
                    break
            if not matched:
                g["odds"] = 999
    golfers = calc_prices(golfers)
    await db.tournaments.update_one({"slot": slot}, {"$set": {"golfers": golfers, "status": "prices_set"}})
    return await db.tournaments.find_one({"slot": slot}, {"_id": 0})

@api_router.post("/admin/set-default-prices/{slot}")
async def admin_default_prices(slot: int, user_id: str = Query(...)):
    await check_admin(user_id)
    t = await db.tournaments.find_one({"slot": slot}, {"_id": 0})
    if not t: raise HTTPException(status_code=404, detail="Tournament not found")
    if not t.get("golfers"): raise HTTPException(status_code=400, detail="Fetch golfers first")
    golfers = t["golfers"]
    price = 300000
    for g in golfers:
        g["price"] = max(75000, price)
        g["odds"] = g.get("odds") or 999
        price -= 5000
    await db.tournaments.update_one({"slot": slot}, {"$set": {"golfers": golfers, "status": "prices_set"}})
    return await db.tournaments.find_one({"slot": slot}, {"_id": 0})

@api_router.delete("/admin/tournaments/{slot}")
async def admin_reset_tournament(slot: int, user_id: str = Query(...)):
    """Completely reset/clear a tournament slot - removes all data."""
    await check_admin(user_id)
    t = await db.tournaments.find_one({"slot": slot}, {"_id": 0})
    if t and t.get("id"):
        # Delete all teams for this tournament
        await db.teams.delete_many({"tournament_id": t["id"]})
        # Delete score cache
        await db.score_cache.delete_many({"tournament_id": t["id"]})
    # Delete the tournament document completely
    await db.tournaments.delete_one({"slot": slot})
    # Create a fresh empty slot
    fresh_doc = {
        "id": gen_id(),
        "slot": slot,
        "name": "",
        "espn_event_id": "",
        "odds_sport_key": "",
        "start_date": "",
        "end_date": "",
        "deadline": "",
        "golfers": [],
        "status": "setup",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.tournaments.insert_one(fresh_doc)
    return {"message": "Tournament completely reset", "slot": slot}

@api_router.get("/admin/export-csv/{slot}")
async def admin_export_csv(slot: int, user_id: str = Query(...)):
    """Export golfers list to CSV for a tournament."""
    await check_admin(user_id)
    t = await db.tournaments.find_one({"slot": slot}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")
    if not t.get("golfers"):
        raise HTTPException(status_code=400, detail="No golfers to export")
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Rank", "Name", "World Ranking", "Price", "Odds"])
    
    golfers = sorted(t["golfers"], key=lambda x: x.get("price", 0) or 0, reverse=True)
    for i, g in enumerate(golfers, 1):
        writer.writerow([
            i,
            g.get("name", ""),
            g.get("world_ranking", ""),
            g.get("price", ""),
            g.get("odds", "")
        ])
    
    output.seek(0)
    filename = f"{t.get('name', 'tournament').replace(' ', '_')}_golfers.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@api_router.get("/admin/teams/{tournament_id}")
async def admin_get_tournament_teams(tournament_id: str, user_id: str = Query(...)):
    """Get all teams for a tournament (admin only)."""
    await check_admin(user_id)
    t = await db.tournaments.find_one({"id": tournament_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")
    teams = await db.teams.find({"tournament_id": tournament_id}, {"_id": 0}).to_list(500)
    return {"tournament": t, "teams": teams}

class AdminTeamUpdate(BaseModel):
    golfers: List[Dict[str, Any]]

@api_router.put("/admin/teams/{team_id}")
async def admin_update_team(team_id: str, data: AdminTeamUpdate, user_id: str = Query(...)):
    """Admin can update any team (swap players even after deadline)."""
    await check_admin(user_id)
    team = await db.teams.find_one({"id": team_id}, {"_id": 0})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    if len(data.golfers) != 5:
        raise HTTPException(status_code=400, detail="Must have exactly 5 golfers")
    names = [g['name'] for g in data.golfers]
    if len(set(names)) != 5:
        raise HTTPException(status_code=400, detail="Cannot have duplicate golfers")
    total_cost = sum(g.get('price', 0) for g in data.golfers)
    if total_cost > 1000000:
        raise HTTPException(status_code=400, detail="Over budget! Max $1,000,000")
    await db.teams.update_one({"id": team_id}, {"$set": {
        "golfers": [dict(g) for g in data.golfers],
        "total_cost": total_cost,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "admin_modified": True
    }})
    return await db.teams.find_one({"id": team_id}, {"_id": 0})

@api_router.delete("/admin/teams/{team_id}")
async def admin_delete_team(team_id: str, user_id: str = Query(...)):
    """Admin can delete any team."""
    await check_admin(user_id)
    team = await db.teams.find_one({"id": team_id}, {"_id": 0})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    await db.teams.delete_one({"id": team_id})
    return {"message": "Team deleted successfully"}

@api_router.patch("/admin/teams/{team_id}/paid")
async def admin_set_team_paid(team_id: str, user_id: str = Query(...), paid: bool = Query(...)):
    """Admin can mark a team as paid or unpaid."""
    await check_admin(user_id)
    team = await db.teams.find_one({"id": team_id}, {"_id": 0})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    await db.teams.update_one({"id": team_id}, {"$set": {"paid": paid}})
    return await db.teams.find_one({"id": team_id}, {"_id": 0})


@api_router.get("/debug/espn-raw/{event_id}")
async def debug_espn_raw(event_id: str):
    """Debug endpoint to see raw ESPN data for cut detection."""
    try:
        import requests
        
        # Try the leaderboard endpoint which should have full competitor data
        url = f"https://site.api.espn.com/apis/site/v2/sports/golf/pga/leaderboard"
        params = {'event': event_id}
        
        resp = requests.get(url, params=params, timeout=15)
        data = resp.json()
        
        # Navigate the structure
        if 'events' not in data:
            return {"error": "No events", "keys": list(data.keys()), "url": url}
        
        event = data['events'][0] if data['events'] else {}
        if 'competitions' not in event:
            return {"error": "No competitions", "event_keys": list(event.keys())}
        
        comp = event['competitions'][0] if event['competitions'] else {}
        if 'competitors' not in comp:
            return {"error": "No competitors", "comp_keys": list(comp.keys()), "trying_url": url}
        
        comps = comp['competitors']
        
        # Sample cut players vs non-cut players
        cut_sample = [c for c in comps if c.get('order', 999) >= 74 and c.get('order', 999) <= 76]
        leader_sample = [c for c in comps if c.get('order', 999) == 1]
        
        return {
            "url_used": url,
            "total_competitors": len(comps),
            "leader": leader_sample[0] if leader_sample else None,
            "cut_players": cut_sample[:2]
        }
    except Exception as e:
        import traceback
        return {"error": str(e), "traceback": traceback.format_exc()}

# ── Public Tournament Routes ──
@api_router.get("/tournaments")
async def get_tournaments():
    tournaments = await db.tournaments.find({}, {"_id": 0}).sort("slot", 1).to_list(4)
    result = []
    for t in tournaments:
        tc = await db.teams.count_documents({"tournament_id": t["id"]})
        result.append({
            "id": t["id"], "slot": t["slot"], "name": t["name"],
            "start_date": t.get("start_date",""), "end_date": t.get("end_date",""),
            "deadline": t.get("deadline",""), "status": t.get("status","setup"),
            "golfer_count": len(t.get("golfers",[])), "team_count": tc,
            "has_prices": any(g.get("price") for g in t.get("golfers",[]))
        })
    return result

@api_router.get("/tournaments/{tid}")
async def get_tournament(tid: str):
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t: raise HTTPException(status_code=404, detail="Tournament not found")
    t["team_count"] = await db.teams.count_documents({"tournament_id": tid})
    return t

# ── Team Routes ──
@api_router.get("/teams/user/{user_id}")
async def get_user_teams(user_id: str):
    return await db.teams.find({"user_id": user_id}, {"_id": 0}).to_list(100)

@api_router.get("/teams/tournament/{tournament_id}")
async def get_tournament_teams(tournament_id: str):
    return await db.teams.find({"tournament_id": tournament_id}, {"_id": 0}).to_list(500)

@api_router.post("/teams")
async def save_team(data: TeamCreate):
    user = await db.users.find_one({"id": data.user_id}, {"_id": 0})
    if not user: raise HTTPException(status_code=404, detail="User not found")
    t = await db.tournaments.find_one({"id": data.tournament_id}, {"_id": 0})
    if not t: raise HTTPException(status_code=404, detail="Tournament not found")
    deadline = t.get("deadline","")
    if deadline:
        try:
            dl = datetime.fromisoformat(deadline.replace('Z','+00:00'))
            if datetime.now(timezone.utc) > dl:
                raise HTTPException(status_code=400, detail="Tournament deadline has passed. Teams are locked.")
        except (ValueError, TypeError):
            pass
    if data.team_number not in (1,2):
        raise HTTPException(status_code=400, detail="Team number must be 1 or 2")
    if len(data.golfers) != 5:
        raise HTTPException(status_code=400, detail="Must select exactly 5 golfers")
    names = [g['name'] for g in data.golfers]
    if len(set(names)) != 5:
        raise HTTPException(status_code=400, detail="Cannot select the same golfer twice on one team")
    total_cost = sum(g.get('price',0) for g in data.golfers)
    if total_cost > 1000000:
        raise HTTPException(status_code=400, detail="Over budget! Max $1,000,000")
    existing = await db.teams.find_one({"user_id": data.user_id, "tournament_id": data.tournament_id, "team_number": data.team_number}, {"_id": 0})
    if existing:
        await db.teams.update_one({"id": existing["id"]}, {"$set": {
            "golfers": [dict(g) for g in data.golfers], "total_cost": total_cost,
            "user_name": user["name"], "updated_at": datetime.now(timezone.utc).isoformat()
        }})
        result = await db.teams.find_one({"id": existing["id"]}, {"_id": 0})
        return result
    else:
        count = await db.teams.count_documents({"user_id": data.user_id, "tournament_id": data.tournament_id})
        if count >= 2:
            raise HTTPException(status_code=400, detail="Maximum 2 teams per tournament")
        team = {
            "id": gen_id(), "user_id": data.user_id, "user_name": user["name"],
            "user_email": user["email"], "tournament_id": data.tournament_id,
            "team_number": data.team_number, "golfers": [dict(g) for g in data.golfers],
            "total_cost": total_cost, "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.teams.insert_one(team)
        return {k:v for k,v in team.items() if k != '_id'}

@api_router.delete("/teams/{team_id}")
async def delete_team(team_id: str, user_id: str = Query(...)):
    team = await db.teams.find_one({"id": team_id}, {"_id": 0})
    if not team: raise HTTPException(status_code=404, detail="Team not found")
    if team["user_id"] != user_id: raise HTTPException(status_code=403, detail="Not your team")
    t = await db.tournaments.find_one({"id": team["tournament_id"]}, {"_id": 0})
    if t and t.get("deadline"):
        try:
            dl = datetime.fromisoformat(t["deadline"].replace('Z','+00:00'))
            if datetime.now(timezone.utc) > dl:
                raise HTTPException(status_code=400, detail="Deadline passed. Teams are locked.")
        except (ValueError, TypeError):
            pass
    await db.teams.delete_one({"id": team_id})
    return {"message": "Team deleted"}

# ── Leaderboard ──
@api_router.get("/leaderboard/{tournament_id}")
async def get_leaderboard(tournament_id: str):
    t = await db.tournaments.find_one({"id": tournament_id}, {"_id": 0})
    if not t: raise HTTPException(status_code=404, detail="Tournament not found")
    cache = await db.score_cache.find_one({"tournament_id": tournament_id}, {"_id": 0})
    if t.get("espn_event_id") and t.get("status") not in ("setup", "golfers_loaded"):
        should_refresh = not cache
        if cache:
            try:
                last = datetime.fromisoformat(cache.get("last_updated",""))
                if (datetime.now(timezone.utc) - last) > timedelta(minutes=1):
                    should_refresh = True
            except Exception:
                should_refresh = True
        if should_refresh:
            try:
                event_date = t.get("start_date", "")
                golfers, raw = await espn_get_field(t["espn_event_id"], event_date)
                if golfers:
                    leader_score = None
                    for g in golfers:
                        if g.get("score_int") is not None and not g.get("is_cut"):
                            if leader_score is None or g["score_int"] < leader_score:
                                leader_score = g["score_int"]
                    scores = []
                    for g in golfers:
                        sb = None
                        if g.get("score_int") is not None and leader_score is not None and not g.get("is_cut"):
                            sb = g["score_int"] - leader_score
                        # Store "CUT" for total_score if player is cut
                        display_score = "CUT" if g.get("is_cut") else g["score"]
                        # Only show first 2 rounds for cut players
                        display_rounds = g["rounds"][:2] if g.get("is_cut") else g["rounds"]
                        
                        scores.append({
                            "espn_id": g["espn_id"], "name": g["name"], "position": str(g["order"]),
                            "total_score": display_score, "score_int": g.get("score_int"),
                            "rounds": display_rounds,
                            "thru": g.get("thru",""), "is_cut": g.get("is_cut",False),
                            "is_active": "PROGRESS" in str(g.get("status","")).upper(),
                            "strokes_behind": sb if sb is not None else 999, "sort_order": g["order"]
                        })
                    await db.score_cache.update_one(
                        {"tournament_id": tournament_id},
                        {"$set": {"tournament_id": tournament_id, "scores": scores,
                                  "last_updated": datetime.now(timezone.utc).isoformat()}},
                        upsert=True)
                    cache = await db.score_cache.find_one({"tournament_id": tournament_id}, {"_id": 0})
                    events = raw.get('events',[])
                    if events:
                        st = events[0].get('status',{}).get('type',{}).get('name','')
                        if 'FINAL' in st.upper():
                            await db.tournaments.update_one({"id": tournament_id}, {"$set": {"status": "completed"}})
                            t["status"] = "completed"
            except Exception as ex:
                logger.error(f"Auto-refresh: {ex}")
    scores = cache.get("scores",[]) if cache else []
    last_updated = cache.get("last_updated","") if cache else ""
    teams = await db.teams.find({"tournament_id": tournament_id}, {"_id": 0}).to_list(500)
    # Pre-calculate tied scores for all golfers
    tied_map = calc_tied_scores(scores) if scores else {}
    team_standings = []
    for team in teams:
        tp = 0
        gd = []
        for golfer in team.get("golfers",[]):
            sd = None
            for s in scores:
                if s.get("name","").lower() == golfer.get("name","").lower() or s.get("espn_id") == golfer.get("espn_id"):
                    sd = s
                    break
            if sd:
                name_key = sd.get("name","").lower()
                espn_key = sd.get("espn_id","")
                tied_data = tied_map.get(name_key) or tied_map.get(espn_key)
                if tied_data and not sd.get("is_cut"):
                    pp = tied_data['place_points']
                    sp = tied_data['stroke_points']
                    tot = tied_data['total_points']
                    position = tied_data['position']
                    sb_val = tied_data['strokes_behind']
                    # Players who made the cut earn a minimum of 5 points
                    if tot < 5:
                        tot = 5
                else:
                    pp = 0
                    sp = 0
                    tot = 0
                    position = sd.get("position","CUT") if sd.get("is_cut") else sd.get("position","-")
                    sb_val = sd.get("strokes_behind", 0)
                
                gd.append({**golfer, "position": position, "total_score": sd.get("total_score",""),
                          "rounds": sd.get("rounds",[]), "thru": sd.get("thru",""),
                          "is_active": sd.get("is_active",False), "is_cut": sd.get("is_cut",False),
                          "strokes_behind": sb_val, "place_points": round(pp, 1), "stroke_points": sp,
                          "total_points": round(tot, 1), "sort_order": sd.get("sort_order", 999)})
                tp += tot
            else:
                gd.append({**golfer, "position":"-","total_score":"-","rounds":[],"thru":"",
                          "is_active":False,"is_cut":False,"strokes_behind":0,"place_points":0,"stroke_points":0,"total_points":0,"sort_order":9999})
        # Sort: active/non-cut players by total_points desc, then cut players by sort_order (finish position) asc
        gd.sort(key=lambda x: (1 if x.get("is_cut") else 0, -x["total_points"] if not x.get("is_cut") else x.get("sort_order", 9999)))
        team_standings.append({
            "team_id": team["id"], "user_name": team["user_name"], "team_number": team["team_number"],
            "team_name": f"{team['user_name']} #{team['team_number']}", "golfers": gd, "total_points": tp, "paid": team.get("paid", False)
        })
    team_standings.sort(key=lambda x: x["total_points"], reverse=True)
    for i, ts in enumerate(team_standings):
        ts["rank"] = i + 1
    # Build top 25 with tied positions
    top25_scores = [s for s in scores if not s.get("is_cut",False) and s.get("score_int") is not None]
    top25_scores.sort(key=lambda x: x.get("score_int", 999))
    top25 = []
    for s in top25_scores[:25]:
        name_key = s.get("name","").lower()
        espn_key = s.get("espn_id","")
        tied_data = tied_map.get(name_key) or tied_map.get(espn_key) or {}
        top25.append({**s, "position": tied_data.get("position", s.get("position",""))})
    return {
        "tournament": {"id": t["id"], "name": t["name"], "status": t.get("status",""),
                       "start_date": t.get("start_date",""), "end_date": t.get("end_date","")},
        "team_standings": team_standings, "tournament_standings": top25,
        "last_updated": last_updated, "is_finalized": t.get("status") == "completed"
    }

@api_router.post("/scores/refresh/{tournament_id}")
async def manual_refresh(tournament_id: str, user_id: str = Query(...)):
    t = await db.tournaments.find_one({"id": tournament_id}, {"_id": 0})
    if not t: raise HTTPException(status_code=404, detail="Tournament not found")
    if not t.get("espn_event_id"): raise HTTPException(status_code=400, detail="No ESPN event mapped")
    event_date = t.get("start_date", "")
    golfers, raw = await espn_get_field(t["espn_event_id"], event_date)
    if not golfers: raise HTTPException(status_code=400, detail="Could not fetch scores")
    leader_score = None
    for g in golfers:
        if g.get("score_int") is not None and not g.get("is_cut"):
            if leader_score is None or g["score_int"] < leader_score:
                leader_score = g["score_int"]
    scores_list = []
    for g in golfers:
        sb = None
        if g.get("score_int") is not None and leader_score is not None and not g.get("is_cut"):
            sb = g["score_int"] - leader_score
        scores_list.append({
            "espn_id": g["espn_id"], "name": g["name"], "position": str(g["order"]),
            "total_score": g["score"], "score_int": g.get("score_int"),
            "rounds": g["rounds"],
            "thru": g.get("thru",""), "is_cut": g.get("is_cut",False),
            "is_active": "PROGRESS" in str(g.get("status","")).upper(),
            "strokes_behind": sb if sb is not None else 999, "sort_order": g["order"]
        })
    await db.score_cache.update_one(
        {"tournament_id": tournament_id},
        {"$set": {"tournament_id": tournament_id, "scores": scores_list,
                  "last_updated": datetime.now(timezone.utc).isoformat()}},
        upsert=True)
    events = raw.get('events',[])
    if events:
        st = events[0].get('status',{}).get('type',{}).get('name','')
        if 'FINAL' in st.upper():
            await db.tournaments.update_one({"id": tournament_id}, {"$set": {"status": "completed"}})
    return {"message": "Scores refreshed", "count": len(scores_list)}

# ── History ──
HISTORY = [
    {"year":2025,"tournaments":[
        {"name":"The Open","winners":["Dat Boy","Rich Pocki","Bill Moser"]},
        {"name":"U.S. Open","winners":["Paul Del Prieto","Alan McBride","Justin Malago"]},
        {"name":"PGA Championship","winners":["Bill Moser","Keith Ginder","Toby Cressman"]},
        {"name":"Masters","winners":["Justin Blazel","Carson Custer","Toby Cressman"]}]},
    {"year":2024,"tournaments":[{"name":"Masters","winners":["Andy Albert","Ian Very","Matt Walker"]}]},
    {"year":2023,"tournaments":[{"name":"Masters","winners":["Andrew David","Colin Scarola","Justin Rosenthal"]}]},
    {"year":2022,"tournaments":[{"name":"Masters","winners":["Justin Blazel","Rob Platz","Andrew David"]}]},
    {"year":2021,"tournaments":[{"name":"Masters","winners":["Matt Cheyne","Andrew David","Sam Lanzino"]}]},
    {"year":2020,"tournaments":[{"name":"Masters","winners":["Alan McBride","Matt Ward","Sam Lanzino"]}]},
    {"year":2019,"tournaments":[{"name":"Masters","winners":["Carson Custer","Mike Zalac","Matt Ward"]}]},
    {"year":2018,"tournaments":[{"name":"Masters","winners":["Carson Custer","Matt Hill","Carson Custer"]}]},
    {"year":2017,"tournaments":[{"name":"Masters","winners":["Sam Lanzino","Matt Hill","Aaron Levine"]}]},
    {"year":2016,"tournaments":[{"name":"Masters","winners":["Dylan Frank","Andrew David","Curtis David"]}]},
]

@api_router.get("/history")
async def get_history():
    return HISTORY

@api_router.get("/")
async def root():
    return {"message": "FairwayFantasy API"}

app.include_router(api_router)

@app.exception_handler(httpx.HTTPStatusError)
async def handle_httpx_status_error(request, exc: httpx.HTTPStatusError):
    status = exc.response.status_code if exc.response else 500
    if status in (401, 403):
        return JSONResponse(status_code=503, content={
            "detail": "Database access denied. Re-run Supabase SQL grants/policies and verify API key."
        })
    return JSONResponse(status_code=502, content={"detail": "Database request failed"})

@app.on_event("startup")
async def startup():
    if ADMIN_PIN == "3669":
        logger.warning("Using default ADMIN_PIN. Set ADMIN_PIN env var in production.")
    await db.users.create_index("pin", unique=True)
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.tournaments.create_index("slot", unique=True)
    await db.tournaments.create_index("id", unique=True)
    await db.teams.create_index("id", unique=True)
    await db.teams.create_index([("user_id",1),("tournament_id",1)])
    await db.score_cache.create_index("tournament_id", unique=True)
    logger.info("FairwayFantasy API started")

@app.on_event("shutdown")
async def shutdown():
    client.close()
