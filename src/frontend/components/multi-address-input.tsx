"use client";

import { useForm } from "react-hook-form";
import { XIcon, PlusIcon } from "lucide-react";
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
import { ScrollArea } from "@components/ui/scroll-area";
import type { AddressIdentifier } from "@stores/addressStore";

const addAddressSchema = z.object({
	address: z.string().min(10, { message: "Please enter a valid address." }),
});
export type AddAddressSchema = z.infer<typeof addAddressSchema>;

interface MultiAddressInputProps {
	onAddAddress: (data: AddAddressSchema) => void;
	addresses: AddressIdentifier[];
	onRemoveAddress: (id: string) => void;
	cachedAddresses: string[];
	onRemoveFromCache: (address: string) => void;
}

export function MultiAddressInput({
	onAddAddress,
	addresses,
	onRemoveAddress,
	cachedAddresses,
	onRemoveFromCache,
}: MultiAddressInputProps) {
	const form = useForm<AddAddressSchema>({
		resolver: zodResolver(addAddressSchema),
		defaultValues: { address: "" },
	});

	const handleSubmit = (data: AddAddressSchema) => {
		onAddAddress(data);
		form.reset();
	};

	const handleAddFromCache = (address: string) => {
		onAddAddress({ address });
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
						Manage the addresses you&#39;ve added.
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
			<Separator />
			<Card className="border-none shadow-none">
				<CardHeader>
					<CardTitle>Cached Addresses</CardTitle>
					<CardDescription>
						Previously searched addresses. Click to add or remove
						from cache.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{cachedAddresses.length > 0 ? (
						<ScrollArea className="h-48">
							<ul className="space-y-2 pr-4">
								{cachedAddresses.map((address) => (
									<li
										key={address}
										className="group flex items-center justify-between rounded-md border bg-muted/50 p-2 text-sm"
									>
										<span className="truncate pr-2">
											{address}
										</span>
										<div className="flex shrink-0 items-center">
											<Button
												variant="ghost"
												size="icon"
												className="h-6 w-6"
												onClick={() =>
													handleAddFromCache(address)
												}
											>
												<PlusIcon className="h-4 w-4" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												className="h-6 w-6 text-destructive/70 hover:text-destructive"
												onClick={() =>
													onRemoveFromCache(address)
												}
											>
												<XIcon className="h-4 w-4" />
											</Button>
										</div>
									</li>
								))}
							</ul>
						</ScrollArea>
					) : (
						<p className="text-sm text-muted-foreground">
							No cached addresses found.
						</p>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
