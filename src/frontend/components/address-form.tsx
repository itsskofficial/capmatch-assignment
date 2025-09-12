"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { marketDataRequestSchema, type MarketDataRequest } from "@lib/schemas";

import { Button } from "@components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@components/ui/form";
import { Input } from "@components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@components/ui/toggle-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@components/ui/select";
import { Loader2 } from "lucide-react";

interface AddressFormProps {
	onSubmit: (data: MarketDataRequest) => void;
	isSubmitting: boolean;
}

export function AddressForm({ onSubmit, isSubmitting }: AddressFormProps) {
	const form = useForm<MarketDataRequest>({
		resolver: zodResolver(marketDataRequestSchema),
		defaultValues: {
			address: "",
			geography: "tract",
			year: 2022,
			timePeriod: 5, // Default to 5 years for CAGR
		},
	});

	return (
		<Form {...form}>
			<form
				onSubmit={form.handleSubmit(onSubmit)}
				className="w-full max-w-2xl space-y-4"
			>
				<FormField
					control={form.control}
					name="address"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Property Address</FormLabel>
							<FormControl>
								<Input
									placeholder="e.g., 555 California St, San Francisco, CA"
									{...field}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<FormField
						control={form.control}
						name="geography"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Geography Level</FormLabel>
								<FormControl>
									<ToggleGroup
										type="single"
										value={field.value}
										onValueChange={field.onChange}
										className="w-full"
									>
										<ToggleGroupItem
											value="tract"
											className="w-full"
										>
											Tract (Local)
										</ToggleGroupItem>
										<ToggleGroupItem
											value="county"
											className="w-full"
										>
											County (Broad)
										</ToggleGroupItem>
									</ToggleGroup>
								</FormControl>
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="timePeriod"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Time Period</FormLabel>
								<Select
									onValueChange={(value) =>
										field.onChange(Number(value))
									}
									defaultValue={String(field.value)}
								>
									<FormControl>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										<SelectItem value="1">
											1-Year (YoY)
										</SelectItem>
										<SelectItem value="3">
											3-Year Trend
										</SelectItem>
										<SelectItem value="5">
											5-Year Trend
										</SelectItem>
									</SelectContent>
								</Select>
							</FormItem>
						)}
					/>
				</div>

				<Button
					type="submit"
					className="w-full"
					disabled={isSubmitting}
				>
					{isSubmitting && (
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
					)}
					Generate Market Card
				</Button>
			</form>
		</Form>
	);
}
