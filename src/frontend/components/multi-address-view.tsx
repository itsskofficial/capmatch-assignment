"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { v4 as uuidv4 } from "uuid";
import { XIcon, Loader2, BarChart2, Search } from "lucide-react";
import { z } from "zod";

import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@components/ui/dialog";
import { PopulationMetricsCard } from "@components/population-metrics-card";
import { ComparisonChart } from "@components/comparison-chart";
import {
	populationDataResponseSchema,
	type PopulationDataResponse,
} from "@lib/schemas";
import { ToggleGroup, ToggleGroupItem } from "@components/ui/toggle-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@components/ui/select";
import { Label } from "@components/ui/label";

type AddressStatus = "idle" | "loading" | "success" | "error";
type GeographyLevel = "tract" | "county";

export interface AddressEntry {
	id: string;
	value: string;
	status: AddressStatus;
	data?: PopulationDataResponse;
	error?: string;
}

const addAddressSchema = z.object({
	address: z.string().min(10, { message: "Please enter a valid address." }),
});
type AddAddressSchema = z.infer<typeof addAddressSchema>;

async function fetchPopulationData(
	address: string,
	geography: GeographyLevel,
	timePeriod: number
): Promise<PopulationDataResponse> {
	const response = await fetch("/api/v1/market-data", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			address,
			geography_level: geography,
			data_year: 2022,
			time_period_years: timePeriod,
		}),
	});
	if (!response.ok) {
		const errorBody = await response.json();
		throw new Error(errorBody.detail || "An unknown error occurred");
	}
	const data = await response.json();
	return populationDataResponseSchema.parse(data);
}

export function MultiAddressView() {
	const [addresses, setAddresses] = useState<AddressEntry[]>([]);
	const [isFetchingAll, setIsFetchingAll] = useState(false);
	const [selectedAddress, setSelectedAddress] = useState<AddressEntry | null>(
		null
	);
	const [isComparisonOpen, setIsComparisonOpen] = useState(false);
	// State for batch settings
	const [geography, setGeography] = useState<GeographyLevel>("tract");
	const [timePeriod, setTimePeriod] = useState(5);

	const form = useForm<AddAddressSchema>({
		resolver: zodResolver(addAddressSchema),
		defaultValues: { address: "" },
	});

	const addAddress = (data: AddAddressSchema) => {
		setAddresses((prev) => [
			...prev,
			{ id: uuidv4(), value: data.address, status: "idle" },
		]);
		form.reset();
	};

	const removeAddress = (id: string) => {
		setAddresses((prev) => prev.filter((addr) => addr.id !== id));
	};

	const handleFetchAll = async () => {
		setIsFetchingAll(true);
		setAddresses((prev) =>
			prev.map((addr) =>
				addr.status === "idle" ? { ...addr, status: "loading" } : addr
			)
		);

		const fetchPromises = addresses
			.filter((addr) => addr.status !== "success")
			.map(async (addr) => {
				try {
					const data = await fetchPopulationData(
						addr.value,
						geography,
						timePeriod
					);
					setAddresses((prev) =>
						prev.map((a) =>
							a.id === addr.id
								? { ...a, status: "success", data }
								: a
						)
					);
				} catch (error: unknown) {
					const errorMessage =
						error instanceof Error
							? error.message
							: "An unknown error occurred";
					setAddresses((prev) =>
						prev.map((a) =>
							a.id === addr.id
								? { ...a, status: "error", error: errorMessage }
								: a
						)
					);
				}
			});

		await Promise.all(fetchPromises);
		setIsFetchingAll(false);
	};

	const successfulAddresses = addresses.filter(
		(addr) => addr.status === "success" && addr.data
	);

	return (
		<div className="w-full max-w-4xl space-y-8">
			<Card>
				<CardHeader>
					<CardTitle>Add Addresses</CardTitle>
				</CardHeader>
				<CardContent>
					<form
						onSubmit={form.handleSubmit(addAddress)}
						className="flex items-start gap-2"
					>
						<div className="flex-grow">
							<Input
								placeholder="e.g., 1600 Amphitheatre Parkway, Mountain View, CA"
								{...form.register("address")}
							/>
							{form.formState.errors.address && (
								<p className="text-sm text-destructive mt-1">
									{form.formState.errors.address.message}
								</p>
							)}
						</div>
						<Button type="submit">Add</Button>
					</form>
				</CardContent>
			</Card>

			{addresses.length > 0 && (
				<Card>
					<CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
						<CardTitle>Address List ({addresses.length})</CardTitle>
						<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto">
							{/* Batch Settings */}
							<div className="flex items-center gap-2">
								<Label htmlFor="geo-toggle">Level:</Label>
								<ToggleGroup
									id="geo-toggle"
									type="single"
									value={geography}
									onValueChange={(v: GeographyLevel) =>
										v && setGeography(v)
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
							<div className="flex items-center gap-2">
								<Label htmlFor="time-select">Trend:</Label>
								<Select
									value={String(timePeriod)}
									onValueChange={(v) =>
										setTimePeriod(Number(v))
									}
								>
									<SelectTrigger
										id="time-select"
										className="w-[120px]"
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{/* FIX: Changed label for clarity */}
										<SelectItem value="1">
											YoY Growth
										</SelectItem>
										<SelectItem value="3">
											3-Year
										</SelectItem>
										<SelectItem value="5">
											5-Year
										</SelectItem>
									</SelectContent>
								</Select>
							</div>
							{/* Action Buttons */}
							<Button
								variant="outline"
								onClick={() => setIsComparisonOpen(true)}
								disabled={successfulAddresses.length < 2}
							>
								<BarChart2 className="mr-2 h-4 w-4" /> Compare
							</Button>
							<Button
								onClick={handleFetchAll}
								disabled={isFetchingAll}
							>
								{isFetchingAll ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<Search className="mr-2 h-4 w-4" />
								)}{" "}
								Fetch All
							</Button>
						</div>
					</CardHeader>
					<CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{addresses.map((addr) => (
							<SummaryCard
								key={addr.id}
								address={addr}
								onRemove={() => removeAddress(addr.id)}
								onSelect={() => setSelectedAddress(addr)}
							/>
						))}
					</CardContent>
				</Card>
			)}

			<Dialog
				open={!!selectedAddress}
				onOpenChange={() => setSelectedAddress(null)}
			>
				<DialogContent className="max-w-3xl">
					<DialogHeader>
						<DialogTitle>{selectedAddress?.value}</DialogTitle>
					</DialogHeader>
					<div className="mt-4">
						<PopulationMetricsCard
							isLoading={false}
							isError={false}
							error={null}
							data={selectedAddress?.data}
						/>
					</div>
				</DialogContent>
			</Dialog>
			<Dialog open={isComparisonOpen} onOpenChange={setIsComparisonOpen}>
				<DialogContent className="max-w-5xl h-[80vh] flex flex-col">
					<DialogHeader>
						<DialogTitle>Population Trend Comparison</DialogTitle>
					</DialogHeader>
					<div className="mt-4 flex-grow">
						<ComparisonChart addresses={successfulAddresses} />
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function SummaryCard({
	address,
	onRemove,
	onSelect,
}: {
	address: AddressEntry;
	onRemove: () => void;
	onSelect: () => void;
}) {
	const renderStatus = () => {
		switch (address.status) {
			case "loading":
				return <p className="text-sm text-blue-500">Loading...</p>;
			case "success":
				return (
					<p className="text-sm text-green-600 truncate">
						{address.data?.geography_name}
					</p>
				);
			case "error":
				return (
					<p className="text-sm text-red-500">
						Failed: {address.error}
					</p>
				);
			default:
				return (
					<p className="text-sm text-muted-foreground">
						Ready to fetch
					</p>
				);
		}
	};
	return (
		<Card
			className={`relative transition-all hover:shadow-md ${
				address.status === "success" ? "cursor-pointer" : ""
			}`}
			onClick={address.status === "success" ? onSelect : undefined}
		>
			<Button
				variant="ghost"
				size="icon"
				className="absolute top-1 right-1 h-6 w-6"
				onClick={(e) => {
					e.stopPropagation();
					onRemove();
				}}
			>
				<XIcon className="h-4 w-4" />
			</Button>
			<CardContent className="p-4">
				<p className="font-medium text-sm truncate pr-6">
					{address.value}
				</p>
				{renderStatus()}
			</CardContent>
		</Card>
	);
}
