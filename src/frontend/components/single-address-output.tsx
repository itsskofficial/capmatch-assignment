"use client";

import { PopulationMetricsCard } from "@components/population-metrics-card";
import type { PopulationDataResponse } from "@lib/schemas";

interface SingleAddressOutputProps {
	isLoading: boolean;
	isError: boolean;
	error: Error | null;
	data: PopulationDataResponse | undefined;
}

export function SingleAddressOutput({
	isLoading,
	isError,
	error,
	data,
}: SingleAddressOutputProps) {
	return (
		<div className="w-full max-w-3xl">
			<PopulationMetricsCard
				isLoading={isLoading}
				isError={isError}
				error={error}
				data={data}
			/>
		</div>
	);
}
