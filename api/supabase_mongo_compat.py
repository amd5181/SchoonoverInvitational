import os
from typing import Any, Dict, List, Optional

import httpx


class SupabaseQuery:
    def __init__(self, table: "SupabaseTable", query_filter: Optional[Dict[str, Any]] = None):
        self.table = table
        self.query_filter = query_filter or {}
        self.sort_field: Optional[str] = None
        self.sort_direction: int = 1

    def sort(self, field: str, direction: int):
        self.sort_field = field
        self.sort_direction = direction
        return self

    async def to_list(self, limit: int):
        rows = await self.table._select(self.query_filter)
        if self.sort_field:
            reverse = self.sort_direction == -1
            rows = sorted(rows, key=lambda x: x.get(self.sort_field), reverse=reverse)
        return rows[:limit]


class SupabaseTable:
    def __init__(self, client: "SupabaseMongoCompat", table_name: str):
        self.client = client
        self.table_name = table_name

    async def _select(self, query_filter: Optional[Dict[str, Any]] = None):
        params = {"select": "*"}
        self._apply_filter_params(params, query_filter or {})
        data = await self.client.request("GET", f"/rest/v1/{self.table_name}", params=params)
        return data if isinstance(data, list) else []

    def _apply_filter_params(self, params: Dict[str, str], query_filter: Dict[str, Any]):
        for key, value in query_filter.items():
            if isinstance(value, dict):
                if "$ne" in value:
                    params[key] = f"neq.{value['$ne']}"
                else:
                    raise ValueError(f"Unsupported filter operator for key {key}: {value}")
            else:
                params[key] = f"eq.{value}"

    async def create_index(self, *args, **kwargs):
        return None

    async def find_one(self, query_filter: Dict[str, Any], projection: Optional[Dict[str, int]] = None):
        rows = await self._select(query_filter)
        return rows[0] if rows else None

    def find(self, query_filter: Optional[Dict[str, Any]] = None, projection: Optional[Dict[str, int]] = None):
        return SupabaseQuery(self, query_filter)

    async def insert_one(self, doc: Dict[str, Any]):
        headers = {"Prefer": "return=representation"}
        data = await self.client.request(
            "POST",
            f"/rest/v1/{self.table_name}",
            json=[doc],
            headers=headers,
        )
        if isinstance(data, list) and data:
            return data[0]
        return doc

    async def update_one(self, query_filter: Dict[str, Any], update_doc: Dict[str, Any], upsert: bool = False):
        set_payload = update_doc.get("$set", update_doc)
        existing = await self.find_one(query_filter)
        if existing:
            params: Dict[str, str] = {}
            self._apply_filter_params(params, query_filter)
            await self.client.request("PATCH", f"/rest/v1/{self.table_name}", params=params, json=set_payload)
            return
        if upsert:
            merged = dict(query_filter)
            merged.update(set_payload)
            await self.insert_one(merged)

    async def update_many(self, query_filter: Dict[str, Any], update_doc: Dict[str, Any]):
        set_payload = update_doc.get("$set", update_doc)
        params: Dict[str, str] = {}
        self._apply_filter_params(params, query_filter)
        await self.client.request("PATCH", f"/rest/v1/{self.table_name}", params=params, json=set_payload)

    async def delete_one(self, query_filter: Dict[str, Any]):
        params: Dict[str, str] = {}
        self._apply_filter_params(params, query_filter)
        await self.client.request("DELETE", f"/rest/v1/{self.table_name}", params=params)

    async def delete_many(self, query_filter: Dict[str, Any]):
        params: Dict[str, str] = {}
        self._apply_filter_params(params, query_filter)
        await self.client.request("DELETE", f"/rest/v1/{self.table_name}", params=params)

    async def count_documents(self, query_filter: Dict[str, Any]):
        params = {"select": "id"}
        self._apply_filter_params(params, query_filter)
        total = await self.client.request_count(f"/rest/v1/{self.table_name}", params=params)
        return total


class SupabaseMongoCompat:
    def __init__(self):
        self.supabase_url = os.environ["SUPABASE_URL"].rstrip("/")
        self.supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not self.supabase_key:
            self.supabase_key = os.environ.get("SUPABASE_ANON_KEY")
        if not self.supabase_key:
            raise RuntimeError("Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY for backend database access")
        self.http_client = httpx.AsyncClient(timeout=20)

        self.users = SupabaseTable(self, "users")
        self.tournaments = SupabaseTable(self, "tournaments")
        self.teams = SupabaseTable(self, "teams")
        self.score_cache = SupabaseTable(self, "score_cache")

    def _headers(self, extra: Optional[Dict[str, str]] = None):
        headers = {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.supabase_key}",
            "Content-Type": "application/json",
        }
        if extra:
            headers.update(extra)
        return headers

    async def request(
        self,
        method: str,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        json: Optional[Any] = None,
        headers: Optional[Dict[str, str]] = None,
    ):
        response = await self.http_client.request(
            method,
            f"{self.supabase_url}{path}",
            params=params,
            json=json,
            headers=self._headers(headers),
        )
        response.raise_for_status()
        if not response.content:
            return None
        return response.json()

    async def request_count(self, path: str, params: Optional[Dict[str, Any]] = None):
        response = await self.http_client.request(
            "GET",
            f"{self.supabase_url}{path}",
            params=params,
            headers=self._headers({"Prefer": "count=exact"}),
        )
        response.raise_for_status()
        content_range = response.headers.get("content-range", "0-0/0")
        try:
            total = int(content_range.split("/")[1])
        except Exception:
            total = 0
        return total

    async def close(self):
        await self.http_client.aclose()
