from datetime import datetime, timedelta, timezone
import jwt
from passlib.context import CryptContext
from app.config import get_settings
from app.database import get_db
from app.models.user import UserCreate, UserInDB
from bson import ObjectId

settings = get_settings()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

class AuthService:
    collection = "users"

    @classmethod
    async def get_user_by_email(cls, email: str) -> UserInDB | None:
        db = get_db()
        user = await db[cls.collection].find_one({"email": email})
        if user:
            # map _id to string id
            user["_id"] = str(user["_id"])
            return UserInDB(**user)
        return None

    @classmethod
    async def get_user(cls, user_id: str) -> UserInDB | None:
        db = get_db()
        try:
            user = await db[cls.collection].find_one({"_id": ObjectId(user_id)})
            if user:
                user["_id"] = str(user["_id"])
                return UserInDB(**user)
        except:
            pass
        return None

    @classmethod
    async def create_user(cls, user_in: UserCreate) -> UserInDB:
        db = get_db()
        hashed_password = get_password_hash(user_in.password)
        user_dict = user_in.model_dump()
        del user_dict["password"]
        user_dict["hashed_password"] = hashed_password
        user_dict["is_active"] = True
        user_dict["created_at"] = datetime.utcnow()
        
        result = await db[cls.collection].insert_one(user_dict)
        
        user_dict["_id"] = str(result.inserted_id)
        return UserInDB(**user_dict)
