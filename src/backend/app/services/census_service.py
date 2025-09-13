import asyncio
import re
import json
import datetime
from typing import Dict, List, Any, Optional

import numpy as np
from httpx import AsyncClient, HTTPStatusError
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from loguru import logger

from app.core.config import settings
from app.schemas.population import (
    PopulationDataResponse, AgeDistribution, Demographics, Coordinates,
    GrowthMetrics, MigrationData, NaturalIncreaseData, PopulationDensity,
    PopulationTrend, PopulationTrendPoint, WalkabilityScores, BenchmarkData, SexDistribution,
    HousingMetrics
)
from app.models.population import PopulationCache

# --- Constants ---
# Use the latest available ACS 5-year data release year.
LATEST_ACS_YEAR = 2023
HISTORICAL_YEARS_COUNT = 5

# --- ACS 5-Year Variables (For static demographics) ---
ACS_VARS = {
    "B01003_001E": "total_population", "B01002_001E": "median_age",
    "B19013_001E": "median_household_income",
    "B25003_001E": "total_occupied_units", "B25003_003E": "renter_occupied_units",
    "B15003_001E": "edu_total_pop_25_over", "B15003_022E": "edu_bachelors",
    "B15003_023E": "edu_masters", "B15003_024E": "edu_professional", "B15003_025E": "edu_doctorate",
    # New variables
    "B25010_001E": "avg_household_size",
    "B25077_001E": "median_home_value",
    "B25064_001E": "median_gross_rent",
    "B01001_002E": "total_male",
    "B01001_026E": "total_female",
    # Age Groups (Male)
    "B01001_003E": "m_under_5", "B01001_004E": "m_5_9", "B01001_005E": "m_10_14", "B01001_006E": "m_15_17", "B01001_007E": "m_18_19", "B01001_008E": "m_20", "B01001_009E": "m_21", "B01001_010E": "m_22_24", "B01001_011E": "m_25_29", "B01001_012E": "m_30_34", "B01001_013E": "m_35_39", "B01001_014E": "m_40_44", "B01001_015E": "m_45_49", "B01001_016E": "m_50_54", "B01001_017E": "m_55_59", "B01001_018E": "m_60_61", "B01001_019E": "m_62_64", "B01001_020E": "m_65_66", "B01001_021E": "m_67_69", "B01001_022E": "m_70_74", "B01001_023E": "m_75_79", "B01001_024E": "m_80_84", "B01001_025E": "m_85_over",
    # Age Groups (Female)
    "B01001_027E": "f_under_5", "B01001_028E": "f_5_9", "B01001_029E": "f_10_14", "B01001_030E": "f_15_17", "B01001_031E": "f_18_19", "B01001_032E": "f_20", "B01001_033E": "f_21", "B01001_034E": "f_22_24", "B01001_035E": "f_25_29", "B01001_036E": "f_30_34", "B01001_037E": "f_35_39", "B01001_038E": "f_40_44", "B01001_039E": "f_45_49", "B01001_040E": "f_50_54", "B01001_041E": "f_55_59", "B01001_042E": "f_60_61", "B01001_043E": "f_62_64",
    "B01001_044E": "f_65_66", "B01001_045E": "f_67_69", "B01001_046E": "f_70_74", "B01001_047E": "f_75_79", "B01001_048E": "f_80_84", "B01001_049E": "f_85_over",
}

# --- Population Estimates Program (PEP) Variables (For drivers of change) ---
PEP_VARS = ("POP", "BIRTHS", "DEATHS", "NATURALINC", "NETMIG", "DOMESTICMIG", "INTERNATIONALMIG")


class CensusService:
    def __init__(self):
        self.http_client = AsyncClient(timeout=15.0)
        self.census_api_semaphore = asyncio.Semaphore(10)
        logger.info("CensusService initialized.")

    async def get_market_data_for_address(self, address: str, db: AsyncSession) -> PopulationDataResponse:
        logger.info(f"Starting market data retrieval for address: '{address}'")
        normalized_address = re.sub(r'\s+', ' ', address).strip().lower()
        cache_key = f"{normalized_address}|tract|5_year_projected_v3"
        logger.debug(f"Generated cache key: {cache_key}")
        
        stmt = select(PopulationCache).where(PopulationCache.address_key == cache_key)
        result = await db.execute(stmt)
        cached_data = result.scalars().first()
        if cached_data:
            try:
                logger.success(f"Cache HIT for key: {cache_key}. Validating and returning cached data.")
                return PopulationDataResponse.model_validate(cached_data.response_data)
            except ValidationError as e:
                logger.warning(f"Cache data for key '{cache_key}' is invalid due to schema mismatch. Refetching. Error: {e}")
                # Treat as a cache miss and proceed to fetch fresh data.
        
        logger.info(f"Cache MISS for key: {cache_key}. Starting fresh data fetch.")
        
        geo_info = await self._geocode_address(address)
        fips, coords, aland = geo_info['fips'], geo_info['coords'], geo_info['aland']
        logger.info(f"Geocoding successful. FIPS: {fips}, ALAND: {aland}")

        historical_years = list(range(LATEST_ACS_YEAR - HISTORICAL_YEARS_COUNT + 1, LATEST_ACS_YEAR + 1))
        logger.info(f"Requesting historical data for ACS 5-Year periods ending in: {historical_years}")

        # --- Optimization: Fetch all tract data for the latest year in one call to reduce total requests ---
        tasks = {
            "latest_year_tract_data": self._fetch_large_acs_dataset(fips, LATEST_ACS_YEAR, 'tract', list(ACS_VARS.keys())),
            "historical_tract_trend": self._fetch_population_trend_acs(fips, historical_years[:-1], 'tract'),
            "county_trend": self._fetch_population_trend_acs(fips, historical_years, 'county'),
            "county_drivers": self._fetch_pep_county_components(fips),
            "migration_flows": self._fetch_migration_flows(fips),
            "walkability": self._get_walkability_scores(address, lat=coords['lat'], lon=coords['lon']),
        }
        logger.info(f"Executing {len(tasks)} tasks concurrently...")
        results = await asyncio.gather(*tasks.values(), return_exceptions=True)
        task_results = dict(zip(tasks.keys(), results))

        # The main ACS data is critical, so we handle its failure specifically.
        main_acs_data = task_results.get("latest_year_tract_data")
        if isinstance(main_acs_data, Exception) or not main_acs_data:
            raise HTTPException(status_code=503, detail=f"Failed to fetch critical ACS data: {main_acs_data}")

        for name, result in task_results.items():
            if isinstance(result, Exception):
                logger.error(f"Task '{name}' failed with an exception: {result}")
                # For non-critical tasks, we can proceed with a None value.
                if name in ["latest_year_tract_data", "historical_tract_trend", "county_trend"]:
                    raise HTTPException(status_code=503, detail=f"Failed to fetch required data for {name}: {result}")
                task_results[name] = None

        # Reconstruct the full tract trend from the historical data and the latest year's data
        historical_trend = task_results.get("historical_tract_trend") or []
        latest_population = main_acs_data.get("B01003_001E")
        tract_trend = historical_trend
        if latest_population is not None:
            tract_trend.append(PopulationTrendPoint(year=LATEST_ACS_YEAR, population=latest_population))
            tract_trend.sort(key=lambda p: p.year)
        else:
            logger.warning(f"Could not find population for {LATEST_ACS_YEAR} in main data package.")
        county_trend = task_results.get("county_trend") or []

        logger.info("Projecting tract population based on county trends.")
        projections = self._project_tract_population(main_acs_data, county_trend)
        logger.info(f"Generated {len(projections)} years of projected data.")

        migration_data = None
        natural_increase_data = None
        pep_drivers = task_results.get("county_drivers")
        acs_flows = task_results.get("migration_flows")

        # Combine ACS Flows and PEP data for a comprehensive migration picture
        if acs_flows and pep_drivers and pep_drivers.get("POP", 0) > 0:
            total_county_pop = pep_drivers["POP"]
            inflows = acs_flows.get("MOVEDIN", 0)
            outflows = acs_flows.get("MOVEDOUT", 0)
            migration_data = MigrationData(
                # Use ACS for net, in, out, gross as it's more direct
                net_migration=acs_flows.get("MOVEDNET", 0),
                net_migration_rate=round((acs_flows.get("MOVEDNET", 0) / total_county_pop) * 100, 2),
                inflows=inflows,
                outflows=outflows,
                gross_migration=inflows + outflows,
                # Supplement with PEP's domestic/international breakdown
                domestic_migration=pep_drivers.get("DOMESTICMIG", 0),
                international_migration=pep_drivers.get("INTERNATIONALMIG", 0),
            )
        if pep_drivers and pep_drivers.get("POP", 0) > 0:
            total_county_pop = pep_drivers["POP"]
            natural_increase_data = NaturalIncreaseData(
                births=pep_drivers["BIRTHS"], deaths=pep_drivers["DEATHS"], natural_change=pep_drivers["NATURALINC"],
                natural_increase_rate=round((pep_drivers["NATURALINC"] / total_county_pop) * 1000, 2)
            )

        logger.info("Formatting all retrieved data into the final response model.")
        response_data = self._format_response_data(
            acs_data=main_acs_data,
            trend=tract_trend,
            projection=projections,
            benchmarks=BenchmarkData(
                county_trend=county_trend,
            ),
            walkability=task_results.get("walkability"),
            migration=migration_data, natural_increase=natural_increase_data,
            address=address, year=LATEST_ACS_YEAR, geo_level='tract',
            aland=aland, coordinates=Coordinates(lat=coords['lat'], lon=coords['lon']),
        )
        logger.info("Data formatting complete.")

        logger.info(f"Saving new data to cache with key: {cache_key}")
        new_cache_entry = PopulationCache(
            address_key=cache_key,
            response_data=json.loads(response_data.model_dump_json(by_alias=True))
        )
        db.add(new_cache_entry)
        await db.commit()
        logger.success("Successfully saved data to cache and committed to DB.")

        return response_data

    async def _geocode_address(self, address: str) -> dict:
        """
        Geocodes an address in a two-step process:
        1. Use Nominatim (OpenStreetMap) to get reliable latitude/longitude.
        2. Use the Census Geocoder with these coordinates to get FIPS codes.
        3. Use Census GEOINFO API to fetch reliable tract land area (AREALAND).
        """
        logger.info(f"Starting hybrid geocoding for address: '{address}'")

        # Step 1: Get coordinates from Nominatim
        logger.debug("Step 1: Fetching coordinates from Nominatim.")
        nominatim_url = "https://nominatim.openstreetmap.org/search"
        params1 = {"q": address, "format": "json", "addressdetails": 1, "limit": 1}
        headers = {"User-Agent": "CapMatch/1.0"}
        try:
            res1 = await self.http_client.get(nominatim_url, params=params1, headers=headers)
            res1.raise_for_status()
            data1 = res1.json()
            if not data1:
                logger.error(f"No address matches found by Nominatim for '{address}'")
                raise HTTPException(status_code=404, detail="Address not found by geocoder.")

            lat = float(data1[0]['lat'])
            lon = float(data1[0]['lon'])
            logger.debug(f"Successfully retrieved coordinates from Nominatim: (lat={lat}, lon={lon})")
        except Exception as e:
            logger.error(f"Nominatim geocoder failed for '{address}': {e}")
            raise HTTPException(status_code=503, detail="Geocoding service (Nominatim) failed.")

        # Step 2: Get geographies (FIPS) using coordinates from Census API
        logger.debug("Step 2: Fetching geographies (FIPS) from Census coordinates endpoint.")
        geo_url = "https://geocoding.geo.census.gov/geocoder/geographies/coordinates"
        vintage = f"ACS{LATEST_ACS_YEAR}_Current"
        params2 = {"format": "json", "benchmark": "Public_AR_Current", "vintage": vintage, "x": lon, "y": lat}
        try:
            res2 = await self.http_client.get(geo_url, params=params2)
            res2.raise_for_status()
            geos = res2.json()["result"]["geographies"]

            county = next((g for g in geos.get("Counties", [])), None)
            tract = next((g for g in geos.get("Census Tracts", [])), None)

            if not county or not tract:
                logger.error(f"Could not find tract/county for coordinates ({lat}, {lon})")
                raise HTTPException(status_code=404, detail="Could not determine geographic boundaries (tract/county).")

            fips = {"state": county["STATE"], "county": county["COUNTY"], "tract": tract["TRACT"]}
            aland = int(tract.get("ALAND", 0) or 0)  # fallback from geocoder
        except Exception as e:
            logger.error(f"Census Geocoder (geographies) failed for coords ({lat}, {lon}): {e}")
            raise HTTPException(status_code=503, detail="Geocoding service failed at FIPS lookup.")

        # Step 3: Get tract land area (AREALAND) from Census GEOINFO API
        logger.debug("Step 3: Fetching tract AREALAND from Census GEOINFO API.")
        geo_info_url = f"https://api.census.gov/data/2023/geoinfo"
        geo_params = {
            "get": "AREALAND",
            "for": f"tract:{fips['tract']}",
            "in": f"state:{fips['state']} county:{fips['county']}",
            "key": settings.CENSUS_API_KEY
        }
        try:
            res3 = await self.http_client.get(geo_info_url, params=geo_params)
            res3.raise_for_status()
            geo_data = res3.json()
            if len(geo_data) > 1:
                headers, values = geo_data[0], geo_data[1]
                geo_record = dict(zip(headers, values))
                aland = int(geo_record.get("AREALAND", 0) or 0)
                logger.debug(f"Tract AREALAND from GEOINFO: {aland}")
            else:
                logger.warning(f"No AREALAND found in GEOINFO for tract {fips}")
        except Exception as e:
            logger.warning(f"Failed to fetch tract land area from GEOINFO API: {e}")

        return {"fips": fips, "coords": {"lat": lat, "lon": lon}, "aland": aland}

    def _chunk_variables(self, variables: List[str], chunk_size: int = 49) -> List[List[str]]:
        """Splits a list of variables into chunks of a given size to stay under the API limit."""
        return [variables[i:i + chunk_size] for i in range(0, len(variables), chunk_size)]

    async def _fetch_large_acs_dataset(self, fips: Dict[str, str], year: int, geo_level: str, variables: List[str]) -> Optional[Dict[str, Any]]:
        """
        Fetches a large set of ACS variables by splitting them into multiple API calls
        to stay under the 50-variable limit.
        """
        logger.info(f"Fetching large ACS dataset ({len(variables)} vars) for geo='{geo_level}', year='{year}'.")
        
        variable_chunks = self._chunk_variables(variables)
        logger.debug(f"Split variables into {len(variable_chunks)} chunks.")
        
        tasks = [
            self._fetch_acs_data(fips, year, geo_level, chunk)
            for chunk in variable_chunks
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        merged_data = {}
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"A chunk of the large ACS dataset fetch failed (chunk {i}): {result}")
                # Fail if any part fails, as the data is critical.
                return None
            if result:
                # The 'NAME' will be the same across all chunks, so we can just keep updating.
                merged_data.update(result)
                
        if not merged_data or 'NAME' not in merged_data:
            logger.warning("Large ACS dataset fetch resulted in no data or NAME after merging chunks.")
            return None
            
        return merged_data

    def _project_tract_population(self, latest_tract_data: Optional[Dict[str, Any]], county_trend: List[PopulationTrendPoint]) -> List[PopulationTrendPoint]:
        logger.info("Starting tract population projection.")
        if not latest_tract_data or not latest_tract_data.get("B01003_001E") or len(county_trend) < 2:
            logger.warning("Not enough historical data to perform projection. Returning empty list.")
            return []

        base_population = latest_tract_data["B01003_001E"]
        base_year = LATEST_ACS_YEAR

        logger.debug(f"Calculating county growth rates from {len(county_trend)} data points.")
        county_growth_rates = [
            county_trend[i].population / county_trend[i-1].population
            for i in range(1, len(county_trend)) if county_trend[i-1].population > 0
        ]
        if not county_growth_rates:
            logger.warning("Could not calculate any county growth rates. Returning empty projection.")
            return []

        avg_growth_factor = np.mean(county_growth_rates)
        logger.debug(f"Average county growth factor: {avg_growth_factor:.4f}")
        
        projections = []
        current_pop = float(base_population)
        logger.debug(f"Projection base: Year {base_year}, Population {current_pop}")
        
        projection_years = list(range(LATEST_ACS_YEAR + 1, LATEST_ACS_YEAR + 4))
        logger.debug(f"Projecting for years: {projection_years}")

        for year in projection_years:
            current_pop *= avg_growth_factor
            projected_point = PopulationTrendPoint(year=year, population=int(round(current_pop)), is_projection=True)
            projections.append(projected_point)
            logger.debug(f"  - Projected {year}: {projected_point.population}")
        
        logger.info("Tract population projection finished.")
        return projections

    async def _get_walkability_scores(self, address: str, lat: float, lon: float) -> Optional[WalkabilityScores]:
        logger.info("Fetching walkability scores.")
        if not settings.WALKSCORE_API_KEY:
            logger.warning("WALKSCORE_API_KEY not set. Skipping walkability fetch.")
            return None
        
        params = {"format": "json", "address": address, "lat": lat, "lon": lon, "transit": 1, "wsapikey": settings.WALKSCORE_API_KEY}
        logger.debug(f"Requesting Walk Score with params: {params}")
        try:
            res = await self.http_client.get("https://api.walkscore.com/score", params=params)
            res.raise_for_status()
            data = res.json()
            if data.get("status") == 1:
                scores = WalkabilityScores(
                    walk_score=data.get("walkscore"),
                    walk_score_description=data.get("description"),
                    transit_score=data.get("transit", {}).get("score"),
                    transit_score_description=data.get("transit", {}).get("description"),
                )
                logger.success(f"Successfully fetched Walk Score: {scores.walk_score}, Transit Score: {scores.transit_score}")
                return scores
            else:
                logger.warning(f"Walk Score API returned status {data.get('status')}. No scores available.")
                return None
        except Exception:
            logger.exception("An unexpected error occurred during walkability fetch.")
            return None

    async def _fetch_acs_data(self, fips: Dict[str, str], year: int, geo_level: str, variables: List[str]) -> Optional[Dict[str, Any]]:
        """
        Fetches ACS 5-Year data directly from the Census API using httpx.
        """
        logger.info(f"Fetching ACS 5-Year data for geo='{geo_level}', year='{year}', fips='{fips}'.")
        geo_filter = {}
        if geo_level == 'tract':
            geo_filter = {'for': f"tract:{fips['tract']}", 'in': f"state:{fips['state']} county:{fips['county']}"}
        elif geo_level == 'county':
            geo_filter = {'for': f"county:{fips['county']}", 'in': f"state:{fips['state']}"}
        elif geo_level == 'state':
            geo_filter = {'for': f"state:{fips['state']}"}
        elif geo_level == 'us':
            geo_filter = {'for': 'us:1'}
        else:
            logger.error(f"Unsupported geography level '{geo_level}' for ACS fetch.")
            return None

        base_url = f"https://api.census.gov/data/{year}/acs/acs5"
        params = {
            "get": ",".join(('NAME', *variables)),
            **geo_filter,
            "key": settings.CENSUS_API_KEY
        }
        logger.debug(f"Requesting Census API: {base_url} with params: {params}")

        try:
            async with self.census_api_semaphore:
                res = await self.http_client.get(base_url, params=params)

            if res.status_code == 204:
                logger.warning(f"No content (204) returned for {geo_level} {fips} in {year}")
                return None

            res.raise_for_status()
            data = res.json()

            if not data or len(data) < 2:
                logger.warning(f"No ACS data returned for {geo_level} {fips} in {year}")
                return None
            
            headers, values = data[0], data[1]
            raw_data = dict(zip(headers, values))

            processed_data = {'NAME': raw_data.get('NAME')}
            for key in variables:
                value_str = raw_data.get(key)
                if value_str is None:
                    processed_data[key] = None
                    continue
                try:
                    value_float = float(value_str)
                    # Handle Census API's negative value indicators for missing data
                    if value_float < 0:
                        processed_data[key] = None
                    # Store as int if it's a whole number, otherwise as float
                    elif value_float.is_integer():
                        processed_data[key] = int(value_float)
                    else:
                        processed_data[key] = value_float
                except (ValueError, TypeError):
                    logger.warning(f"Could not parse numeric value '{value_str}' for key '{key}'. Setting to None.")
                    processed_data[key] = None
            
            logger.debug(f"Successfully processed ACS data for year {year}.")
            return processed_data

        except HTTPStatusError as e:
            logger.error(f"Census ACS API call failed for ({geo_level}, {year}) with status {e.response.status_code}: {e.response.text}")
            return None
        except Exception:
            logger.exception(f"An unexpected error occurred during ACS API call for ({geo_level}, {year}).")
            return None

    async def _fetch_migration_flows(self, fips: Dict[str, str]) -> Optional[Dict[str, Any]]:
        """
        Fetches county-level migration flows (in, out, net) from the ACS Flows dataset.
        Uses the latest available 5-year data.
        """
        year = 2022
        logger.info(f"Fetching ACS Migration Flows for county fips={fips}, year={year}.")

        variables = ("MOVEDIN", "MOVEDOUT", "MOVEDNET")
        geo_filter = {'for': f"county:{fips['county']}", 'in': f"state:{fips['state']}"}

        try:
            async with self.census_api_semaphore:
                base_url = f"https://api.census.gov/data/{year}/acs/flows"
                params = {
                    "get": ",".join(variables),
                    **geo_filter,
                    "key": settings.CENSUS_API_KEY
                }
                res = await self.http_client.get(base_url, params=params)
                res.raise_for_status()
                data = res.json()

            if not data or len(data) < 2:
                logger.warning(f"No ACS Flows data returned for county {fips} in {year}")
                return None

            headers, values = data[0], data[1]
            raw_data = dict(zip(headers, values))
            flows_data = {
                key: int(val) if val is not None else 0
                for key, val in raw_data.items()
                if key in variables
            }

            logger.debug(f"Successfully received ACS Flows data: {flows_data}")
            return flows_data
        except Exception as e:
            logger.exception(f"Census ACS Flows API call failed for county {fips}: {e}")
            return None


    async def _fetch_pep_county_components(self, fips: Dict[str, str]) -> Optional[Dict[str, Any]]:
        """
        Fetch county-level population and components of change (births, deaths, migration)
        from the Census PEP datasets. Uses 2019, the latest available year.
        """
        LATEST_PEP_YEAR = 2019
        logger.info(f"Fetching PEP population + components for county fips={fips}, year={LATEST_PEP_YEAR}.")

        # --- Population ---
        pop_url = f"https://api.census.gov/data/{LATEST_PEP_YEAR}/pep/population"
        pop_params = {
            "get": "POP",
            "for": f"county:{fips['county']}",
            "in": f"state:{fips['state']}"
        }

        # --- Components ---
        comp_url = f"https://api.census.gov/data/{LATEST_PEP_YEAR}/pep/components"
        comp_vars = ("BIRTHS", "DEATHS", "NATURALINC", "NETMIG", "DOMESTICMIG", "INTERNATIONALMIG")
        comp_params = {
            "get": ",".join(comp_vars),
            "for": f"county:{fips['county']}",
            "in": f"state:{fips['state']}"
        }

        try:
            async with self.census_api_semaphore:
                # Run both requests concurrently
                pop_task = self.http_client.get(pop_url, params=pop_params)
                comp_task = self.http_client.get(comp_url, params=comp_params)
                pop_res, comp_res = await asyncio.gather(pop_task, comp_task)

            pop_res.raise_for_status()
            comp_res.raise_for_status()

            pop_data = pop_res.json()
            comp_data = comp_res.json()

            if len(pop_data) < 2 or len(comp_data) < 2:
                logger.warning(f"No PEP data returned for county {fips} in {LATEST_PEP_YEAR}")
                return None

            # Parse population
            pop_headers, pop_values = pop_data[0], pop_data[1]
            pop_record = dict(zip(pop_headers, pop_values))

            # Parse components
            comp_headers, comp_values = comp_data[0], comp_data[1]
            comp_record = dict(zip(comp_headers, comp_values))

            # Merge results
            merged = {**comp_record, "POP": pop_record.get("POP")}

            # Convert strings to ints (where possible)
            for k, v in merged.items():
                if v is None or v == "":
                    merged[k] = None
                else:
                    try:
                        merged[k] = int(v)
                    except ValueError:
                        pass

            return merged

        except Exception as e:
            logger.error(f"PEP API call failed for county {fips}: {e}")
            return None


    async def _fetch_population_trend_acs(self, fips: Dict[str, str], years: List[int], geo_level: str) -> List[PopulationTrendPoint]:
        logger.info(f"Fetching population trend for geo='{geo_level}' for years {years}.")
        tasks = [self._fetch_acs_data(fips, year, geo_level, ["B01003_001E"]) for year in years]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        trend = [
            PopulationTrendPoint(year=years[i], population=res.get("B01003_001E", 0))
            for i, res in enumerate(results) if isinstance(res, dict) and res.get("B01003_001E") is not None
        ]
        logger.info(f"Successfully assembled trend for '{geo_level}' with {len(trend)} data points.")
        return sorted(trend, key=lambda x: x.year)

    def _format_response_data(
        self,
        acs_data: Optional[Dict[str, Any]],
        trend: List[PopulationTrendPoint],
        projection: List[PopulationTrendPoint],
        benchmarks: BenchmarkData,
        walkability: Optional[WalkabilityScores],
        migration: Optional[MigrationData],
        natural_increase: Optional[NaturalIncreaseData],
        address: str, year: int, geo_level: str,
        aland: int, coordinates: Coordinates
    ) -> PopulationDataResponse:
        logger.info("Starting final response formatting.")
        if not acs_data:
            logger.error("Cannot format response: main ACS data is missing.")
            raise HTTPException(status_code=404, detail=f"No ACS demographic data found for this {geo_level} in {year}.")
        
        all_points = trend + projection
        total_pop = all_points[-1].population if all_points else acs_data.get("B01003_001E", 0)
        logger.debug(f"Final total population (including projections): {total_pop}")

        logger.debug("Calculating growth metrics.")
        growth_metrics = GrowthMetrics(period_years=5)
        if len(trend) >= 2:
            end_pop, start_pop = trend[-1].population, trend[0].population
            periods = trend[-1].year - trend[0].year
            if start_pop > 0 and periods > 0:
                growth_metrics.cagr = round((((end_pop / start_pop) ** (1 / periods)) - 1) * 100, 2)

            if len(trend) > 1:
                prev_pop = trend[-2].population
                if prev_pop > 0:
                    growth_metrics.yoy_growth = round(((end_pop - prev_pop) / prev_pop) * 100, 2)
            growth_metrics.absolute_change = end_pop - start_pop

        logger.debug(f"Growth metrics: {growth_metrics.model_dump_json()}")

        logger.debug("Calculating population density.")
        aland_sq_miles = aland / 2589988.11 if aland > 0 else 0
        latest_actual_pop = trend[-1].population if trend else (acs_data.get("B01003_001E") or 0)
        current_density = (latest_actual_pop / aland_sq_miles) if aland_sq_miles > 0 else 0
        density_change = None
        if trend and aland_sq_miles > 0 and len(trend) >= 2:
            start_density = trend[0].population / aland_sq_miles
            last_historical_density = trend[-1].population / aland_sq_miles
            density_change = last_historical_density - start_density
        
        population_density = PopulationDensity(
            people_per_sq_mile=current_density,
            change_over_period=density_change
        )
        logger.debug(f"Population density: {population_density.model_dump_json()}")

        logger.debug("Calculating demographic and housing percentages.")
        bachelors_or_higher = sum(acs_data.get(k, 0) or 0 for k in ["B15003_022E", "B15003_023E", "B15003_024E", "B15003_025E"])
        total_pop_25_over = acs_data.get("B15003_001E", 0)
        percent_bachelors = round((bachelors_or_higher / total_pop_25_over) * 100, 1) if total_pop_25_over and total_pop_25_over > 0 else None
        
        demographics = Demographics(
            median_household_income=acs_data.get("B19013_001E"),
            percent_bachelors_or_higher=percent_bachelors,
            avg_household_size=acs_data.get("B25010_001E")
        )

        renters, total_occupied = acs_data.get("B25003_003E", 0), acs_data.get("B25003_001E", 0)
        percent_renter = round((renters / total_occupied) * 100, 1) if total_occupied and total_occupied > 0 else None
        
        housing_metrics = HousingMetrics(
            percent_renter_occupied=percent_renter,
            median_home_value=acs_data.get("B25077_001E"),
            median_gross_rent=acs_data.get("B25064_001E")
        )

        age_distribution = AgeDistribution(
            under_18=sum(acs_data.get(k, 0) or 0 for k in ["B01001_003E", "B01001_004E", "B01001_005E", "B01001_006E", "B01001_027E", "B01001_028E", "B01001_029E", "B01001_030E"]),
            _18_to_34=sum(acs_data.get(k, 0) or 0 for k in ["B01001_007E", "B01001_008E", "B01001_009E", "B01001_010E", "B01001_011E", "B01001_012E", "B01001_031E", "B01001_032E", "B01001_033E", "B01001_034E", "B01001_035E", "B01001_036E"]),
            _35_to_64=sum(acs_data.get(k, 0) or 0 for k in ["B01001_013E", "B01001_014E", "B01001_015E", "B01001_016E", "B01001_017E", "B01001_018E", "B01001_019E", "B01001_037E", "B01001_038E", "B01001_039E", "B01001_040E", "B01001_041E", "B01001_042E", "B01001_043E"]),
            over_65=sum(acs_data.get(k, 0) or 0 for k in ["B01001_020E", "B01001_021E", "B01001_022E", "B01001_023E", "B01001_024E", "B01001_025E", "B01001_044E", "B01001_045E", "B01001_046E", "B01001_047E", "B01001_048E", "B01001_049E"])
        )

        logger.debug("Calculating sex distribution.")
        male_total = acs_data.get("B01001_002E", 0) or 0
        female_total = acs_data.get("B01001_026E", 0) or 0
        total_sex = male_total + female_total

        sex_distribution = SexDistribution(
            male=male_total,
            female=female_total,
            percent_male=round((male_total / total_sex) * 100, 1) if total_sex > 0 else None,
            percent_female=round((female_total / total_sex) * 100, 1) if total_sex > 0 else None
        )
        logger.debug(f"Sex distribution calculated: {sex_distribution.model_dump_json()}")

        logger.success("Response formatting complete. Returning final data object.")
        return PopulationDataResponse(
            search_address=address, data_year=year, geography_name=acs_data.get("NAME", "N/A"), geography_level=geo_level, coordinates=coordinates, tract_area_sq_meters=aland,
            total_population=total_pop, median_age=acs_data.get("B01002_001E"),
            growth=growth_metrics, migration=migration, natural_increase=natural_increase,
            population_density=population_density,
            age_distribution=age_distribution,
            sex_distribution=sex_distribution,
            demographics=demographics,
            housing=housing_metrics,
            walkability=walkability,
            population_trends=PopulationTrend(trend=trend, projection=projection, benchmark=benchmarks)
        )