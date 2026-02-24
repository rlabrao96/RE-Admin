import asyncio
from app.config import settings
from supabase import create_client

supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

# Fetch Las Nieves building
b_res = supabase.table("buildings").select("*").eq("name", "las nieves").execute()
if not b_res.data:
    print("Building 'las nieves' not found.")
else:
    b_id = b_res.data[0]['id']
    print(f"Las Nieves ID: {b_id}")
    
    # Fetch all units for Las Nieves
    u_res = supabase.table("units").select("*, floors(number)").eq("floors.building_id", b_id).execute()
    print("Units in Las Nieves:")
    for u in u_res.data:
        # floors() inner join drops unmatched rows, but in supabase select it returns it as a nested object
        if u.get('floors'):
            print(f"- Unit: {u['number']} (Floor {u['floors']['number']})")
            
    # Check if unit 101 exists at all globally
    all_101 = supabase.table("units").select("*, floors(building_id, buildings(name))").eq("number", "101").execute()
    print("\nAll units named 101:")
    for u in all_101.data:
        b_name = "Unknown"
        if u.get('floors') and u['floors'].get('buildings'):
            b_name = u['floors']['buildings']['name']
        print(f"- Unit 101 in Building: {b_name} (ID: {u['id']})")
        
    print("\nResidents globally:")
    r_res = supabase.table("residents").select("*, profiles(email), units(number, floors(buildings(name)))").execute()
    for r in r_res.data:
        email = r['profiles']['email'] if r.get('profiles') else "No Profile"
        uname = r['units']['number'] if r.get('units') else "?"
        bname = r['units']['floors']['buildings']['name'] if r.get('units') and r['units'].get('floors') else "?"
        print(f"- {email} in Unit {uname} ({bname})")
