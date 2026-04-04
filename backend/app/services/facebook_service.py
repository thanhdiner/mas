from datetime import datetime, timezone
from typing import Optional
import httpx

from app.config import get_settings
from app.database import get_db
from app.models.facebook import (
    FacebookPageCreate,
    FacebookPageResponse,
    FacebookPageTokenStatus,
    FacebookPageUpdate,
)
from app.utils.doc_parser import doc_to_model
from app.utils.object_id import to_object_id


def _doc_to_response(doc: dict) -> FacebookPageResponse:
    return doc_to_model(doc, FacebookPageResponse)


class FacebookService:
    @staticmethod
    async def list_pages(
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[FacebookPageResponse], int]:
        db = get_db()
        query: dict = {}
        total = await db.facebook_pages.count_documents(query)
        cursor = (
            db.facebook_pages.find(query)
            .skip(skip)
            .limit(limit)
            .sort("createdAt", -1)
        )
        docs = await cursor.to_list(length=limit)
        return [_doc_to_response(d) for d in docs], total

    @staticmethod
    async def get_page(page_id: str) -> Optional[FacebookPageResponse]:
        db = get_db()
        doc = await db.facebook_pages.find_one(
            {"_id": to_object_id(page_id, "page_id")}
        )
        if not doc:
            return None
        return _doc_to_response(doc)

    @staticmethod
    async def connect_manual_page(page_id: str, access_token: str) -> FacebookPageResponse:
        """Connects a single Fanpage using a manual Page Access Token securely via Graph API."""
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://graph.facebook.com/v19.0/{page_id}",
                params={
                    "fields": "id,name,category,followers_count,picture{url}",
                    "access_token": access_token
                }
            )
            
        if resp.status_code != 200:
            error_data = resp.json().get("error", {})
            msg = error_data.get("message", "Invalid FB Graph API Response")
            print(f"[DEBUG] Facebook API rejected token for {page_id}. Error: {error_data}")
            raise ValueError(f"Facebook API Error: {msg}")

        data = resp.json()
        
        # Determine a random avatar color for UI consistency
        import random
        colors = ["bg-blue-600", "bg-orange-500", "bg-purple-600", "bg-green-500", "bg-pink-500"]
        color = random.choice(colors)

        # Extract picture URL if available
        avatar_url = data.get("picture", {}).get("data", {}).get("url")

        # Upsert operation to avoid duplicates
        db = get_db()
        now = datetime.now(timezone.utc)
        doc = {
            "pageId": data.get("id", page_id),
            "name": data.get("name", "Unknown Page"),
            "category": data.get("category", "General"),
            "followersCount": data.get("followers_count", 0),
            "accessToken": access_token,  # We store it to use for publishing later
            "tokenStatus": FacebookPageTokenStatus.ACTIVE.value,
            "avatarColor": color,
            "avatarUrl": avatar_url,
            "connectedAccountName": "Manual Connect",
            "connectedAccountAvatar": None,
            "lastPostedAt": None,
            "updatedAt": now,
        }

        # Use update_one with upsert
        await db.facebook_pages.update_one(
            {"pageId": data.get("id", page_id)},
            {"$set": doc, "$setOnInsert": {"createdAt": now}},
            upsert=True
        )
        
        # Fetch the newly updated/inserted doc to return complete info
        final_doc = await db.facebook_pages.find_one({"pageId": data.get("id", page_id)})
        return _doc_to_response(final_doc)

    @staticmethod
    async def exchange_oauth_code(code: str) -> str:
        """Exchanges OAuth code for long-lived User Access Token."""
        settings = get_settings()
        if not settings.FACEBOOK_APP_ID or not settings.FACEBOOK_APP_SECRET:
            raise ValueError("FACEBOOK_APP_ID and FACEBOOK_APP_SECRET missing.")

        async with httpx.AsyncClient() as client:
            # Short-lived token
            resp = await client.get(
                "https://graph.facebook.com/v19.0/oauth/access_token",
                params={
                    "client_id": settings.FACEBOOK_APP_ID,
                    "redirect_uri": settings.FACEBOOK_REDIRECT_URI,
                    "client_secret": settings.FACEBOOK_APP_SECRET,
                    "code": code
                }
            )
            if resp.status_code != 200:
                raise ValueError("Failed to exchange OAuth code.")
            data = resp.json()
            short_token = data.get("access_token")

            # Exchange for long-lived user token
            long_resp = await client.get(
                "https://graph.facebook.com/v19.0/oauth/access_token",
                params={
                    "grant_type": "fb_exchange_token",
                    "client_id": settings.FACEBOOK_APP_ID,
                    "client_secret": settings.FACEBOOK_APP_SECRET,
                    "fb_exchange_token": short_token
                }
            )
            
            if long_resp.status_code != 200:
                return short_token # Fallback
            return long_resp.json().get("access_token", short_token)

    @staticmethod
    async def sync_oauth_pages(user_access_token: str) -> int:
        """Fetches all pages administered by the user and upserts them."""
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://graph.facebook.com/v19.0/me/accounts",
                params={
                    "fields": "id,name,category,followers_count,access_token,picture{url}",
                    "access_token": user_access_token
                }
            )
            
            if resp.status_code != 200:
                raise ValueError("Failed to fetch pages from Facebook.")
                
            pages = resp.json().get("data", [])
            if not pages:
                return 0
                
            # Try to fetch current user's profile info
            user_name = "Auth User"
            user_avatar = None
            user_resp = await client.get(
                "https://graph.facebook.com/v19.0/me",
                params={
                    "fields": "id,name,picture{url}",
                    "access_token": user_access_token
                }
            )
            if user_resp.status_code == 200:
                user_data = user_resp.json()
                user_name = user_data.get("name", "Auth User")
                user_avatar = user_data.get("picture", {}).get("data", {}).get("url")

        import random
        colors = ["bg-blue-600", "bg-orange-500", "bg-purple-600", "bg-green-500", "bg-pink-500"]
        now = datetime.now(timezone.utc)
        db = get_db()
        count = 0
        
        for p in pages:
            # Extract picture URL
            avatar_url = p.get("picture", {}).get("data", {}).get("url")
            
            doc = {
                "pageId": p.get("id"),
                "name": p.get("name"),
                "category": p.get("category", "General"),
                "followersCount": p.get("followers_count", 0),
                "accessToken": p.get("access_token"), # High privilege page token
                "tokenStatus": FacebookPageTokenStatus.ACTIVE.value,
                "avatarColor": random.choice(colors),
                "avatarUrl": avatar_url,
                "connectedAccountName": user_name,
                "connectedAccountAvatar": user_avatar,
                "updatedAt": now,
            }
            await db.facebook_pages.update_one(
                {"pageId": p.get("id")},
                {"$set": doc, "$setOnInsert": {"createdAt": now, "lastPostedAt": None}},
                upsert=True
            )
            count += 1
            
        return count

    @staticmethod
    async def create_page(data: FacebookPageCreate) -> FacebookPageResponse:
        db = get_db()
        now = datetime.now(timezone.utc)
        doc = {
            **data.model_dump(),
            "tokenStatus": FacebookPageTokenStatus.ACTIVE.value,
            "lastPostedAt": None,
            "createdAt": now,
            "updatedAt": None,
        }
        result = await db.facebook_pages.insert_one(doc)
        doc["_id"] = result.inserted_id
        return _doc_to_response(doc)

    @staticmethod
    async def update_page(
        page_id: str, data: FacebookPageUpdate
    ) -> Optional[FacebookPageResponse]:
        db = get_db()
        update_data = {
            key: value
            for key, value in data.model_dump().items()
            if value is not None
        }
        if not update_data:
            return await FacebookService.get_page(page_id)

        update_data["updatedAt"] = datetime.now(timezone.utc)
        await db.facebook_pages.update_one(
            {"_id": to_object_id(page_id, "page_id")},
            {"$set": update_data},
        )
        return await FacebookService.get_page(page_id)

    @staticmethod
    async def delete_page(page_id: str) -> bool:
        db = get_db()
        result = await db.facebook_pages.delete_one(
            {"_id": to_object_id(page_id, "page_id")}
        )
        return result.deleted_count > 0

    @staticmethod
    async def count_pages() -> int:
        db = get_db()
        return await db.facebook_pages.count_documents({})

    @staticmethod
    async def seed_sample_pages() -> int:
        """Insert sample data if the collection is empty. Returns count inserted."""
        db = get_db()
        existing = await db.facebook_pages.count_documents({})
        if existing > 0:
            return 0

        now = datetime.now(timezone.utc)
        samples = [
            {
                "pageId": "109283746192837",
                "name": "Tech News Daily",
                "category": "Publisher",
                "accessToken": "",
                "followersCount": 125000,
                "tokenStatus": "active",
                "avatarColor": "bg-blue-600",
                "lastPostedAt": now,
                "createdAt": now,
                "updatedAt": None,
            },
            {
                "pageId": "983746210384756",
                "name": "Gadget Store Online",
                "category": "E-Commerce",
                "accessToken": "",
                "followersCount": 45000,
                "tokenStatus": "expired",
                "avatarColor": "bg-orange-500",
                "lastPostedAt": None,
                "createdAt": now,
                "updatedAt": None,
            },
            {
                "pageId": "574839201847563",
                "name": "AI & ML Enthusiasts",
                "category": "Community",
                "accessToken": "",
                "followersCount": 8200,
                "tokenStatus": "active",
                "avatarColor": "bg-purple-600",
                "lastPostedAt": now,
                "createdAt": now,
                "updatedAt": None,
            },
            {
                "pageId": "283746192837465",
                "name": "Developer Memes V2",
                "category": "Entertainment",
                "accessToken": "",
                "followersCount": 320000,
                "tokenStatus": "active",
                "avatarColor": "bg-green-500",
                "lastPostedAt": now,
                "createdAt": now,
                "updatedAt": None,
            },
        ]
        result = await db.facebook_pages.insert_many(samples)
        return len(result.inserted_ids)
