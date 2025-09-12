import {
	LineChart,
	Line,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	Legend,
	ResponsiveContainer,
} from "recharts";
import type { AddressEntry } from "@lib/types";

const COLORS = [
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

// This function transforms the data into a format Recharts can use for a multi-line chart.
const transformDataForChart = (addresses: AddressEntry[]) => {
	const yearMap = new Map<number, Record<string, number | string>>();

	addresses.forEach((addr) => {
		if (!addr.data || !addr.data.population_trend) return;
		// Use the full geography name as the key
		const seriesKey = addr.data.geography_name;

		// Explicitly type the point parameter to fix the 'any' error
		addr.data.population_trend.forEach(
			(point: { year: number; population: number }) => {
				if (!yearMap.has(point.year)) {
					yearMap.set(point.year, { year: point.year });
				}
				yearMap.get(point.year)![seriesKey] = point.population;
			}
		);
	});

	return Array.from(yearMap.values()).sort(
		(a, b) => (a.year as number) - (b.year as number)
	);
};

export function ComparisonChart({ addresses }: { addresses: AddressEntry[] }) {
	const chartData = transformDataForChart(addresses);
	// Get the unique series keys (geography names) from the successful addresses
	const seriesKeys = addresses
		.filter((addr) => addr.data?.geography_name)
		.map((addr) => addr.data!.geography_name);

	if (addresses.length < 1) {
		return (
			<div className="flex items-center justify-center h-full text-muted-foreground">
				Add and fetch data for at least one address to see a chart.
			</div>
		);
	}

	return (
		<ResponsiveContainer width="100%" height="100%">
			<LineChart
				data={chartData}
				margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
			>
				<CartesianGrid strokeDasharray="3 3" />
				<XAxis dataKey="year" />
				<YAxis tickFormatter={formatPopulation} />
				<Tooltip
					formatter={(value: number) => value.toLocaleString()}
					cursor={{ fill: "hsl(var(--muted))" }}
					contentStyle={{
						background: "hsl(var(--background))",
						border: "1px solid hsl(var(--border))",
						borderRadius: "var(--radius)",
					}}
				/>
				<Legend />
				{seriesKeys.map((key, index) => (
					<Line
						key={key}
						type="monotone"
						dataKey={key}
						stroke={COLORS[index % COLORS.length]}
						strokeWidth={2}
						dot={{ r: 4 }}
						activeDot={{ r: 8 }}
					/>
				))}
			</LineChart>
		</ResponsiveContainer>
	);
}
