"use client";

import { useMutation } from "@tanstack/react-query";
import { AddressForm } from "@/components/address-form";
import { PopulationCard } from "@/components/population-card";
import {
	addressSchema,
	populationGrowthResponseSchema,
	type AddressSchema,
	type PopulationGrowthResponse,
} from "@lib/schemas";

// This is the core data fetching function
async function fetchPopulationData(
	addressData: AddressSchema
): Promise<PopulationGrowthResponse> {
	const response = await fetch("/api/v1/population-growth", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(addressData),
	});

	if (!response.ok) {
		// Try to parse error details from the backend
		const errorBody = await response.json();
		throw new Error(errorBody.detail || "An unknown error occurred");
	}

	const data = await response.json();

	// Validate the response with Zod. Throws an error if the shape is wrong.
	return populationGrowthResponseSchema.parse(data);
}

export default function HomePage() {
	// useMutation is perfect for POST requests that are triggered by user actions
	const mutation = useMutation({
		mutationFn: fetchPopulationData,
	});

	const handleFormSubmit = (data: AddressSchema) => {
		mutation.mutate(data);
	};

	return (
		<main className="flex min-h-screen flex-col items-center p-8 md:p-24 bg-muted/40">
			<div className="z-10 w-full max-w-2xl items-center justify-between text-center">
				<h1 className="text-4xl font-bold tracking-tight">
					CapMatch Market Intelligence
				</h1>
				<p className="mt-2 text-lg text-muted-foreground">
					Enter a property address to dynamically generate a market
					overview card.
				</p>
			</div>

			<div className="mt-8 w-full max-w-2xl">
				<AddressForm
					onSubmit={handleFormSubmit}
					isSubmitting={mutation.isPending}
				/>
			</div>

			<div className="mt-8 w-full max-w-2xl">
				<PopulationCard
					isLoading={mutation.isPending}
					isError={mutation.isError}
					data={mutation.data}
				/>
			</div>
		</main>
	);
}
