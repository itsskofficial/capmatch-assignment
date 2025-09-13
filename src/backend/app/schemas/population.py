from pydantic import BaseModel, Field
from typing import List, Optional, Literal

# --- Request and Foundational Schemas (Largely Unchanged) ---
class MarketDataRequest(BaseModel):
    """Schema for the incoming market data POST request."""
    address: str = Field(..., description="A full U.S. address.")

class CacheDeleteRequest(BaseModel):
    """Schema for the cache deletion request."""
    address: str = Field(..., description="The exact address to remove from the cache.")

class PopulationTrendPoint(BaseModel):
    year: int
    population: int
    is_projection: bool = False

class Coordinates(BaseModel):
    lat: float
    lon: float

class WalkabilityScores(BaseModel):
    walk_score: Optional[int] = None
    walk_score_description: Optional[str] = None
    transit_score: Optional[int] = None
    transit_score_description: Optional[str] = None

class BenchmarkData(BaseModel):
    county_trend: List[PopulationTrendPoint]

class ErrorResponse(BaseModel):
    detail: str

# --- Core Data Schemas (Modified & New) ---
class GrowthMetrics(BaseModel):
    """Flexible growth metrics based on the requested time period."""
    period_years: int
    cagr: Optional[float] = Field(None, description="Compound Annual Growth Rate (%)")
    yoy_growth: Optional[float] = Field(None, description="Year-over-Year Growth Rate (%) for the most recent year.")
    absolute_change: Optional[int] = Field(None, description="Absolute population change over the period.")

class MigrationData(BaseModel):
    """Data on population change from migration."""
    net_migration: int
    net_migration_rate: float = Field(..., description="Net migration as a percentage of the population.")
    domestic_migration: int
    international_migration: int
    inflows: int
    outflows: int
    gross_migration: int

class NaturalIncreaseData(BaseModel):
    """Data on population change from births and deaths."""
    births: int
    deaths: int
    natural_change: int
    natural_increase_rate: float = Field(..., description="Natural increase (births - deaths) per 1,000 people.")

class PopulationDensity(BaseModel):
    """Population density and its change over time."""
    people_per_sq_mile: float
    change_over_period: Optional[float] = Field(None, description="Change in people per sq mile over the period.")

class PopulationTrend(BaseModel):
    """Historical population trend with projections and benchmarks."""
    trend: List[PopulationTrendPoint]
    projection: List[PopulationTrendPoint]
    benchmark: Optional[BenchmarkData] = None

class AgeDistribution(BaseModel):
    """Schema for the age distribution data."""
    under_18: int
    age_18_to_34: int = Field(..., alias="_18_to_34")
    age_35_to_64: int = Field(..., alias="_35_to_64")
    over_65: int
    class Config:
        populate_by_name = True


class SexDistribution(BaseModel):
    male: int
    female: int
    percent_male: Optional[float] = None
    percent_female: Optional[float] = None

class Demographics(BaseModel):
    """Socio-economic and household composition metrics."""
    median_household_income: Optional[int] = None
    percent_bachelors_or_higher: Optional[float] = None
    avg_household_size: Optional[float] = None

class HousingMetrics(BaseModel):
    """Housing market and tenure metrics."""
    percent_renter_occupied: Optional[float] = None
    median_home_value: Optional[int] = None
    median_gross_rent: Optional[int] = None

# --- Main Response Schema (Heavily Modified) ---
class PopulationDataResponse(BaseModel):
    """Final schema for the growth-focused market data response."""
    search_address: str
    data_year: int
    geography_name: str
    geography_level: Literal['tract', 'county']
    tract_area_sq_meters: int
    coordinates: Coordinates

    # Foundational Metrics
    total_population: int
    median_age: Optional[float]

    # Growth Metrics
    growth: GrowthMetrics

    # Driver Metrics
    migration: Optional[MigrationData] = None
    natural_increase: Optional[NaturalIncreaseData] = None

    # Effects / Implications
    population_density: PopulationDensity

    # Composition Metrics
    age_distribution: AgeDistribution
    sex_distribution: Optional[SexDistribution] = None
    demographics: Demographics

    # Housing Metrics
    housing: HousingMetrics

    # Ancillary Metrics
    walkability: Optional[WalkabilityScores] = None

    # Trend Data
    population_trends: PopulationTrend

    class Config:
        populate_by_name = True