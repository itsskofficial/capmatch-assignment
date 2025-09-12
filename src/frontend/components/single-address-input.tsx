"use client";

import { AddressForm } from "@components/address-form";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@components/ui/card";
import type { MarketDataRequest } from "@lib/schemas";

interface SingleAddressInputProps {
	onSubmit: (data: MarketDataRequest) => void;
	isSubmitting: boolean;
}

export function SingleAddressInput({
	onSubmit,
	isSubmitting,
}: SingleAddressInputProps) {
	return (
		<Card className="border-none shadow-none">
			<CardHeader>
				<CardTitle>Single Address Analysis</CardTitle>
				<CardDescription>
					Generate focused population metrics for any U.S. address.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<AddressForm onSubmit={onSubmit} isSubmitting={isSubmitting} />
			</CardContent>
		</Card>
	);
}
