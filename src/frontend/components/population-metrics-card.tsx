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
	Briefcase,
	Clock,
	House,
} from "lucide-react";
import type { PopulationDataResponse } from "@lib/schemas";
import { cn } from "@lib/utils";
import DynamicMap from "@components/dynamic-map";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@components/ui/tooltip";

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
	tooltip,
}: {
	icon: React.ElementType;
	label: string;
	value: React.ReactNode;
	unit?: React.ReactNode;
	className?: string;
	children?: React.ReactNode;
	tooltip?: React.ReactNode;
}) => {
	const content = (
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

	if (!tooltip) {
		return content;
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className="cursor-help">{content}</div>
			</TooltipTrigger>
			<TooltipContent>
				<p className="max-w-xs">{tooltip}</p>
			</TooltipContent>
		</Tooltip>
	);
};

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
		demographics,
		economic_context,
		sex_distribution,
	} = data;

	const ageData = [
		{ name: "Under 18", value: data.age_distribution.under_18 },
		{ name: "18-34", value: data.age_distribution._18_to_34 },
		{ name: "35-64", value: data.age_distribution._35_to_64 },
		{ name: "65+", value: data.age_distribution.over_65 },
	];

	const householdData = demographics.household_composition ? [
		{ name: "Family", value: demographics.household_composition.percent_family_households ?? 0 },
		{ name: "Non-Family", value: demographics.household_composition.percent_non_family_households ?? 0 },
	] : [];

	const raceData = demographics.race_and_ethnicity ? [
		{ name: "White", value: demographics.race_and_ethnicity.percent_white_non_hispanic ?? 0 },
		{ name: "Black", value: demographics.race_and_ethnicity.percent_black_non_hispanic ?? 0 },
		{ name: "Asian", value: demographics.race_and_ethnicity.percent_asian_non_hispanic ?? 0 },
		{ name: "Hispanic", value: demographics.race_and_ethnicity.percent_hispanic ?? 0 },
		{ name: "Other", value: demographics.race_and_ethnicity.percent_other_non_hispanic ?? 0 },
	] : [];
	const RACE_COLORS = [
		"hsl(var(--chart-1))",
		"hsl(var(--chart-2))",
		"hsl(var(--chart-3))",
		"hsl(var(--chart-4))",
		"hsl(var(--chart-5))",
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
		<TooltipProvider>
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
					<TabsList className="grid w-full grid-cols-4">
						<TabsTrigger value="overview">Overview</TabsTrigger>
						<TabsTrigger value="demographics">
							Demographics
						</TabsTrigger>
						<TabsTrigger value="economics">Economics & Drivers</TabsTrigger>
						<TabsTrigger value="housing">Housing</TabsTrigger>
					</TabsList>

					<TabsContent value="overview" className="mt-6">
						<div className="space-y-8">
							<div className="grid grid-cols-2 md:grid-cols-3 gap-6">
								<StatItem
									icon={Users}
									label="Population"
									value={data.total_population.toLocaleString()}
									tooltip={`The total number of residents in the census tract. Source: U.S. Census Bureau, ${data.data_year} American Community Survey (ACS) 5-Year Estimates, Table B01003. Includes projections based on county-level trends.`}
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
									tooltip={`Compound Annual Growth Rate. This is the average annual growth rate of the tract's population over the past ${growth.period_years} years. Derived from historical ACS 5-Year population data.`}
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
									tooltip={`Population per square mile. Calculated by dividing the total population by the land area of the census tract. Land area is from the U.S. Census Bureau's GeoInfo Data (${data.data_year}).`}
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
									tooltip="A score from 0-100 that measures the walkability of an address. Higher scores indicate that daily errands do not require a car. Data provided by Walk Score®."
								/>
								<StatItem
									icon={Train}
									label="Transit Score®"
									value={data.walkability?.transit_score}
									tooltip="A score from 0-100 that measures how well an address is served by public transit. Data provided by Walk Score®."
								/>
								<StatItem
									icon={Cake}
									label="Median Age"
									value={data.median_age}
									tooltip={`The median age of all residents in the census tract. Source: U.S. Census Bureau, ${data.data_year} ACS 5-Year Estimates, Table B01002.`}
								/>
							</div>
							<div>
								<Tooltip>
									<TooltipTrigger asChild>
										<h3 className="text-md font-semibold mb-2 cursor-help w-fit">
											Population Trend & Projection
										</h3>
									</TooltipTrigger>
									<TooltipContent>
										<p className="max-w-xs">
											Historical population data is from
											ACS 5-Year Estimates. Projections
											are calculated by applying the
											county's average historical growth
											rate to the tract's most recent
											population figure.
										</p>
									</TooltipContent>
								</Tooltip>
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
							<div>
								<Tooltip>
									<TooltipTrigger asChild>
										<h3 className="text-md font-semibold mb-2 cursor-help w-fit">Map View</h3>
									</TooltipTrigger>
									<TooltipContent>The approximate boundary of the census tract is shown in blue.</TooltipContent>
								</Tooltip>
								<div className="h-96 w-full rounded-lg overflow-hidden">
									<DynamicMap lat={data.coordinates.lat} lon={data.coordinates.lon} area={data.tract_area_sq_meters} interactive />
								</div>
							</div>
						</div>
					</TabsContent>

					<TabsContent value="demographics" className="mt-6">
						<div className="space-y-8">
							<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
								<StatItem
									icon={DollarSign}
									label="Median Income"
									value={demographics
											.median_household_income
											? `$${demographics.median_household_income.toLocaleString()}`
											: "N/A"
									}
									tooltip={`The median household income in the past 12 months (in ${data.data_year} inflation-adjusted dollars). Source: U.S. Census Bureau, ${data.data_year} ACS 5-Year Estimates, Table B19013.`}
								/>
								<StatItem
									icon={GraduationCap}
									label="Bachelor's+"
									value={demographics
											.percent_bachelors_or_higher
									}
									unit="%"
									tooltip={`The percentage of the population aged 25 and over that holds a bachelor's degree or higher. Derived from U.S. Census Bureau, ${data.data_year} ACS 5-Year Estimates, Table B15003.`}
								/>
								<StatItem
									icon={Users2}
									label="Avg. Household Size"
									value={demographics.avg_household_size}
									unit="people"
									tooltip={`The average number of people per household. Source: U.S. Census Bureau, ${data.data_year} ACS 5-Year Estimates, Table B25010.`}
								/>
							</div>
							<div>
								<Tooltip>
									<TooltipTrigger asChild>
										<h3 className="text-md font-semibold mb-2 cursor-help w-fit">
											Age Distribution
										</h3>
									</TooltipTrigger>
									<TooltipContent>
										<p className="max-w-xs">
											The number of people in different age
											groups within the tract. Source:
											U.S. Census Bureau, {data.data_year} ACS 5-Year Estimates, Table B01001.
										</p>
									</TooltipContent>
								</Tooltip>
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
							{sexData.length > 0 && (
								<div>
									<Tooltip>
										<TooltipTrigger asChild>
											<h3 className="text-md font-semibold mb-2 cursor-help w-fit">
												Sex Distribution
											</h3>
										</TooltipTrigger>
										<TooltipContent>
											<p className="max-w-xs">
												The number of male and female residents
												in the tract. Source: U.S. Census Bureau,
												{data.data_year} ACS 5-Year Estimates, Table B01001.
											</p>
										</TooltipContent>
									</Tooltip>
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
							{householdData.length > 0 && (
								<div>
									<Tooltip>
										<TooltipTrigger asChild>
											<h3 className="text-md font-semibold mb-2 cursor-help w-fit">
												Household Composition
											</h3>
										</TooltipTrigger>
										<TooltipContent>
											<p className="max-w-xs">
												The breakdown of family vs. non-family households. Source: U.S. Census Bureau, {data.data_year} ACS 5-Year Estimates, Table B11001.
											</p>
										</TooltipContent>
									</Tooltip>
									<div className="h-64 w-full">
										<ResponsiveContainer width="100%" height="100%">
											<PieChart>
												<Pie data={householdData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
													<Cell fill="hsl(var(--chart-1))" />
													<Cell fill="hsl(var(--chart-3))" />
												</Pie>
												<Legend />
												<Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
											</PieChart>
										</ResponsiveContainer>
									</div>
								</div>
							)}
							{raceData.length > 0 && (
								<div>
									<Tooltip>
										<TooltipTrigger asChild>
											<h3 className="text-md font-semibold mb-2 cursor-help w-fit">
												Race & Ethnicity
											</h3>
										</TooltipTrigger>
										<TooltipContent>
											<p className="max-w-xs">
												The racial and ethnic breakdown of the tract population. "Other" includes American Indian, Pacific Islander, Other, and Two or More Races. Source: U.S. Census Bureau, {data.data_year} ACS 5-Year Estimates, Table B03002.
											</p>
										</TooltipContent>
									</Tooltip>
									<div className="h-64 w-full">
										<ResponsiveContainer width="100%" height="100%">
											<PieChart>
												<Pie data={raceData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(props: PieLabelRenderProps) => `${((props.percent ?? 0) * 100).toFixed(0)}%`}>
													{raceData.map((entry, index) => (
														<Cell key={`cell-${index}`} fill={RACE_COLORS[index % RACE_COLORS.length]} />
													))}
												</Pie>
												<Legend />
												<Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
											</PieChart>
										</ResponsiveContainer>
									</div>
								</div>
							)}
						</div>
					</TabsContent>

					<TabsContent value="economics" className="mt-6">
						<div className="space-y-8">
							<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
								<StatItem icon={TrendingDown} label="Poverty Rate" value={economic_context?.poverty_rate} unit="%" tooltip={`Percentage of the population with income in the past 12 months below the poverty level. Source: U.S. Census Bureau, ${data.data_year} ACS 5-Year Subject Tables, Table S1701.`} />
								<StatItem icon={Briefcase} label="Labor Force Participation" value={economic_context?.labor_force_participation_rate} unit="%" tooltip={`The percentage of the population aged 16 and over that is in the labor force (either employed or unemployed but looking for work). Source: U.S. Census Bureau, ${data.data_year} ACS 5-Year Estimates, Table B23025.`} />
								<StatItem icon={Clock} label="Mean Commute" value={economic_context?.mean_commute_time_minutes?.toFixed(1)} unit="min" tooltip={`The average travel time to work for workers 16 years and over who did not work from home. Source: U.S. Census Bureau, ${data.data_year} ACS 5-Year Data Profiles, Table DP03.`} />
							</div>
							{migration && (
								<div>
									<Tooltip>
										<TooltipTrigger asChild>
											<h3 className="text-md font-semibold mb-2 cursor-help w-fit">
												Migration Drivers (County)
											</h3>
										</TooltipTrigger>
										<TooltipContent>
											<p className="max-w-xs">
												Components of population change at
												the county level. "Inflows" and
												"Outflows" are from the 2022 ACS
												5-Year Flows data. "Domestic" and
												"International" migration are from
												the 2019 Census Population
												Estimates Program (PEP).
											</p>
										</TooltipContent>
									</Tooltip>
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
							)}
							{natural_increase && (
								<div>
									<Tooltip>
										<TooltipTrigger asChild>
											<h3 className="text-md font-semibold mb-2 cursor-help w-fit">
												Natural Increase (County)
											</h3>
										</TooltipTrigger>
										<TooltipContent>
											<p className="max-w-xs">
												Components of population change at
												the county level, showing the
												difference between births and
												deaths. Source: 2019 Census
												Population Estimates Program
												(PEP).
											</p>
										</TooltipContent>
									</Tooltip>
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
							)}
						</div>
					</TabsContent>

					<TabsContent value="housing" className="mt-6">
						<div className="space-y-8">
							<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
								<StatItem
									icon={Home}
									label="Renter Occupied"
									value={housing.percent_renter_occupied?.toFixed(1)}
									unit="%"
									tooltip={`The percentage of occupied housing units that are renter-occupied. Derived from U.S. Census Bureau, ${data.data_year} ACS 5-Year Estimates, Table B25003.`}
								/>
								<StatItem
									icon={Building}
									label="Median Home Value"
									value={
										housing.median_home_value
											? `$${housing.median_home_value.toLocaleString()}`
											: "N/A"
									}
									tooltip={`The median value of owner-occupied housing units. Source: U.S. Census Bureau, ${data.data_year} ACS 5-Year Estimates, Table B25077.`}
								/>
								<StatItem
									icon={DollarSign}
									label="Median Gross Rent"
									value={
										housing.median_gross_rent
											? `$${housing.median_gross_rent.toLocaleString()}`
											: "N/A"
									}
									tooltip={`The median gross rent for renter-occupied units. Source: U.S. Census Bureau, ${data.data_year} ACS 5-Year Estimates, Table B25064.`}
								/>
								<StatItem icon={Building} label="Median Year Built" value={housing.median_year_structure_built} tooltip={`The median year in which housing structures in the tract were built. Source: U.S. Census Bureau, ${data.data_year} ACS 5-Year Estimates, Table B25035.`} />
								<StatItem icon={House} label="Overall Vacancy" value={housing.vacancy_rate} unit="%" tooltip={`The percentage of all housing units that are vacant. Source: U.S. Census Bureau, ${data.data_year} ACS 5-Year Estimates, Table B25002.`} />
								<StatItem icon={House} label="Rental Vacancy" value={housing.rental_vacancy_rate} unit="%" tooltip={`The percentage of rental units (occupied + for rent) that are vacant. Source: U.S. Census Bureau, ${data.data_year} ACS 5-Year Estimates, Tables B25003 & B25004.`} />

							</div>
							<div>
								<Tooltip>
									<TooltipTrigger asChild>
										<h3 className="text-md font-semibold mb-2 cursor-help w-fit">
											Housing Tenure
										</h3>
									</TooltipTrigger>
									<TooltipContent>
										<p className="max-w-xs">
											The percentage of occupied housing
											units that are owner-occupied versus
											renter-occupied. Derived from U.S.
											Census Bureau, {data.data_year} ACS
											5-Year Estimates, Table B25003.
										</p>
									</TooltipContent>
								</Tooltip>
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

				</Tabs>
			</CardContent>
			</Card>
		</TooltipProvider>
	);
}
