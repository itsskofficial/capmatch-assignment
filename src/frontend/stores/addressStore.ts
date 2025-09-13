import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";

import type { AddressEntry } from "@/lib/types";
import {
	populationDataResponseSchema,
	type MarketDataRequest,
	type PopulationDataResponse,
} from "@/lib/schemas";

type Mode = "explore" | "compare";

interface AddressState {
	mode: Mode;
	addresses: AddressEntry[];
	selectedAddress: AddressEntry | null;
	cachedAddresses: string[];

	setMode: (mode: Mode) => void;
	addAddress: (addressValue: string) => Promise<void>;
	removeAddress: (id: string) => void;
	selectAddress: (address: AddressEntry | null) => void;

	fetchCachedAddresses: () => Promise<void>;
	removeAddressFromCache: (address: string) => Promise<void>;
}

async function fetchPopulationData(
	requestData: MarketDataRequest
): Promise<PopulationDataResponse> {
	const body = {
		address: requestData.address,
	};
	const response = await fetch("/api/v1/market-data", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		const errorBody = await response.json();
		throw new Error(errorBody.detail || "An unknown error occurred");
	}
	const data = await response.json();
	return populationDataResponseSchema.parse(data);
}

export const useAddressStore = create<AddressState>((set, get) => ({
	mode: "explore",
	addresses: [],
	selectedAddress: null,
	cachedAddresses: [],

	setMode: (mode) => set({ mode }),

	selectAddress: (address) => set({ selectedAddress: address }),

	fetchCachedAddresses: async () => {
		try {
			const response = await fetch("/api/v1/market-data/cache");
			if (!response.ok) {
				toast.error("Failed to fetch cached addresses.");
				throw new Error("Failed to fetch cached addresses");
			}
			const data: string[] = await response.json();
			set({ cachedAddresses: data });
		} catch (error) {
			console.error(error);
			toast.error("An error occurred while fetching cached addresses.");
		}
	},

	addAddress: async (addressValue: string) => {
		const { addresses } = get();
		if (
			addresses.some(
				(addr) =>
					addr.value.trim().toLowerCase() ===
					addressValue.trim().toLowerCase()
			)
		) {
			toast.info("Address is already in the list.");
			return;
		}

		const newAddress: AddressEntry = {
			id: uuidv4(),
			value: addressValue,
			status: "loading",
		};

		set((state) => ({ addresses: [...state.addresses, newAddress] }));

		try {
			const fetchedData = await fetchPopulationData({
				address: newAddress.value,
			});
			set((state) => ({
				addresses: state.addresses.map((a) =>
					a.id === newAddress.id
						? { ...a, status: "success", data: fetchedData }
						: a
				),
			}));
			toast.success(
				`Successfully fetched data for: ${fetchedData.search_address}`
			);
			get().fetchCachedAddresses();
		} catch (error: unknown) {
			const errorMessage =
				error instanceof Error
					? error.message
					: "An unknown error occurred";
			set((state) => ({
				addresses: state.addresses.map((a) =>
					a.id === newAddress.id
						? { ...a, status: "error", error: errorMessage }
						: a
				),
			}));
			toast.error(`Failed to fetch data: ${errorMessage}`);
		}
	},

	removeAddress: (id: string) => {
		set((state) => ({
			addresses: state.addresses.filter((addr) => addr.id !== id),
		}));
		toast.info("Address removed from current session.");
	},

	removeAddressFromCache: async (address: string) => {
		try {
			const response = await fetch("/api/v1/market-data/cache", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ address }),
			});

			if (!response.ok) {
				const errorBody = await response.json().catch(() => ({}));
				const detail =
					errorBody.detail ||
					"Failed to delete address from server cache.";
				toast.error(detail);
				throw new Error("Failed to delete address from server cache.");
			}
			await get().fetchCachedAddresses();
			toast.success(`Removed "${address}" from cache.`);
		} catch (error) {
			console.error("Error deleting address from server cache:", error);
			toast.error(
				"An error occurred while deleting the address from cache."
			);
		}
	},
}));