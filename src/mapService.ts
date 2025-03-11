import { Map as OLMap, View } from 'ol';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import { Circle, Style, Fill, Stroke, Text } from 'ol/style';
import { fromLonLat } from 'ol/proj';
import LineString from 'ol/geom/LineString';
import * as arcjs from 'arc';
import { boundingExtent } from 'ol/extent';
import { City, ArcCoordinates } from './types';

// Map variables
let vectorSource: VectorSource;
let vectorLayer: VectorLayer;
let map: OLMap;

// Setup map with container
export function setupMap(): void {
    try {
        vectorSource = new VectorSource({
            features: [],
        });

        vectorLayer = new VectorLayer({
            source: vectorSource,
        });

        map = new OLMap({
            target: 'map',
            layers: [
                new TileLayer({
                    source: new OSM(),
                }),
                vectorLayer,
            ],
            view: new View({
                center: [0, 0],
                zoom: 1,
                // Remove constraint on zoom resolution to enable fractional zoom levels
                constrainResolution: false,
                // Add smaller zoom factor for more sensitive zooming (default is 2)
                zoomFactor: 1.2
            }),
        });

        // Ensure map container maintains 2:1 ratio
        const mapEl = document.getElementById('map');
        if (mapEl) {
            mapEl.style.maxWidth = '100%';

            // Set initial height based on current width
            const updateMapHeight = () => {
                const width = mapEl.offsetWidth;
                mapEl.style.height = `${width / 2}px`;
            };

            // Update height initially and on resize
            updateMapHeight();
            window.addEventListener('resize', updateMapHeight);
        }
    } catch (error) {
        console.error("Failed to set up map:", error);
    }
}

// Add a city marker to the map
export function addCityMarker(city: City, index: number): void {
    const iconStyle = new Style({
        image: new Circle({
            radius: 14,
            fill: new Fill({ color: 'rgba(0, 153, 255, 0.6)' }),
            stroke: new Stroke({ color: '#fff', width: 2 }),
        }),
        text: new Text({
            text: String(index + 1),
            fill: new Fill({ color: '#fff' }),
            font: '12px sans-serif',
            textAlign: 'center',
            textBaseline: 'middle',
        }),
    });

    const cityFeature = new Feature({
        geometry: new Point(fromLonLat([city.longitude, city.latitude])),
    });

    cityFeature.setStyle(iconStyle);
    vectorSource.addFeature(cityFeature);
}

// Clear all city markers from the map
export function clearCityMarkers(): void {
    vectorSource.clear();
}

// Draw a great circle arc between two cities
export function drawGreatCircleArc(
    from: City,
    to: City,
    velocity: number = 0,
    velocityMin: number = 0,
    velocityMax: number = 1
): Feature {
    try {
        // Normalize velocity based on route's velocity range
        let normalizedValue = 0.5; // default mid-point if no range
        if (velocityMax !== velocityMin) {
            normalizedValue = (velocity - velocityMin) / (velocityMax - velocityMin);
            normalizedValue = Math.max(0, Math.min(1, normalizedValue));
        }

        const arcColor = getViridisColor(normalizedValue);
        const arcGenerator = new arcjs.GreatCircle(
            { x: from.longitude, y: from.latitude },
            { x: to.longitude, y: to.latitude }
        );

        const arcLine = arcGenerator.Arc(100);
        const features: Feature[] = [];

        arcLine.geometries.forEach(geometry => {
            const lineCoords = geometry.coords.map(coord => fromLonLat([coord[0], coord[1]]));

            const lineFeature = new Feature({
                geometry: new LineString(lineCoords)
            });

            // Create the main line style
            const lineStyle = new Style({
                stroke: new Stroke({
                    color: arcColor,
                    width: 3
                })
            });

            lineFeature.setStyle([lineStyle]);

            vectorSource.addFeature(lineFeature);
            features.push(lineFeature);
        });

        return features[0] || new Feature();
    } catch (error) {
        console.error("Error drawing great circle arc:", error);

        const arcPoints = calculateGreatCircleArc(from, to);
        const lineCoordinates = arcPoints.map(point => fromLonLat([point.lon, point.lat]));

        const lineFeature = new Feature({
            geometry: new LineString(lineCoordinates)
        });

        // Create the main line style
        const lineStyle = new Style({
            stroke: new Stroke({
                color: '#ff0000',
                width: 3
            })
        });

        lineFeature.setStyle([lineStyle]);

        vectorSource.addFeature(lineFeature);
        return lineFeature;
    }
}

// Calculate arc coordinates for great circle
export function calculateGreatCircleArc(from: City, to: City, numPoints: number = 100): ArcCoordinates[] {
    const points: ArcCoordinates[] = [];

    const lat1 = from.latitude * Math.PI / 180;
    const lon1 = from.longitude * Math.PI / 180;
    const lat2 = to.latitude * Math.PI / 180;
    const lon2 = to.longitude * Math.PI / 180;

    for (let i = 0; i <= numPoints; i++) {
        const f = i / numPoints;

        const A = Math.sin((1 - f) * Math.PI) / Math.sin(Math.PI);
        const B = Math.sin(f * Math.PI) / Math.sin(Math.PI);

        const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
        const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
        const z = A * Math.sin(lat1) + B * Math.sin(lat2);

        const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
        const lon = Math.atan2(y, x);

        points.push({
            lat: lat * 180 / Math.PI,
            lon: lon * 180 / Math.PI
        });
    }

    return points;
}

// Remove features from the map
export function removeFeatures(features: Feature[]): void {
    features.forEach(feature => vectorSource.removeFeature(feature));
}

// Draw arcs for a route
export function drawRouteArcs(
    routeData: Array<{ from: string, to: string, velocity?: number }>,
    cities: City[],
    velocityMin: number,
    velocityMax: number
): Feature[] {
    const arcs: Feature[] = [];

    routeData.forEach(segment => {
        const fromCity = cities.find(city => city.name === segment.from);
        const toCity = cities.find(city => city.name === segment.to);

        if (fromCity && toCity) {
            const arcFeature = drawGreatCircleArc(
                fromCity,
                toCity,
                segment.velocity || 0,
                velocityMin,
                velocityMax
            );
            arcs.push(arcFeature);
        }
    });

    return arcs;
}

// Update map view to fit all cities
export function updateMapView(cities: City[]): void {
    if (cities.length === 0) return;

    const coordinates = cities.map(city => fromLonLat([city.longitude, city.latitude]));
    const extent = boundingExtent(coordinates);

    if (map) {
        map.getView().fit(extent, { padding: [50, 50, 50, 50], duration: 1000 });
    }
}

// Get color based on value in viridis color scale
export function getViridisColor(value: number): string {
    value = Math.max(0, Math.min(1, value));

    const colors = [
        [13, 8, 135],
        [85, 0, 170],
        [156, 23, 158],
        [205, 62, 78],
        [246, 147, 34],
        [252, 225, 56]
    ];

    const numColors = colors.length - 1;
    const idx = value * numColors;
    const idx1 = Math.floor(idx);
    const idx2 = Math.min(idx1 + 1, numColors);
    const fract = idx - idx1;

    const r = Math.round(colors[idx1][0] + fract * (colors[idx2][0] - colors[idx1][0]));
    const g = Math.round(colors[idx1][1] + fract * (colors[idx2][1] - colors[idx1][1]));
    const b = Math.round(colors[idx1][2] + fract * (colors[idx2][2] - colors[idx1][2]));

    return `rgb(${r}, ${g}, ${b})`;
}
