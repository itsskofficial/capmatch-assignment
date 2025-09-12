import asyncio
from typing import Dict
from census import Census
from httpx import AsyncClient
from fastapi import HTTPException, status

# V-- THIS IS THE KEY CHANGE --V
from app.core.config import settings # Import the centralized settings object
from app.schemas.population import PopulationDataPoint, PopulationGrowthResponse

# --- Configuration ---
# The API key is now accessed via the validated settings object.
# Pydantic has already ensured it exists on application startup, so we don't need to check for it here.
CENSUS_API_KEY = settings.CENSUS_API_KEY

# U.S. Census Bureau ACS5 (American Community Survey 5-Year Estimates)
# B01003_001E is the variable for Total Population
CENSUS_VARIABLE = "B01003_001E"
# We will fetch data for these years to show a trend
YEARS_TO_FETCH = [2022, 2021, 2019, 2018, 2017, 2016, 2015] # Note: 2020 ACS data is limited due to the pandemic, so it's often skipped.

class CensusService:
    def __init__(self):
        self.census_client = Census(CENSUS_API_KEY)
        self.http_client = AsyncClient()

    async def _geocode_address_to_fips(self, address: str) -> Dict[str, str]:
        """
        Geocodes an address to get State and County FIPS codes using the free FCC API.
        """
        params = {"format": "json", "benchmark": "Public_AR_Current", "address": address}
        try:
            response = await self.http_client.get(
                "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress",
                params=params
            )
            response.raise_for_status()
            data = response.json()

            if not data["result"]["addressMatches"]:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Address not found or could not be geocoded: {address}",
                )

            match = data["result"]["addressMatches"][0]
            geographies = match["geographies"]
            
            county_info = next((g for g in geographies.get("Counties", [])), None)
            if not county_info:
                 raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Could not determine county for the address.",
                )

            return {
                "state_fips": county_info["STATE"],
                "county_fips": county_info["COUNTY"],
                "county_name": county_info["NAME"],
                "state_name": next((g["NAME"] for g in geographies.get("States", []) if g["STATE"] == county_info["STATE"]), "N/A"),
            }
        except Exception as e:
            print(f"Geocoding error: {e}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Geocoding service failed or address is invalid.",
            )

    async def _fetch_population_for_year(self, year: int, state_fips: str, county_fips: str) -> PopulationDataPoint | None:
        """
        Fetches ACS5 population data for a single year.
        """
        try:
            loop = asyncio.get_running_loop()
            data = await loop.run_in_executor(
                None,
                self.census_client.acs5.get,
                ('NAME', CENSUS_VARIABLE),
                {'for': f'county:{county_fips}', 'in': f'state:{state_fips}'},
                year
            )
            
            if data:
                return PopulationDataPoint(year=year, population=int(data[0][CENSUS_VARIABLE]))
            return None
        except Exception:
            return None

    async def get_population_growth_for_address(self, address: str) -> PopulationGrowthResponse:
        """
        Orchestrates the process: geocode address -> fetch census data -> format response.
        """
        geo_data = await self._geocode_address_to_fips(address)
        state_fips = geo_data["state_fips"]
        county_fips = geo_data["county_fips"]

        tasks = [
            self._fetch_population_for_year(year, state_fips, county_fips)
            for year in YEARS_TO_FETCH
        ]
        results = await asyncio.gather(*tasks)

        valid_data = sorted(
            [res for res in results if res is not None],
            key=lambda x: x.year
        )

        if not valid_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No population data found for the county associated with '{address}'.",
            )

        return PopulationGrowthResponse(
            county_name=geo_data["county_name"],
            state_name=geo_data["state_name"],
            data=valid_data,
        )