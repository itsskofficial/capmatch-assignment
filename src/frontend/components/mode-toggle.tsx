// src/frontend/components/mode-toggle.tsx
import { ToggleGroup, ToggleGroupItem } from "@components/ui/toggle-group";

interface ModeToggleProps {
	mode: "single" | "multi";
	onModeChange: (mode: "single" | "multi") => void;
}

export function ModeToggle({ mode, onModeChange }: ModeToggleProps) {
	return (
		<ToggleGroup
			type="single"
			value={mode}
			onValueChange={(value) => {
				if (value === "single" || value === "multi") {
					onModeChange(value);
				}
			}}
			className="my-6"
		>
			<ToggleGroupItem value="single" aria-label="Single Address Mode">
				Single Address
			</ToggleGroupItem>
			<ToggleGroupItem value="multi" aria-label="Multiple Addresses Mode">
				Multiple Addresses
			</ToggleGroupItem>
		</ToggleGroup>
	);
}
