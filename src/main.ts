import './style.scss';
import { Map as OLMap, View } from 'ol';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import Fuse, { FuseResult } from 'fuse.js';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import { Circle, Style, Fill, Stroke, Text } from 'ol/style';
import { fromLonLat } from 'ol/proj';
import LineString from 'ol/geom/LineString';
import * as arcjs from 'arc';
import { Model } from 'https://cdn.jsdelivr.net/npm/minizinc/dist/minizinc.mjs';
import LatLon from 'geodesy/latlon-ellipsoidal-vincenty.js';
import { DateTime } from 'luxon';
import './clock';
import { boundingExtent } from 'ol/extent';
import { City, ArcCoordinates, ModelData, RouteLeg } from './types';

// --- State ---
const state = {
    cities: [] as City[],
    fuse: null as Fuse<City> | null,
    selectedCities: [] as City[],
    selectedSearchIndex: 0,
    selectedRouteIndex: 0, // New state to track selected route
    velocityMin: 0,
    velocityMax: 0,
    currentArcs: [] as Feature[],
    currentRoute: [] as Array<{ from: string, to: string, velocity: number }>
};

// --- Map ---
let vectorSource: VectorSource;
let vectorLayer: VectorLayer;

function setupMap(): void {
    try {
        vectorSource = new VectorSource({
            features: [],
        });

        vectorLayer = new VectorLayer({
            source: vectorSource,
        });

        new OLMap({
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
                constrainResolution: true
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

function addCityMarker(city: City, index: number): void {
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

    updateMapView();
}

function clearCityMarkers(): void {
    vectorSource.clear();
}

// --- Great Circle Arcs ---
function drawGreatCircleArc(from: City, to: City): Feature {
    try {
        // Look up the velocity between these cities in the current route
        const fromCityName = from.name;
        const toCityName = to.name;

        // Get velocity from the selected route for this segment
        let velocity = 0;
        if (state.currentRoute && state.currentRoute.length > 0) {
            const segment = state.currentRoute.find(
                seg => seg.from === fromCityName && seg.to === toCityName
            );
            if (segment) {
                velocity = segment.velocity;
            }
        }

        // Normalize velocity based on route's velocity range
        let normalizedValue = 0.5; // default mid-point if no range
        if (state.velocityMax !== state.velocityMin) {
            normalizedValue = (velocity - state.velocityMin) / (state.velocityMax - state.velocityMin);
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

function calculateGreatCircleArc(from: City, to: City, numPoints: number = 100): ArcCoordinates[] {
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

function clearArcs(): void {
    state.currentArcs.forEach(feature => vectorSource.removeFeature(feature));
    state.currentArcs = [];
}

function drawRouteArcs(routeData: Array<{ from: string, to: string, velocity?: number }>): void {
    clearArcs();

    routeData.forEach(segment => {
        const fromCity = state.selectedCities.find(city => city.name === segment.from);
        const toCity = state.selectedCities.find(city => city.name === segment.to);

        if (fromCity && toCity) {
            const arcFeature = drawGreatCircleArc(fromCity, toCity);
            state.currentArcs.push(arcFeature);
        }
    });
}

// --- City Selection ---
function selectCity(city: City): void {
    if (!isCitySelected(city)) {
        state.selectedCities.push(city);
        updateSelectedCitiesUI();

        // Scroll to the selected cities container
        const selectedCitiesContainer = document.querySelector('.selected-cities');
        if (selectedCitiesContainer) {
            selectedCitiesContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    clearSearch();
}

function isCitySelected(city: City): boolean {
    return state.selectedCities.some(
        c => c.name === city.name && c.country_code === city.country_code
    );
}

function removeCity(city: City): void {
    const index = state.selectedCities.indexOf(city);
    if (index > -1) {
        state.selectedCities.splice(index, 1);
        clearArcs();
        updateSelectedCitiesUI();
        updateMapView();
    }
}

// --- City Search ---
function searchCities(query: string): FuseResult<City>[] {
    if (!state.fuse || query.trim().length === 0) return [];
    return state.fuse.search(query).slice(0, 10);
}

function handleSearch(event: Event): void {
    const query = (event.target as HTMLInputElement).value.trim();
    const results = searchCities(query);
    const resultsContainer = getElement<HTMLElement>('.search-results');

    state.selectedSearchIndex = 0;
    displayResults(results, resultsContainer);
}

function displayResults(results: FuseResult<City>[], container: HTMLElement): void {
    container.innerHTML = '';

    if (results.length === 0) {
        container.innerHTML = '<p>No cities found</p>';
        return;
    }

    const ul = createElement('ul');

    results.forEach((result, index) => {
        const city = result.item;
        const li = createElement('li', { textContent: getCityDisplayName(city) });

        li.addEventListener('click', () => selectCity(city));
        li.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') selectCity(city);
        });

        if (index === 0) li.classList.add('selected');
        ul.appendChild(li);
    });

    container.appendChild(ul);
}

function updateSelectedResult(items: NodeListOf<Element>, index: number): void {
    items.forEach(item => item.classList.remove('selected'));
    items[index].classList.add('selected');
    items[index].scrollIntoView({ block: 'nearest' });
}

function clearSearch(): void {
    const searchInput = getElement<HTMLInputElement>('.city-search-input');
    const resultsContainer = getElement<HTMLElement>('.search-results');
    searchInput.value = '';
    resultsContainer.innerHTML = '';
}

function setupKeyboardNavigation(searchInput: HTMLInputElement): void {
    searchInput.addEventListener('keydown', (event: KeyboardEvent) => {
        const resultsItems = document.querySelectorAll('.search-results li');
        const itemCount = resultsItems.length;

        if (itemCount === 0) return;

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                state.selectedSearchIndex = (state.selectedSearchIndex + 1) % itemCount;
                updateSelectedResult(resultsItems, state.selectedSearchIndex);
                break;

            case 'ArrowUp':
                event.preventDefault();
                state.selectedSearchIndex = (state.selectedSearchIndex - 1 + itemCount) % itemCount;
                updateSelectedResult(resultsItems, state.selectedSearchIndex);
                break;

            case 'Enter':
                event.preventDefault();
                if (itemCount > 0) {
                    (resultsItems[state.selectedSearchIndex] as HTMLElement).click();
                }
                break;
        }
    });
}

// Add this new function to handle keyboard navigation for routes
function setupRouteKeyboardNavigation(): void {
    document.addEventListener('keydown', (event: KeyboardEvent) => {
        // Only handle keyboard navigation when search results are not visible
        const searchResults = document.querySelector('.search-results');
        if (searchResults && searchResults.innerHTML.trim() !== '') return;

        const routeContainers = document.querySelectorAll('.solution-container');
        const routeCount = routeContainers.length;

        if (routeCount === 0) return;

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                state.selectedRouteIndex = (state.selectedRouteIndex + 1) % routeCount;
                updateSelectedRoute(routeContainers, state.selectedRouteIndex);
                break;

            case 'ArrowUp':
                event.preventDefault();
                state.selectedRouteIndex = (state.selectedRouteIndex - 1 + routeCount) % routeCount;
                updateSelectedRoute(routeContainers, state.selectedRouteIndex);
                break;

            case 'Enter':
                event.preventDefault();
                if (routeCount > 0) {
                    const currentRoute = routeContainers[state.selectedRouteIndex] as HTMLElement;
                    toggleRouteSelection(currentRoute);
                }
                break;
        }
    });
}

function updateSelectedRoute(items: NodeListOf<Element>, index: number): void {
    // First remove all visual focus
    items.forEach(item => {
        item.classList.remove('keyboard-focus');
    });

    // Add visual focus to the selected route (without toggling selection)
    const selectedItem = items[index] as HTMLElement;
    selectedItem.classList.add('keyboard-focus');
    selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function toggleRouteSelection(routeElement: HTMLElement): void {
    // Remove selected from all other routes
    document.querySelectorAll('.solution-container').forEach(container => {
        if (container !== routeElement) container.classList.remove('selected');
    });

    // Toggle selected class on current route
    routeElement.classList.toggle('selected');

    // Dispatch the same custom event as when clicking
    const solutionClickEvent = new CustomEvent('solution-click', {
        detail: {
            html: routeElement.innerHTML,
            target: routeElement,
            isSelected: routeElement.classList.contains('selected')
        }
    });
    document.dispatchEvent(solutionClickEvent);
}

// --- UI Updates ---
function updateSelectedCitiesUI(): void {
    const container = getElement<HTMLElement>('.selected-cities');
    container.innerHTML = '<h3>Selected Cities:</h3>';

    const table = createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';

    const thead = createElement('thead');
    const headerRow = createElement('tr');

    const cityNameHeader = createElement('th', { textContent: 'City Name' });
    cityNameHeader.style.padding = '8px';
    cityNameHeader.style.borderBottom = '1px solid #ddd';
    cityNameHeader.style.textAlign = 'left';

    const flagHeader = createElement('th', { textContent: '' });
    flagHeader.style.padding = '8px';
    flagHeader.style.borderBottom = '1px solid #ddd';
    flagHeader.style.textAlign = 'center';

    const utcHeader = createElement('th', { textContent: 'UTC' });
    utcHeader.style.padding = '8px';
    utcHeader.style.borderBottom = '1px solid #ddd';
    utcHeader.style.textAlign = 'center';

    const removeHeader = createElement('th', { textContent: '' });
    removeHeader.style.padding = '8px';
    removeHeader.style.borderBottom = '1px solid #ddd';
    removeHeader.style.textAlign = 'center';

    headerRow.appendChild(cityNameHeader);
    headerRow.appendChild(flagHeader);
    headerRow.appendChild(utcHeader);
    headerRow.appendChild(removeHeader);
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = createElement('tbody');

    state.selectedCities.forEach((city) => {
        const row = createElement('tr');

        const cityNameCell = createElement('td', { textContent: city.name });
        cityNameCell.style.padding = '8px';
        cityNameCell.style.borderBottom = '1px solid #ddd';
        cityNameCell.style.textAlign = 'left';

        const flagCell = createElement('td', { textContent: countryCodeToEmoji(city.country_code) });
        flagCell.style.padding = '8px';
        flagCell.style.borderBottom = '1px solid #ddd';
        flagCell.style.textAlign = 'center';

        const utcCell = createElement('td', { textContent: getTimezoneOffsetString(city.timezone) });
        utcCell.style.padding = '8px';
        utcCell.style.borderBottom = '1px solid #ddd';
        utcCell.style.textAlign = 'center';

        const removeCell = createElement('td');
        removeCell.style.padding = '8px';
        removeCell.style.borderBottom = '1px solid #ddd';
        removeCell.style.textAlign = 'center';

        const removeBtn = createElement('button', { textContent: 'Remove' });
        removeBtn.addEventListener('click', () => removeCity(city));
        removeCell.appendChild(removeBtn);

        row.appendChild(cityNameCell);
        row.appendChild(flagCell);
        row.appendChild(utcCell);
        row.appendChild(removeCell);
        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    container.appendChild(table);

    clearCityMarkers();
    state.selectedCities.forEach((city, index) => {
        addCityMarker(city, index);
    });
}

// --- Timezone Helpers ---
function getTimezoneOffsetString(timezone: string): string {
    const now = DateTime.now().setZone(timezone);
    const offsetMinutes = now.offset;
    const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
    const remainingMinutes = Math.abs(offsetMinutes) % 60;
    const sign = offsetMinutes >= 0 ? '+' : '-';

    let offsetString = `${sign}${offsetHours}`;
    if (remainingMinutes > 0) {
        offsetString += `:${remainingMinutes.toString().padStart(2, '0')}`;
    }

    return offsetString;
}

// --- Matrix Calculation Functions ---
const calculateDistanceMatrix = (cities: City[]): number[][] =>
    cities.map((from, i) =>
        cities.map((to, j) =>
            i === j ? 0 : calculateDistanceGeodesy(from, to)
        )
    );

const calculateTimeMatrix = (cities: City[]): number[][] =>
    cities.map(cityI =>
        cities.map(cityJ => DateTime.now().setZone(cityI.timezone).offset - DateTime.now().setZone(cityJ.timezone).offset)
    );

const calculateDurationMatrix = (timeMatrix: number[][], timeDelta: number): number[][] =>
    timeMatrix.map(row =>
        row.map(value => {
            const adjusted = value + timeDelta;
            return adjusted < 0 ? adjusted + 24 * 60 : adjusted;
        })
    );

const calculatevelocityMatrix = (distanceMatrix: number[][], durationMatrix: number[][]): number[][] =>
    distanceMatrix.map((distRow, i) =>
        distRow.map((distance, j) => {
            if (i === j) return 0;
            const duration = durationMatrix[i][j];
            return duration === 0 ? 0 : Math.round((distance / 1000) / (duration / 60));
        })
    );

const calculateDistanceGeodesy = (city1: City, city2: City): number =>
    new LatLon(city1.latitude, city1.longitude).distanceTo(new LatLon(city2.latitude, city2.longitude));

// --- Model Data Creation ---
function createModelData(
    velocityMatrix: number[][],
    durationMatrix: number[][],
    velocityMin: number,
    velocityMax: number
): ModelData {
    const edges: [number, number][] = [];
    const costs: number[] = [];
    const n = velocityMatrix.length;

    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            if (i === j) continue;
            const velocity = velocityMatrix[i][j];
            if (velocity >= velocityMin && velocity <= velocityMax) {
                edges.push([i + 1, j + 1]);
                costs.push(velocity > 0 ? Math.round(durationMatrix[i][j]) : 0);
            }
        }
    }

    return { n, num_edges: edges.length, E: edges, c: costs };
}

// --- Solution Parsing ---
function generateRouteHtml(route: RouteLeg[]): string {
    const totalDurationMinutes = route.reduce((acc, leg) => {
        // Parse the duration string (HH:MM) into minutes
        const [hours, minutes] = leg.duration.split(':').map(Number);
        const legDurationMinutes = hours * 60 + minutes;
        return acc + legDurationMinutes;
    }, 0);

    const totalDurationHours = Math.floor(totalDurationMinutes / 60);
    const remainingMinutes = totalDurationMinutes % 60;
    const totalDurationString = `${totalDurationHours}hrs ${remainingMinutes}mins`;

    const routeRows = route.map(leg => `
        <tr>
            <td>${leg.from}</td>
            <td>${leg.to}</td>
            <td>${leg.duration}</td>
            <td>${leg.velocity}</td>
        </tr>
    `).join('');

    return `
        <div class="route-table-wrapper">
            <table class="route-table">
                <tr>
                    <th>From</th>
                    <th>To</th>
                    <th>Duration</th>
                    <th>Velocity (km/h)</th>
                </tr>
                ${routeRows}
                <tr class="total-row">
                    <td colspan="2"><b>Total Duration</b></td>
                    <td colspan="2"><b>${totalDurationString}</b></td>
                </tr>
            </table>
        </div>
    `;
}

function parseSolution(solution: any, modelData: ModelData, cities: City[], velocityMatrix: number[][]): string {
    const { x } = solution.output.json;
    const edges = modelData.E;
    const costs = modelData.c;

    let route: RouteLeg[] = [];
    let currentCityIndex = 0;

    for (let i = 0; i < cities.length; i++) {  // Changed from cities.length - 1 to cities.length
        let nextEdgeIndex = -1;
        for (let j = 0; j < edges.length; j++) {
            if (edges[j][0] === currentCityIndex + 1 && x[j] === 1) {
                nextEdgeIndex = j;
                break;
            }
        }

        if (nextEdgeIndex !== -1) {
            const nextCityIndex = edges[nextEdgeIndex][1] - 1;
            const durationMinutes = costs[nextEdgeIndex];
            const durationHours = Math.floor(durationMinutes / 60);
            const remainingMinutes = durationMinutes % 60;
            const durationString = `${durationHours}hrs ${remainingMinutes}mins`;

            route.push({ from: cities[currentCityIndex].name, to: cities[nextCityIndex].name, duration: durationString, velocity: velocityMatrix[currentCityIndex][nextCityIndex] });
            currentCityIndex = nextCityIndex;
        } else {
            console.warn("No outgoing edge found from city", currentCityIndex + 1);
            break;
        }
    }

    // Format durations as HH:MM
    route = route.map(leg => {
        const durationParts = leg.duration.split(' ');
        let legDurationMinutes = 0;
        durationParts.forEach(part => {
            if (part.includes('hrs')) {
                legDurationMinutes += parseInt(part) * 60;
            } else if (part.includes('mins')) {
                legDurationMinutes += parseInt(part);
            }
        });

        const hours = Math.floor(legDurationMinutes / 60);
        const minutes = legDurationMinutes % 60;
        const formattedDuration = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        return { ...leg, duration: formattedDuration };
    });

    const resultHtml = generateRouteHtml(route);
    return `<div class="solution-container">${resultHtml}</div>`;
}

// --- Setup Solve Button Function ---
function setupSolveButton(
    state: any
): void {
    const solveButton = document.querySelector<HTMLElement>('#solveButton');
    const outputDiv = document.querySelector<HTMLElement>('#output');
    if (!solveButton || !outputDiv) return;

    let routeContainer = document.querySelector<HTMLElement>('#routeContainer');
    if (!routeContainer) {
        routeContainer = document.createElement('div');
        routeContainer.id = 'routeContainer';
        routeContainer.style.display = 'none';
        outputDiv.appendChild(routeContainer);
    }

    solveButton.addEventListener('click', () => {
        routeContainer.innerHTML = '';
        routeContainer.style.display = 'block';

        if (state.selectedCities.length < 2) {
            routeContainer.innerHTML = '<p>Select at least two cities</p>';
            return;
        }

        const distanceMatrix = calculateDistanceMatrix(state.selectedCities);
        const timeMatrix = calculateTimeMatrix(state.selectedCities);

        // Get the time difference from the clock elements - updated for time input
        const leftTimeInput = document.getElementById(`timeInput-left`) as HTMLInputElement;
        const leftAmPm = (document.getElementById(`ampmToggle-left`) as HTMLButtonElement).textContent;
        const rightTimeInput = document.getElementById(`timeInput-right`) as HTMLInputElement;
        const rightAmPm = (document.getElementById(`ampmToggle-right`) as HTMLButtonElement).textContent;

        // Parse the time values
        const [leftHourStr, leftMinuteStr] = leftTimeInput.value.split(':');
        const [rightHourStr, rightMinuteStr] = rightTimeInput.value.split(':');

        const leftHour = parseInt(leftHourStr);
        const leftMinute = parseInt(leftMinuteStr);
        const rightHour = parseInt(rightHourStr);
        const rightMinute = parseInt(rightMinuteStr);

        // Convert to minutes from midnight
        let leftTime = leftHour * 60 + leftMinute;
        if (leftAmPm === 'PM' && leftHour !== 12) leftTime += 12 * 60;
        if (leftAmPm === 'AM' && leftHour === 12) leftTime -= 12 * 60; // Adjust for midnight

        let rightTime = rightHour * 60 + rightMinute;
        if (rightAmPm === 'PM' && rightHour !== 12) rightTime += 12 * 60;
        if (rightAmPm === 'AM' && rightHour === 12) rightTime -= 12 * 60; // Adjust for midnight

        const timeDelta = leftTime - rightTime;

        const durationMatrix = calculateDurationMatrix(timeMatrix, timeDelta);
        const velocityMatrix = calculatevelocityMatrix(distanceMatrix, durationMatrix);
        const modelData = createModelData(velocityMatrix, durationMatrix, state.velocityMin, state.velocityMax);

        const model = new Model();
        fetch('./tsp.mzn')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load tsp.mzn: ${response.status}`);
                }
                return response.text();
            })
            .then(modelText => {
                model.addFile('tsp.mzn', modelText);
                model.addJson(modelData);

                const solve = model.solve({
                    options: {
                        solver: 'gecode',
                        'all-solutions': false
                    }
                });

                solve.on('solution', (solution: any) => {
                    const routeString = parseSolution(
                        solution,
                        modelData,
                        state.selectedCities,
                        velocityMatrix
                    );
                    routeContainer.innerHTML += routeString;
                });

                return solve;
            })
            .then(result => {
                routeContainer.innerHTML += `<p>Status: ${result.status}</p>`;
                const solutionContainers = routeContainer.querySelectorAll('.solution-container');
                state.selectedRouteIndex = 0; // Reset route index whenever new solutions are shown

                solutionContainers.forEach((container, index) => {
                    container.addEventListener('click', (event) => {
                        document.querySelectorAll('.solution-container').forEach(c => {
                            if (c !== container) c.classList.remove('selected');
                        });

                        const target = event.currentTarget as HTMLElement;
                        target.classList.toggle('selected');

                        // Update selected route index when clicked
                        state.selectedRouteIndex = index;

                        const solutionClickEvent = new CustomEvent('solution-click', {
                            detail: {
                                html: target.innerHTML,
                                target: target,
                                isSelected: target.classList.contains('selected')
                            }
                        });
                        document.dispatchEvent(solutionClickEvent);
                    });

                    // Add visual indicator for keyboard focus on first route
                    if (index === 0) {
                        container.classList.add('keyboard-focus');
                    }
                });

                // Automatically select the first solution
                if (solutionContainers.length > 0) {
                    const firstSolution = solutionContainers[0] as HTMLElement;
                    toggleRouteSelection(firstSolution);
                }
            })
            .catch(error => {
                console.error('Error loading TSP model or solving:', error);
                routeContainer.innerHTML = `<p>Error: ${error.message}</p>`;
            });
    });
}

// --- UI Setup ---
function setupSearchUI(): void {
    try {
        const searchInput = getElement<HTMLInputElement>('.city-search-input');
        searchInput.addEventListener('input', handleSearch);
        setupKeyboardNavigation(searchInput);
        console.log("Search UI setup complete");
    } catch (error) {
        console.error("Failed to set up search UI:", error);
    }
}


function updateColorScale(min: number, max: number): void {
    const labelsContainer = document.querySelector('.color-scale-labels') as HTMLElement;

    // Clear existing labels
    labelsContainer.innerHTML = '';

    // Add min label - removed km/h
    const minLabel = document.createElement('span');
    minLabel.textContent = `${min}`;
    labelsContainer.appendChild(minLabel);

    // Add intermediate labels if the range is large enough
    const range = max - min;
    if (range > 500) {
        // Add quarter points
        for (let i = 1; i <= 3; i++) {
            const value = min + Math.round((range * i) / 4);
            const label = document.createElement('span');
            label.textContent = `${value}`; // removed km/h
            labelsContainer.appendChild(label);
        }
    }

    // Add max label - removed km/h
    const maxLabel = document.createElement('span');
    maxLabel.textContent = `${max}`;
    labelsContainer.appendChild(maxLabel);
}

// --- Velocity Preset Configuration ---
const presets = {
    extreme: { min: 13, max: 7200 },
    concorde: { min: 500, max: 2200 },
    commercial: { min: 500, max: 900 },
    custom: { min: 13, max: 7200 }
};

function setupvelocityPresets(): void {
    try {
        const velocityMinInput = getElement<HTMLInputElement>('#velocityMin');
        const velocityMaxInput = getElement<HTMLInputElement>('#velocityMax');

        // Initialize state with extreme values (changed from commercial)
        state.velocityMin = presets.extreme.min;
        state.velocityMax = presets.extreme.max;

        // Set up radio button listeners
        document.querySelectorAll('input[name="velocityPreset"]').forEach((radio) => {
            radio.addEventListener('change', (event) => {
                const presetType = (event.target as HTMLInputElement).value;
                const preset = presets[presetType as keyof typeof presets];

                if (presetType === 'custom') {
                    // Enable custom inputs
                    velocityMinInput.disabled = false;
                    velocityMaxInput.disabled = false;

                    // Use existing values or default
                    state.velocityMin = parseInt(velocityMinInput.value) || preset.min;
                    state.velocityMax = parseInt(velocityMaxInput.value) || preset.max;
                } else {
                    // Disable custom inputs for fixed presets
                    velocityMinInput.disabled = true;
                    velocityMaxInput.disabled = true;

                    // Set to preset values
                    state.velocityMin = preset.min;
                    state.velocityMax = preset.max;

                    // Update input fields to show the preset values
                    velocityMinInput.value = preset.min.toString();
                    velocityMaxInput.value = preset.max.toString();
                }

                updateColorScale(state.velocityMin, state.velocityMax);
            });
        });

        // Add listeners for custom input changes
        velocityMinInput.addEventListener('change', (event) => {
            if (!velocityMinInput.disabled) {
                state.velocityMin = parseInt((event.target as HTMLInputElement).value);
                updateColorScale(state.velocityMin, state.velocityMax);
            }
        });

        velocityMaxInput.addEventListener('change', (event) => {
            if (!velocityMaxInput.disabled) {
                state.velocityMax = parseInt((event.target as HTMLInputElement).value);
                updateColorScale(state.velocityMin, state.velocityMax);
            }
        });

        console.log("Velocity presets setup complete");
    } catch (error) {
        console.error("Failed to set up velocity presets:", error);
    }
}

// --- Utilities ---
const emojiCache = new Map<string, string>();

function countryCodeToEmoji(code: string): string {
    const cached = emojiCache.get(code);
    if (cached) {
        return cached;
    }

    const letter1 = code[0].toUpperCase();
    const letter2 = code[1].toUpperCase();
    const offset1 = letter1.charCodeAt(0) - 'A'.charCodeAt(0);
    const offset2 = letter2.charCodeAt(0) - 'A'.charCodeAt(0);
    const codePoint1 = 0x1f1e6 + offset1;
    const codePoint2 = 0x1f1e6 + offset2;
    const emoji = String.fromCodePoint(codePoint1) + String.fromCodePoint(codePoint2);

    emojiCache.set(code, emoji);
    return emoji;
}

function getCityDisplayName(city: City): string {
    return `${city.name}, ${countryCodeToEmoji(city.country_code)}`;
}

function getElement<T extends HTMLElement>(selector: string): T {
    const element = document.querySelector<T>(selector);
    if (!element) throw new Error(`Element not found: ${selector}`);
    return element;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    options?: { className?: string; textContent?: string }
): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    if (options?.className) element.className = options.className;
    if (options?.textContent) element.textContent = options.textContent;
    return element;
}

function getViridisColor(value: number): string {
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

function parseRouteFromHtml(htmlContent: string): Array<{ from: string, to: string, velocity: number }> {
    const route: Array<{ from: string, to: string, velocity: number }> = [];

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;

    const rows = tempDiv.querySelectorAll('.route-table tr');

    // Initialize velocity min/max
    let minVelocity = Number.MAX_VALUE;
    let maxVelocity = Number.MIN_VALUE;

    for (let i = 1; i < rows.length - 1; i++) {
        const cells = rows[i].querySelectorAll('td');
        if (cells.length >= 4) {
            const from = cells[0].textContent?.trim() || '';
            const to = cells[1].textContent?.trim() || '';
            const velocityText = cells[3].textContent?.trim() || '0';
            const velocity = parseInt(velocityText.replace(/[^\d]/g, ''));

            // Update min/max velocity
            if (velocity < minVelocity) minVelocity = velocity;
            if (velocity > maxVelocity) maxVelocity = velocity;

            route.push({ from, to, velocity });
        }
    }

    // Update state with the route's velocity range
    if (route.length > 0) {
        state.velocityMin = minVelocity;
        state.velocityMax = maxVelocity;
    }

    return route;
}

// --- Initialization ---
function initialize(): void {
    loadCities().catch(error => {
        console.error('Error loading cities data:', error);
    });
}

function loadCities(): Promise<City[]> {
    return fetch('./cities.json')
        .then(response => response.json())
        .then(data => {
            state.cities = data;
            state.fuse = new Fuse(state.cities, {
                keys: ['name'],
                threshold: 0.3,
                sortFn: (a, b) => {
                    const itemA = state.cities[a.idx];
                    const itemB = state.cities[b.idx];
                    return itemB.population - itemA.population;
                }
            });
            console.log(`Loaded ${state.cities.length} cities`);
            return data;
        });
}

function updateMapView(): void {
    if (state.selectedCities.length === 0) return;

    const coordinates = state.selectedCities.map(city => fromLonLat([city.longitude, city.latitude]));
    const extent = boundingExtent(coordinates);
    const map = vectorLayer.get('map'); // Corrected method to get the map instance
    if (map != null) {  // now checking explicitly
        map.getView().fit(extent, { padding: [50, 50, 50, 50], duration: 1000 });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initialize();
    setupSolveButton(state);
    setupSearchUI();
    setupvelocityPresets(); // Replace setupvelocityMinInput, setupvelocityMaxInput, and setupPresetButtons
    setupMap();
    setupRouteKeyboardNavigation(); // Add this new function call

    document.addEventListener('solution-click', (event: Event) => {
        const customEvent = event as CustomEvent;
        const isSelected = customEvent.detail.isSelected;

        const scaleLabels = document.querySelector('.color-scale-labels');
        if (scaleLabels) {
            if (isSelected) {
                updateColorScale(state.velocityMin, state.velocityMax);
            } else {
                scaleLabels.innerHTML = '';
            }
        }

        if (isSelected) {
            const routeData = parseRouteFromHtml(customEvent.detail.html);

            // Store the current route in state
            state.currentRoute = routeData;

            // Update color scale with the route's velocity range
            if (scaleLabels) {
                updateColorScale(state.velocityMin, state.velocityMax);
            }

            // Draw the route arcs using the updated velocity range
            drawRouteArcs(routeData);
        } else {
            // Clear state and UI when no route is selected
            state.currentRoute = [];
            if (scaleLabels) {
                scaleLabels.innerHTML = '';
            }
            clearArcs();
        }
    });
});