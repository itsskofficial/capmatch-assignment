"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	Tooltip,
	ResponsiveContainer,
	CartesianGrid,
} from "recharts";
import { AlertCircle, TrendingUp } from "lucide-react";
import type { PopulationGrowthResponse } from "@lib/schemas";

// Define the props for our component
interface PopulationCardProps {
	isLoading: boolean;
	isError: boolean;
	data: PopulationGrowthResponse | undefined;
}

// A simple formatter for large numbers on the Y-axis
const formatPopulation = (value: number) => {
	if (value >= 1_000_000) {
		return `${(value / 1_000_000).toFixed(1)}M`;
	}
	if (value >= 1_000) {
		return `${(value / 1_000).toFixed(0)}K`;
	}
	return value.toString();
};

export function PopulationCard({
	isLoading,
	isError,
	data,
}: PopulationCardProps) {
	// 1. Loading State
	if (isLoading) {
		return (
			<Card className="w-full max-w-2xl">
				<CardHeader>
					<Skeleton className="h-6 w-48" />
					<Skeleton className="h-4 w-64 mt-2" />
				</CardHeader>
				<CardContent>
					<Skeleton className="h-64 w-full" />
				</CardContent>
			</Card>
		);
	}

	// 2. Error State
	if (isError) {
		return (
			<Alert variant="destructive" className="w-full max-w-2xl">
				<AlertCircle className="h-4 w-4" />
				<AlertTitle>Error</AlertTitle>
				<AlertDescription>
					Could not fetch population data. The address may be invalid
					or the data source is temporarily unavailable.
				</AlertDescription>
			</Alert>
		);
	}

	// 3. Empty/Initial State (No data yet)
	if (!data) {
		return (
			<Card className="w-full max-w-2xl border-dashed">
				<CardHeader className="text-center">
					<div className="mx-auto bg-secondary rounded-full p-3 w-fit">
						<TrendingUp className="h-8 w-8 text-muted-foreground" />
					</div>
					<CardTitle className="mt-2">Market Context</CardTitle>
					<CardDescription>
						Enter an address above to generate the population growth
						card.
					</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	// 4. Success State
	return (
		<Card className="w-full max-w-2xl">
			<CardHeader>
				<CardTitle>Population Growth</CardTitle>
				<CardDescription>
					Historical population for {data.county_name},{" "}
					{data.state_name}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="h-64 w-full">
					<ResponsiveContainer width="100%" height="100%">
						<BarChart
							data={data.data}
							margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
						>
							<CartesianGrid
								strokeDasharray="3 3"
								vertical={false}
							/>
							<XAxis
								dataKey="year"
								tickLine={false}
								axisLine={false}
							/>
							<YAxis
								tickFormatter={formatPopulation}
								tickLine={false}
								axisLine={false}
							/>
							<Tooltip
								cursor={{ fill: "hsl(var(--muted))" }}
								contentStyle={{
									background: "hsl(var(--background))",
									border: "1px solid hsl(var(--border))",
									borderRadius: "var(--radius)",
								}}
							/>
							<Bar
								dataKey="population"
								fill="hsl(var(--primary))"
								radius={[4, 4, 0, 0]}
							/>
						</BarChart>
					</ResponsiveContainer>
				</div>
			</CardContent>
		</Card>
	);
}
