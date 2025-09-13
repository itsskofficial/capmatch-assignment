import React from "react";
import { XIcon, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import { Skeleton } from "@components/ui/skeleton";
import DynamicMap from "@components/dynamic-map";
import { cn } from "@lib/utils";
import { useMarketData } from "@hooks/useMarketData";
import type { AddressIdentifier } from "@stores/addressStore";

interface SummaryCardProps {
	addressIdentifier: AddressIdentifier;
	onRemove: () => void;
	onSelect: () => void;
	isAnyModalOpen: boolean;
}

export function SummaryCard({
	addressIdentifier,
	onRemove,
	onSelect,
	isAnyModalOpen,
}: SummaryCardProps) {
	const { data, isLoading, isError, error } = useMarketData(
		addressIdentifier.value
	);

	const renderStatus = () => {
		if (isLoading) {
			return (
				<div className="flex items-center text-sm text-blue-500">
					<Loader2 className="mr-2 h-4 w-4 animate-spin" />
					Fetching data...
				</div>
			);
		}
		if (isError) {
			return (
				<p
					className="truncate text-sm text-red-500 dark:text-red-400"
					title={error.message}
				>
					Error: {error.message}
				</p>
			);
		}
		if (data) {
			return (
				<p className="truncate text-sm text-green-600 dark:text-green-400">
					{data.geography_name}
				</p>
			);
		}
		return null;
	};

	return (
		<Card
			className={cn(
				"group relative transition-all hover:shadow-md overflow-hidden p-0 gap-0",
				data && "cursor-pointer"
			)}
			onClick={data ? onSelect : undefined}
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
				{(isLoading || (isAnyModalOpen && data)) && (
					<Skeleton className="h-full w-full rounded-none" />
				)}
				{isError && (
					<div className="flex h-full w-full items-center justify-center bg-destructive/10">
						<AlertTriangle className="h-8 w-8 text-destructive" />
					</div>
				)}
				{data && !isAnyModalOpen && (
					<DynamicMap
						lat={data.coordinates.lat}
						lon={data.coordinates.lon}
						fips={data.fips} // <-- UPDATED
					/>
				)}
			</div>
			<CardContent className="p-4">
				<p className="truncate pr-6 font-medium">
					{addressIdentifier.value}
				</p>
				<div className="mt-1">{renderStatus()}</div>
			</CardContent>
		</Card>
	);
}

export const MemoizedSummaryCard = React.memo(SummaryCard);
