"use client";

import { MapContainer, TileLayer, Marker, Circle } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { useMap } from "react-leaflet/hooks";

// Fix for default icon issue with Webpack
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
	iconRetinaUrl:
		"https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
	iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
	shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

interface MapComponentProps {
	lat: number;
	lon: number;
	area: number; // in square meters
	interactive?: boolean;
}

const MapUpdater: React.FC<{ center: [number, number]; radius: number }> = ({
	center,
	radius,
}) => {
	const map = useMap();
	useEffect(() => {
		if (!map) return; // Guard clause: Don't run effect if map isn't ready
		if (radius > 0) {
			const bounds = L.latLng(center).toBounds(radius * 2);
			map.fitBounds(bounds);
		} else {
			map.setView(center, 14);
		}
	}, [map, center, radius]);
	return null;
};

const MapComponent: React.FC<MapComponentProps> = ({
	lat,
	lon,
	area,
	interactive = false,
}) => {
	const position: [number, number] = [lat, lon];
	const radius = area > 0 ? Math.sqrt(area / Math.PI) : 0;

	return (
		<MapContainer
			center={position}
			zoom={14}
			style={{
				height: "100%",
				width: "100%",
			}}
			scrollWheelZoom={interactive}
			dragging={interactive}
			zoomControl={interactive}
			doubleClickZoom={interactive}
			touchZoom={interactive}
			attributionControl={interactive}
		>
			<TileLayer
				attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
				url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
			/>
			<Marker position={position} />
			{radius > 0 && <Circle center={position} radius={radius} pathOptions={{ color: 'blue', fillColor: 'blue' }} />}
			<MapUpdater center={position} radius={radius} />
		</MapContainer>
	);
};

export default MapComponent;
