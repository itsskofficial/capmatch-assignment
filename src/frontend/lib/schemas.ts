import { z } from "zod";

// Schema for the address form validation
export const addressSchema = z.object({
	address: z.string().min(10, {
		message: "Please enter a valid, complete address.",
	}),
});

// Type definition inferred from the schema
export type AddressSchema = z.infer<typeof addressSchema>;

// --- API Response Schemas ---

// This schema validates a single data point from the API response
const populationDataPointSchema = z.object({
	year: z.number(),
	population: z.number(),
});

// This schema validates the entire successful API response
export const populationGrowthResponseSchema = z.object({
	county_name: z.string(),
	state_name: z.string(),
	data: z.array(populationDataPointSchema),
});

// Type definition for a successful response
export type PopulationGrowthResponse = z.infer<
	typeof populationGrowthResponseSchema
>;
