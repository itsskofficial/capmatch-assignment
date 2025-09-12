import asyncio
import re
import json
import datetime
from typing import Dict, List, Any, Optional

import numpy as np
from census import Census
from httpx import AsyncClient
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from loguru import logger

from app.core.config import settings
from app.schemas.population import (
    PopulationDataResponse, AgeDistribution, Demographics, Coordinates,
    GrowthMetrics, MigrationData, NaturalIncreaseData, PopulationDensity,
    PopulationTrend, PopulationTrendPoint, WalkabilityScores, BenchmarkData
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
    # Age Groups (Male)
    "B01001_003E": "m_under_5", "B01001_004E": "m_5_9", "B01001_005E": "m_10_14", "B01001_006E": "m_15_17", "B01001_007E": "m_18_19", "B01001_008E": "m_20", "B01001_009E": "m_21", "B01001_010E": "m_22_24", "B01001_011E": "m_25_29", "B01001_012E": "m_30_34", "B01001_013E": "m_35_39", "B01001_014E": "m_40_44", "B01001_015E": "m_45_49", "B01001_016E": "m_50_54", "B01001_017E": "m_55_59", "B01001_018E": "m_60_61", "B01001_019E": "m_62_64", "B01001_020E": "m_65_66", "B01001_021E": "m_67_69", "B01001_022E": "m_70_74", "B01001_023E": "m_75_79", "B01001_024E": "m_80_84", "B01001_025E": "m_85_over",
    # Age Groups (Female)
    "B01001_027E": "f_under_5", "B01001_028E": "f_5_9", "B01001_029E": "f_10_14", "B01001_030E": "f_15_17", "B01001_031E": "f_18_19", "B01001_032E": "f_20", "B01001_033E": "f_21", "B01001_034E": "f_22_24", "B01001_035E": "f_25_29", "B01001_036E": "f_30_34", "B01001_037E": "f_35_39", "B01001_038E": "f_40_44", "B01001_039E": "f_45_49", "B01001_040E": "f_50_54", "B01001_041E": "f_55_59", "B01001_042E": "f_60_61", "B01001_043E": "f_62_64",
    "B01001_044E": "f_65_66", "B01001_045E": "f_67_69", "B01001_046E": "f_70_74", "B01001_047E": "f_75_79", "B01001_048E": "f_80_84", "B01001_049E": "f_85_over",
}

class CensusService:
    def __init__(self):
        self.census_client = Census(settings.CENSUS_API_KEY)
        self.http_client = AsyncClient(timeout=15.0)
        self.census_api_semaphore = asyncio.Semaphore(10)
        logger.info("CensusService initialized.")

    async def get_market_data_for_address(self, address: str, db: AsyncSession) -> PopulationDataResponse:
        logger.info(f"Starting market data retrieval for address: '{address}'")
        normalized_address = re.sub(r'\s+', ' ', address).strip().lower()
        cache_key = f"{normalized_address}|tract|5_year_projected_v2"
        logger.debug(f"Generated cache key: {cache_key}")
        
        stmt = select(PopulationCache).where(PopulationCache.address_key == cache_key)
        result = await db.execute(stmt)
        cached_data = result.scalars().first()
        if cached_data:
            logger.success(f"Cache HIT for key: {cache_key}. Returning cached data.")
            return PopulationDataResponse.model_validate(cached_data.response_data)
        
        logger.info(f"Cache MISS for key: {cache_key}. Starting fresh data fetch.")
        
        geo_info = await self._geocode_address(address)
        fips, coords, aland = geo_info['fips'], geo_info['coords'], geo_info['aland']
        logger.info(f"Geocoding successful. FIPS: {fips}, ALAND: {aland}")

        historical_years = list(range(LATEST_ACS_YEAR - HISTORICAL_YEARS_COUNT + 1, LATEST_ACS_YEAR + 1))
        logger.info(f"Requesting historical data for ACS 5-Year periods ending in: {historical_years}")
        
        logger.info("Creating concurrent tasks for data fetching.")
        tasks = {
            "main_acs_data": self._fetch_acs_data(fips, LATEST_ACS_YEAR, 'tract', list(ACS_VARS.keys())),
            "tract_trend": self._fetch_population_trend_acs(fips, historical_years, 'tract'),
            "county_trend": self._fetch_population_trend_acs(fips, historical_years, 'county'),
            "state_trend": self._fetch_population_trend_acs(fips, historical_years, 'state'),
            "national_trend": self._fetch_population_trend_acs({}, historical_years, 'us'),
            "walkability": self._get_walkability_scores(address, lat=coords['lat'], lon=coords['lon']),
        }

        logger.info(f"Executing {len(tasks)} tasks concurrently...")
        results = await asyncio.gather(*tasks.values(), return_exceptions=True)
        task_results = dict(zip(tasks.keys(), results))
        logger.info("All concurrent tasks finished.")

        for name, result in task_results.items():
            if isinstance(result, Exception):
                logger.error(f"Task '{name}' failed with an exception: {result}")
                if name in ["main_acs_data", "tract_trend", "county_trend"]:
                    raise HTTPException(status_code=503, detail=f"Failed to fetch required data for {name}: {result}")
                task_results[name] = None
            else:
                logger.debug(f"Task '{name}' completed successfully.")
        
        tract_trend = task_results.get("tract_trend") or []
        county_trend = task_results.get("county_trend") or []
        
        logger.info("Projecting tract population based on county trends.")
        projections = self._project_tract_population(tract_trend, county_trend)
        logger.info(f"Generated {len(projections)} years of projected data.")

        logger.info("Formatting all retrieved data into the final response model.")
        response_data = self._format_response_data(
            acs_data=task_results.get("main_acs_data"),
            trend=tract_trend,
            projection=projections,
            benchmarks=BenchmarkData(
                county_trend=county_trend,
                state_trend=task_results.get("state_trend") or [],
                national_trend=task_results.get("national_trend") or [],
            ),
            walkability=task_results.get("walkability"),
            address=address, year=LATEST_ACS_YEAR, geo_level='tract',
            aland=aland, coordinates=Coordinates(lat=coords['lat'], lon=coords['lon'])
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
        logger.info(f"Starting geocoding process for address: '{address}'")

        # Step 1: Get coordinates from address
        logger.debug("Step 1: Fetching coordinates from Census onelineaddress endpoint.")
        oneline_url = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"
        params1 = {"format": "json", "benchmark": "Public_AR_Current", "address": address}
        try:
            res1 = await self.http_client.get(oneline_url, params=params1)
            res1.raise_for_status()
            data1 = res1.json()
            if not data1["result"]["addressMatches"]:
                logger.error(f"No address matches found by Census Geocoder for '{address}'")
                raise HTTPException(status_code=404, detail="Address could not be geocoded by Census Geocoder.")
            coords = data1["result"]["addressMatches"][0]["coordinates"]
            lat, lon = coords['y'], coords['x']
            logger.debug(f"Successfully retrieved coordinates: (lat={lat}, lon={lon})")
        except Exception as e:
            logger.error(f"Census Geocoder (coordinates) failed for '{address}': {e}")
            raise HTTPException(status_code=503, detail="Geocoding service failed at coordinate lookup.")

        # Step 2: Get geographies (FIPS and ALAND) using coordinates
        logger.debug("Step 2: Fetching geographies (FIPS, ALAND) from Census coordinates endpoint.")
        geo_url = "https://geocoding.geo.census.gov/geocoder/geographies/coordinates"
        vintage = f"ACS{LATEST_ACS_YEAR}_Current"
        logger.debug(f"Using geography vintage: {vintage}")
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
            
            fips = { "state": county["STATE"], "county": county["COUNTY"], "tract": tract["TRACT"] }
            aland = tract.get("ALAND", 0)
            logger.debug(f"Successfully retrieved FIPS: {fips} and ALAND: {aland}")
            if aland == 0:
                logger.warning(f"Census Geocoder returned land area of 0 for tract {tract.get('GEOID')}")

            return { "fips": fips, "coords": {"lat": lat, "lon": lon}, "aland": aland }
        except Exception as e:
            logger.error(f"Census Geocoder (geographies) failed for coords ({lat}, {lon}): {e}")
            raise HTTPException(status_code=503, detail="Geocoding service failed at FIPS/ALAND lookup.")

    def _project_tract_population(self, tract_trend: List[PopulationTrendPoint], county_trend: List[PopulationTrendPoint]) -> List[PopulationTrendPoint]:
        logger.info("Starting tract population projection.")
        if not tract_trend or len(county_trend) < 2:
            logger.warning("Not enough historical data to perform projection. Returning empty list.")
            return []

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
        last_tract_point = tract_trend[-1]
        current_pop = float(last_tract_point.population)
        logger.debug(f"Projection base: Year {last_tract_point.year}, Population {current_pop}")
        
        current_year = datetime.datetime.now().year
        projection_years = list(range(LATEST_ACS_YEAR + 1, current_year + 1))
        logger.debug(f"Projecting for years: {projection_years}")

        for year in projection_years:
            current_pop *= avg_growth_factor
            projected_point = PopulationTrendPoint(year=year, population=int(round(current_pop)))
            projections.append(projected_point)
            logger.debug(f"  - Projected {year}: {projected_point.population}")
        
        logger.info("Tract population projection finished.")
        return projections

    async def _get_walkability_scores(self, address: str, lat: float, lon: float) -> Optional[WalkabilityScores]:
        logger.info("Fetching walkability scores.")
        if not settings.WALKSCORE_API_KEY:
            logger.warning("WALKSCORE_API_KEY not set. Skipping walkability fetch.")
            return None
        
        params = {"format": "json", "address": address, "lat": lat, "lon": lon, "wsapikey": settings.WALKSCORE_API_KEY}
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
                logger.success(f"Successfully fetched Walk Score: {scores.walk_score}")
                return scores
            else:
                logger.warning(f"Walk Score API returned status {data.get('status')}. No scores available.")
                return None
        except Exception:
            logger.exception("An unexpected error occurred during walkability fetch.")
            return None

    async def _fetch_acs_data(self, fips: Dict[str, str], year: int, geo_level: str, variables: List[str]) -> Optional[Dict[str, Any]]:
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
        
        logger.debug(f"Using Census API geo_filter: {geo_filter}")
        try:
            async with self.census_api_semaphore:
                loop = asyncio.get_running_loop()
                logger.debug(f"Calling census_client.acs5.get for year {year}...")
                data = await loop.run_in_executor(None, self.census_client.acs5.get, ('NAME', *variables), geo_filter, year)
            
            if not data: 
                logger.warning(f"No ACS data returned for {geo_level} {fips} in {year}")
                return None
            
            logger.debug(f"Successfully received data from Census API for year {year}.")
            raw_data = data[0]
            processed_data = {'NAME': raw_data.get('NAME')}
            for key in variables:
                value = raw_data.get(key)
                processed_data[key] = int(value) if value is not None else None
            return processed_data
        except Exception as e:
            logger.error(f"Census ACS API call failed for ({geo_level}, {year}): {e}")
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

    def _format_response_data(self, acs_data: Optional[Dict[str, Any]], trend: List[PopulationTrendPoint], projection: List[PopulationTrendPoint], benchmarks: BenchmarkData, walkability: Optional[WalkabilityScores], address: str, year: int, geo_level: str, aland: int, coordinates: Coordinates) -> PopulationDataResponse:
        logger.info("Starting final response formatting.")
        if not acs_data:
            logger.error("Cannot format response: main ACS data is missing.")
            raise HTTPException(status_code=404, detail=f"No ACS demographic data found for this {geo_level} in {year}.")
        
        all_points = trend + projection
        total_pop = all_points[-1].population if all_points else acs_data.get("B01003_001E", 0)
        logger.debug(f"Final total population (including projections): {total_pop}")

        logger.debug("Calculating growth metrics.")
        growth_metrics = GrowthMetrics(period_years=len(trend) - 1 if trend else 0)
        if len(trend) >= 2:
            end_pop, start_pop = trend[-1].population, trend[0].population
            periods = len(trend) - 1
            if start_pop > 0 and periods > 0:
                growth_metrics.cagr = round((((end_pop / start_pop) ** (1 / periods)) - 1) * 100, 2)
            prev_pop = trend[-2].population
            if prev_pop > 0:
                growth_metrics.yoy_growth = round(((end_pop - prev_pop) / prev_pop) * 100, 2)
            growth_metrics.absolute_change = end_pop - start_pop
        logger.debug(f"Growth metrics: {growth_metrics.model_dump_json()}")

        logger.debug("Calculating population density.")
        aland_sq_miles = aland / 2589988.11 if aland > 0 else 0
        current_density = (total_pop / aland_sq_miles) if aland_sq_miles > 0 else 0
        density_change = None
        if trend and aland_sq_miles > 0:
            start_density = trend[0].population / aland_sq_miles
            last_historical_density = trend[-1].population / aland_sq_miles
            density_change = last_historical_density - start_density
        
        population_density = PopulationDensity(
            people_per_sq_mile=round(current_density, 1), 
            change_over_period=round(density_change, 1) if density_change is not None else None
        )
        logger.debug(f"Population density: {population_density.model_dump_json()}")

        logger.debug("Calculating demographic percentages.")
        bachelors_or_higher = sum(acs_data.get(k, 0) or 0 for k in ["B15003_022E", "B15003_023E", "B15003_024E", "B15003_025E"])
        total_pop_25_over = acs_data.get("B15003_001E", 0)
        percent_bachelors = round((bachelors_or_higher / total_pop_25_over) * 100, 1) if total_pop_25_over > 0 else None
        renters, total_occupied = acs_data.get("B25003_003E", 0), acs_data.get("B25003_001E", 0)
        percent_renter = round((renters / total_occupied) * 100, 1) if total_occupied > 0 else None
        
        demographics = Demographics(
            median_household_income=acs_data.get("B19013_001E"),
            percent_bachelors_or_higher=percent_bachelors,
            percent_renter_occupied=percent_renter
        )
        age_distribution = AgeDistribution(
            under_18=sum(acs_data.get(k, 0) or 0 for k in ["B01001_003E", "B01001_004E", "B01001_005E", "B01001_006E", "B01001_027E", "B01001_028E", "B01001_029E", "B01001_030E"]),
            _18_to_34=sum(acs_data.get(k, 0) or 0 for k in ["B01001_007E", "B01001_008E", "B01001_009E", "B01001_010E", "B01001_011E", "B01001_012E", "B01001_031E", "B01001_032E", "B01001_033E", "B01001_034E", "B01001_035E", "B01001_036E"]),
            _35_to_64=sum(acs_data.get(k, 0) or 0 for k in ["B01001_013E", "B01001_014E", "B01001_015E", "B01001_016E", "B01001_017E", "B01001_018E", "B01001_019E", "B01001_037E", "B01001_038E", "B01001_039E", "B01001_040E", "B01001_041E", "B01001_042E", "B01001_043E"]),
            over_65=sum(acs_data.get(k, 0) or 0 for k in ["B01001_020E", "B01001_021E", "B01001_022E", "B01001_023E", "B01001_024E", "B01001_025E", "B01001_044E", "B01001_045E", "B01001_046E", "B01001_047E", "B01001_048E", "B01001_049E"])
        )
        logger.debug("Demographics and age distribution calculated.")

        logger.success("Response formatting complete. Returning final data object.")
        return PopulationDataResponse(
            search_address=address, data_year=year, geography_name=acs_data.get("NAME", "N/A"), geography_level=geo_level, coordinates=coordinates,
            total_population=total_pop, median_age=acs_data.get("B01002_001E"),
            growth=growth_metrics, migration=None, natural_increase=None,
            population_density=population_density, age_distribution=age_distribution,
            demographics=demographics, walkability=walkability,
            population_trends=PopulationTrend(trend=trend, projection=projection, benchmark=benchmarks)
        )
