"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@components/ui/toggle-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@components/ui/select";
import { Label } from "@components/ui/label";
import { Separator } from "@components/ui/separator";
import type { GeographyLevel } from "@lib/types";

const addAddressSchema = z.object({
	address: z.string().min(10, { message: "Please enter a valid address." }),
});
export type AddAddressSchema = z.infer<typeof addAddressSchema>;

interface MultiAddressInputProps {
	onAddAddress: (data: AddAddressSchema) => void;
	geography: GeographyLevel;
	onGeographyChange: (geo: GeographyLevel) => void;
	timePeriod: number;
	onTimePeriodChange: (tp: number) => void;
}

export function MultiAddressInput({
	onAddAddress,
	geography,
	onGeographyChange,
	timePeriod,
	onTimePeriodChange,
}: MultiAddressInputProps) {
	const form = useForm<AddAddressSchema>({
		resolver: zodResolver(addAddressSchema),
		defaultValues: { address: "" },
	});

	const handleSubmit = (data: AddAddressSchema) => {
		onAddAddress(data);
		form.reset();
	};

	return (
		<div className="space-y-6">
			<Card className="border-none shadow-none">
				<CardHeader>
					<CardTitle>Multi-Address Comparison</CardTitle>
					<CardDescription>
						Add multiple addresses to compare their population
						trends.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						onSubmit={form.handleSubmit(handleSubmit)}
						className="flex items-start gap-2"
					>
						<div className="flex-grow">
							<Input
								placeholder="e.g., 1600 Amphitheatre Parkway..."
								{...form.register("address")}
							/>
							{form.formState.errors.address && (
								<p className="mt-1 text-sm text-destructive">
									{form.formState.errors.address.message}
								</p>
							)}
						</div>
						<Button type="submit">Add</Button>
					</form>
				</CardContent>
			</Card>
			<Separator />
			<Card className="border-none shadow-none">
				<CardHeader>
					<CardTitle>Batch Settings</CardTitle>
					<CardDescription>
						These settings will apply to all addresses when you
						fetch data.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex items-center justify-between">
						<Label htmlFor="geo-toggle">Geography Level</Label>
						<ToggleGroup
							id="geo-toggle"
							type="single"
							value={geography}
							onValueChange={(v: GeographyLevel) =>
								v && onGeographyChange(v)
							}
						>
							<ToggleGroupItem value="tract">
								Tract
							</ToggleGroupItem>
							<ToggleGroupItem value="county">
								County
							</ToggleGroupItem>
						</ToggleGroup>
					</div>
					<div className="flex items-center justify-between">
						<Label htmlFor="time-select">Time Period</Label>
						<Select
							value={String(timePeriod)}
							onValueChange={(v) => onTimePeriodChange(Number(v))}
						>
							<SelectTrigger
								id="time-select"
								className="w-[150px]"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="1">YoY Growth</SelectItem>
								<SelectItem value="3">3-Year Trend</SelectItem>
								<SelectItem value="5">5-Year Trend</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
