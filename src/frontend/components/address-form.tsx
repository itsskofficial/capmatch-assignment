"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addressSchema, type AddressSchema } from "@lib/schemas";

import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

interface AddressFormProps {
	onSubmit: (data: AddressSchema) => void;
	isSubmitting: boolean;
}

export function AddressForm({ onSubmit, isSubmitting }: AddressFormProps) {
	const form = useForm<AddressSchema>({
		resolver: zodResolver(addressSchema),
		defaultValues: {
			address: "",
		},
	});

	return (
		<Form {...form}>
			<form
				onSubmit={form.handleSubmit(onSubmit)}
				className="w-full max-w-2xl space-y-4"
			>
				<FormField
					control={form.control}
					name="address"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Property Address</FormLabel>
							<FormControl>
								<Input
									placeholder="e.g., 555 California St, San Francisco, CA"
									{...field}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<Button
					type="submit"
					className="w-full"
					disabled={isSubmitting}
				>
					{isSubmitting && (
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
					)}
					Generate Market Card
				</Button>
			</form>
		</Form>
	);
}
