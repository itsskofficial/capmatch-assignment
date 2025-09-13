import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";

type Mode = "explore" | "compare";

// This interface now only contains the address string and a unique client-side ID.
// All server state (status, data, error) is handled by React Query.
export interface AddressIdentifier {
	id: string;
	value: string;
}

interface AppState {
	mode: Mode;
	addresses: AddressIdentifier[];
	selectedAddress: AddressIdentifier | null; // Store the identifier, not the full data object

	setMode: (mode: Mode) => void;
	addAddress: (addressValue: string) => void;
	removeAddress: (id: string) => void;
	selectAddress: (address: AddressIdentifier | null) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
	mode: "explore",
	addresses: [],
	selectedAddress: null,

	setMode: (mode) => set({ mode }),

	selectAddress: (address) => set({ selectedAddress: address }),

	addAddress: (addressValue) => {
		const { addresses } = get();
		// Prevent duplicate addresses from being added to the list.
		if (
			addresses.some(
				(addr) =>
					addr.value.trim().toLowerCase() ===
					addressValue.trim().toLowerCase()
			)
		) {
			toast.info("This address is already in your list.");
			return;
		}

		const newAddress: AddressIdentifier = {
			id: uuidv4(),
			value: addressValue,
		};

		// The store's only job is to add the identifier to the list.
		// A React Query mutation will handle the actual data fetching.
		set((state) => ({ addresses: [...state.addresses, newAddress] }));
	},

	removeAddress: (id: string) => {
		set((state) => ({
			addresses: state.addresses.filter((addr) => addr.id !== id),
			// If the removed address was selected, deselect it.
			selectedAddress:
				state.selectedAddress?.id === id ? null : state.selectedAddress,
		}));
		toast.info("Address removed from the list.");
	},
}));
