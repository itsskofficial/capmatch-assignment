import asyncio
import re
import json
from typing import Dict, List, Any, Literal, Optional

import numpy as np
from census import Census
# This is an internal import from the 'python-census' library. It's used here
# to create clients for PEP endpoints that are not exposed by default.
from httpx import AsyncClient, HTTPStatusError
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
        # FIX: The `python-census` library is synchronous. Do not pass an AsyncClient.
        # This prevents a `RuntimeWarning` because the library does not `await` async calls.
        # It will use a default synchronous `requests` session, which works correctly
        # when run in a thread pool executor (`run_in_executor`).
        self.census_client = Census(settings.CENSUS_API_KEY)
        self.http_client = AsyncClient()
        self.census_api_semaphore = asyncio.Semaphore(10)
        logger.info("CensusService initialized.")

    async def get_market_data_for_address(self, address: str, geography_level: str, year: int, time_period_years: int, db: AsyncSession) -> PopulationDataResponse:
        normalized_address = re.sub(r'\s+', ' ', address).strip().lower()
        cache_key = f"{normalized_address}|{geography_level}|{year}|{time_period_years}"
        
        stmt = select(PopulationCache).where(PopulationCache.address_key == cache_key)
        result = await db.execute(stmt)
        cached_data = result.scalars().first()
        if cached_data:
            logger.info(f"Cache HIT for key: {cache_key}")
            return PopulationDataResponse.model_validate(cached_data.response_data)
        
        logger.info(f"Cache MISS for key: {cache_key}. Fetching new data.")
        geo_info = await self._geocode_address(address, year)
        fips = geo_info['fips']
        coords = geo_info['coords']
        land_area_sq_meters = geo_info['tract_obj'].get('ALAND', 0) if geography_level == 'tract' else geo_info['county_obj'].get('ALAND', 0)

        trend_years = list(range(year - time_period_years, year + 1))
        state_fips = {'state': fips['state']}
        
        tasks = {
            "main_acs_data": self._fetch_acs_data(fips, year, geography_level, list(ACS_VARS.keys())),
            # Use ACS for all trend and benchmark data
            "acs_trend_data": self._fetch_population_trend_acs(fips, trend_years, geography_level),
            "walkability": self._get_walkability_scores(address, lat=coords['y'], lon=coords['x']),
            "county_benchmark": self._fetch_population_trend_acs(fips, trend_years, 'county'),
            "state_benchmark": self._fetch_population_trend_acs(state_fips, trend_years, 'state'),
            "national_benchmark": self._fetch_population_trend_acs({}, trend_years, 'us'),
        }

        results = await asyncio.gather(*tasks.values(), return_exceptions=True)
        task_results = dict(zip(tasks.keys(), results))

        for name, result in task_results.items():
            if isinstance(result, Exception):
                logger.error(f"Task '{name}' failed: {result}")
                task_results[name] = None

        response_data = self._format_response_data(
            acs_data=task_results.get("main_acs_data"),
            trend=task_results.get("acs_trend_data"),
            components_data=None, # PEP data is no longer fetched
            benchmarks=BenchmarkData(
                county_trend=task_results.get("county_benchmark") or [],
                state_trend=task_results.get("state_benchmark") or [],
                national_trend=task_results.get("national_benchmark") or [],
            ),
            walkability=task_results.get("walkability"),
            address=address, year=year, geo_level=geography_level,
            aland=land_area_sq_meters, coordinates=Coordinates(lat=coords['y'], lon=coords['x'])
        )

        new_cache_entry = PopulationCache(
            address_key=cache_key,
            response_data=json.loads(response_data.model_dump_json(by_alias=True))
        )
        db.add(new_cache_entry)
        await db.commit()
        logger.info("Successfully saved data to cache.")

        return response_data

    # ... (keep _geocode_address and _get_walkability_scores as they are)
    async def _geocode_address(self, address: str, year: int) -> Dict[str, Any]:
        logger.info(f"Geocoding address: '{address}'")
        params1 = {"format": "json", "benchmark": "Public_AR_Current", "address": address}
        try:
            res1 = await self.http_client.get("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress", params=params1)
            res1.raise_for_status()
            data1 = res1.json()
            if not data1["result"]["addressMatches"]:
                raise HTTPException(status_code=404, detail="Address could not be geocoded.")
            coords = data1["result"]["addressMatches"][0]["coordinates"]
        except (HTTPStatusError, Exception) as e:
            logger.error(f"Geocoding service (coordinates) failed for '{address}': {e}")
            raise HTTPException(status_code=503, detail="Geocoding service failed at coordinate lookup.")

        vintage_str = f"ACS{year}_Current"
        params2 = {"format": "json", "benchmark": "Public_AR_Current", "vintage": vintage_str, "x": coords['x'], "y": coords['y']}
        try:
            res2 = await self.http_client.get("https://geocoding.geo.census.gov/geocoder/geographies/coordinates", params=params2)
            res2.raise_for_status()
            geos = res2.json()["result"]["geographies"]
            county = next((g for g in geos.get("Counties", [])), None)
            tract = next((g for g in geos.get("Census Tracts", [])), None)
            if not county or not tract:
                raise HTTPException(status_code=404, detail="Could not determine geographic boundaries.")
            return {
                "fips": {"state": county["STATE"], "county": county["COUNTY"], "tract": tract["TRACT"]},
                "tract_obj": tract,
                "county_obj": county,
                "coords": coords
            }
        except (HTTPStatusError, Exception) as e:
            logger.error(f"Geocoding service (FIPS) failed for coords {coords}: {e}")
            raise HTTPException(status_code=503, detail="Geocoding service failed at FIPS lookup.")

    async def _get_walkability_scores(self, address: str, lat: float, lon: float) -> Optional[WalkabilityScores]:
        if not settings.WALKSCORE_API_KEY:
            logger.warning("WALKSCORE_API_KEY not set. Skipping walkability fetch.")
            return None
        params = {"format": "json", "address": address, "lat": lat, "lon": lon, "wsapikey": settings.WALKSCORE_API_KEY}
        try:
            res = await self.http_client.get("https://api.walkscore.com/score", params=params)
            res.raise_for_status()
            data = res.json()
            if data.get("status") == 1:
                return WalkabilityScores(
                    walk_score=data.get("walkscore"),
                    walk_score_description=data.get("description"),
                    transit_score=data.get("transit", {}).get("score"),
                    transit_score_description=data.get("transit", {}).get("description"),
                )
            return None
        except Exception:
            logger.exception("An unexpected error occurred during walkability fetch.")
            return None

    async def _fetch_acs_data(self, fips: Dict[str, str], year: int, geo_level: str, variables: List[str]) -> Optional[Dict[str, Any]]:
        if geo_level == 'tract':
            geo_filter = {'for': f"tract:{fips.get('tract')}", 'in': f"state:{fips.get('state')} county:{fips.get('county')}"}
        elif geo_level == 'county':
            geo_filter = {'for': f"county:{fips.get('county')}", 'in': f"state:{fips.get('state')}"}
        elif geo_level == 'state':
            geo_filter = {'for': f"state:{fips.get('state')}"}
        elif geo_level == 'us':
            geo_filter = {'for': 'us:1'}
        else:
            logger.error(f"Unsupported geography level for ACS: {geo_level}")
            return None
        
        try:
            async with self.census_api_semaphore:
                loop = asyncio.get_running_loop()
                data = await loop.run_in_executor(None, self.census_client.acs5.get, ('NAME', *variables), geo_filter, year)
            if not data: return None
            raw_data = data[0]
            # Return the name along with the requested variables
            processed_data = {'NAME': raw_data.get('NAME')}
            for key in variables:
                value = raw_data.get(key)
                processed_data[key] = int(value) if value is not None else None
            return processed_data
        except Exception as e:
            logger.error(f"Census ACS API call failed for ({geo_level}, {year}): {e}")
            return None

    async def _fetch_population_trend_acs(self, fips: Dict[str, str], years: List[int], geo_level: str) -> List[PopulationTrendPoint]:
        """Fetches a population trend using ACS 5-Year data for each year."""
        tasks = [self._fetch_acs_data(fips, year, geo_level, ["B01003_001E"]) for year in years]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        trend = [
            PopulationTrendPoint(year=years[i], population=res.get("B01003_001E", 0))
            for i, res in enumerate(results) if isinstance(res, dict) and res.get("B01003_001E") is not None
        ]
        return sorted(trend, key=lambda x: x.year)

    def _format_response_data(self, acs_data: Optional[Dict[str, Any]], trend: Optional[List[PopulationTrendPoint]], components_data: Optional[Dict[str, Any]], benchmarks: BenchmarkData, walkability: Optional[WalkabilityScores], address: str, year: int, geo_level: str, aland: int, coordinates: Coordinates) -> PopulationDataResponse:
        if not acs_data:
            raise HTTPException(status_code=404, detail=f"No ACS demographic data found for this {geo_level} in {year}.")
        if not trend:
            trend = []

        total_pop = trend[-1].population if trend else acs_data.get("B01003_001E", 0)

        # --- Growth Calculations ---
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

        # --- Density Calculation ---
        aland_sq_miles = aland / 2589988.11
        current_density = (total_pop / aland_sq_miles) if aland_sq_miles > 0 else 0
        density_change = None
        if len(trend) >= 2 and aland_sq_miles > 0:
            start_density = (trend[0].population / aland_sq_miles)
            density_change = current_density - start_density
        population_density = PopulationDensity(people_per_sq_mile=round(current_density, 1), change_over_period=round(density_change, 1) if density_change is not None else None)

        # --- Projections ---
        projection = []
        if len(trend) >= 2:
            years_numeric = [p.year for p in trend]
            pops = [p.population for p in trend]
            coeffs = np.polyfit(years_numeric, pops, 1)
            poly = np.poly1d(coeffs)
            future_years = list(range(trend[-1].year + 1, trend[-1].year + 4))
            projected_pops = poly(future_years)
            projection = [PopulationTrendPoint(year=yr, population=int(pop)) for yr, pop in zip(future_years, projected_pops)]

        # --- Migration & Natural Increase ---
        migration, natural_increase = None, None
        if components_data and total_pop > 0:
            migration = MigrationData(
                net_migration=components_data.get("NETMIG", 0),
                domestic_migration=components_data.get("DOMESTICMIG", 0),
                international_migration=components_data.get("INTLMIG", 0),
                net_migration_rate=round((components_data.get("NETMIG", 0) / total_pop) * 100, 2)
            )
            natural_increase = NaturalIncreaseData(
                births=components_data.get("BIRTHS", 0),
                deaths=components_data.get("DEATHS", 0),
                natural_change=components_data.get("NATURALCHG", 0),
                natural_increase_rate=round((components_data.get("NATURALCHG", 0) / total_pop) * 1000, 1)
            )
        
        # --- ACS Demographics ---
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

        return PopulationDataResponse(
            search_address=address, data_year=year, geography_name=acs_data.get("NAME", "N/A"), geography_level=geo_level, coordinates=coordinates,
            total_population=total_pop, median_age=acs_data.get("B01002_001E"),
            growth=growth_metrics, migration=migration, natural_increase=natural_increase,
            population_density=population_density, age_distribution=age_distribution,
            demographics=demographics, walkability=walkability,
            population_trends=PopulationTrend(trend=trend, projection=projection, benchmark=benchmarks)
        )