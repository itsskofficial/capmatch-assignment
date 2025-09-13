+++ b/src/frontend/hooks/useMarketData.ts
@@ -12,14 +12,18 @@
 // --- Fetcher Functions ---
 
 // Fetches market data for a single address
-const fetchMarketData = async (request: MarketDataRequest): Promise<PopulationDataResponse> => {
+export const fetchMarketData = async (request: MarketDataRequest): Promise<PopulationDataResponse> => {
   const response = await fetch("/api/v1/market-data", {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify(request),
   });
   if (!response.ok) {
     const errorBody = await response.json();
-    throw new Error(errorBody.detail || "Failed to fetch market data.");
+    // Attach status for better error handling in components
+    const error = new Error(errorBody.detail || "Failed to fetch market data.");
+    (error as any).status = response.status;
+    throw error;
   }
   const data = await response.json();
   return populationDataResponseSchema.parse(data);

```

### 2. Fix for `multi-address-input.tsx` (Correcting the prop type)

```patch
--- a/src/frontend/components/multi-address-input.tsx
+++ b/src/frontend/components/multi-address-input.tsx
@@ -13,7 +13,7 @@
 } from "@components/ui/card";
 import { Separator } from "@components/ui/separator";
 import { ScrollArea } from "@components/ui/scroll-area";
-import type { AddressEntry } from "@lib/types";
+import type { AddressIdentifier } from "@stores/addressStore";
 
 const addAddressSchema = z.object({
 	address: z.string().min(10, { message: "Please enter a valid address." }),
@@ -22,7 +22,7 @@
 
 interface MultiAddressInputProps {
 	onAddAddress: (data: AddAddressSchema) => void;
-	addresses: AddressEntry[];
+	addresses: AddressIdentifier[];
 	onRemoveAddress: (id: string) => void;
 	cachedAddresses: string[];
 	onRemoveFromCache: (address: string) => void;

```

### 3. Fix for `page.tsx` (Using the correct query function and types)

```patch
--- a/src/frontend/app/page.tsx
+++ b/src/frontend/app/page.tsx
@@ -28,9 +28,9 @@
 import { useAppStore, type AddressIdentifier } from "@stores/addressStore";
 import {
 	useCachedAddresses,
 	useDeleteCachedAddress,
 	useMarketData,
+	fetchMarketData,
 } from "@hooks/useMarketData";
-import type { AddressEntry } from "@lib/types";
-import { marketDataRequestSchema } from "@lib/schemas";
+import type { AddressEntry } from "@lib/types";
+import type { PopulationDataResponse } from "@lib/schemas";
 
 const ComparisonChart = dynamic(
 	() =>
@@ -73,8 +73,7 @@
 	const queries = useQueries({
 		queries: addresses.map((address) => ({
 			queryKey: ["marketData", "detail", address.value],
-			queryFn: () =>
-				marketDataRequestSchema.parse({ address: address.value }),
+			queryFn: () => fetchMarketData({ address: address.value }),
 			enabled: mode === "compare", // Only fetch for comparison chart if in compare mode
 			staleTime: 1000 * 60 * 5,
 		})),
@@ -87,7 +86,7 @@
 				id: addresses[index].id,
 				value: addresses[index].value,
 				status: "success",
-				data: query.data as unknown, // Cast because we know it's successful
+				data: query.data as PopulationDataResponse, // Cast because we know it's successful
 			}));
 	}, [queries, addresses]);
 

```

By applying these three changes, you will resolve the TypeScript errors, fix a latent bug in the error handling, and align the component props with your new state management strategy. Your application should now compile and run correctly.