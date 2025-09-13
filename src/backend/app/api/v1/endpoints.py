from fastapi import APIRouter, Depends, HTTPException, Request, Response
from typing import Annotated, List
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger
import time

from app.schemas.population import MarketDataRequest, PopulationDataResponse, ErrorResponse, CacheDeleteRequest
from app.services.census_service import CensusService
from app.db.session import get_db_session

router = APIRouter()
CensusServiceDep = Annotated[CensusService, Depends(CensusService)]
DBSessionDep = Annotated[AsyncSession, Depends(get_db_session)]

@router.post(
    "/market-data",
    response_model=PopulationDataResponse,
    summary="Get Population Metrics by Address",
    description="Accepts an address and returns key population metrics for the census tract.",
    responses={
        404: {"model": ErrorResponse, "description": "Address or data not found"},
        503: {"model": ErrorResponse, "description": "External service unavailable"},
    },
)
async def get_market_data(
    fastapi_request: Request, # Inject the request object to get client info
    request: MarketDataRequest,
    service: CensusServiceDep,
    db_session: DBSessionDep,
):
    start_time = time.time()
    client_host = fastapi_request.client.host if fastapi_request.client else "unknown"
    logger.info(f"Received /market-data request from {client_host} for address: '{request.address}'")
    logger.debug(f"Request details: {request.model_dump_json()}")
    
    try:
        result = await service.get_market_data_for_address(
            address=request.address,
            db=db_session
        )
        process_time = (time.time() - start_time) * 1000
        logger.info(f"Successfully processed request for '{request.address}' in {process_time:.2f}ms.")
        return result
    except HTTPException as e: #pylint: disable=try-except-raise
        process_time = (time.time() - start_time) * 1000
        logger.warning(
            f"HTTPException for '{request.address}': "
            f"Status={e.status_code}, Detail='{e.detail}'. Processed in {process_time:.2f}ms."
        )
        raise e
    except Exception:
        process_time = (time.time() - start_time) * 1000
        # Use logger.exception to automatically include stack trace
        logger.exception(
            f"An unexpected error occurred for '{request.address}'. Processed in {process_time:.2f}ms."
        )
        # Re-raising as a generic 500 error to avoid leaking implementation details
        raise HTTPException(status_code=500, detail="An unexpected internal error occurred.")

@router.get(
    "/market-data/cache",
    response_model=List[str],
    summary="Get all cached addresses",
    description="Retrieves a list of all addresses currently in the server-side cache.",
)
async def get_all_cached_data(
    service: CensusServiceDep,
    db_session: DBSessionDep,
):
    """Returns a list of all cached search addresses."""
    logger.info("Received request to list all cached addresses.")
    addresses = await service.get_all_cached_addresses(db=db_session)
    return addresses

@router.delete(
    "/market-data/cache",
    status_code=204,
    summary="Delete a cached address",
    description="Removes a specific address from the server-side cache.",
)
async def delete_cached_data(
    request: CacheDeleteRequest,
    service: CensusServiceDep,
    db_session: DBSessionDep,
):
    """Deletes a cache entry for a given address."""
    logger.info(f"Received request to delete cache for address: '{request.address}'")
    await service.delete_cache_for_address(address=request.address, db=db_session)
    # Return a 204 No Content response, which is standard for successful DELETE operations
    return Response(status_code=204)