import {
	LineChart,
	Line,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	Legend,
	ResponsiveContainer,
	BarChart,
	Bar,
} from "recharts";
import type { AddressEntry } from "@lib/types";

const COLORS = [
	"hsl(var(--chart-1))",
	"hsl(var(--chart-2))",
	"hsl(var(--chart-3))",
	"hsl(var(--chart-4))",
	"hsl(var(--chart-5))",
];
const OLD_COLORS = [
	"#8884d8",
	"#82ca9d",
	"#ffc658",
	"#ff8042",
	"#0088FE",
	"#00C49F",
	"#FFBB28",
];

const formatPopulation = (value: number) => {
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
	return value.toString();
};

const transformDataForChart = (addresses: AddressEntry[]) => {
	const yearMap = new Map<number, Record<string, number | string>>();

	addresses.forEach((addr) => {
		if (!addr.data || !addr.data.population_trends) return;
		const seriesKey = addr.data.geography_name;

		const allPoints = [
			...addr.data.population_trends.trend,
			...addr.data.population_trends.projection,
		];

		allPoints.forEach(
			(point: { year: number; population: number }) => {
				if (!yearMap.has(point.year)) {
					yearMap.set(point.year, { year: point.year.toString() });
				}
				yearMap.get(point.year)![seriesKey] = point.population;
			}
		);
	});

	return Array.from(yearMap.values()).sort(
		(a, b) => parseInt(a.year as string) - parseInt(b.year as string)
	);
};

const transformDataForBarChart = (
	addresses: AddressEntry[],
	metric: "demographics" | "housing"
) => {
	if (metric === "demographics") {
		return [
			{
				metric: "Median Income",
				...Object.fromEntries(
					addresses.map((addr) => [
						addr.data!.geography_name,
						addr.data!.demographics.median_household_income,
					])
				),
			},
			{
				metric: "Median Age",
				...Object.fromEntries(
					addresses.map((addr) => [
						addr.data!.geography_name,
						addr.data!.median_age,
					])
				),
			},
		];
	}
	if (metric === "housing") {
		return [
			{
				metric: "% Renter Occupied",
				...Object.fromEntries(
					addresses.map((addr) => [
						addr.data!.geography_name,
						addr.data!.demographics.percent_renter_occupied,
					])
				),
			},
			{
				metric: "Density (per sq mi)",
				...Object.fromEntries(
					addresses.map((addr) => [
						addr.data!.geography_name,
						addr.data!.population_density.people_per_sq_mile,
					])
				),
			},
		];
	}
	return [];
};

const CustomTooltip = ({ active, payload, label }: any) => {
	if (active && payload && payload.length) {
		return (
			<div className="rounded-lg border bg-background p-2 shadow-sm">
				<p className="text-sm font-medium">{label}</p>
				{payload.map((pld: any) => (
					<div key={pld.dataKey} style={{ color: pld.color }} className="text-sm">
						{pld.dataKey}: {pld.value?.toLocaleString()}
					</div>
				))}
			</div>
		);
	}
	return null;
};


export function ComparisonChart({
	addresses,
	metric,
}: {
	addresses: AddressEntry[];
	metric: "population_trend" | "demographics" | "housing";
}) {
	if (addresses.length < 1) {
		return (
			<div className="flex items-center justify-center h-full text-muted-foreground">
				Add and fetch data for at least one address to see charts.
			</div>
		);
	}

	const seriesKeys = addresses.map((addr) => addr.data!.geography_name);

	if (metric === "population_trend") {
		const chartData = transformDataForChart(addresses);
		return (
			<ResponsiveContainer width="100%" height="100%">
				<LineChart
					data={chartData}
					margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
				>
					<CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
					<XAxis dataKey="year" stroke="hsl(var(--muted-foreground))" fontSize={12} />
					<YAxis
						tickFormatter={formatPopulation}
						stroke="hsl(var(--muted-foreground))"
						fontSize={12}
					/>
					<Tooltip content={<CustomTooltip />} />
					<Legend />
					{seriesKeys.map((key, index) => (
						<Line
							key={key}
							type="monotone"
							dataKey={key}
							stroke={COLORS[index % COLORS.length]}
							strokeWidth={2}
							dot={{ r: 2 }}
							activeDot={{ r: 6 }}
						/>
					))}
				</LineChart>
			</ResponsiveContainer>
		);
	}

	const barChartData = transformDataForBarChart(addresses, metric);

	return (
		<div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
			{barChartData.map((data, idx) => (
				<div key={idx} className="flex flex-col">
					<h3 className="text-center font-semibold mb-2">{data.metric}</h3>
					<div className="flex-grow">
						<ResponsiveContainer width="100%" height="100%">
							<BarChart
								data={[data]}
								layout="vertical"
								margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
							>
								<CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
								<XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
								<YAxis
									type="category"
									dataKey="metric"
									hide
								/>
								<Tooltip content={<CustomTooltip />} />
								<Legend />
								{seriesKeys.map((key, index) => (
									<Bar
										key={key}
										dataKey={key}
										fill={COLORS[index % COLORS.length]}
									/>
								))}
							</BarChart>
						</ResponsiveContainer>
					</div>
				</div>
			))}
		</div>
	)
}
