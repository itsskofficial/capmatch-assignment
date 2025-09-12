import { z } from "zod";

// Schema for the form validation
export const marketDataRequestSchema = z.object({
	address: z.string().min(10, { message: "Please enter a valid address." }),
});
export type MarketDataRequest = z.infer<typeof marketDataRequestSchema>;

// --- API Response Schemas ---
const populationTrendPointSchema = z.object({
	year: z.number(),
	population: z.number(),
	is_projection: z.boolean().optional().default(false)
});

const ageDistributionSchema = z.object({
	under_18: z.number(),
	_18_to_34: z.number(),
	_35_to_64: z.number(),
	over_65: z.number(),
});

const walkabilityScoresSchema = z
	.object({
		walk_score: z.number().nullable().optional(),
		walk_score_description: z.string().nullable().optional(),
		transit_score: z.number().nullable().optional(),
		transit_score_description: z.string().nullable().optional(),
	})
	.nullable()
	.optional();

const benchmarkDataSchema = z
	.object({
		county_trend: z.array(populationTrendPointSchema),
		state_trend: z.array(populationTrendPointSchema),
		national_trend: z.array(populationTrendPointSchema),
	})
	.nullable()
	.optional();

const demographicsSchema = z.object({
	median_household_income: z.number().nullable(),
	percent_bachelors_or_higher: z.number().nullable(),
	percent_renter_occupied: z.number().nullable(),
});

const coordinatesSchema = z.object({
	lat: z.number(),
	lon: z.number(),
});

const growthMetricsSchema = z.object({
	period_years: z.number(),
	cagr: z.number().nullable(),
	yoy_growth: z.number().nullable(),
	absolute_change: z.number().nullable(),
});

const migrationDataSchema = z
	.object({
		net_migration: z.number(),
		net_migration_rate: z.number(),
		domestic_migration: z.number(),
		international_migration: z.number(),
	})
	.nullable()
	.optional();

const naturalIncreaseDataSchema = z
	.object({
		births: z.number(),
		deaths: z.number(),
		natural_change: z.number(),
		natural_increase_rate: z.number(),
	})
	.nullable()
	.optional();

const populationDensitySchema = z.object({
	people_per_sq_mile: z.number(),
	change_over_period: z.number().nullable(),
});

const populationTrendSchema = z.object({
	trend: z.array(populationTrendPointSchema),
	projection: z.array(populationTrendPointSchema),
	benchmark: benchmarkDataSchema,
});

export const populationDataResponseSchema = z.object({
	search_address: z.string(),
	data_year: z.number(),
	geography_name: z.string(),
	geography_level: z.enum(["tract", "county"]),
	coordinates: coordinatesSchema,
	tract_area_sq_meters: z.number(),
	total_population: z.number(),
	median_age: z.number().nullable(),
	growth: growthMetricsSchema,
	migration: migrationDataSchema,
	natural_increase: naturalIncreaseDataSchema,
	population_density: populationDensitySchema,
	age_distribution: ageDistributionSchema,
	demographics: demographicsSchema,
	walkability: walkabilityScoresSchema,
	population_trends: populationTrendSchema,
});
export type PopulationDataResponse = z.infer<
	typeof populationDataResponseSchema
>;
