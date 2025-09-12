"use client";

import { useState } from "react";
import { XIcon, List, Loader2 } from "lucide-react";

import { Button } from "@components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@components/ui/dialog";
import { PopulationMetricsCard } from "@components/population-metrics-card";
import type { AddressEntry } from "@lib/types";
import { cn } from "@lib/utils";

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
					<p className="truncate text-sm text-red-500 dark:text-red-400" title={address.error}>
						Error: {address.error}
					</p>
				);
			default:
				return null;
		}
	};

	const statusBorder = {
        loading: "border-l-blue-500",
        success: "border-l-green-500",
        error: "border-l-red-500",
        idle: "border-l-transparent",
    }[address.status];

	return (
		<Card
			className={cn("group relative transition-all hover:shadow-md border-l-4",
				statusBorder,
				address.status === "success" && "cursor-pointer"
			)}
			onClick={address.status === "success" ? onSelect : undefined}
		>
			<Button
				variant="ghost"
				size="icon"
				className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100"
				onClick={(e) => {
					e.stopPropagation();
					onRemove();
				}}
			>
				<XIcon className="h-4 w-4" />
			</Button>
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
					<CardTitle>Address List ({addresses.length})</CardTitle>
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
				<DialogContent className="max-w-7xl">
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
