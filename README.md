# CapMatch: Market Card Data Automation

This is a full-stack application built for the CapMatch take-home assignment. It dynamically generates a comprehensive "Population Context" market card for any U.S. address, sourcing data from credible public APIs in real-time.

![CapMatch Application Screenshot](./screenshot.png)

---

## 🚀 Live Demo, Walkthrough, Architecture & Report

*   **Live Application:** **[SK CapMatch](https://sk-capmatch.existence.technology)**
*   **Video Walkthrough:** **[Video Link](https://youtu.be/z_8_orDMt28)**
*   **Architecture Diagram:** **[View Excalidraw Diagram](./diagram.excalidraw)**
*   **Data Report:** **[Download PDF](./Report.pdf)**

---

## ✨ Key Features

*   **Dynamic Data Fetching:** Enter any U.S. address to generate a detailed population market card.
*   **Comprehensive Metrics:** Goes beyond simple growth to include demographics, economic indicators, housing data, migration drivers, and more.
*   **Interactive Visualizations:** Data is presented with interactive charts, graphs, and a map showing the census tract boundary.
*   **"Explore" Mode:** View and manage multiple address cards on a single dashboard.
*   **"Compare" Mode:** A powerful tool to compare population trends, demographics, and housing metrics across multiple addresses side-by-side.
*   **Intelligent Caching:** A robust PostgreSQL-backed caching layer ensures subsequent requests for the same address are instantaneous.
*   **Address Autocomplete:** Powered by the Google Places API for a smooth user experience.
*   **Secure Authentication:** User accounts and protected routes are managed with Firebase Authentication.
*   **Modern UI/UX:** A clean, responsive interface with light/dark modes, built with Next.js and shadcn/ui.
*   **Performance Optimized:** Backend is designed for speed, using concurrent API calls to meet the <30 second data-fetch requirement.

---

## 🛠️ Tech Stack

| Category            | Technology                                                                                                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend**        | [Next.js](https://nextjs.org/), [React](https://reactjs.org/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/), [Framer Motion](https://www.framer.com/motion/), [Lucide React](https://lucide.dev/) |
| **State Mgmt**      | [React Query (TanStack)](https://tanstack.com/query/latest) (Server State), [Zustand](https://zustand-demo.pmnd.rs/) (UI State)                                                                        |
| **Charts & Maps**   | [Recharts](https://recharts.org/) (Charts), [React-Leaflet](https://react-leaflet.js.org/) (Maps)                                                                                                     |
| **Backend**         | [FastAPI](https://fastapi.tiangolo.com/), [Python 3.11](https://www.python.org/), [SQLAlchemy 2.0](https://www.sqlalchemy.org/) (Async with `asyncpg`), [Uvicorn](https://www.uvicorn.org/)             |
| **Core Backend Libs** | [HTTX](https://www.python-httpx.org/) (Async HTTP Client), [Tenacity](https://tenacity.readthedocs.io/) (Retries), [Loguru](https://loguru.readthedocs.io/) (Logging)                                |
| **Database**        | [PostgreSQL](https://www.postgresql.org/) (for Caching), [Alembic](https://alembic.sqlalchemy.org/) (Migrations)                                                                                     |
| **Data APIs**       | U.S. Census Bureau (ACS, PEP, TIGERweb), Google Places, [Nominatim](https://nominatim.org/) (OSM), Walk Score®                                                                                        |
| **Deployment**      | [Docker](https://www.docker.com/), Docker Compose, GitHub Actions (CI/CD), Linux VM                                                                                                                  |
| **Auth**            | [Firebase Authentication](https://firebase.google.com/docs/auth)                                                                                                                                    |
| **Tooling & Testing** | [ESLint](https://eslint.org/), [Vitest](https://vitest.dev/), [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/), [Pytest](https://pytest.org/)   
---

## 🏗️ Architecture Overview

The system is a decoupled full-stack application orchestrated with Docker Compose.

1.  **Client (Next.js):** The user interacts with the React-based frontend. All API requests are sent to a Next.js API route, which acts as a proxy.
2.  **API Proxy (Next.js):** This proxy forwards requests to the backend, preventing CORS issues and hiding the backend URL from the client. It also attaches the user's Firebase auth token.
3.  **Backend (FastAPI):** The high-performance Python backend receives the request.
    *   It first checks the **PostgreSQL cache** for existing data.
    *   If a cache miss occurs, it concurrently calls all necessary external APIs (Census, Walk Score, etc.) using `asyncio` and `httpx`.
    *   Data is processed, aggregated, and formatted into the final JSON response.
    *   The new response is stored in the cache before being sent back to the client.
4.  **Database (PostgreSQL):** A persistent cache store for API responses, keyed by a normalized address.

---

## ⚙️ Running Locally

### Prerequisites

*   [Docker](https://www.docker.com/get-started/) and Docker Compose
*   [Node.js](https://nodejs.org/) (v20+) and a package manager (npm, yarn, or pnpm)
*   API Keys from external services (see `.env` setup)

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/your-repo-name.git
cd your-repo-name
```

### 2. Set Up Environment Variables

You will need to create `.env` files for both the backend and frontend. Template files are provided.

**Backend:**

```bash
cp src/backend/.env.template src/backend/.env
```

Now, open `src/backend/.env` and fill in the following values:
*   `FIREBASE_SERVICE_ACCOUNT_BASE64`: Generate a service account key from your Firebase project settings. Base64 encode the entire JSON file and paste the string here.
    *   On Linux/macOS: `base64 -w 0 path/to/your/serviceAccountKey.json`
*   `FIREBASE_PROJECT_ID`: Your Firebase project ID.
*   `CENSUS_API_KEY`: Get a key from the [Census API Key Signup](https://api.census.gov/data/key_signup.html).
*   `WALKSCORE_API_KEY`: Get a key from [Walk Score API](https://www.walkscore.com/professional/api.php).

**Frontend:**

```bash
cp src/frontend/.env.template src/frontend/.env
```

Now, open `src/frontend/.env` and fill in the following values from your Firebase project's web app settings:
*   `NEXT_PUBLIC_FIREBASE_API_KEY`
*   `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
*   `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
*   ...and other Firebase variables.
*   `GOOGLE_PLACES_API_KEY`: A Google Cloud API key with the "Places API" enabled. This is used for the address autocomplete feature and is called from a server-side route, so it is not exposed to the client.
*   `BACKEND_API_URL`: The URL of your FastAPI backend (e.g., `http://localhost:5000`). This is used by the frontend to proxy API requests to the backend server.

### 3. Build and Run with Docker

Once the environment variables are set, you can start the entire application with a single command:

```bash
docker-compose up --build
```

The application will be available at **[http://localhost:3000](http://localhost:3000)**. The backend API runs on port 5000 but is proxied through the frontend.

---

## 💡 Design Decisions & Rationale

*   **Performance:** The core challenge was meeting the <30 second requirement. This was achieved by using a fully asynchronous backend (FastAPI, `asyncpg`, `httpx`) and running all external API calls concurrently with `asyncio.gather`. This parallelization is the key to minimizing the total wait time.
*   **Robustness:** A persistent PostgreSQL cache was chosen over an in-memory solution to ensure data survives server restarts. The `tenacity` library is used on the backend to automatically retry failed API calls with exponential backoff, making the system resilient to transient network errors.
*   **Scalability & Maintainability:** The backend is built with a clean, service-oriented architecture. Logic is separated into distinct services (`GeocodingService`, `CensusAPIClient`, `CacheManager`, `DataProcessor`), making the codebase easy to understand, test, and extend.
*   **Modern Frontend:** React Query was chosen to handle server state, caching, and data fetching on the client. This simplifies logic, eliminates boilerplate, and provides a great user experience with features like automatic refetching and error handling. Zustand is used for minimal, shared UI state (like the current mode).
*   **Developer Experience:** Dockerizing the entire stack ensures a consistent and reproducible development environment, simplifying setup for any developer.

---

## 🔮 Future Improvements

*   **📈 Add County/MSA Benchmark Data:** Enhance the population trend chart by directly overlaying the county or MSA trend line. This provides immediate visual context for whether the specific location is outperforming or underperforming the broader market.

*   **⚡️ Integrate Hyper-Current Data:** Augment the foundational Census data by integrating with paid data providers (e.g., Esri, Placer.ai) to access more timely metrics like quarterly population estimates and real-time foot traffic data, reducing the lag of public sources.

*   **✨ Add More Market Cards:** The architecture is extensible and ready for new data verticals. Key additions would include **Job Growth** (from the Bureau of Labor Statistics), **Supply Pipeline** (new construction), and **Rent/Sales Comparables** (from commercial providers).

*   **🤖 AI-Powered Insights & Summaries:** Integrate a Large Language Model (LLM) to automatically generate natural language summaries of the market card (e.g., "This tract shows strong growth driven by an affluent, highly-educated population...") and to flag potential risks or opportunities based on the data.

*   **🧪 Comprehensive Test Coverage:** Implement a full suite of tests to ensure long-term stability, including backend `pytest` unit/integration tests for services and API endpoints, and frontend end-to-end tests (with Cypress or Playwright) for critical user flows.

*   **💾 User-Saved Lists & Projects:** Allow authenticated users to save, name, and manage lists of addresses (e.g., "Downtown Portfolio," "Q3 Acquisition Targets"). This transforms the tool from a single-session utility into a persistent workspace.

*   **☁️ Cloud-Native Scalability:** Migrate the deployment from a single VM to a container orchestration platform like **Kubernetes** or a managed service like **AWS ECS / Google Cloud Run**. This enables automated scaling, zero-downtime rolling deployments, and better resource management.

*   **⏱️ Intelligent Caching with TTL:** Implement a Time-To-Live (TTL) policy on the PostgreSQL cache. This would automatically expire and refresh cached data after a set period (e.g., 30-90 days), ensuring data stays reasonably current without manual intervention.

*   **📱 Full Responsiveness & Polished UI:** Thoroughly test and refine the UI for a seamless experience on tablet and mobile devices. Conduct a detailed review of the **dark mode** theme to ensure optimal color contrast and readability for all data visualizations.

*   **💡 Improved Code Quality & Maintainability:** Add comprehensive **code comments** and docstrings throughout the backend services and frontend hooks to improve long-term maintainability and ease onboarding for new developers.