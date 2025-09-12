# backend/app/services/census_service.py
import asyncio
import re
from typing import Dict
from datetime import datetime, timedelta, timezone
from pprint import pprint

from census import Census
from httpx import AsyncClient
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.schemas.population import PopulationDataPoint, PopulationGrowthResponse
from app.models.population import PopulationCache

# --- Configuration ---
CENSUS_API_KEY = settings.CENSUS_API_KEY
CENSUS_VARIABLE = "B01003_001E"
YEARS_TO_FETCH = [2022, 2021, 2019, 2018, 2017, 2016, 2015]
CACHE_EXPIRATION_DAYS = 30 # Cache results for 30 days

class CensusService:
    def __init__(self):
        self.census_client = Census(CENSUS_API_KEY)
        self.http_client = AsyncClient()

    def _normalize_address(self, address: str) -> str:
        """Creates a consistent cache key from an address."""
        normalized = re.sub(r'[^\w\s]', '', address.lower())
        print(f"Normalized address '{address}' to '{normalized}'")
        return " ".join(normalized.split())

    async def _get_from_cache(self, address_key: str, db: AsyncSession) -> PopulationGrowthResponse | None:
        """Checks the database for a fresh cached result."""
        print(f"Checking cache for address_key: {address_key}")
        stmt = select(PopulationCache).where(PopulationCache.address_key == address_key)
        result = await db.execute(stmt)
        cached = result.scalars().first()

        if cached:
            cache_age = datetime.now(timezone.utc) - cached.updated_at
            print(f"Cache hit. Age: {cache_age.days} days")
            if cache_age < timedelta(days=CACHE_EXPIRATION_DAYS):
                print("Cache is fresh. Returning cached response.")
                return PopulationGrowthResponse(**cached.response_data)
            else:
                print("Cache is stale.")
        else:
            print("Cache miss.")
        return None

    async def _store_in_cache(self, address_key: str, data: dict, db: AsyncSession):
        """Stores or updates a result in the cache."""
        print(f"Storing result in cache for address_key: {address_key}")
        stmt = select(PopulationCache).where(PopulationCache.address_key == address_key)
        result = await db.execute(stmt)
        existing_entry = result.scalars().first()

        if existing_entry:
            print("Updating existing cache entry.")
            existing_entry.response_data = data
            existing_entry.updated_at = datetime.now(timezone.utc)
        else:
            print("Creating new cache entry.")
            new_entry = PopulationCache(address_key=address_key, response_data=data)
            db.add(new_entry)
        
        await db.commit()
        print("Cache commit complete.")

    async def get_population_growth_for_address(self, address: str, db: AsyncSession) -> PopulationGrowthResponse:
        """
        Orchestrates the process with caching:
        1. Check cache.
        2. If miss, geocode address -> fetch census data -> format response.
        3. Store new result in cache.
        """
        print(f"Processing population growth for address: {address}")
        address_key = self._normalize_address(address)

        # 1. Check cache first
        cached_response = await self._get_from_cache(address_key, db)
        if cached_response:
            print("Returning cached response.")
            return cached_response

        # 2. Cache miss: proceed with fetching data
        print("Cache miss. Geocoding address.")
        geo_data = await self._geocode_address_to_fips(address)
        print(f"Geocoded address to FIPS: {geo_data}")
        state_fips = geo_data["state_fips"]
        county_fips = geo_data["county_fips"]

        print(f"Fetching population data for years: {YEARS_TO_FETCH}")
        tasks = [self._fetch_population_for_year(year, state_fips, county_fips) for year in YEARS_TO_FETCH]
        results = await asyncio.gather(*tasks)
        print(f"Population fetch results: {results}")

        valid_data = sorted([res for res in results if res is not None], key=lambda x: x.year)
        print(f"Valid population data: {valid_data}")

        if not valid_data:
            print("No valid population data found.")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No population data found for the county of '{address}'.",
            )

        response = PopulationGrowthResponse(
            county_name=geo_data["county_name"],
            state_name=geo_data["state_name"],
            data=valid_data,
        )

        # 3. Store the new result in the cache before returning
        print("Storing new response in cache.")
        await self._store_in_cache(address_key, response.model_dump(), db)

        print("Returning new response.")
        return response

    async def _geocode_address_to_fips(self, address: str) -> Dict[str, str]:
        """
        Geocodes an address in a robust two-step process:
        1. Convert address to coordinates (lat/lon).
        2. Use coordinates to look up FIPS codes for State and County.
        """
        print(f"Geocoding address: {address}")
        # --- Step 1: Address to Coordinates ---
        oneline_params = {"format": "json", "benchmark": "Public_AR_Current", "address": address}
        try:
            print(f"Sending request to Census geocoder (address -> coords) with params: {oneline_params}")
            oneline_response = await self.http_client.get(
                "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress",
                params=oneline_params
            )
            oneline_response.raise_for_status()
            oneline_data = oneline_response.json()
            print(f"Received geocoder response: {oneline_data}")

            if not oneline_data["result"]["addressMatches"]:
                print("No address matches found in geocoder response.")
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Address could not be geocoded: {address}")

            coords = oneline_data["result"]["addressMatches"][0]["coordinates"]
            lat, lon = coords['y'], coords['x']
            print(f"Extracted coordinates: lat={lat}, lon={lon}")

        except HTTPException:
            print("HTTPException during address geocoding.")
            raise
        except Exception as e:
            print(f"Geocoding Step 1 (Address -> Coords) failed: {e}")
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Geocoding service failed at coordinate lookup.")

        # --- Step 2: Coordinates to FIPS Codes ---
        coords_params = {"format": "json", "benchmark": "Public_AR_Current", "vintage": "Current_Current", "x": lon, "y": lat}
        try:
            print(f"Sending request to Census geocoder (coords -> FIPS) with params: {coords_params}")
            coords_response = await self.http_client.get(
                "https://geocoding.geo.census.gov/geocoder/geographies/coordinates",
                params=coords_params
            )
            coords_response.raise_for_status()
            coords_data = coords_response.json()
            print(f"Received FIPS geocoder response: {coords_data}")
            
            geographies = coords_data["result"]["geographies"]
            
            county_info = next((g for g in geographies.get("Counties", [])), None)
            if not county_info:
                print("No county info found in geographies.")
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Could not determine county from coordinates.")

            state_info = next((g for g in geographies.get("States", []) if g["STATE"] == county_info["STATE"]), None)
            if not state_info:
                print("No state info found in geographies.")
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Could not determine state from coordinates.")

            print(f"Extracted FIPS info: state_fips={county_info['STATE']}, county_fips={county_info['COUNTY']}, county_name={county_info['NAME']}, state_name={state_info['NAME']}")
            return {
                "state_fips": county_info["STATE"],
                "county_fips": county_info["COUNTY"],
                "county_name": county_info["NAME"],
                "state_name": state_info["NAME"],
            }
        except HTTPException:
            print("HTTPException during FIPS lookup.")
            raise
        except Exception as e:
            print(f"Geocoding Step 2 (Coords -> FIPS) failed: {e}")
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Geocoding service failed at FIPS lookup.")

    async def _fetch_population_for_year(self, year: int, state_fips: str, county_fips: str) -> PopulationDataPoint | None:
        """Fetches ACS5 population data for a single year."""
        print(f"Fetching population for year={year}, state_fips={state_fips}, county_fips={county_fips}")
        try:
            loop = asyncio.get_running_loop()
            data = await loop.run_in_executor(
                None, self.census_client.acs5.get, ('NAME', CENSUS_VARIABLE),
                {'for': f'county:{county_fips}', 'in': f'state:{state_fips}'}, year
            )
            print(f"Received census data for year {year}: {data}")
            if data:
                population = int(data[0][CENSUS_VARIABLE])
                print(f"Parsed population for year {year}: {population}")
                return PopulationDataPoint(year=year, population=population)
            print(f"No data found for year {year}")
            return None
        except Exception as e:
            print(f"Exception while fetching population for year {year}: {e}")
            return None