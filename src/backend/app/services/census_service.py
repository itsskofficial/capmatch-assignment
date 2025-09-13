import asyncio
from typing import Dict, List, Any

from httpx import AsyncClient
from fastapi import HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from app.schemas.population import (
    PopulationDataResponse, WalkabilityScores, BenchmarkData, PopulationTrendPoint,
    MigrationData, NaturalIncreaseData, PopulationDensity, AgeDistribution,
    SexDistribution, EconomicContext, Coordinates
)
from app.services.cache_manager import CacheManager
from app.services.geocoding_service import GeocodingService
from app.services.census_api_client import CensusAPIClient
from app.services.data_processor import DataProcessor

# --- Constants ---
LATEST_ACS_YEAR = 2023
HISTORICAL_YEARS_COUNT = 5
ACS_VARS = {
    "B01003_001E": "total_population", "B01002_001E": "median_age", "B19013_001E": "median_household_income",
    "B25003_001E": "total_occupied_units", "B25003_003E": "renter_occupied_units", "B15003_001E": "edu_total_pop_25_over",
    "B15003_022E": "edu_bachelors", "B15003_023E": "edu_masters", "B15003_024E": "edu_professional", "B15003_025E": "edu_doctorate",
    "B25010_001E": "avg_household_size", "B25077_001E": "median_home_value", "B25064_001E": "median_gross_rent",
    "B11001_001E": "total_households", "B11001_002E": "family_households", "B11001_003E": "married_couple_family", "B11001_007E": "nonfamily_households",
    "B03002_001E": "race_total", "B03002_003E": "race_white_non_hispanic", "B03002_004E": "race_black_non_hispanic",
    "B03002_006E": "race_asian_non_hispanic", "B03002_012E": "race_hispanic", "B03002_005E": "race_native_non_hispanic",
    "B03002_007E": "race_pacific_non_hispanic", "B03002_008E": "race_other_non_hispanic", "B03002_009E": "race_two_plus_non_hispanic",
    "B23025_001E": "lf_total_pop_16_over", "B23025_002E": "lf_in_labor_force", "B25035_001E": "median_year_built",
    "B25002_001E": "total_housing_units", "B25002_003E": "vacant_units", "B25003_002E": "owner_occupied_units",
    "B25004_002E": "vacant_for_rent", "B25004_004E": "vacant_for_sale", "B01001_002E": "total_male", "B01001_026E": "total_female",
    "B01001_003E": "m_under_5", "B01001_004E": "m_5_9", "B01001_005E": "m_10_14", "B01001_006E": "m_15_17", "B01001_007E": "m_18_19", "B01001_008E": "m_20", "B01001_009E": "m_21", "B01001_010E": "m_22_24", "B01001_011E": "m_25_29", "B01001_012E": "m_30_34", "B01001_013E": "m_35_39", "B01001_014E": "m_40_44", "B01001_015E": "m_45_49", "B01001_016E": "m_50_54", "B01001_017E": "m_55_59", "B01001_018E": "m_60_61", "B01001_019E": "m_62_64", "B01001_020E": "m_65_66", "B01001_021E": "m_67_69", "B01001_022E": "m_70_74", "B01001_023E": "m_75_79", "B01001_024E": "m_80_84", "B01001_025E": "m_85_over",
    "B01001_027E": "f_under_5", "B01001_028E": "f_5_9", "B01001_029E": "f_10_14", "B01001_030E": "f_15_17", "B01001_031E": "f_18_19", "B01001_032E": "f_20", "B01001_033E": "f_21", "B01001_034E": "f_22_24", "B01001_035E": "f_25_29", "B01001_036E": "f_30_34", "B01001_037E": "f_35_39", "B01001_038E": "f_40_44", "B01001_039E": "f_45_49", "B01001_040E": "f_50_54", "B01001_041E": "f_55_59", "B01001_042E": "f_60_61", "B01001_043E": "f_62_64", "B01001_044E": "f_65_66", "B01001_045E": "f_67_69", "B01001_046E": "f_70_74", "B01001_047E": "f_75_79", "B01001_048E": "f_80_84", "B01001_049E": "f_85_over",
}
SUBJECT_VARS = {"S1701_C03_001E": "poverty_rate_percent"}
PROFILE_VARS = {"DP03_0025E": "mean_commute_time"}

class CensusService:
    def __init__(
        self,
        cache_manager: CacheManager = Depends(),
        geocoding_service: GeocodingService = Depends(),
        api_client: CensusAPIClient = Depends(),
        data_processor: DataProcessor = Depends(),
    ):
        self.cache = cache_manager
        self.geocoder = geocoding_service
        self.api_client = api_client
        self.processor = data_processor
        logger.info("CensusService initialized with all sub-services.")

    async def get_market_data_for_address(self, address: str, db: AsyncSession) -> PopulationDataResponse:
        cached_response = await self.cache.get_cached_response(address, db)
        if cached_response:
            return cached_response

        geo_info = await self.geocoder.geocode_address(address)
        fips, coords_dict, aland = geo_info['fips'], geo_info['coords'], geo_info['aland']
        coords = Coordinates(**coords_dict)

        historical_years = list(range(LATEST_ACS_YEAR - HISTORICAL_YEARS_COUNT + 1, LATEST_ACS_YEAR + 1))
        
        async def fetch_historical_trend(geo_level: str, years: List[int]):
            tasks = [self.api_client.fetch_acs_data(fips, year, geo_level, ["B01003_001E"]) for year in years]
            results = await asyncio.gather(*tasks)
            return sorted(
                [PopulationTrendPoint(year=years[i], population=res["B01003_001E"]) for i, res in enumerate(results) if res and res.get("B01003_001E")],
                key=lambda x: x.year
            )

        tasks = {
            "latest_year_data": self.api_client.fetch_large_acs_dataset(fips, LATEST_ACS_YEAR, 'tract', list(ACS_VARS.keys())),
            "subject_data": self.api_client.fetch_acs_data(fips, LATEST_ACS_YEAR, 'tract', list(SUBJECT_VARS.keys()), endpoint="acs/acs5/subject"),
            "profile_data": self.api_client.fetch_acs_data(fips, LATEST_ACS_YEAR, 'tract', list(PROFILE_VARS.keys()), endpoint="acs/acs5/profile"),
            "tract_trend": fetch_historical_trend('tract', historical_years),
            "county_trend": fetch_historical_trend('county', historical_years),
            "county_drivers": self.api_client.fetch_pep_county_components(fips),
            "migration_flows": self.api_client.fetch_migration_flows(fips),
            "walkability_data": self.api_client.fetch_walkability_scores(address, lat=coords.lat, lon=coords.lon),
        }
        results = await asyncio.gather(*tasks.values(), return_exceptions=True)
        task_results = dict(zip(tasks.keys(), results))

        for name, result in task_results.items():
            if isinstance(result, Exception):
                logger.error(f"Task '{name}' failed: {result}")
                if name in ["latest_year_data", "tract_trend"]: # Critical data
                    raise HTTPException(status_code=503, detail=f"Failed to fetch required data for {name}.")
                task_results[name] = None
        
        # --- Prepare data for the processor ---
        acs_data = task_results["latest_year_data"]
        tract_trend = task_results["tract_trend"]
        county_trend = task_results["county_trend"]

        # Walkability
        walkability = WalkabilityScores(**task_results["walkability_data"]) if task_results["walkability_data"] else None

        # Migration and Natural Increase
        pep_drivers = task_results.get("county_drivers")
        acs_flows = task_results.get("migration_flows")
        migration_data, natural_increase_data = None, None
        if pep_drivers and (pep_drivers.get("POP") or 0) > 0:
            total_county_pop = pep_drivers["POP"]
            if acs_flows:
                # Safely get values from acs_flows, defaulting to 0 if the value is None
                moved_net = acs_flows.get("MOVEDNET") or 0
                moved_in = acs_flows.get("MOVEDIN") or 0
                moved_out = acs_flows.get("MOVEDOUT") or 0
                migration_data = MigrationData(
                    net_migration=moved_net,
                    net_migration_rate=round((moved_net / total_county_pop) * 100, 2),
                    inflows=moved_in,
                    outflows=moved_out,
                    gross_migration=moved_in + moved_out,
                    domestic_migration=pep_drivers.get("DOMESTICMIG") or 0,
                    international_migration=pep_drivers.get("INTERNATIONALMIG") or 0,
                )
            natural_inc = pep_drivers.get("NATURALINC") or 0
            natural_increase_data = NaturalIncreaseData(
                births=pep_drivers.get("BIRTHS") or 0, deaths=pep_drivers.get("DEATHS") or 0, natural_change=natural_inc,
                natural_increase_rate=round((natural_inc / total_county_pop) * 1000, 2)
            )

        # Population Density
        aland_sq_miles = aland / 2589988.11 if aland > 0 else 0
        latest_actual_pop = tract_trend[-1].population if tract_trend else (acs_data.get("B01003_001E") or 0)
        current_density = (latest_actual_pop / aland_sq_miles) if aland_sq_miles > 0 else 0
        density_change = None
        if tract_trend and aland_sq_miles > 0 and len(tract_trend) >= 2:
            start_density = tract_trend[0].population / aland_sq_miles
            density_change = current_density - start_density
        
        population_density = PopulationDensity(people_per_sq_mile=current_density, change_over_period=density_change)

        # Age and Sex Distribution
        age_distribution = AgeDistribution(
            under_18=sum(acs_data.get(k, 0) or 0 for k in ["B01001_003E", "B01001_004E", "B01001_005E", "B01001_006E", "B01001_027E", "B01001_028E", "B01001_029E", "B01001_030E"]),
            _18_to_34=sum(acs_data.get(k, 0) or 0 for k in ["B01001_007E", "B01001_008E", "B01001_009E", "B01001_010E", "B01001_011E", "B01001_012E", "B01001_031E", "B01001_032E", "B01001_033E", "B01001_034E", "B01001_035E", "B01001_036E"]),
            _35_to_64=sum(acs_data.get(k, 0) or 0 for k in ["B01001_013E", "B01001_014E", "B01001_015E", "B01001_016E", "B01001_017E", "B01001_018E", "B01001_019E", "B01001_037E", "B01001_038E", "B01001_039E", "B01001_040E", "B01001_041E", "B01001_042E", "B01001_043E"]),
            over_65=sum(acs_data.get(k, 0) or 0 for k in ["B01001_020E", "B01001_021E", "B01001_022E", "B01001_023E", "B01001_024E", "B01001_025E", "B01001_044E", "B01001_045E", "B01001_046E", "B01001_047E", "B01001_048E", "B01001_049E"])
        )
        male_total, female_total = acs_data.get("B01001_002E", 0) or 0, acs_data.get("B01001_026E", 0) or 0
        sex_distribution = SexDistribution(
            male=male_total, female=female_total,
            percent_male=round((male_total / (male_total + female_total)) * 100, 1) if (male_total + female_total) > 0 else None,
            percent_female=round((female_total / (male_total + female_total)) * 100, 1) if (male_total + female_total) > 0 else None
        )

        # Economic Context
        lf_total_pop, in_labor_force = acs_data.get("B23025_001E", 0) or 0, acs_data.get("B23025_002E", 0) or 0
        economic_context = EconomicContext(
            poverty_rate=task_results["subject_data"].get("S1701_C03_001E") if task_results["subject_data"] else None,
            labor_force_participation_rate=round((in_labor_force / lf_total_pop) * 100, 1) if lf_total_pop > 0 else None,
            mean_commute_time_minutes=task_results["profile_data"].get("DP03_0025E") if task_results["profile_data"] else None
        )

        response_data = self.processor.format_response_data(
            address=address, geo_level='tract', coordinates=coords, aland=aland,
            fips=fips, # <-- UPDATED
            acs_data=acs_data, trend=tract_trend,
            projection=self.processor.project_tract_population(acs_data, county_trend),
            benchmarks=BenchmarkData(county_trend=county_trend),
            walkability=walkability, migration=migration_data, natural_increase=natural_increase_data,
            population_density=population_density, age_distribution=age_distribution,
            sex_distribution=sex_distribution, economic_context=economic_context
        )

        await self.cache.set_cached_response(address, response_data, db)
        return response_data

    async def get_all_cached_addresses(self, db: AsyncSession) -> List[str]:
        return await self.cache.get_all_cached_addresses(db)

    async def delete_cache_for_address(self, address: str, db: AsyncSession):
        await self.cache.delete_cache_for_address(address, db)

    async def get_tract_geojson(self, state: str, county: str, tract: str) -> Dict[str, Any]:
        logger.info(f"Fetching GeoJSON for state={state}, county={county}, tract={tract}")
        try:
            return await self.api_client.fetch_tract_geojson(state, county, tract)
        except Exception as e:
            logger.exception("Failed to fetch tract GeoJSON.")
            raise HTTPException(status_code=503, detail="Could not retrieve geographic data for the tract.")
