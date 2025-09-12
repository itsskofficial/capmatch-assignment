// src/frontend/components/single-address-view.tsx
"use client";

import { useMutation } from "@tanstack/react-query";
import { AddressForm } from "@components/address-form";
import { PopulationMetricsCard } from "@components/population-metrics-card";
import {
	marketDataRequestSchema,
	populationDataResponseSchema,
	type MarketDataRequest,
	type PopulationDataResponse,
} from "@lib/schemas";

async function fetchPopulationData(
	requestData: MarketDataRequest
): Promise<PopulationDataResponse> {
	const body = {
		address: requestData.address,
		geography_level: requestData.geography,
		data_year: requestData.year,
		time_period_years: requestData.timePeriod,
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

export function SingleAddressView() {
	const mutation = useMutation({ mutationFn: fetchPopulationData });

	const handleFormSubmit = (data: MarketDataRequest) => {
		mutation.mutate(data);
	};

	return (
		<div className="w-full max-w-2xl space-y-8">
			<AddressForm
				onSubmit={handleFormSubmit}
				isSubmitting={mutation.isPending}
			/>
			<PopulationMetricsCard
				isLoading={mutation.isPending}
				isError={mutation.isError}
				error={mutation.error}
				data={mutation.data}
			/>
		</div>
	);
}
