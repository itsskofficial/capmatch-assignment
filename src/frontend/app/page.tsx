"use client";

import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { Compass, BarChartHorizontal, AreaChart, Users, Home } from "lucide-react";

import {
	ResizablePanelGroup,
	ResizablePanel,
	ResizableHandle,
} from "@components/ui/resizable";
import { ScrollArea } from "@components/ui/scroll-area";
import { FloatingDock } from "@components/floating-dock";
import {
	MultiAddressInput,
	type AddAddressSchema,
} from "@components/multi-address-input";
import { MultiAddressOutput } from "@components/multi-address-output";
import { ComparisonChart } from "@components/comparison-chart";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@components/ui/tabs";

import type { AddressEntry } from "@lib/types";
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
	type Mode = "explore" | "compare";
	const [mode, setMode] = useState<Mode>("explore");

	const [addresses, setAddresses] = useState<AddressEntry[]>([]);

	const addAddress = (data: AddAddressSchema) => {
		const newAddress: AddressEntry = {
			id: uuidv4(),
			value: data.address,
			status: "loading",
		};

		setAddresses((prev) => [
			...prev,
			newAddress,
		]);

		const fetchAndSet = async () => {
			try {
				const fetchedData = await fetchPopulationData({ address: newAddress.value });
				setAddresses((prev) =>
					prev.map((a) =>
						a.id === newAddress.id
							? { ...a, status: "success", data: fetchedData }
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
						a.id === newAddress.id
							? { ...a, status: "error", error: errorMessage }
							: a
					)
				);
			}
		};

		fetchAndSet();
	};

	const removeAddress = (id: string) => {
		setAddresses((prev) => prev.filter((addr) => addr.id !== id));
	};

	const dockItems = [
		{ title: "explore" as Mode, icon: <Compass /> },
		{ title: "compare" as Mode, icon: <BarChartHorizontal /> },
	];

	const successfulAddresses = addresses.filter(
		(addr) => addr.status === "success" && addr.data
	);

	return (
		<div className="flex min-h-screen w-full bg-muted/40">
			<aside className="fixed inset-y-0 left-0 z-10 hidden w-24 flex-col border-r bg-background sm:flex">
				<div className="flex h-16 shrink-0 items-center justify-center border-b px-2">
					{/* CapMatch Logo */}
					<svg
						className="h-8 w-8 text-primary"
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M12 2L2 7l10 5 10-5-10-5z" />
						<path d="M2 17l10 5 10-5" />
						<path d="M2 12l10 5 10-5" />
					</svg>
				</div>
				<FloatingDock
					items={dockItems}
					activeMode={mode}
					onModeChange={(newMode) => setMode(newMode)}
				/>
			</aside>

			<div className="w-full pl-24">
				<ResizablePanelGroup direction="horizontal" className="w-full">
					<ResizablePanel defaultSize={65} minSize={40}>
						<main className="h-screen overflow-auto p-4 md:p-6 lg:p-8">
							{mode === "explore" && (
								<MultiAddressOutput
									addresses={addresses}
									onRemoveAddress={removeAddress}
								/>
							)}
							{mode === "compare" && (
								<Card className="flex h-full flex-col">
									<CardHeader>
										<CardTitle>Comparison View</CardTitle>
										<CardDescription>
											Population trends for fetched
											addresses. Add and fetch data for at
											least two addresses to compare.
										</CardDescription>
									</CardHeader>
									<CardContent className="flex-grow">
										<Tabs defaultValue="growth" className="h-full flex flex-col">
											<TabsList className="grid w-full grid-cols-3">
												<TabsTrigger value="growth">
													<AreaChart className="mr-2 h-4 w-4" />
													Population Growth
												</TabsTrigger>
												<TabsTrigger value="demographics">
													<Users className="mr-2 h-4 w-4" />
													Demographics
												</TabsTrigger>
												<TabsTrigger value="housing">
													<Home className="mr-2 h-4 w-4" />
													Housing
												</TabsTrigger>
											</TabsList>
											<TabsContent value="growth" className="flex-grow mt-4">
												<ComparisonChart
													addresses={successfulAddresses}
													metric="population_trend"
												/>
											</TabsContent>
											<TabsContent value="demographics" className="flex-grow mt-4">
												<ComparisonChart
													addresses={successfulAddresses}
													metric="demographics"
												/>
											</TabsContent>
											<TabsContent value="housing" className="flex-grow mt-4">
												<ComparisonChart
													addresses={successfulAddresses}
													metric="housing"
												/>
											</TabsContent>
										</Tabs>
									</CardContent>
								</Card>
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
						<aside className="h-screen">
							<ScrollArea className="h-full">
								<div className="p-4 md:p-6 lg:p-8">
									<MultiAddressInput
										onAddAddress={addAddress}
										addresses={addresses}
										onRemoveAddress={removeAddress}
									/>
								</div>
							</ScrollArea>
						</aside>
					</ResizablePanel>
				</ResizablePanelGroup>
			</div>
		</div>
	);
}
