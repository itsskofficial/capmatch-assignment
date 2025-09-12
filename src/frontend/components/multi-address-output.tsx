"use client";

import { useState } from "react";
import { XIcon, List, Loader2, AlertTriangle } from "lucide-react";

import { Button } from "@components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@components/ui/card";
import { Skeleton } from "@components/ui/skeleton";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@components/ui/dialog";
import { PopulationMetricsCard } from "@components/population-metrics-card";
import type { AddressEntry } from "@lib/types";
import { cn } from "@lib/utils";
import DynamicMap from "@components/dynamic-map";

function SummaryCard({
	address,
	onRemove,
	onSelect,
	isAnyModalOpen,
}: {
	address: AddressEntry;
	onRemove: () => void;
	onSelect: () => void;
	isAnyModalOpen: boolean;
}) {
	const renderStatus = () => {
		switch (address.status) {
			case "loading":
				return (
					<div className="flex items-center text-sm text-blue-500">
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						Fetching data...
					</div>
				);
			case "success":
				return (
					<p className="truncate text-sm text-green-600 dark:text-green-400">
						{address.data?.geography_name}
					</p>
				);
			case "error":
				return (
					<p
						className="truncate text-sm text-red-500 dark:text-red-400"
						title={address.error}
					>
						Error: {address.error ?? "Unknown error"}
					</p>
				);
			default:
				return null;
		}
	};

	return (
		<Card
			className={cn(
				"group relative transition-all hover:shadow-md overflow-hidden p-0 gap-0",
				address.status === "success" && "cursor-pointer"
			)}
			onClick={address.status === "success" ? onSelect : undefined}
		>
			<Button
				variant="ghost"
				size="icon"
				className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 z-10 bg-background/50 hover:bg-background/80"
				onClick={(e) => {
					e.stopPropagation();
					onRemove();
				}}
			>
				<XIcon className="h-4 w-4" />
			</Button>
			<div className="h-32 w-full">
				{address.status === "loading" && (
					<Skeleton className="h-full w-full rounded-none" />
				)}
				{address.status === "error" && (
					<div className="flex h-full w-full items-center justify-center bg-destructive/10">
						<AlertTriangle className="h-8 w-8 text-destructive" />
					</div>
				)}
				{address.status === "success" && address.data && (
					isAnyModalOpen ? (
						<Skeleton className="h-full w-full rounded-none" />
					) : (
						<DynamicMap
							lat={address.data.coordinates.lat}
							lon={address.data.coordinates.lon}
							area={address.data.tract_area_sq_meters}
						/>
					)
				)}
			</div>
			<CardContent className="p-4">
				<p className="truncate pr-6 font-medium">{address.value}</p>
				<div className="mt-1">{renderStatus()}</div>
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
					<CardTitle>Address Data ({addresses.length})</CardTitle>
				</CardHeader>
				<CardContent className="flex-grow overflow-auto p-4">
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
						{addresses.map((addr) => (
							<SummaryCard
								key={addr.id}
								address={addr}
								onRemove={() => onRemoveAddress(addr.id)}
								onSelect={() => setSelectedAddress(addr)}
								isAnyModalOpen={!!selectedAddress}
							/>
						))}
					</div>
				</CardContent>
			</Card>

			<Dialog
				open={!!selectedAddress}
				onOpenChange={() => setSelectedAddress(null)}
			>
				<DialogContent className="sm:max-w-7xl w-full">
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
		</div>
	);
}
