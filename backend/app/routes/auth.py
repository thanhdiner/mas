from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Request, Response
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
import jwt
from jwt.exceptions import InvalidTokenError
import cloudinary
import cloudinary.uploader

from app.config import get_settings
from app.models.user import UserCreate, UserResponse, Token, TokenData, UserInDB, UserUpdate, PasswordChange
from app.services.auth_service import AuthService, verify_password, create_access_token

router = APIRouter()
settings = get_settings()

COOKIE_NAME = "mas_token"
COOKIE_MAX_AGE = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60  # seconds

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_PREFIX}/auth/login", auto_error=False)

# Configure Cloudinary from URL
if settings.CLOUDINARY_URL:
    import os
    os.environ["CLOUDINARY_URL"] = settings.CLOUDINARY_URL
    from urllib.parse import urlparse
    parsed = urlparse(settings.CLOUDINARY_URL)
    cloudinary.config(
        cloud_name=parsed.hostname,
        api_key=parsed.username,
        api_secret=parsed.password,
        secure=True,
    )


def _user_response(user: UserInDB) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        avatar_url=user.avatar_url,
        created_at=user.created_at,
    )


async def get_current_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
) -> UserInDB:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Priority: Authorization header > cookie fallback
    resolved_token = token or request.cookies.get(COOKIE_NAME)
    if not resolved_token:
        raise credentials_exception

    try:
        payload = jwt.decode(resolved_token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = TokenData(email=email)
    except InvalidTokenError:
        raise credentials_exception
        
    user = await AuthService.get_user_by_email(email=token_data.email)
    if user is None:
        raise credentials_exception
    return user

async def get_current_active_user(current_user: UserInDB = Depends(get_current_user)):
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

@router.post("/register", response_model=UserResponse)
async def register(user_in: UserCreate):
    user = await AuthService.get_user_by_email(user_in.email)
    if user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    new_user = await AuthService.create_user(user_in)
    return _user_response(new_user)

@router.post("/login", response_model=Token)
async def login_for_access_token(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
):
    user = await AuthService.get_user_by_email(form_data.username)
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )

    # Set HttpOnly cookie for Next.js Middleware SSR auth
    response.set_cookie(
        key=COOKIE_NAME,
        value=access_token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=not settings.DEBUG,
        path="/",
    )

    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(
        key=COOKIE_NAME,
        path="/",
        httponly=True,
        samesite="lax",
        secure=not settings.DEBUG,
    )
    return {"message": "Logged out successfully"}

@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: UserInDB = Depends(get_current_active_user)):
    return _user_response(current_user)

@router.put("/me", response_model=UserResponse)
async def update_profile(
    data: UserUpdate,
    current_user: UserInDB = Depends(get_current_active_user),
):
    # Check duplicate email
    if data.email and data.email != current_user.email:
        existing = await AuthService.get_user_by_email(data.email)
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")

    updated = await AuthService.update_user(current_user.id, data.model_dump(exclude_none=True))
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")

    return _user_response(updated)

@router.post("/me/password")
async def change_password(
    data: PasswordChange,
    current_user: UserInDB = Depends(get_current_active_user),
):
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")

    success = await AuthService.update_password(current_user.id, data.new_password)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update password")

    return {"message": "Password changed successfully"}

@router.post("/me/avatar", response_model=UserResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: UserInDB = Depends(get_current_active_user),
):
    if not settings.CLOUDINARY_URL:
        raise HTTPException(status_code=500, detail="Cloudinary is not configured")

    # Validate file type
    allowed = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP and GIF images are allowed")

    # Validate file size (max 5MB)
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be smaller than 5MB")

    try:
        result = cloudinary.uploader.upload(
            contents,
            folder="mas/avatars",
            public_id=f"user_{current_user.id}",
            overwrite=True,
            transformation=[
                {"width": 256, "height": 256, "crop": "fill", "gravity": "face"},
                {"quality": "auto", "fetch_format": "auto"},
            ],
        )
        avatar_url = result["secure_url"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

    updated = await AuthService.update_user(current_user.id, {"avatar_url": avatar_url})
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")

    return _user_response(updated)

@router.delete("/me/avatar", response_model=UserResponse)
async def delete_avatar(
    current_user: UserInDB = Depends(get_current_active_user),
):
    if not settings.CLOUDINARY_URL:
        raise HTTPException(status_code=500, detail="Cloudinary is not configured")

    if not current_user.avatar_url:
        return _user_response(current_user)

    try:
        cloudinary.uploader.destroy(f"mas/avatars/user_{current_user.id}")
    except Exception:
        # We don't fail if Cloudinary deletion fails (e.g. already deleted), just remove from DB
        pass

    updated = await AuthService.update_user(current_user.id, {"avatar_url": None})
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")

    return _user_response(updated)
