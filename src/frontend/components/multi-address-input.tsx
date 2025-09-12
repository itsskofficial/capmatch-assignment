"use client";

import { useForm } from "react-hook-form";
import { XIcon } from "lucide-react";
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
import { Separator } from "@components/ui/separator";
import type { AddressEntry } from "@lib/types";

const addAddressSchema = z.object({
	address: z.string().min(10, { message: "Please enter a valid address." }),
});
export type AddAddressSchema = z.infer<typeof addAddressSchema>;

interface MultiAddressInputProps {
	onAddAddress: (data: AddAddressSchema) => void;
	addresses: AddressEntry[];
	onRemoveAddress: (id: string) => void;
}

export function MultiAddressInput({
	onAddAddress,
	addresses,
	onRemoveAddress,
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
					<CardTitle>Add Address</CardTitle>
					<CardDescription>
						Enter an address to fetch its market data.
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
					<CardTitle>Address List</CardTitle>
					<CardDescription>
						Manage the addresses you've added.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{addresses.length > 0 ? (
						<ul className="space-y-2">
							{addresses.map((address) => (
								<li
									key={address.id}
									className="flex items-center justify-between rounded-md border bg-muted/50 p-2"
								>
									<span className="truncate pr-2 text-sm">
										{address.value}
									</span>
									<Button
										variant="ghost"
										size="icon"
										className="h-6 w-6 shrink-0"
										onClick={() =>
											onRemoveAddress(address.id)
										}
									>
										<XIcon className="h-4 w-4" />
									</Button>
								</li>
							))}
						</ul>
					) : (
						<p className="text-sm text-muted-foreground">
							No addresses added yet.
						</p>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
