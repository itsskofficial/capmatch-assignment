"use client";

import { MapContainer, TileLayer, Marker, Circle } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { useMap } from "react-leaflet/hooks";

// Fix for default icon issue with Webpack
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
	iconRetinaUrl:
		"https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
	iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
	shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

interface MapComponentProps {
	lat: number;
	lon: number;
	radiusInMiles: number; // New prop
}

// A helper component to dynamically update map view
function MapUpdater({ radiusInMiles }: { radiusInMiles: number }) {
	const map = useMap();
	useEffect(() => {
		let zoomLevel = 14; // Default for 1 mile
		if (radiusInMiles === 3) zoomLevel = 12;
		if (radiusInMiles === 5) zoomLevel = 11;
		map.setZoom(zoomLevel);
	}, [radiusInMiles, map]);
	return null;
}

const MapComponent: React.FC<MapComponentProps> = ({
	lat,
	lon,
	radiusInMiles,
}) => {
	const position: [number, number] = [lat, lon];
	const radiusInMeters = radiusInMiles * 1609.34;

	return (
		<MapContainer
			center={position}
			zoom={14}
			style={{
				height: "100%",
				width: "100%",
				borderRadius: "var(--radius)",
			}}
			scrollWheelZoom={false}
			key={`${lat}-${lon}-${radiusInMiles}`} // Force re-render on radius change
		>
			<TileLayer
				attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
				url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
			/>
			<Marker position={position} />
			<Circle
				center={position}
				pathOptions={{
					color: "hsl(var(--primary))",
					fillColor: "hsl(var(--primary))",
				}}
				radius={radiusInMeters}
				fillOpacity={0.1}
				stroke={true}
				weight={2}
			/>
			<MapUpdater radiusInMiles={radiusInMiles} />
		</MapContainer>
	);
};

export default MapComponent;
