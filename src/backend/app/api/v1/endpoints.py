# backend/app/api/v1/endpoints.py
from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.population import AddressRequest, PopulationGrowthResponse, ErrorResponse
from app.services.census_service import CensusService
from app.db.session import get_db_session

router = APIRouter()

# Dependency Injection setup
CensusServiceDep = Annotated[CensusService, Depends(CensusService)]
DBSessionDep = Annotated[AsyncSession, Depends(get_db_session)]


@router.post(
    "/population-growth",
    response_model=PopulationGrowthResponse,
    summary="Get Population Growth by Address",
    description="Accepts a full U.S. address and returns historical population data for the corresponding county. Results are cached.",
    responses={
        404: {"model": ErrorResponse, "description": "Address or data not found"},
        503: {"model": ErrorResponse, "description": "External service unavailable"},
    },
)
async def get_population_growth(
    request: AddressRequest,
    service: CensusServiceDep,
    db_session: DBSessionDep, # Inject the database session
):
    """
    Endpoint to retrieve population growth data. It now uses a database cache
    to speed up responses for previously requested addresses.
    """
    try:
        # Pass the database session to the service layer
        return await service.get_population_growth_for_address(request.address, db_session)
    except HTTPException as e:
        raise e
    except Exception as e:
        # Log the error in a real application
        # import logging; logging.exception("An unexpected error occurred")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")