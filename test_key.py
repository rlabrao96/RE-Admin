import asyncio
import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv("backend/.env")

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_KEY")

print(f"URL: {url}")
print(f"Key starts with: {key[:15]}...")

supabase: Client = create_client(url, key)

try:
    # Try an insert that normally requires RLS bypass
    # We will just fetch a table and see its policies, or try a dummy insert and catch
    res = supabase.table("units").select("*").limit(1).execute()
    print("Select succeeded.")
except Exception as e:
    print(f"Select failed: {e}")
