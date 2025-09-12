from pydantic import BaseModel, Field

class AddressRequest(BaseModel):
    """Schema for the incoming address POST request."""
    address: str = Field(
        ...,
        description="A full U.S. address, e.g., '555 California St, San Francisco, CA'",
        examples=["555 California St, San Francisco, CA 94104"]
    )

class PopulationDataPoint(BaseModel):
    """Represents a single data point for population in a given year."""
    year: int
    population: int

class PopulationGrowthResponse(BaseModel):
    """Schema for the successful response containing population data."""
    county_name: str
    state_name: str
    data: list[PopulationDataPoint]

class ErrorResponse(BaseModel):
    """Schema for returning error messages."""
    detail: str