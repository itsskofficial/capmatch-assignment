"use client";

import React from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@components/ui/alert";
import { Skeleton } from "@components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@components/ui/tabs";
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	Tooltip,
	ResponsiveContainer,
	CartesianGrid,
	LineChart,
	Line,
	Legend,
	PieChart,
	Pie,
	Cell,
	type PieLabelRenderProps,
} from "recharts";
import {
	AlertCircle,
	TrendingUp,
	Users,
	MapPin,
	Cake,
	DollarSign,
	GraduationCap,
	Home,
	Footprints,
	Train,
	TrendingDown,
	Users2,
	Building,
} from "lucide-react";
import type { PopulationDataResponse } from "@lib/schemas";
import { cn } from "@lib/utils";
import DynamicMap from "@components/dynamic-map";

interface PopulationMetricsCardProps {
	isLoading: boolean;
	isError: boolean;
	error: Error | null;
	data: PopulationDataResponse | undefined;
}

const StatItem = ({
	icon: Icon,
	label,
	value,
	unit,
	className,
	children,
}: {
	icon: React.ElementType;
	label: string;
	value: React.ReactNode;
	unit?: React.ReactNode;
	className?: string;
	children?: React.ReactNode;
}) => (
	<div className="flex items-start space-x-3">
		<div className="bg-muted rounded-md p-2">
			<Icon className="h-5 w-5 text-muted-foreground" />
		</div>
		<div>
			<p className="text-sm text-muted-foreground">{label}</p>
			<p className={cn("text-lg font-semibold", className)}>
				{value ?? "N/A"}
				{value != null && unit && (
					<span className="text-sm font-normal text-muted-foreground ml-1">
						{unit}
					</span>
				)}
			</p>
			{children}
		</div>
	</div>
);

const formatPopulation = (value: number) =>
	value >= 1_000_000
		? `${(value / 1_000_000).toFixed(1)}M`
		: value >= 1_000
		? `${(value / 1_000).toFixed(0)}K`
		: value.toString();

const formatSigned = (value: number) =>
	value.toLocaleString("en-US", { signDisplay: "always" });

export function PopulationMetricsCard({
	isLoading,
	isError,
	error,
	data,
}: PopulationMetricsCardProps) {
	if (isLoading)
		return (
			<Card className="w-full max-w-3xl">
				<CardHeader>
					<Skeleton className="h-6 w-1/2" />
					<Skeleton className="h-4 w-3/4 mt-2" />
				</CardHeader>
				<CardContent>
					<Skeleton className="h-[600px] w-full" />
				</CardContent>
			</Card>
		);
	if (isError)
		return (
			<Alert variant="destructive" className="w-full max-w-3xl">
				<AlertCircle className="h-4 w-4" />
				<AlertTitle>Error</AlertTitle>
				<AlertDescription>
					{error?.message || "Could not fetch data."}
				</AlertDescription>
			</Alert>
		);
	if (!data)
		return (
			<Card className="w-full max-w-3xl border-dashed">
				<CardHeader className="text-center">
					<div className="mx-auto bg-secondary rounded-full p-3 w-fit">
						<TrendingUp className="h-8 w-8 text-muted-foreground" />
					</div>
					<CardTitle className="mt-2">Population Metrics</CardTitle>
					<CardDescription>
						Enter an address to generate a population card.
					</CardDescription>
				</CardHeader>
			</Card>
		);

	const {
		growth,
		population_density,
		population_trends,
		migration,
		natural_increase,
		housing,
		sex_distribution,
	} = data;

	const ageData = [
		{ name: "Under 18", value: data.age_distribution.under_18 },
		{ name: "18-34", value: data.age_distribution._18_to_34 },
		{ name: "35-64", value: data.age_distribution._35_to_64 },
		{ name: "65+", value: data.age_distribution.over_65 },
	];
	const tenureValue = housing.percent_renter_occupied;
	const tenureData =
		tenureValue != null
			? [
					{ name: "Renters", value: tenureValue },
					{ name: "Owners", value: 100 - tenureValue },
			  ]
			: [];

	const sexData =
		sex_distribution &&
		sex_distribution.male != null &&
		sex_distribution.female != null
			? [
					{ name: "Male", value: sex_distribution.male },
					{ name: "Female", value: sex_distribution.female },
			  ]
			: [];
	const TENURE_COLORS = ["hsl(var(--primary))", "hsl(var(--muted))"];

	const projectionKey = "Projection";
    const chartDataMap = new Map();

    population_trends.trend.forEach((p) => {
        chartDataMap.set(p.year, { year: p.year, [data.geography_name]: p.population });
    });

    // Manually construct projection data to ensure the line connects correctly
    if (population_trends.trend.length > 0 && population_trends.projection.length > 0) {
        const lastTrendPoint = population_trends.trend.at(-1)!;
        chartDataMap.get(lastTrendPoint.year)[projectionKey] = lastTrendPoint.population;
        population_trends.projection.forEach((p) => {
            chartDataMap.set(p.year, { year: p.year, [projectionKey]: p.population });
        });
    }

    const trendData = Array.from(chartDataMap.values()).sort((a, b) => a.year - b.year);

	let allTicks: number[] | undefined = undefined;
	if (trendData.length > 0) {
		const allYearsOnChart = trendData.map((d) => d.year);
		const minYear = Math.min(...allYearsOnChart);
		const maxYear = Math.max(...allYearsOnChart);
		if (isFinite(minYear) && isFinite(maxYear)) {
			allTicks = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i);
		}
	}

	const growthMetric = growth.cagr;
	const growthLabel = `${growth.period_years}-Yr CAGR`;
	const growthColor =
		growthMetric != null && growthMetric > 0
			? "text-green-600"
			: "text-red-600";

	const inflowOutflowData = migration
		? [
				{
					name: "Inflows",
					value: migration.inflows,
					fill: "hsl(var(--chart-1))",
				},
				{
					name: "Outflows",
					value: migration.outflows,
					fill: "hsl(var(--chart-2))",
				},
		  ]
		: [];

	const domesticIntlData = migration
		? [
				{ name: "Domestic", value: migration.domestic_migration, fill: "hsl(var(--chart-3))" },
				{ name: "International", value: migration.international_migration, fill: "hsl(var(--chart-4))" },
		  ]
		: [];

	const naturalIncreaseData = natural_increase
		? [
				{ name: "Births", value: natural_increase.births },
				{ name: "Deaths", value: natural_increase.deaths },
		  ]
		: [];

	return (
		<Card className="w-full">
			<CardHeader>
				<CardTitle>
					Metrics for{" "}
					<span className="text-primary">{data.search_address}</span>
				</CardTitle>
				<CardDescription>
					{data.geography_name} (tract, {data.data_year} ACS Data)
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<Tabs defaultValue="overview">
					<TabsList className="grid w-full grid-cols-5">
						<TabsTrigger value="overview">Overview</TabsTrigger>
						<TabsTrigger value="drivers">Drivers</TabsTrigger>
						<TabsTrigger value="demographics">
							Demographics
						</TabsTrigger>
						<TabsTrigger value="housing">Housing</TabsTrigger>
						<TabsTrigger value="map">Map View</TabsTrigger>
					</TabsList>

					<TabsContent value="overview" className="mt-6">
						<div className="space-y-8">
							<div className="grid grid-cols-2 md:grid-cols-3 gap-6">
								<StatItem
									icon={Users}
									label="Population"
									value={data.total_population.toLocaleString()}
								/>
								<StatItem
									icon={
										growthMetric != null && growthMetric > 0
											? TrendingUp
											: TrendingDown
									}
									label={growthLabel}
									value={growthMetric}
									unit="%"
									className={growthColor}
								>
									{growth.absolute_change != null && (
										<p className="text-xs text-muted-foreground">
											{formatSigned(
												growth.absolute_change
											)}{" "}
											people
										</p>
									)}
								</StatItem>
								<StatItem
									icon={MapPin}
									label="Density"
									value={population_density.people_per_sq_mile.toLocaleString(
										undefined,
										{ maximumFractionDigits: 1 }
									)}
									unit={
										<>
											/mi²{" "}
											{population_density.change_over_period !=
												null && (
												<span
													className={
														population_density.change_over_period >
														0
															? "text-green-600"
															: "text-red-600"
													}
												>
													<TrendingUp
														size={12}
														className="inline ml-1"
													/>
												</span>
											)}
										</>
									}
								/>
								<StatItem
									icon={Footprints}
									label="Walk Score®"
									value={data.walkability?.walk_score}
								/>
								<StatItem
									icon={Train}
									label="Transit Score®"
									value={data.walkability?.transit_score}
								/>
								<StatItem
									icon={Cake}
									label="Median Age"
									value={data.median_age}
								/>
							</div>
							<div>
								<h3 className="text-md font-semibold mb-2">
									Population Trend & Projection
								</h3>
								<div className="h-64 w-full">
									<ResponsiveContainer
										width="100%"
										height="100%"
									>
										<LineChart data={trendData}>
											<CartesianGrid strokeDasharray="3 3" />
											<XAxis
												dataKey="year"
												type="number"
												domain={["dataMin", "dataMax"]}
												ticks={allTicks}
												allowDecimals={false}
											/>
											<YAxis
												tickFormatter={formatPopulation}
											/>
											<Tooltip
												formatter={(value: number) =>
													value.toLocaleString()
												}
											/>
											<Legend />
											<Line
												type="monotone"
												dataKey={data.geography_name}
												connectNulls
												stroke="black"
												strokeWidth={2}
												dot={{ r: 2 }}
												activeDot={{ r: 4 }}
											/>
											{population_trends.projection.length > 0 && (
												<Line
													type="monotone"
													dataKey={projectionKey}
													connectNulls
													stroke="red"
													strokeWidth={2}
													strokeDasharray="5 5"
													dot={{ r: 2 }}
													activeDot={{ r: 4 }}
												/>
											)}
										</LineChart>
									</ResponsiveContainer>
								</div>
							</div>
							{sexData.length > 0 && (
								<div>
									<h3 className="text-md font-semibold mb-2">
										Sex Distribution
									</h3>
									<div className="h-64 w-full">
										<ResponsiveContainer
											width="100%"
											height="100%"
										>
											<PieChart>
												<Pie
													data={sexData}
													dataKey="value"
													nameKey="name"
													cx="50%"
													cy="50%"
													outerRadius={80}
													label={(
														props: PieLabelRenderProps
													) =>
														`${(
															(props.percent ??
																0) * 100
														).toFixed(1)}%`
													}
												>
													<Cell fill="hsl(var(--chart-2))" />
													<Cell fill="hsl(var(--chart-4))" />
												</Pie>
												<Legend />
												<Tooltip
													formatter={(
														value: number
													) => value.toLocaleString()}
												/>
											</PieChart>
										</ResponsiveContainer>
									</div>
								</div>
							)}
						</div>
					</TabsContent>

					<TabsContent value="drivers" className="mt-6">
						{migration && natural_increase ? (
							<div className="space-y-8">
								<div>
									<h3 className="text-md font-semibold mb-2">
										Migration Drivers (County)
									</h3>
									<div className="grid md:grid-cols-2 gap-8 items-center h-64">
										<div className="h-full w-full">
											<ResponsiveContainer
												width="100%"
												height="100%"
											>
												<BarChart
													data={inflowOutflowData}
													margin={{ left: 10 }}
												>
													<CartesianGrid strokeDasharray="3 3" />
													<XAxis
														dataKey="name"
														tickLine={false}
														axisLine={false}
													/>
													<YAxis />
													<Tooltip
														cursor={{
															fill: "hsl(var(--muted))",
														}}
														formatter={(
															value: number
														) => value.toLocaleString()}
													/>
													<Bar
														dataKey="value"
														radius={[4, 4, 0, 0]}
													>
														{inflowOutflowData.map(
															(entry, index) => (
																<Cell
																	key={`cell-${index}`}
																	fill={
																		entry.fill
																	}
																/>
															)
														)}
													</Bar>
												</BarChart>
											</ResponsiveContainer>
										</div>
										<div className="h-full w-full">
											<ResponsiveContainer
												width="100%"
												height="100%"
											>
												<BarChart
													data={domesticIntlData}
													margin={{ left: 10 }}
												>
													<CartesianGrid strokeDasharray="3 3" />
													<XAxis
														dataKey="name"
														tickLine={false}
														axisLine={false}
													/>
													<YAxis />
													<Tooltip
														cursor={{
															fill: "hsl(var(--muted))",
														}}
														formatter={(
															value: number
														) => value.toLocaleString()}
													/>
													<Bar
														dataKey="value"
														fill="hsl(var(--chart-3))"
														radius={[4, 4, 0, 0]}
													>
														<Cell fill="hsl(var(--chart-3))" />
														<Cell fill="hsl(var(--chart-4))" />
													</Bar>
												</BarChart>
											</ResponsiveContainer>
										</div>
									</div>
								</div>
								<div>
									<h3 className="text-md font-semibold mb-2">
										Natural Increase (County)
									</h3>
									<div className="h-64 w-full">
										<ResponsiveContainer
											width="100%"
											height="100%"
										>
											<BarChart
												data={naturalIncreaseData}
												margin={{ left: 10 }}
											>
												<CartesianGrid strokeDasharray="3 3" />
												<XAxis
													dataKey="name"
													tickLine={false}
													axisLine={false}
												/>
												<YAxis />
												<Tooltip
													cursor={{
														fill: "hsl(var(--muted))",
													}}
													formatter={(
														value: number
													) => value.toLocaleString()}
												/>
												<Bar
													dataKey="value"
													radius={[4, 4, 0, 0]}
												>
													<Cell fill="hsl(var(--chart-1))" />
													<Cell fill="hsl(var(--chart-5))" />
												</Bar>
											</BarChart>
										</ResponsiveContainer>
									</div>
								</div>
							</div>
						) : (
							<div className="flex h-64 items-center justify-center">
								<p className="text-muted-foreground">
									County-level driver data not available.
								</p>
							</div>
						)}
					</TabsContent>

					<TabsContent value="demographics" className="mt-6">
						<div className="space-y-8">
							<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
								<StatItem
									icon={DollarSign}
									label="Median Income"
									value={
										data.demographics
											.median_household_income
											? `$${data.demographics.median_household_income.toLocaleString()}`
											: "N/A"
									}
								/>
								<StatItem
									icon={GraduationCap}
									label="Bachelor's+"
									value={
										data.demographics
											.percent_bachelors_or_higher
									}
									unit="%"
								/>
								<StatItem
									icon={Users2}
									label="Avg. Household Size"
									value={data.demographics.avg_household_size}
									unit="people"
								/>
							</div>
							<div>
								<h3 className="text-md font-semibold mb-2">
									Age Distribution
								</h3>
								<div className="h-64 w-full">
									<ResponsiveContainer
										width="100%"
										height="100%"
									>
										<BarChart
											data={ageData}
											layout="vertical"
											margin={{ left: 10 }}
										>
											<CartesianGrid
												strokeDasharray="3 3"
												horizontal={false}
											/>
											<XAxis
												type="number"
												tickFormatter={formatPopulation}
											/>
											<YAxis
												type="category"
												dataKey="name"
												width={50}
												tickLine={false}
												axisLine={false}
											/>
											<Tooltip
												cursor={{
													fill: "hsl(var(--muted))",
												}}
												formatter={(value: number) =>
													value.toLocaleString()
												}
											/>
											<Bar
												dataKey="value"
												fill="hsl(var(--primary))"
												radius={[0, 4, 4, 0]}
											/>
										</BarChart>
									</ResponsiveContainer>
								</div>
							</div>
						</div>
					</TabsContent>

					<TabsContent value="housing" className="mt-6">
						<div className="space-y-8">
							<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
								<StatItem
									icon={Home}
									label="Renter Occupied"
									value={housing.percent_renter_occupied}
									unit="%"
								/>
								<StatItem
									icon={Building}
									label="Median Home Value"
									value={
										housing.median_home_value
											? `$${housing.median_home_value.toLocaleString()}`
											: "N/A"
									}
								/>
								<StatItem
									icon={DollarSign}
									label="Median Gross Rent"
									value={
										housing.median_gross_rent
											? `$${housing.median_gross_rent.toLocaleString()}`
											: "N/A"
									}
								/>
							</div>
							<div>
								<h3 className="text-md font-semibold mb-2">
									Housing Tenure
								</h3>
								<div className="h-64 w-full">
									{tenureData.length > 0 ? (
										<ResponsiveContainer
											width="100%"
											height="100%"
										>
											<PieChart>
												<Pie
													data={tenureData}
													dataKey="value"
													nameKey="name"
													cx="50%"
													cy="50%"
													outerRadius={80}
													label
												>
													{tenureData.map(
														(entry, index) => (
															<Cell
																key={`cell-${index}`}
																fill={
																	TENURE_COLORS[
																		index %
																			TENURE_COLORS.length
																	]
																}
															/>
														)
													)}
												</Pie>
												<Legend />
												<Tooltip
													formatter={(
														value: number
													) => `${value.toFixed(1)}%`}
												/>
											</PieChart>
										</ResponsiveContainer>
									) : (
										<div className="flex items-center justify-center h-full text-muted-foreground">
											Data not available.
										</div>
									)}
								</div>
							</div>
						</div>
					</TabsContent>

					<TabsContent value="map" className="mt-6">
						<div className="h-96 w-full rounded-lg overflow-hidden">
							<DynamicMap
								lat={data.coordinates.lat}
								lon={data.coordinates.lon}
								area={data.tract_area_sq_meters}
								interactive
							/>
						</div>
					</TabsContent>
				</Tabs>
			</CardContent>
		</Card>
	);
}
