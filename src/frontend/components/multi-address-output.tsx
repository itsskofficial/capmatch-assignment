"use client";

import { useState } from "react";
import { XIcon, BarChart2, List } from "lucide-react";

import { Button } from "@components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@components/ui/dialog";
import { PopulationMetricsCard } from "@components/population-metrics-card";
import { ComparisonChart } from "@components/comparison-chart";
import type { AddressEntry } from "@lib/types";

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
					<p className="truncate text-sm text-green-600">
						{address.data?.geography_name}
					</p>
				);
			case "error":
				return (
					<p className="truncate text-sm text-red-500">
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
				<p className="truncate pr-6 text-sm font-medium">
					{address.value}
				</p>
				{renderStatus()}
			</CardContent>
		</Card>
	);
}

interface MultiAddressOutputProps {
	addresses: AddressEntry[];
	onRemoveAddress: (id: string) => void;
}

export function MultiAddressOutput({
	addresses,
	onRemoveAddress,
}: MultiAddressOutputProps) {
	const [selectedAddress, setSelectedAddress] = useState<AddressEntry | null>(
		null
	);
	const [isComparisonOpen, setIsComparisonOpen] = useState(false);

	const successfulAddresses = addresses.filter(
		(addr) => addr.status === "success" && addr.data
	);

	if (addresses.length === 0) {
		return (
			<div className="flex h-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-8 text-center dark:border-gray-700">
				<div className="mx-auto w-fit rounded-full bg-secondary p-4">
					<List className="h-10 w-10 text-muted-foreground" />
				</div>
				<h2 className="mt-6 text-2xl font-semibold">
					Address List is Empty
				</h2>
				<p className="mt-2 max-w-sm text-muted-foreground">
					Use the panel on the right to add one or more addresses.
					Once added, they will appear here.
				</p>
			</div>
		);
	}

	return (
		<div className="h-full w-full">
			<Card className="flex h-full flex-col">
				<CardHeader className="flex flex-row items-center justify-between">
					<CardTitle>Address List ({addresses.length})</CardTitle>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							onClick={() => setIsComparisonOpen(true)}
							disabled={successfulAddresses.length < 2}
						>
							<BarChart2 className="mr-2 h-4 w-4" /> Compare
						</Button>
					</div>
				</CardHeader>
				<CardContent className="flex-grow overflow-auto p-4">
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
						{addresses.map((addr) => (
							<SummaryCard
								key={addr.id}
								address={addr}
								onRemove={() => onRemoveAddress(addr.id)}
								onSelect={() => setSelectedAddress(addr)}
							/>
						))}
					</div>
				</CardContent>
			</Card>

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
				<DialogContent className="flex h-[80vh] max-w-5xl flex-col">
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
