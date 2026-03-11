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
import re
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

ADMIN_EMAIL = "adavidfr2006@gmail.com"
ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/golf/pga"

CUT_EARNINGS = 10_000  # Flat earnings for any player who misses the cut

def gen_id():
    return str(uuid.uuid4())

# ── Models ──
class UserCreate(BaseModel):
    name: str
    email: str

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None

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

class PayoutScheduleUpdate(BaseModel):
    payout_text: str  # e.g. "1: 3600000\n2: 2160000\n..."

class ManualPlayerUpload(BaseModel):
    players_text: str

class SyncMappingConfirm(BaseModel):
    manual_mappings: Optional[Dict[str, Optional[Dict[str, Any]]]] = {}
    espn_additions: Optional[Dict[str, int]] = {}
    espn_discards: Optional[List[str]] = []
    unmap_player_ids: Optional[List[str]] = []

class UnmapRequest(BaseModel):
    player_id: str

# ── Payout Schedule Helpers ──
def parse_payout_text(text: str) -> List[Dict]:
    """
    Parse payout text. Handles tab-separated, colon-separated, header rows,
    $ signs and commas. Accepts formats like:
      Position\tAmount          <- header row, skipped
      1\t$4,200,000            <- tab-separated with $ and commas
      1: $3,600,000            <- colon-separated
      2: 2160000               <- plain numbers
    Returns list of {"place": int, "amount": int} up to 70 places.
    """
    lines = [l.strip() for l in text.strip().split('\n') if l.strip()]
    payouts = []
    for line in lines:
        # Clean the line: remove $ and commas BEFORE splitting
        cleaned = line.replace('$', '').replace(',', '')
        # Split on tab, colon, or whitespace
        parts = re.split(r'[\t:]+|\s+', cleaned.strip())
        parts = [p.strip() for p in parts if p.strip()]
        if len(parts) < 2:
            continue
        # Skip header rows where first token is not a number
        try:
            place = int(parts[0])
        except ValueError:
            continue
        # Amount is the last numeric token
        amount_str = None
        for p in reversed(parts[1:]):
            if re.match(r'^\d+(\.\d+)?$', p):
                amount_str = p
                break
        if amount_str is None:
            continue
        try:
            amount = int(float(amount_str))
        except ValueError:
            continue
        if 1 <= place <= 70 and amount > 0:
            payouts.append({"place": place, "amount": amount})
    # Deduplicate, keep last value for each place
    seen = {}
    for p in payouts:
        seen[p["place"]] = p["amount"]
    return [{"place": k, "amount": v} for k, v in sorted(seen.items())]

def build_payout_map(payout_schedule: List[Dict]) -> Dict[int, int]:
    """Convert payout schedule list to {place: amount} dict."""
    return {p["place"]: p["amount"] for p in payout_schedule}

def calc_earnings_for_position(pos_str: str, payout_map: Dict[int, int],
                                scores_list: list, is_cut: bool, is_wd: bool = False) -> float:
    """
    Calculate projected earnings for a golfer.
    - CUT/WD players: flat CUT_EARNINGS
    - Tied players: sum payouts for all tied positions, split evenly
    """
    if is_cut or is_wd:
        return float(CUT_EARNINGS)
    if not pos_str or pos_str in ('-', '', 'WD', 'DQ', 'MDF'):
        return 0.0
    if not payout_map:
        return 0.0

    # Strip T prefix (e.g. "T3" -> 3)
    clean = pos_str.replace('T', '').strip()
    try:
        place = int(clean)
    except ValueError:
        return 0.0

    # Count how many golfers share this exact position (for tie-splitting)
    # We do this by counting non-cut golfers with the same position in scores_list
    tied_count = sum(
        1 for s in scores_list
        if not s.get('is_cut') and s.get('position_num') == place
    )
    if tied_count == 0:
        tied_count = 1

    # Sum payouts for all positions the tied group occupies
    total = sum(payout_map.get(place + i, 0) for i in range(tied_count))
    return float(total) / tied_count


def assign_positions(scores_list: list) -> list:
    """
    Given raw ESPN scores, assign integer position_num to each non-cut/non-wd golfer
    accounting for ties (same score_int = same position).
    Returns annotated scores_list.
    """
    active = [s for s in scores_list if not s.get('is_cut') and not s.get('is_wd') and s.get('score_int') is not None]
    active.sort(key=lambda x: x['score_int'])

    pos = 1
    i = 0
    while i < len(active):
        score = active[i]['score_int']
        j = i
        while j < len(active) and active[j]['score_int'] == score:
            j += 1
        num_tied = j - i
        tied_label = f'T{pos}' if num_tied > 1 else str(pos)
        for k in range(i, j):
            active[k]['position_num'] = pos
            active[k]['position_label'] = tied_label
        pos += num_tied
        i = j

    # Build lookup by espn_id and name
    lookup = {}
    for s in active:
        lookup[s.get('espn_id', '')] = s
        lookup[s.get('name', '').lower()] = s

    # Apply back to full list
    for s in scores_list:
        if s.get('is_cut'):
            s['position_num'] = None
            s['position_label'] = 'CUT'
        elif s.get('is_wd'):
            s['position_num'] = None
            s['position_label'] = 'WD'
        else:
            key = s.get('espn_id', '') or s.get('name', '').lower()
            match = lookup.get(key) or lookup.get(s.get('name', '').lower())
            if match:
                s['position_num'] = match.get('position_num')
                s['position_label'] = match.get('position_label', '-')
            else:
                s['position_num'] = None
                s['position_label'] = '-'
    return scores_list


def fmt_earnings(amount: float) -> str:
    """Format earnings as dollar string."""
    return f"${int(amount):,}"


AUTO_MAP_THRESHOLD = 0.99

def normalize_name(name: str) -> str:
    """Lowercase, strip suffixes and punctuation for fuzzy matching."""
    n = name.lower().strip()
    n = re.sub(r"\s+(jr\.?|sr\.?|iii|ii|iv|v)\s*$", "", n)
    n = re.sub(r"['\-\.]", "", n)
    n = re.sub(r"\s+", " ", n).strip()
    return n

def name_match_score(name1: str, name2: str) -> float:
    """Return 0-1 similarity between two player names."""
    n1 = normalize_name(name1)
    n2 = normalize_name(name2)
    if n1 == n2:
        return 1.0
    parts1 = n1.split()
    parts2 = n2.split()
    if not parts1 or not parts2:
        return 0.0
    last1, last2 = parts1[-1], parts2[-1]
    first1, first2 = parts1[0], parts2[0]
    if last1 != last2:
        return 0.0
    if first1 == first2:
        return 0.99
    if first1 and first2 and first1[0] == first2[0]:
        return 0.85
    return 0.4

def parse_manual_players(text: str) -> List[Dict]:
    """Parse 'Name, Price' or 'Name\tPrice' lines. Returns list of {name, price}."""
    lines = [l.strip() for l in text.strip().split("\n") if l.strip()]
    players = []
    seen: set = set()
    for line in lines:
        parts = re.split(r"\t|,", line, maxsplit=1)
        if len(parts) >= 2:
            name, price_str = parts[0].strip(), parts[1].strip()
        else:
            m = re.match(r"^(.+?)\s+(\$?[\d,]+)\s*$", line)
            if m:
                name, price_str = m.group(1).strip(), m.group(2).strip()
            else:
                continue
        price_str = price_str.replace("$", "").replace(",", "").strip()
        try:
            price = int(float(price_str))
        except ValueError:
            continue
        if name and price > 0 and name.lower() not in seen:
            seen.add(name.lower())
            players.append({"name": name, "price": price})
    return players

def calc_prices(golfers):
    sorted_g = sorted(golfers, key=lambda x: x.get('odds', 999))
    price = 300000
    for g in sorted_g:
        g['price'] = max(75000, price)
        price -= 5000
    return sorted_g

def parse_score(s):
    if not s or s in ('-', ''):
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
        params = {}
        if event_date:
            try:
                dt = datetime.fromisoformat(str(event_date).replace('Z', '+00:00'))
                params['dates'] = dt.strftime('%Y%m%d')
            except Exception:
                params['event'] = str(event_id)
        else:
            params['event'] = str(event_id)
        resp = await asyncio.to_thread(requests.get, url, params=params, timeout=15)
        data = resp.json()
        events = data.get('events', [])
        ev = None
        for e in events:
            if str(e.get('id', '')) == str(event_id):
                ev = e
                break
        if not ev and 'dates' in params:
            params2 = {'event': str(event_id)}
            resp2 = await asyncio.to_thread(requests.get, url, params=params2, timeout=15)
            data2 = resp2.json()
            for e in data2.get('events', []):
                if str(e.get('id', '')) == str(event_id):
                    ev = e
                    data = data2
                    break
        if not ev:
            for year in [2026, 2025]:
                resp3 = await asyncio.to_thread(requests.get, url, params={'dates': str(year)}, timeout=15)
                data3 = resp3.json()
                for e in data3.get('events', []):
                    if str(e.get('id', '')) == str(event_id):
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
            all_ls = c.get('linescores', [])
            total_linescores = len(all_ls)
            rounds = []
            for ls in all_ls:
                val = ls.get('value', 0) or 0
                display = (ls.get('displayValue', '') or '').strip()
                # Skip ESPN placeholder rounds: value=0 and no real display score
                if val > 0 or (display and display not in ('-', '', 'WD')):
                    rounds.append({
                        'round': ls.get('period', 0),
                        'score': display,
                        'strokes': val
                    })
            score_str = str(c.get('score', ''))
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
            linescore_text = ' '.join(str(ls.get('displayValue', '')) for ls in all_ls)
            combined_text = f"{score_str} {status_name} {status_desc} {status_short} {linescore_text}".upper()
            _wd_keywords = ('WD', 'WITHDRAWN', 'WITHDRAW', 'WITHDREW', 'WITHDRA')
            is_wd = any(kw in combined_text for kw in _wd_keywords)
            is_cut = 'CUT' in combined_text and not is_wd
            golfers.append({
                'espn_id': str(ath.get('id', c.get('id', ''))),
                'name': ath.get('fullName', ath.get('displayName', '')),
                'short_name': ath.get('shortName', ''),
                'order': c.get('order', 999),
                'score': score_str,
                'score_int': parse_score(score_str),
                'rounds': rounds,
                'total_linescores': total_linescores,
                'is_cut': is_cut,
                'is_wd': is_wd,
                'status': c.get('status', {}).get('type', {}).get('name', '') if isinstance(c.get('status'), dict) else '',
                'thru': str(c.get('status', {}).get('thru', '')) if isinstance(c.get('status'), dict) else ''
            })
        if golfers:
            round_counts = {}
            for g in golfers:
                rc = len(g['rounds'])
                round_counts[rc] = round_counts.get(rc, 0) + 1
            max_rounds = max(round_counts.keys()) if round_counts else 0

            # Standard PGA Tour event is 4 rounds. Playoff rounds add extra linescores
            # (total_ls > 4) but we cap at 4 so playoff rounds don't corrupt CUT/WD logic.
            STANDARD_ROUNDS = 4
            effective_max = min(max_rounds, STANDARD_ROUNDS)

            # WD detection: ESPN allocates exactly 4 linescore slots for players who made
            # the cut. A WD player has total_linescores==4 but fewer than 4 real rounds
            # (rounds with value > 0). Playoff players get total_ls > 4, so they're safe.
            for g in golfers:
                real_rounds = len(g['rounds'])
                total_ls = g.get('total_linescores', real_rounds)
                is_active = 'PROGRESS' in str(g.get('status', '')).upper()
                if (not g.get('is_cut') and not g.get('is_wd') and
                        not is_active and
                        real_rounds >= 1 and
                        total_ls == STANDARD_ROUNDS and
                        real_rounds < STANDARD_ROUNDS):
                    g['is_wd'] = True

            # CUT detection: players with fewer real rounds once round 3+ is in play.
            # Use effective_max (capped at 4) so playoff rounds don't flag normal finishers.
            if effective_max >= 3:
                for g in golfers:
                    if len(g['rounds']) < effective_max and not g.get('is_wd'):
                        g['is_cut'] = True
        return golfers, data
    except Exception as e:
        logger.error(f"ESPN field: {e}")
        return [], {}

# ── Auth Routes ──
@api_router.post("/auth/register")
async def register(data: UserCreate):
    if not data.email.strip():
        raise HTTPException(status_code=400, detail="Email is required")
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Name is required")
    if await db.users.find_one({"email": data.email.lower().strip()}, {"_id": 0}):
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    user = {
        "id": gen_id(), "name": data.name.strip(), "email": data.email.lower().strip(),
        "is_admin": data.email.lower().strip() == ADMIN_EMAIL,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user)
    return {"id": user["id"], "name": user["name"], "email": user["email"], "is_admin": user["is_admin"]}

@api_router.post("/auth/login")
async def login(data: dict):
    email = data.get('email', '').lower().strip()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="No account found with this email")
    return {"id": user["id"], "name": user["name"], "email": user["email"], "is_admin": user.get("is_admin", False)}

@api_router.get("/auth/user/{user_id}")
async def get_user(user_id: str):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"id": user["id"], "name": user["name"], "email": user["email"], "is_admin": user.get("is_admin", False)}

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
    if updates:
        await db.users.update_one({"id": user_id}, {"$set": updates})
        if "name" in updates:
            await db.teams.update_many({"user_id": user_id}, {"$set": {"user_name": updates["name"]}})
        if "email" in updates:
            await db.teams.update_many({"user_id": user_id}, {"$set": {"user_email": updates["email"]}})
    updated = await db.users.find_one({"id": user_id}, {"_id": 0})
    return {"id": updated["id"], "name": updated["name"], "email": updated["email"], "is_admin": updated.get("is_admin", False)}

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
               "deadline": "", "golfers": [], "status": "setup", "payout_schedule": [],
               "sync_state": None, "created_at": datetime.now(timezone.utc).isoformat()}
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
    golfer_list = [{"espn_id": g["espn_id"], "name": g["name"], "short_name": g.get("short_name", ""),
                    "world_ranking": i + 1, "odds": None, "price": None} for i, g in enumerate(golfers)]
    update_data = {"golfers": golfer_list, "status": "golfers_loaded"}
    target_ev = None
    for ev_item in raw.get('events', []):
        if str(ev_item.get('id', '')) == str(t["espn_event_id"]):
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
    """Import odds from pasted text data."""
    await check_admin(user_id)
    t = await db.tournaments.find_one({"slot": slot}, {"_id": 0})
    if not t: raise HTTPException(status_code=404, detail="Tournament not found")
    if not t.get("golfers"): raise HTTPException(status_code=400, detail="Fetch golfers first")
    odds_text = body.get("odds_text", "")
    if not odds_text:
        raise HTTPException(status_code=400, detail="Paste odds data from FanDuel/DraftKings")
    lines = [l.strip() for l in odds_text.strip().split('\n') if l.strip()]
    parsed_odds = {}
    for line in lines:
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
            odds_val = float(odds_str.replace('+', ''))
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

@api_router.post("/admin/upload-players/{slot}")
async def admin_upload_players(slot: int, data: ManualPlayerUpload, user_id: str = Query(...)):
    """Upload a manual player list with prices before ESPN data is available."""
    await check_admin(user_id)
    t = await db.tournaments.find_one({"slot": slot}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")
    players = parse_manual_players(data.players_text)
    if not players:
        raise HTTPException(status_code=400, detail="Could not parse any players. Use 'Name, Price' format per line.")
    players.sort(key=lambda x: x["price"], reverse=True)
    golfer_list = []
    for i, p in enumerate(players):
        golfer_list.append({
            "player_id": gen_id(), "espn_id": None, "name": p["name"],
            "espn_name": None, "short_name": None, "world_ranking": i + 1,
            "price": p["price"], "odds": None, "mapping_status": "manual"
        })
    await db.tournaments.update_one(
        {"slot": slot},
        {"$set": {"golfers": golfer_list, "status": "manually_loaded", "sync_state": None}}
    )
    return await db.tournaments.find_one({"slot": slot}, {"_id": 0})

@api_router.post("/admin/sync-espn/{slot}")
async def admin_sync_espn(slot: int, user_id: str = Query(...)):
    """Sync manually uploaded players with the ESPN field. Returns mapping results."""
    await check_admin(user_id)
    t = await db.tournaments.find_one({"slot": slot}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")
    if not t.get("golfers"):
        raise HTTPException(status_code=400, detail="Upload players first")
    if not t.get("espn_event_id"):
        raise HTTPException(status_code=400, detail="Map an ESPN event first")
    event_date = t.get("start_date", "")
    espn_golfers, raw = await espn_get_field(t["espn_event_id"], event_date)
    if not espn_golfers:
        raise HTTPException(status_code=400, detail="Could not fetch ESPN field. Field may not be available yet.")
    # ESPN IDs already confirmed from prior mapping rounds
    confirmed_espn_ids = set()
    for g in t["golfers"]:
        if g.get("mapping_status") in ("auto_mapped", "manually_mapped") and g.get("espn_id"):
            confirmed_espn_ids.add(g["espn_id"])
    # Players still needing mapping
    unsynced = [g for g in t["golfers"] if g.get("mapping_status") == "manual"]
    matched_espn_ids = set(confirmed_espn_ids)
    auto_mapped_new = []
    pending_manual = []
    for g in unsynced:
        best_score, best_espn = 0.0, None
        for eg in espn_golfers:
            if eg["espn_id"] in matched_espn_ids:
                continue
            score = name_match_score(g["name"], eg["name"])
            if score > best_score:
                best_score, best_espn = score, eg
        if best_score >= AUTO_MAP_THRESHOLD and best_espn:
            matched_espn_ids.add(best_espn["espn_id"])
            auto_mapped_new.append({
                "player_id": g.get("player_id"), "name": g["name"], "price": g["price"],
                "espn_id": best_espn["espn_id"], "espn_name": best_espn["name"],
                "short_name": best_espn.get("short_name", ""), "confidence": best_score
            })
        else:
            candidates = sorted(
                [{"espn_id": eg["espn_id"], "espn_name": eg["name"],
                  "short_name": eg.get("short_name", ""), "score": round(name_match_score(g["name"], eg["name"]), 2)}
                 for eg in espn_golfers if eg["espn_id"] not in matched_espn_ids],
                key=lambda x: x["score"], reverse=True
            )[:10]
            pending_manual.append({
                "player_id": g.get("player_id"), "name": g["name"],
                "price": g["price"], "candidates": candidates
            })
    # ESPN players not matched to any confirmed or new mapping
    new_auto_espn_ids = {am["espn_id"] for am in auto_mapped_new}
    pending_espn = [
        {"espn_id": eg["espn_id"], "espn_name": eg["name"],
         "short_name": eg.get("short_name", ""), "world_ranking": eg.get("order", 999)}
        for eg in espn_golfers
        if eg["espn_id"] not in matched_espn_ids and eg["espn_id"] not in new_auto_espn_ids
    ]
    # Already confirmed (auto_mapped/manually_mapped) from prior rounds
    already_mapped = [
        {"player_id": g.get("player_id"), "name": g["name"], "price": g["price"],
         "espn_id": g.get("espn_id"), "espn_name": g.get("espn_name"),
         "short_name": g.get("short_name"), "mapping_status": g.get("mapping_status")}
        for g in t["golfers"]
        if g.get("mapping_status") in ("auto_mapped", "manually_mapped") and g.get("espn_id")
    ]
    # Update start/end dates if ESPN returns them
    update_data: Dict[str, Any] = {
        "sync_state": {"auto_mapped_new": auto_mapped_new, "pending_manual": pending_manual, "pending_espn": pending_espn}
    }
    target_ev = next((e for e in raw.get("events", []) if str(e.get("id","")) == str(t["espn_event_id"])), None)
    if not target_ev and raw.get("events"):
        target_ev = raw["events"][0]
    if target_ev:
        update_data["start_date"] = target_ev.get("date", t.get("start_date", ""))
        update_data["end_date"] = target_ev.get("endDate", target_ev.get("date", t.get("end_date", "")))
    await db.tournaments.update_one({"slot": slot}, {"$set": update_data})
    return {
        "auto_mapped_new": auto_mapped_new, "already_mapped": already_mapped,
        "pending_manual": pending_manual, "pending_espn": pending_espn,
        "message": (f"Auto-mapped {len(auto_mapped_new)} new players. "
                    f"{len(pending_manual)} need manual mapping. "
                    f"{len(pending_espn)} ESPN players unmatched.")
    }

@api_router.post("/admin/confirm-sync/{slot}")
async def admin_confirm_sync(slot: int, data: SyncMappingConfirm, user_id: str = Query(...)):
    """Apply sync mapping decisions and finalize tournament golfers."""
    await check_admin(user_id)
    t = await db.tournaments.find_one({"slot": slot}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")
    golfers = t.get("golfers", [])
    sync_state = t.get("sync_state") or {}
    golfer_map = {g["player_id"]: dict(g) for g in golfers if g.get("player_id")}
    # Apply auto_mapped_new from sync_state (except those being unmapped)
    unmap_set = set(data.unmap_player_ids or [])
    for item in sync_state.get("auto_mapped_new", []):
        pid = item.get("player_id")
        if pid and pid in golfer_map and pid not in unmap_set:
            golfer_map[pid].update({
                "espn_id": item["espn_id"], "espn_name": item["espn_name"],
                "short_name": item.get("short_name", ""), "mapping_status": "auto_mapped"
            })
    # Unmap players (revert to manual)
    for pid in unmap_set:
        if pid in golfer_map:
            golfer_map[pid].update({"mapping_status": "manual", "espn_id": None, "espn_name": None, "short_name": None})
    # Apply manual mappings
    for player_id, espn_data in (data.manual_mappings or {}).items():
        if player_id in golfer_map:
            if espn_data is None:
                golfer_map[player_id].update({"mapping_status": "not_in_field", "espn_id": None, "espn_name": None})
            else:
                golfer_map[player_id].update({
                    "espn_id": espn_data.get("espn_id"), "espn_name": espn_data.get("espn_name"),
                    "short_name": espn_data.get("short_name", ""), "mapping_status": "manually_mapped"
                })
    # Add new ESPN players
    pending_espn_lookup = {ep["espn_id"]: ep for ep in sync_state.get("pending_espn", [])}
    for espn_id, price in (data.espn_additions or {}).items():
        ep = pending_espn_lookup.get(espn_id)
        if ep:
            new_pid = gen_id()
            golfer_map[new_pid] = {
                "player_id": new_pid, "espn_id": espn_id,
                "name": ep.get("espn_name", ""), "espn_name": ep.get("espn_name", ""),
                "short_name": ep.get("short_name", ""), "world_ranking": 999,
                "price": price, "odds": None, "mapping_status": "manually_mapped"
            }
    # Build final sorted list
    all_g = list(golfer_map.values())
    active = sorted([g for g in all_g if g.get("mapping_status") != "not_in_field" and g.get("price")],
                    key=lambda x: x.get("price", 0), reverse=True)
    not_in_field = [g for g in all_g if g.get("mapping_status") == "not_in_field"]
    for i, g in enumerate(active):
        g["world_ranking"] = i + 1
    final_golfers = active + not_in_field
    # Update sync_state to remove resolved items
    resolved_manual = set((data.manual_mappings or {}).keys()) | unmap_set
    resolved_espn = set(list((data.espn_additions or {}).keys()) + list((data.espn_discards or [])))
    updated_sync_state = {
        "auto_mapped_new": [],
        "pending_manual": [p for p in sync_state.get("pending_manual", [])
                           if p.get("player_id") not in resolved_manual],
        "pending_espn": [ep for ep in sync_state.get("pending_espn", [])
                         if ep.get("espn_id") not in resolved_espn]
    }
    still_pending = updated_sync_state["pending_manual"]
    new_status = "prices_set" if not still_pending else t.get("status", "manually_loaded")
    await db.tournaments.update_one(
        {"slot": slot},
        {"$set": {"golfers": final_golfers, "status": new_status, "sync_state": updated_sync_state}}
    )
    return await db.tournaments.find_one({"slot": slot}, {"_id": 0})

@api_router.post("/admin/unmap-player/{slot}")
async def admin_unmap_player(slot: int, data: UnmapRequest, user_id: str = Query(...)):
    """Move a confirmed (auto/manually mapped) player back to the manual mapping pool."""
    await check_admin(user_id)
    t = await db.tournaments.find_one({"slot": slot}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")
    golfers = t.get("golfers", [])
    target = next((g for g in golfers if g.get("player_id") == data.player_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Player not found")
    if target.get("mapping_status") not in ("auto_mapped", "manually_mapped"):
        raise HTTPException(status_code=400, detail="Player is not currently mapped")
    released_espn_id = target.get("espn_id")
    updated_golfers = [
        {**g, "mapping_status": "manual", "espn_id": None, "espn_name": None, "short_name": None}
        if g.get("player_id") == data.player_id else g
        for g in golfers
    ]
    sync_state = t.get("sync_state") or {"auto_mapped_new": [], "pending_manual": [], "pending_espn": []}
    sync_state.setdefault("pending_manual", []).append({
        "player_id": target["player_id"], "name": target["name"], "price": target["price"], "candidates": []
    })
    if released_espn_id:
        sync_state.setdefault("pending_espn", []).append({
            "espn_id": released_espn_id, "espn_name": target.get("espn_name"),
            "short_name": target.get("short_name"), "world_ranking": 999
        })
    await db.tournaments.update_one(
        {"slot": slot},
        {"$set": {"golfers": updated_golfers, "status": "manually_loaded", "sync_state": sync_state}}
    )
    return await db.tournaments.find_one({"slot": slot}, {"_id": 0})

@api_router.post("/admin/payout-schedule/{slot}")
async def admin_set_payout_schedule(slot: int, data: PayoutScheduleUpdate, user_id: str = Query(...)):
    """Upload the payout schedule for a tournament. Place 1-70, dollar amount per place."""
    await check_admin(user_id)
    t = await db.tournaments.find_one({"slot": slot}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")
    if not data.payout_text.strip():
        raise HTTPException(status_code=400, detail="Payout data is empty")
    schedule = parse_payout_text(data.payout_text)
    if not schedule:
        raise HTTPException(status_code=400, detail="Could not parse any payout entries. Use format: '1: 3600000' per line")
    if len(schedule) > 70:
        raise HTTPException(status_code=400, detail="Maximum 70 payout positions")
    await db.tournaments.update_one({"slot": slot}, {"$set": {"payout_schedule": schedule}})
    return {"message": f"Payout schedule saved ({len(schedule)} places)", "schedule": schedule}

@api_router.get("/admin/payout-schedule/{slot}")
async def admin_get_payout_schedule(slot: int, user_id: str = Query(...)):
    """Get the current payout schedule for a tournament."""
    await check_admin(user_id)
    t = await db.tournaments.find_one({"slot": slot}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")
    return {"schedule": t.get("payout_schedule", [])}

@api_router.delete("/admin/tournaments/{slot}")
async def admin_reset_tournament(slot: int, user_id: str = Query(...)):
    await check_admin(user_id)
    t = await db.tournaments.find_one({"slot": slot}, {"_id": 0})
    if t and t.get("id"):
        await db.teams.delete_many({"tournament_id": t["id"]})
        await db.score_cache.delete_many({"tournament_id": t["id"]})
    await db.tournaments.delete_one({"slot": slot})
    fresh_doc = {
        "id": gen_id(), "slot": slot, "name": "", "espn_event_id": "",
        "odds_sport_key": "", "start_date": "", "end_date": "", "deadline": "",
        "golfers": [], "status": "setup", "payout_schedule": [], "sync_state": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.tournaments.insert_one(fresh_doc)
    return {"message": "Tournament completely reset", "slot": slot}

@api_router.get("/admin/export-csv/{slot}")
async def admin_export_csv(slot: int, user_id: str = Query(...)):
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
        writer.writerow([i, g.get("name", ""), g.get("world_ranking", ""), g.get("price", ""), g.get("odds", "")])
    output.seek(0)
    filename = f"{t.get('name', 'tournament').replace(' ', '_')}_golfers.csv"
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f"attachment; filename={filename}"})

@api_router.get("/admin/teams/{tournament_id}")
async def admin_get_tournament_teams(tournament_id: str, user_id: str = Query(...)):
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
    await check_admin(user_id)
    team = await db.teams.find_one({"id": team_id}, {"_id": 0})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    await db.teams.delete_one({"id": team_id})
    return {"message": "Team deleted successfully"}

@api_router.patch("/admin/teams/{team_id}/paid")
async def admin_set_team_paid(team_id: str, user_id: str = Query(...), paid: bool = Query(...)):
    await check_admin(user_id)
    team = await db.teams.find_one({"id": team_id}, {"_id": 0})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    await db.teams.update_one({"id": team_id}, {"$set": {"paid": paid}})
    return await db.teams.find_one({"id": team_id}, {"_id": 0})

# ── Public Tournament Routes ──
@api_router.get("/tournaments")
async def get_tournaments():
    tournaments = await db.tournaments.find({}, {"_id": 0}).sort("slot", 1).to_list(4)
    result = []
    for t in tournaments:
        tc = await db.teams.count_documents({"tournament_id": t["id"]})
        result.append({
            "id": t["id"], "slot": t["slot"], "name": t["name"],
            "start_date": t.get("start_date", ""), "end_date": t.get("end_date", ""),
            "deadline": t.get("deadline", ""), "status": t.get("status", "setup"),
            "golfer_count": len(t.get("golfers", [])), "team_count": tc,
            "has_prices": any(g.get("price") for g in t.get("golfers", [])),
            "has_payouts": len(t.get("payout_schedule", [])) > 0
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
    deadline = t.get("deadline", "")
    if deadline:
        try:
            dl = datetime.fromisoformat(deadline.replace('Z', '+00:00'))
            if datetime.now(timezone.utc) > dl:
                raise HTTPException(status_code=400, detail="Tournament deadline has passed. Teams are locked.")
        except (ValueError, TypeError):
            pass
    if data.team_number not in (1, 2):
        raise HTTPException(status_code=400, detail="Team number must be 1 or 2")
    if len(data.golfers) != 5:
        raise HTTPException(status_code=400, detail="Must select exactly 5 golfers")
    names = [g['name'] for g in data.golfers]
    if len(set(names)) != 5:
        raise HTTPException(status_code=400, detail="Cannot select the same golfer twice on one team")
    total_cost = sum(g.get('price', 0) for g in data.golfers)
    if total_cost > 1000000:
        raise HTTPException(status_code=400, detail="Over budget! Max $1,000,000")
    existing = await db.teams.find_one({"user_id": data.user_id, "tournament_id": data.tournament_id,
                                        "team_number": data.team_number}, {"_id": 0})
    if existing:
        await db.teams.update_one({"id": existing["id"]}, {"$set": {
            "golfers": [dict(g) for g in data.golfers], "total_cost": total_cost,
            "user_name": user["name"], "updated_at": datetime.now(timezone.utc).isoformat()
        }})
        return await db.teams.find_one({"id": existing["id"]}, {"_id": 0})
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
        return {k: v for k, v in team.items() if k != '_id'}

@api_router.delete("/teams/{team_id}")
async def delete_team(team_id: str, user_id: str = Query(...)):
    team = await db.teams.find_one({"id": team_id}, {"_id": 0})
    if not team: raise HTTPException(status_code=404, detail="Team not found")
    if team["user_id"] != user_id: raise HTTPException(status_code=403, detail="Not your team")
    t = await db.tournaments.find_one({"id": team["tournament_id"]}, {"_id": 0})
    if t and t.get("deadline"):
        try:
            dl = datetime.fromisoformat(t["deadline"].replace('Z', '+00:00'))
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

    if t.get("espn_event_id") and t.get("status") not in ("setup", "golfers_loaded", "manually_loaded"):
        should_refresh = not cache
        if cache:
            try:
                last = datetime.fromisoformat(cache.get("last_updated", ""))
                if (datetime.now(timezone.utc) - last) > timedelta(minutes=1):
                    should_refresh = True
            except Exception:
                should_refresh = True
        if should_refresh:
            try:
                event_date = t.get("start_date", "")
                golfers, raw = await espn_get_field(t["espn_event_id"], event_date)
                if golfers:
                    scores = []
                    for g in golfers:
                        display_score = "CUT" if g.get("is_cut") else g["score"]
                        display_rounds = g["rounds"][:2] if g.get("is_cut") else g["rounds"]
                        scores.append({
                            "espn_id": g["espn_id"], "name": g["name"],
                            "position": str(g["order"]),
                            "total_score": display_score, "score_int": g.get("score_int"),
                            "rounds": display_rounds,
                            "thru": g.get("thru", ""), "is_cut": g.get("is_cut", False),
                            "is_wd": g.get("is_wd", False),
                            "is_active": "PROGRESS" in str(g.get("status", "")).upper(),
                            "sort_order": g["order"]
                        })
                    # Assign positions & tie info
                    scores = assign_positions(scores)
                    await db.score_cache.update_one(
                        {"tournament_id": tournament_id},
                        {"$set": {"tournament_id": tournament_id, "scores": scores,
                                  "last_updated": datetime.now(timezone.utc).isoformat()}},
                        upsert=True)
                    cache = await db.score_cache.find_one({"tournament_id": tournament_id}, {"_id": 0})
                    events = raw.get('events', [])
                    if events:
                        st = events[0].get('status', {}).get('type', {}).get('name', '')
                        if 'FINAL' in st.upper():
                            await db.tournaments.update_one({"id": tournament_id}, {"$set": {"status": "completed"}})
                            t["status"] = "completed"
            except Exception as ex:
                logger.error(f"Auto-refresh: {ex}")

    scores = cache.get("scores", []) if cache else []
    last_updated = cache.get("last_updated", "") if cache else ""

    # Normalize CUT/WD players so initial page load matches manual refresh behavior.
    for s in scores:
        if s.get("is_cut"):
            if s.get("total_score") == "CUT" and s.get("score_int") is not None:
                val = s["score_int"]
                if val == 0:
                    s["total_score"] = "E"
                elif val > 0:
                    s["total_score"] = f"+{val}"
                else:
                    s["total_score"] = str(val)
            if len(s.get("rounds", [])) > 2:
                s["rounds"] = s["rounds"][:2]
        elif s.get("is_wd"):
            if s.get("total_score") in ("WD", "") and s.get("score_int") is not None:
                val = s["score_int"]
                if val == 0:
                    s["total_score"] = "E"
                elif val > 0:
                    s["total_score"] = f"+{val}"
                else:
                    s["total_score"] = str(val)

    # Make sure positions are assigned (in case cache pre-dates this feature)
    if scores:
        scores = assign_positions(scores)

    payout_map = build_payout_map(t.get("payout_schedule", []))
    teams = await db.teams.find({"tournament_id": tournament_id}, {"_id": 0}).to_list(500)

    # Build score lookup
    score_by_espn = {s["espn_id"]: s for s in scores}
    score_by_name = {s["name"].lower(): s for s in scores}

    team_standings = []
    for team in teams:
        total_earnings = 0.0
        gd = []
        for golfer in team.get("golfers", []):
            sd = (score_by_espn.get(golfer.get("espn_id", "")) or
                  score_by_name.get(golfer.get("name", "").lower()))
            if sd:
                earnings = calc_earnings_for_position(
                    sd.get("position_label", "-"),
                    payout_map,
                    scores,
                    sd.get("is_cut", False),
                    sd.get("is_wd", False)
                )
                total_earnings += earnings
                gd.append({
                    **golfer,
                    "position": sd.get("position_label", "-"),
                    "total_score": sd.get("total_score", ""),
                    "rounds": sd.get("rounds", []),
                    "thru": sd.get("thru", ""),
                    "is_active": sd.get("is_active", False),
                    "is_cut": sd.get("is_cut", False),
                    "is_wd": sd.get("is_wd", False),
                    "earnings": earnings,
                    "earnings_fmt": fmt_earnings(earnings),
                    "sort_order": sd.get("sort_order", 999)
                })
            else:
                gd.append({
                    **golfer,
                    "position": "-", "total_score": "-", "rounds": [], "thru": "",
                    "is_active": False, "is_cut": False,
                    "earnings": 0.0, "earnings_fmt": "$0",
                    "sort_order": 9999
                })
        # Sort: active/non-cut/non-wd by earnings desc, then cut/wd players
        gd.sort(key=lambda x: (1 if x.get("is_cut") or x.get("is_wd") else 0,
                                -x["earnings"] if not (x.get("is_cut") or x.get("is_wd")) else x.get("sort_order", 9999)))
        team_standings.append({
            "team_id": team["id"],
            "user_name": team["user_name"],
            "team_number": team["team_number"],
            "team_name": f"{team['user_name']} #{team['team_number']}",
            "golfers": gd,
            "total_earnings": total_earnings,
            "total_earnings_fmt": fmt_earnings(total_earnings),
            "paid": team.get("paid", False)
        })

    team_standings.sort(key=lambda x: x["total_earnings"], reverse=True)
    for i, ts in enumerate(team_standings):
        ts["rank"] = i + 1

    # Top 25 for tournament standings panel
    top25_scores = [s for s in scores if not s.get("is_cut", False) and not s.get("is_wd", False) and s.get("score_int") is not None]
    top25_scores.sort(key=lambda x: x.get("score_int", 999))
    top25 = []
    for s in top25_scores[:25]:
        earnings = calc_earnings_for_position(
            s.get("position_label", "-"), payout_map, scores, False
        )
        top25.append({
            **s,
            "position": s.get("position_label", s.get("position", "")),
            "earnings": earnings,
            "earnings_fmt": fmt_earnings(earnings)
        })

    return {
        "tournament": {"id": t["id"], "name": t["name"], "status": t.get("status", ""),
                       "start_date": t.get("start_date", ""), "end_date": t.get("end_date", ""),
                       "has_payouts": len(payout_map) > 0},
        "team_standings": team_standings,
        "tournament_standings": top25,
        "last_updated": last_updated,
        "is_finalized": t.get("status") == "completed",
        "has_payouts": len(payout_map) > 0,
        "cut_earnings": CUT_EARNINGS
    }

@api_router.post("/scores/refresh/{tournament_id}")
async def manual_refresh(tournament_id: str, user_id: str = Query(...)):
    t = await db.tournaments.find_one({"id": tournament_id}, {"_id": 0})
    if not t: raise HTTPException(status_code=404, detail="Tournament not found")
    if not t.get("espn_event_id"): raise HTTPException(status_code=400, detail="No ESPN event mapped")
    event_date = t.get("start_date", "")
    golfers, raw = await espn_get_field(t["espn_event_id"], event_date)
    if not golfers: raise HTTPException(status_code=400, detail="Could not fetch scores")
    scores_list = []
    for g in golfers:
        scores_list.append({
            "espn_id": g["espn_id"], "name": g["name"],
            "position": str(g["order"]),
            "total_score": g["score"], "score_int": g.get("score_int"),
            "rounds": g["rounds"],
            "thru": g.get("thru", ""), "is_cut": g.get("is_cut", False),
            "is_wd": g.get("is_wd", False),
            "is_active": "PROGRESS" in str(g.get("status", "")).upper(),
            "sort_order": g["order"]
        })
    scores_list = assign_positions(scores_list)
    await db.score_cache.update_one(
        {"tournament_id": tournament_id},
        {"$set": {"tournament_id": tournament_id, "scores": scores_list,
                  "last_updated": datetime.now(timezone.utc).isoformat()}},
        upsert=True)
    events = raw.get('events', [])
    if events:
        st = events[0].get('status', {}).get('type', {}).get('name', '')
        if 'FINAL' in st.upper():
            await db.tournaments.update_one({"id": tournament_id}, {"$set": {"status": "completed"}})
    return {"message": "Scores refreshed", "count": len(scores_list)}

# ── History ──
HISTORY = [
    {"year": 2025, "tournaments": [
        {"name": "Masters", "winners": ["Brandon Nowak", "Mike Gnaster", "Dave Magurno"]}]},
    {"year": 2024, "tournaments": [
        {"name": "Masters", "winners": ["Chad Ewald", "Pete Shoemaker", "Mike Gnaster"]}]},
    {"year": 2023, "tournaments": [
        {"name": "Masters", "winners": ["Vance Hodges", "Joe Girard", "Zach Lehmann"]}]},
    {"year": 2022, "tournaments": [
        {"name": "Masters", "winners": ["Dave Magurno", "Nick Woody", "John Babcock"]}]},
    {"year": 2021, "tournaments": [
        {"name": "Masters", "winners": ["Daryl Gabriel", "Andrew David", "Mike Gnaster"]}]},
    {"year": 2020, "tournaments": [
        {"name": "Masters", "winners": ["Curtis Schoonover", "Mike Gnaster", "Blake Gabriel"]}]},
    {"year": 2019, "tournaments": [
        {"name": "Masters", "winners": ["Mike Rettler", "Andrew Barden", "Curtis Schoonover"]}]},
    {"year": 2018, "tournaments": [
        {"name": "Masters", "winners": ["Clark Odom", "Jason Depp", "Jeff Nagel"]}]},
    {"year": 2017, "tournaments": [
        {"name": "Masters", "winners": ["Adam Haase", "Pete Shoemaker", "Tim Burnham"]}]},
    {"year": 2016, "tournaments": [
        {"name": "Masters", "winners": ["Mike Walters", "Jason Depp", "Jeff Nagel"]}]},
    {"year": 2015, "tournaments": [
        {"name": "Masters", "winners": ["Vance Hodges", "Adam Haase", "Scott Resch"]}]},
]

@api_router.get("/history")
async def get_history():
    return HISTORY

@api_router.get("/")
async def root():
    return {"message": "Schoonover Invitational API"}

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
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.tournaments.create_index("slot", unique=True)
    await db.tournaments.create_index("id", unique=True)
    await db.teams.create_index("id", unique=True)
    await db.teams.create_index([("user_id", 1), ("tournament_id", 1)])
    await db.score_cache.create_index("tournament_id", unique=True)
    logger.info("Schoonover Invitational API started")

@app.on_event("shutdown")
async def shutdown():
    client.close()