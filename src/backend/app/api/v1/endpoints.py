from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated

from app.schemas.population import AddressRequest, PopulationGrowthResponse, ErrorResponse
from app.services.census_service import CensusService

router = APIRouter()

# Dependency Injection: FastAPI will create a new CensusService instance for each request.
# This makes testing easier and manages resources cleanly.
CensusServiceDep = Annotated[CensusService, Depends(CensusService)]


@router.post(
    "/population-growth",
    response_model=PopulationGrowthResponse,
    summary="Get Population Growth by Address",
    description="Accepts a full U.S. address and returns historical population data for the corresponding county.",
    responses={
        404: {"model": ErrorResponse, "description": "Address or data not found"},
        503: {"model": ErrorResponse, "description": "External service unavailable"},
    },
)
async def get_population_growth(
    request: AddressRequest,
    service: CensusServiceDep,
):
    """
    Endpoint to retrieve population growth data.

    - **address**: A full street address in the United States.
    """
    try:
        return await service.get_population_growth_for_address(request.address)
    except HTTPException as e:
        # Re-raise HTTPException to let FastAPI handle the response
        raise e
    except Exception as e:
        # Catch any other unexpected errors
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")