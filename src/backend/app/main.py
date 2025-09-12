from fastapi import FastAPI
from app.api.v1 import endpoints

# Create the FastAPI app instance
app = FastAPI(
    title="CapMatch Market Data API",
    description="An API to fetch market context data for commercial real estate.",
    version="1.0.0",
)

# Include the router from our endpoints module
# All routes in the router will be prefixed with /api/v1
app.include_router(endpoints.router, prefix="/api/v1", tags=["Market Data"])

@app.get("/", tags=["Health Check"])
async def read_root():
    """A simple health check endpoint."""
    return {"status": "ok", "message": "Welcome to the CapMatch API"}