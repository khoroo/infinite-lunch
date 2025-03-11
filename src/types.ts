// --- Types ---

export interface City {
    name: string;
    latitude: number;
    longitude: number;
    timezone: string;
    country_code: string;
    population: number;
}

export interface RouteSegment {
    from: City;
    to: City;
    distance: number; // in kilometers
}

export interface Route {
    cities: City[];
    segments: RouteSegment[];
    totalDistance: number;
}

export interface ArcCoordinates {
    lon: number;
    lat: number;
}

export interface GreatCircleArc {
    from: City;
    to: City;
    points: ArcCoordinates[]; // Interpolated points along the great circle
    distance: number;
}
export interface ModelData {
    n: number;
    num_edges: number;
    E: [number, number][];
    c: number[];
}
export interface RouteLeg {
    from: string;
    to: string;
    duration: string;
    velocity: number;
}
