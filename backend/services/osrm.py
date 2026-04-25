import requests
import json

OSRM_BASE_URL = "http://router.project-osrm.org"

def get_route(start_lat, start_lon, end_lat, end_lon):
    """
    Fetch a detailed route between two points.
    Returns: { "geometry": "polyine", "distance": float, "duration": float, "steps": [] }
    """
    url = f"{OSRM_BASE_URL}/route/v1/driving/{start_lon},{start_lat};{end_lon},{end_lat}?overview=full&geometries=geojson&steps=true"
    try:
        response = requests.get(url, timeout=2)
        if response.status_code == 200:
            data = response.json()
            if data.get("code") == "Ok":
                route = data["routes"][0]
                return {
                    "geometry": route["geometry"]["coordinates"], # [[lon, lat], ...]
                    "distance": route["distance"],
                    "duration": route["duration"]
                }
    except Exception as e:
        print(f"OSRM Error: {e}")
    
    # --- FALLBACK: Straight Line ---
    # Convert degrees to roughly meters (1 degree ~ 111km)
    dist_deg = ((start_lat - end_lat)**2 + (start_lon - end_lon)**2)**0.5
    distance_m = dist_deg * 111000
    return {
        "geometry": [[start_lon, start_lat], [end_lon, end_lat]],
        "distance": distance_m,
        "duration": distance_m / 10, # Assumed 10m/s speed
        "fallback": True
    }

def get_table(sources: list, destinations: list):
    """
    Fetch distance matrix between multiple sources and destinations.
    sources: [[lat, lon], ...]
    """
    source_coords = ";".join([f"{lon},{lat}" for lat, lon in sources])
    dest_coords = ";".join([f"{lon},{lat}" for lat, lon in destinations])
    
    url = f"{OSRM_BASE_URL}/table/v1/driving/{source_coords};{dest_coords}"
    # This is a bit complex for a single call if we want many-to-many.
    # For now, let's keep it simple.
    return None
