from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.config import get_settings

from app.models.facebook import (
    FacebookPageCreate,
    FacebookPageListResponse,
    FacebookPageResponse,
    FacebookPageUpdate,
)
from app.services.facebook_service import FacebookService

router = APIRouter(prefix="/social/facebook", tags=["Social – Facebook"])


@router.get("/pages", response_model=FacebookPageListResponse)
async def list_facebook_pages(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    items, total = await FacebookService.list_pages(skip=skip, limit=limit)
    return FacebookPageListResponse(items=items, total=total)


class ManualConnectRequest(BaseModel):
    pageId: str
    accessToken: str

@router.post("/pages/manual", response_model=FacebookPageResponse, status_code=201)
async def create_facebook_page_manual(data: ManualConnectRequest):
    """Securely connects a single Fanpage using a manually provided Access Token via FB Graph API."""
    try:
        page_id = data.pageId.strip()
        access_token = data.accessToken.strip()
        if access_token.lower().startswith("bearer "):
            access_token = access_token[7:].strip()
            
        page = await FacebookService.connect_manual_page(page_id, access_token)
        return page
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/auth/url")
async def get_facebook_oauth_url():
    """Generates the Facebook OAuth consent URL."""
    settings = get_settings()
    if not settings.FACEBOOK_APP_ID:
        raise HTTPException(status_code=400, detail="Facebook APP ID is not configured.")
        
    scope = "pages_show_list,pages_read_engagement,pages_manage_posts"
    url = (
        f"https://www.facebook.com/v19.0/dialog/oauth?"
        f"client_id={settings.FACEBOOK_APP_ID}&"
        f"redirect_uri={settings.FACEBOOK_REDIRECT_URI}&"
        f"scope={scope}"
    )
    return {"url": url}


@router.get("/callback")
async def facebook_oauth_callback(code: str = None, error: str = None, request: Request = None):
    """Receives the OAuth callback, fetches tokens, syncs pages, and redirects front-end."""
    settings = get_settings()
    frontend_url = "http://localhost:3000/social/facebook/pages"
    
    if error or not code:
        return RedirectResponse(url=f"{frontend_url}?error=oauth_failed")
        
    try:
        # 1. Exchange code for user token
        user_token = await FacebookService.exchange_oauth_code(code)
        
        # 2. Sync all pages user admins
        await FacebookService.sync_oauth_pages(user_token)
        
        # 3. Redirect back to frontend
        return RedirectResponse(url=f"{frontend_url}?sync=success")
    except Exception as e:
        import traceback
        traceback.print_exc()
        return RedirectResponse(url=f"{frontend_url}?error=sync_failed")


@router.post("/pages", response_model=FacebookPageResponse, status_code=201)
async def create_facebook_page(data: FacebookPageCreate):
    page = await FacebookService.create_page(data)
    return page


@router.get("/pages/{page_id}", response_model=FacebookPageResponse)
async def get_facebook_page(page_id: str):
    page = await FacebookService.get_page(page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Facebook page not found")
    return page


@router.patch("/pages/{page_id}", response_model=FacebookPageResponse)
async def update_facebook_page(page_id: str, data: FacebookPageUpdate):
    page = await FacebookService.update_page(page_id, data)
    if not page:
        raise HTTPException(status_code=404, detail="Facebook page not found")
    return page


@router.delete("/pages/{page_id}")
async def delete_facebook_page(page_id: str):
    deleted = await FacebookService.delete_page(page_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Facebook page not found")
    return {"message": "Facebook page removed", "pageId": page_id}


@router.post("/pages/seed")
async def seed_facebook_pages():
    """Seed sample fanpage data (only if collection is empty)."""
    count = await FacebookService.seed_sample_pages()
    if count == 0:
        return {"message": "Collection already has data. Skipped seeding.", "inserted": 0}
    return {"message": f"Seeded {count} sample fanpages", "inserted": count}
