from typing import Dict, List, Any, Optional
import numpy as np
from fastapi import HTTPException
from loguru import logger

from app.schemas.population import (
    PopulationDataResponse, AgeDistribution, Demographics, Coordinates,
    GrowthMetrics, MigrationData, NaturalIncreaseData, PopulationDensity, PopulationTrend,
    PopulationTrendPoint, WalkabilityScores, BenchmarkData, SexDistribution, HousingMetrics,
    HouseholdComposition, RaceAndEthnicity, EconomicContext
)

LATEST_ACS_YEAR = 2023

class DataProcessor:
    """Contains business logic for calculations, projections, and data formatting."""

    def project_tract_population(
        self, latest_tract_data: Optional[Dict[str, Any]], county_trend: List[PopulationTrendPoint]
    ) -> List[PopulationTrendPoint]:
        """Projects future tract population based on historical county growth rates."""
        logger.info("Starting tract population projection.")
        if not latest_tract_data or not latest_tract_data.get("B01003_001E") or len(county_trend) < 2:
            logger.warning("Not enough historical data to perform projection. Returning empty list.")
            return []

        base_population = latest_tract_data["B01003_001E"]
        county_growth_rates = [
            county_trend[i].population / county_trend[i-1].population
            for i in range(1, len(county_trend)) if county_trend[i-1].population > 0
        ]
        
        if not county_growth_rates:
            logger.warning("Could not calculate any county growth rates. Returning empty projection.")
            return []

        avg_growth_factor = np.mean(county_growth_rates)
        projections = []
        current_pop = float(base_population)
        
        for year in range(LATEST_ACS_YEAR + 1, LATEST_ACS_YEAR + 4):
            current_pop *= avg_growth_factor
            projections.append(PopulationTrendPoint(year=year, population=int(round(current_pop)), is_projection=True))
        
        logger.info(f"Tract population projection finished with {len(projections)} data points.")
        return projections

    def _calculate_growth_metrics(self, trend: List[PopulationTrendPoint]) -> GrowthMetrics:
        """Calculates CAGR, YoY growth, and absolute change from a trend line."""
        metrics = GrowthMetrics(period_years=5)
        if len(trend) < 2:
            return metrics

        end_pop, start_pop = trend[-1].population, trend[0].population
        periods = trend[-1].year - trend[0].year
        if start_pop > 0 and periods > 0:
            metrics.cagr = round((((end_pop / start_pop) ** (1 / periods)) - 1) * 100, 2)
        
        if len(trend) > 1:
            prev_pop = trend[-2].population
            if prev_pop > 0:
                metrics.yoy_growth = round(((end_pop - prev_pop) / prev_pop) * 100, 2)
        
        metrics.absolute_change = end_pop - start_pop
        return metrics

    def format_response_data(self, **kwargs: Any) -> PopulationDataResponse:
        """Assembles all processed data into the final API response model."""
        acs_data = kwargs.get("acs_data")
        if not acs_data:
            raise HTTPException(status_code=404, detail=f"No ACS demographic data found for this area.")

        trend = kwargs.get("trend", [])
        projection = kwargs.get("projection", [])
        total_pop = (trend + projection)[-1].population if (trend + projection) else acs_data.get("B01003_001E", 0)
        
        # Helper for safe division and rounding
        def safe_div_percent(numerator, denominator):
            if denominator is None or denominator == 0 or numerator is None:
                return None
            return round((numerator / denominator) * 100, 1)

        # Demographics
        bachelors_or_higher = sum(acs_data.get(k, 0) or 0 for k in ["B15003_022E", "B15003_023E", "B15003_024E", "B15003_025E"])
        total_pop_25_over = acs_data.get("B15003_001E")
        
        # Household Comp
        total_households = acs_data.get("B11001_001E")
        household_comp = HouseholdComposition(
            total_households=total_households,
            percent_family_households=safe_div_percent(acs_data.get("B11001_002E"), total_households),
            percent_married_couple_family=safe_div_percent(acs_data.get("B11001_003E"), total_households),
            percent_non_family_households=safe_div_percent(acs_data.get("B11001_007E"), total_households)
        )

        # Race/Ethnicity
        race_total = acs_data.get("B03002_001E")
        other_non_hispanic = sum(acs_data.get(k, 0) or 0 for k in ["B03002_005E", "B03002_007E", "B03002_008E", "B03002_009E"])
        race_ethnicity = RaceAndEthnicity(
            percent_white_non_hispanic=safe_div_percent(acs_data.get("B03002_003E"), race_total),
            percent_black_non_hispanic=safe_div_percent(acs_data.get("B03002_004E"), race_total),
            percent_asian_non_hispanic=safe_div_percent(acs_data.get("B03002_006E"), race_total),
            percent_hispanic=safe_div_percent(acs_data.get("B03002_012E"), race_total),
            percent_other_non_hispanic=safe_div_percent(other_non_hispanic, race_total)
        )

        demographics = Demographics(
            median_household_income=acs_data.get("B19013_001E"),
            percent_bachelors_or_higher=safe_div_percent(bachelors_or_higher, total_pop_25_over),
            avg_household_size=acs_data.get("B25010_001E"),
            household_composition=household_comp,
            race_and_ethnicity=race_ethnicity
        )

        # Housing
        housing_metrics = HousingMetrics(
            percent_renter_occupied=safe_div_percent(acs_data.get("B25003_003E"), acs_data.get("B25003_001E")),
            median_home_value=acs_data.get("B25077_001E"),
            median_gross_rent=acs_data.get("B25064_001E"),
            median_year_structure_built=acs_data.get("B25035_001E"),
            vacancy_rate=safe_div_percent(acs_data.get("B25002_003E"), acs_data.get("B25002_001E")),
            rental_vacancy_rate=safe_div_percent(acs_data.get("B25004_002E"), (acs_data.get("B25003_003E", 0) or 0) + (acs_data.get("B25004_002E", 0) or 0)),
            homeowner_vacancy_rate=safe_div_percent(acs_data.get("B25004_004E"), (acs_data.get("B25003_002E", 0) or 0) + (acs_data.get("B25004_004E", 0) or 0))
        )
        
        # Final Assembly
        return PopulationDataResponse(
            search_address=kwargs["address"],
            data_year=LATEST_ACS_YEAR,
            geography_name=acs_data.get("NAME", "N/A"),
            fips=kwargs["fips"],
            geography_level=kwargs["geo_level"],
            coordinates=kwargs["coordinates"],
            tract_area_sq_meters=kwargs["aland"],
            total_population=total_pop,
            median_age=acs_data.get("B01002_001E"),
            growth=self._calculate_growth_metrics(trend),
            migration=kwargs.get("migration"),
            natural_increase=kwargs.get("natural_increase"),
            population_density=kwargs.get("population_density"),
            age_distribution=kwargs.get("age_distribution"),
            sex_distribution=kwargs.get("sex_distribution"),
            demographics=demographics,
            housing=housing_metrics,
            economic_context=kwargs.get("economic_context"),
            walkability=kwargs.get("walkability"),
            population_trends=PopulationTrend(trend=trend, projection=projection, benchmark=kwargs.get("benchmarks"))
        )
