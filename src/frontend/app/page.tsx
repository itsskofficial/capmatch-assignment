"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { v4 as uuidv4 } from "uuid";
import { Users, List, BarChartHorizontal } from "lucide-react";

import {
	Sidebar,
	SidebarProvider,
	SidebarInset,
	SidebarHeader,
	SidebarContent,
	SidebarMenu,
	SidebarMenuItem,
	SidebarMenuButton,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarGroupContent,
} from "@components/ui/sidebar";
import {
	ResizablePanelGroup,
	ResizablePanel,
	ResizableHandle,
} from "@components/ui/resizable";
import { ScrollArea } from "@components/ui/scroll-area";

import { SingleAddressInput } from "@components/single-address-input";
import { SingleAddressOutput } from "@components/single-address-output";
import {
	MultiAddressInput,
	type AddAddressSchema,
} from "@components/multi-address-input";
import { MultiAddressOutput } from "@components/multi-address-output";

import type { AddressEntry, GeographyLevel } from "@lib/types";
import {
	populationDataResponseSchema,
	type MarketDataRequest,
	type PopulationDataResponse,
} from "@lib/schemas";

async function fetchPopulationData(
	requestData: MarketDataRequest
): Promise<PopulationDataResponse> {
	const body = {
		address: requestData.address,
		geography_level: requestData.geography,
		data_year: requestData.year,
		time_period_years: requestData.timePeriod,
	};
	const response = await fetch("/api/v1/market-data", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		const errorBody = await response.json();
		throw new Error(errorBody.detail || "An unknown error occurred");
	}
	const data = await response.json();
	return populationDataResponseSchema.parse(data);
}

export default function HomePage() {
	const [mode, setMode] = useState<"single" | "multi">("single");

	// --- Single Address Mode State & Logic ---
	const singleAddressMutation = useMutation({
		mutationFn: (data: MarketDataRequest) => fetchPopulationData(data),
	});
	const handleSingleSubmit = (data: MarketDataRequest) => {
		singleAddressMutation.mutate(data);
	};

	// --- Multi Address Mode State & Logic ---
	const [addresses, setAddresses] = useState<AddressEntry[]>([]);
	const [isFetchingAll, setIsFetchingAll] = useState(false);
	const [geography, setGeography] = useState<GeographyLevel>("tract");
	const [timePeriod, setTimePeriod] = useState(5);

	const addAddress = (data: AddAddressSchema) => {
		setAddresses((prev) => [
			...prev,
			{ id: uuidv4(), value: data.address, status: "idle" },
		]);
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
					const data = await fetchPopulationData({
						address: addr.value,
						geography: geography,
						year: 2022,
						timePeriod: timePeriod,
					});
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

	return (
		<SidebarProvider>
			<div className="flex min-h-screen min-w-screen">
				<Sidebar>
					<SidebarHeader>
						<div className="flex items-center gap-2">
							<BarChartHorizontal className="h-6 w-6" />
							<h1 className="text-xl font-semibold tracking-tight">
								CapMatch
							</h1>
						</div>
					</SidebarHeader>
					<SidebarContent>
						<SidebarMenu>
							<SidebarGroup>
								<SidebarGroupLabel>
									Analysis Modes
								</SidebarGroupLabel>
								<SidebarGroupContent>
									<SidebarMenuItem>
										<SidebarMenuButton
											isActive={mode === "single"}
											onClick={() => setMode("single")}
											tooltip="Single Address Mode"
										>
											<Users />
											<span>Single Address</span>
										</SidebarMenuButton>
									</SidebarMenuItem>
									<SidebarMenuItem>
										<SidebarMenuButton
											isActive={mode === "multi"}
											onClick={() => setMode("multi")}
											tooltip="Multi-Address Mode"
										>
											<List />
											<span>Multi-Address</span>
										</SidebarMenuButton>
									</SidebarMenuItem>
								</SidebarGroupContent>
							</SidebarGroup>
						</SidebarMenu>
					</SidebarContent>
				</Sidebar>
				<SidebarInset className="flex-1 w-full bg-muted/40">
					<ResizablePanelGroup
						direction="horizontal"
						className="w-full"
					>
						<ResizablePanel defaultSize={65} minSize={40}>
							<main className="h-full overflow-auto p-4 md:p-6 lg:p-8">
								{mode === "single" ? (
									<div className="flex h-full w-full items-start justify-center">
										<SingleAddressOutput
											isLoading={
												singleAddressMutation.isPending
											}
											isError={
												singleAddressMutation.isError
											}
											error={singleAddressMutation.error}
											data={singleAddressMutation.data}
										/>
									</div>
								) : (
									<MultiAddressOutput
										addresses={addresses}
										isFetchingAll={isFetchingAll}
										onRemoveAddress={removeAddress}
										onFetchAll={handleFetchAll}
									/>
								)}
							</main>
						</ResizablePanel>
						<ResizableHandle withHandle />
						<ResizablePanel
							defaultSize={35}
							minSize={25}
							maxSize={40}
							className="bg-background"
						>
							<aside className="h-full">
								<ScrollArea className="h-full">
									<div className="p-4 md:p-6 lg:p-8">
										{mode === "single" ? (
											<SingleAddressInput
												onSubmit={handleSingleSubmit}
												isSubmitting={
													singleAddressMutation.isPending
												}
											/>
										) : (
											<MultiAddressInput
												onAddAddress={addAddress}
												geography={geography}
												onGeographyChange={setGeography}
												timePeriod={timePeriod}
												onTimePeriodChange={
													setTimePeriod
												}
											/>
										)}
									</div>
								</ScrollArea>
							</aside>
						</ResizablePanel>
					</ResizablePanelGroup>
				</SidebarInset>
			</div>
		</SidebarProvider>
	);
}
