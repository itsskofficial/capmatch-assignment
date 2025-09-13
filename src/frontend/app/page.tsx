"use client";

import { useEffect } from "react";
import {
	Compass,
	BarChartHorizontal,
	AreaChart,
	Users,
	Home,
} from "lucide-react";
import { PopulationMetricsCard } from "@components/population-metrics-card";

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
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@components/ui/tabs";

import { useAddressStore } from "@/stores/addressStore";

export default function HomePage() {
	const {
		mode,
		addresses,
		selectedAddress,
		cachedAddresses,
		setMode,
		addAddress,
		removeAddress,
		selectAddress,
		fetchCachedAddresses,
		removeAddressFromCache,
	} = useAddressStore();

	// Fetch cached addresses on initial component mount
	useEffect(() => {
		fetchCachedAddresses();
	}, [fetchCachedAddresses]);

	const dockItems = [
		{ title: "explore" as const, icon: <Compass /> },
		{ title: "compare" as const, icon: <BarChartHorizontal /> },
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

			<div className="w-full sm:pl-24">
				<ResizablePanelGroup
					direction="horizontal"
					className="w-full flex-col md:flex-row min-h-screen"
				>
					<ResizablePanel
						defaultSize={65}
						minSize={40}
						className="min-h-[50vh] md:min-h-0"
					>
						<main className="h-full overflow-auto p-4 md:p-6 lg:p-8">
							{mode === "explore" && (
								<MultiAddressOutput
									addresses={addresses}
									onRemoveAddress={removeAddress}
									onSelectAddress={selectAddress}
									isAnyModalOpen={!!selectedAddress}
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
										<Tabs
											defaultValue="growth"
											className="h-full flex flex-col"
										>
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
											<TabsContent
												value="growth"
												className="flex-grow mt-4"
											>
												<ComparisonChart
													addresses={
														successfulAddresses
													}
													metric="population_trend"
												/>
											</TabsContent>
											<TabsContent
												value="demographics"
												className="flex-grow mt-4"
											>
												<ComparisonChart
													addresses={
														successfulAddresses
													}
													metric="demographics"
												/>
											</TabsContent>
											<TabsContent
												value="housing"
												className="flex-grow mt-4"
											>
												<ComparisonChart
													addresses={
														successfulAddresses
													}
													metric="housing"
												/>
											</TabsContent>
										</Tabs>
									</CardContent>
								</Card>
							)}
						</main>
					</ResizablePanel>
					<ResizableHandle withHandle className="hidden md:flex" />
					<ResizablePanel
						defaultSize={35}
						minSize={25}
						maxSize={40}
						className="bg-background min-h-[50vh] md:min-h-0"
					>
						<aside className="h-full">
							<ScrollArea className="h-full">
								<div className="p-4 md:p-6 lg:p-8">
									<MultiAddressInput
										onAddAddress={(data) =>
											addAddress(data.address)
										}
										addresses={addresses}
										onRemoveAddress={removeAddress}
										cachedAddresses={cachedAddresses}
										onRemoveFromCache={
											removeAddressFromCache
										}
									/>
								</div>
							</ScrollArea>
						</aside>
					</ResizablePanel>
				</ResizablePanelGroup>
			</div>
			<Dialog
				open={!!selectedAddress}
				onOpenChange={() => selectAddress(null)}
			>
				<DialogContent className="sm:max-w-7xl w-full h-[90vh] flex flex-col">
					<DialogHeader>
						<DialogTitle>{selectedAddress?.value}</DialogTitle>
					</DialogHeader>
					<div className="flex-1 overflow-y-auto">
						<PopulationMetricsCard
							isLoading={false}
							isError={false}
							error={null}
							data={selectedAddress?.data}
						/>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
