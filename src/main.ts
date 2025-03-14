import './style.scss';
import Fuse, { FuseResult } from 'fuse.js';
import Feature from 'ol/Feature';
import { Model } from 'https://cdn.jsdelivr.net/npm/minizinc/dist/minizinc.mjs';
import LatLon from 'geodesy/latlon-ellipsoidal-vincenty.js';
import { DateTime } from 'luxon';
import './clock';
import { City, ModelData, RouteLeg } from './types';
import * as mapService from './mapService';

// --- State ---
let state = {
    cities: [] as City[],
    fuse: null as Fuse<City> | null,
    selectedCities: [] as City[],
    selectedSearchIndex: 0,
    selectedRouteIndex: 0,
    velocityMin: 0,
    velocityMax: 0,
    currentArcs: [] as Feature[],
    currentRoute: [] as Array<{ from: string, to: string, velocity: number }>,
    visitationOrder: [] as City[],
    // Load exampleHintHidden from localStorage or default to false
    exampleHintHidden: localStorage.getItem('exampleHintHidden') === 'true'
};

// --- URL Parameter Handling ---
// Parse URL query parameters
function parseUrlParams(): Map<string, string> {
    const params = new Map<string, string>();
    const queryString = window.location.search.substring(1);
    
    if (queryString) {
        const pairs = queryString.split('&');
        for (const pair of pairs) {
            const [key, value] = pair.split('=');
            params.set(decodeURIComponent(key), decodeURIComponent(value));
        }
    }
    
    return params;
}

// Select cities by their indices in the cities array
function selectCitiesByIndices(indices: number[]): void {
    indices.forEach(index => {
        if (index >= 0 && index < state.cities.length) {
            const city = state.cities[index];
            if (!isCitySelected(city)) {
                // Use direct addition to avoid recursive URL updates
                state.selectedCities.push(city);
                console.log(`Selected city ${city.name} (${city.country_code}) at index ${index} from URL parameter`);
            }
        } else {
            console.warn(`Invalid city index in URL: ${index}`);
        }
    });
    
    // Only update UI once after all cities are selected
    if (indices.length > 0) {
        updateSelectedCitiesUI();
        mapService.updateMapView(state.selectedCities);
    }
}

// Update URL with current state (selected cities and velocity presets)
function updateUrlWithState(): void {
    const cityIndices = state.selectedCities.map(selectedCity => 
        state.cities.findIndex(city => 
            city.name === selectedCity.name && city.country_code === selectedCity.country_code
        )
    ).filter(index => index !== -1);
    
    // Create a URL that works across different deployments
    const url = new URL(window.location.href);
    
    // Update city indices
    if (cityIndices.length > 0) {
        url.searchParams.set('cities', cityIndices.join(','));
    } else {
        url.searchParams.delete('cities');
    }
    
    // Update velocity parameters
    url.searchParams.set('vmin', state.velocityMin.toString());
    url.searchParams.set('vmax', state.velocityMax.toString());
    
    // Find which preset is currently active
    let activePreset = 'custom';
    for (const [presetName, presetValues] of Object.entries(presets)) {
        if (presetValues.min === state.velocityMin && presetValues.max === state.velocityMax) {
            activePreset = presetName;
            break;
        }
    }
    
    url.searchParams.set('preset', activePreset);
    
    window.history.replaceState({}, '', url.toString());
}

// --- Map Integration Functions ---
function clearArcs(): void {
    mapService.removeFeatures(state.currentArcs);
    state.currentArcs = [];
}

function drawRouteArcs(routeData: Array<{ from: string, to: string, velocity?: number }>): void {
    clearArcs();

    state.currentArcs = mapService.drawRouteArcs(
        routeData,
        state.selectedCities,
        state.velocityMin,
        state.velocityMax
    );
}

// --- City Selection ---
function selectCity(city: City): void {
    if (!isCitySelected(city)) {
        // Find the index of this city in the original cities array
        const cityIndex = state.cities.findIndex(c => 
            c.name === city.name && c.country_code === city.country_code);
        
        console.log(`Adding city ${city.name} (${city.country_code}) at index ${cityIndex} in cities.json`);
        
        state.selectedCities.push(city);
        updateSelectedCitiesUI();
        
        // Update URL with the new selection
        updateUrlWithState();

        // Scroll to the selected cities container
        const selectedCitiesContainer = document.querySelector('.selected-cities');
        if (selectedCitiesContainer) {
            selectedCitiesContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        
        // If we now have at least 2 cities, clear any existing warning in the route container
        if (state.selectedCities.length === 2) {
            const routeContainer = document.querySelector<HTMLElement>('#routeContainer');
            if (routeContainer && routeContainer.innerHTML.includes('Select at least two cities')) {
                routeContainer.innerHTML = '';
            }
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
        mapService.updateMapView(state.selectedCities);
        
        // Update URL after removing a city
        updateUrlWithState();
    }
}

// Add this function to remove the last selected city
function removeLastCity(): void {
    if (state.selectedCities.length > 0) {
        const lastCity = state.selectedCities[state.selectedCities.length - 1];
        removeCity(lastCity);
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

    // Hide example hint if all three suggested cities are selected
    const londonSelected = state.selectedCities.some(city => 
        city.name.toLowerCase().includes('london'));
    const newYorkSelected = state.selectedCities.some(city => 
        city.name.toLowerCase().includes('new york'));
    const losAngelesSelected = state.selectedCities.some(city => 
        city.name.toLowerCase().includes('los angeles'));
    
    // Set the flag to true if all cities are selected and save to localStorage
    if (londonSelected && newYorkSelected && losAngelesSelected) {
        state.exampleHintHidden = true;
        localStorage.setItem('exampleHintHidden', 'true');
    }
    
    // Use the flag to determine visibility - once hidden, stays hidden
    const exampleHint = document.querySelector<HTMLElement>('.example-hint');
    if (exampleHint) {
        exampleHint.style.display = state.exampleHintHidden ? 'none' : '';
    }

    mapService.clearCityMarkers();
    state.selectedCities.forEach((city, index) => {
        mapService.addCityMarker(city, index);
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

function addBackToMapButton(container: HTMLElement): void {
    // Remove any existing back-to-map button first
    const existingButton = container.querySelector('.back-to-map-button');
    if (existingButton) {
        existingButton.remove();
    }

    // Create the button
    const backButton = createElement('button', {
        className: 'back-to-map-button',
        textContent: 'Back to Map'
    });

    // Add click handler to scroll back to the map
    backButton.addEventListener('click', () => {
        const mapElement = document.getElementById('map');
        if (mapElement) {
            // Scroll to center the map in the viewport instead of aligning to the top
            // This will effectively show more content above the map
            mapElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });

    // Append to the container
    container.appendChild(backButton);
}

// Add helper to compute extra leg between the last and first city
function computeExtraLeg(fromCity: City, toCity: City, velocityMin: number, velocityMax: number): RouteLeg {
    const distance = calculateDistanceGeodesy(fromCity, toCity); // in meters
    const avgVelocity = Math.round((velocityMin + velocityMax) / 2);
    const durationMinutes = Math.round((distance / 1000) / avgVelocity * 60);
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    const durationStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    return { from: fromCity.name, to: toCity.name, duration: durationStr, velocity: avgVelocity };
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
            const durationString = `${durationHours.toString().padStart(2, '0')}:${remainingMinutes.toString().padStart(2, '0')}`;
            route.push({ from: cities[currentCityIndex].name, to: cities[nextCityIndex].name, duration: durationString, velocity: velocityMatrix[currentCityIndex][nextCityIndex] });
            currentCityIndex = nextCityIndex;
        } else {
            console.warn("No outgoing edge found from city", currentCityIndex + 1);
            break;
        }
    }

    // Instead of removing duplicate final city, append extra leg if needed
    if (route.length > 0 && route[route.length - 1].to !== route[0].from) {
        const startCity = cities.find(c => c.name === route[0].from)!;
        const endCity = cities.find(c => c.name === route[route.length - 1].to)!;
        const extraLeg = computeExtraLeg(endCity, startCity, state.velocityMin, state.velocityMax);
        route.push(extraLeg);
    }

    // Compute visitation order without adding the duplicate starting city from the extra leg.
    let visitationOrder: City[] = [];
    if (state.selectedCities.length > 0 && route.length > 0) {
        const firstCity = state.selectedCities.find(c => c.name === route[0].from);
        if (firstCity) {
            visitationOrder.push(firstCity);
        }
        // Add all cities from the route except when the leg ends in the same city as the first.
        route.slice(0, route.length - 1).forEach(leg => {
            const nextCity = state.selectedCities.find(c => c.name === leg.to);
            if (nextCity) {
                visitationOrder.push(nextCity);
            }
        });
    }
    state = { ...state, visitationOrder };
    const resultHtml = generateRouteHtml(route);
    return `<div class="solution-container">${resultHtml}</div>`;
}

// Add this new function to convert solver status to user-friendly message with styling
function formatSolverStatus(status: string): string {
    const statusMessages: Record<string, { message: string, className: string }> = {
        'OPTIMAL_SOLUTION': {
            message: 'Optimal solution found',
            className: 'status-success'
        },
        'SATISFIED': {
            message: 'Solution found',
            className: 'status-success'
        },
        'UNSATISFIABLE': {
            message: 'No solution exists with current constraints',
            className: 'status-error'
        },
        'UNKNOWN': {
            message: 'Could not determine if a solution exists',
            className: 'status-warning'
        },
        'ERROR': {
            message: 'An error occurred while solving',
            className: 'status-error'
        },
        'UNBOUNDED': {
            message: 'Problem is unbounded',
            className: 'status-warning'
        },
        'UNSAT_OR_UNBOUNDED': {
            message: 'Problem is unsatisfiable or unbounded',
            className: 'status-warning'
        }
    };

    const defaultStatus = {
        message: `Solver status: ${status}`,
        className: 'status-info'
    };

    const result = statusMessages[status] || defaultStatus;

    return `<div class="solver-status ${result.className}">${result.message}</div>`;
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
        // Clear any existing content including previous warnings
        routeContainer.innerHTML = '';
        routeContainer.style.display = 'block';

        if (state.selectedCities.length < 2) {
            routeContainer.innerHTML = '<div class="solver-status status-warning">Select at least two cities</div>';
            return;
        }

        // Continue with the solving process
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
                routeContainer.innerHTML += formatSolverStatus(result.status);
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
                // if (solutionContainers.length > 0) {
                //     const firstSolution = solutionContainers[0] as HTMLElement;
                //     toggleRouteSelection(firstSolution);
                // }

                // Add the back to map button after solutions are displayed
                addBackToMapButton(routeContainer);
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
    const container = document.querySelector('.color-scale-labels') as HTMLElement;
    container.innerHTML = '';

    const range = max - min;
    if (range <= 0) return;

    // Round min and max to nearest 100
    const niceMin = Math.floor(min / 100) * 100;
    const niceMax = Math.ceil(max / 100) * 100;

    // Choose a step based on the range magnitude
    let step;
    if (range > 5000) {
        step = 1000;
    } else if (range > 2000) {
        step = 500;
    } else if (range > 1000) {
        step = 200;
    } else {
        step = 100;
    }

    // Generate labels without tick marks
    for (let value = niceMin + step; value < niceMax; value += step) {
        // Create a wrapper div to hold the label
        const labelGroup = document.createElement('div');
        labelGroup.className = 'scale-label-group';
        
        // Create text label
        const label = document.createElement('span');
        label.className = 'scale-label-text';
        label.textContent = value.toString();
        
        // Add elements to the container
        labelGroup.appendChild(label);
        container.appendChild(labelGroup);
    }
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
                
                // Update URL with new velocity presets
                updateUrlWithState();
            });
        });

        // Add listeners for custom input changes
        velocityMinInput.addEventListener('change', (event) => {
            if (!velocityMinInput.disabled) {
                state.velocityMin = parseInt((event.target as HTMLInputElement).value);
                updateColorScale(state.velocityMin, state.velocityMax);
                // Update URL with new custom velocity
                updateUrlWithState();
            }
        });

        velocityMaxInput.addEventListener('change', (event) => {
            if (!velocityMaxInput.disabled) {
                state.velocityMax = parseInt((event.target as HTMLInputElement).value);
                updateColorScale(state.velocityMin, state.velocityMax);
                // Update URL with new custom velocity
                updateUrlWithState();
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

// --- Keyboard Shortcuts ---
function setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (event: KeyboardEvent) => {
        // Check for Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux)
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault(); // Prevent default browser behavior
            
            const solveButton = document.querySelector<HTMLElement>('#solveButton');
            if (solveButton) {
                solveButton.click();
            }
        }
        
        // Check for Cmd+K (Mac) or Ctrl+K (Windows/Linux) to remove last city
        if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault(); // Prevent default browser behavior
            
            // Don't remove cities when user is focused on search input
            const activeElement = document.activeElement;
            if (activeElement && activeElement.tagName === 'INPUT') {
                return;
            }
            
            removeLastCity();
        }
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
            
            // Check for parameters in URL after cities are loaded
            const params = parseUrlParams();
            
            // Handle city indices
            if (params.has('cities')) {
                const cityIndices = params.get('cities')!
                    .split(',')
                    .map(index => parseInt(index.trim(), 10))
                    .filter(index => !isNaN(index));
                
                selectCitiesByIndices(cityIndices);
            }
            
            // Handle velocity presets
            if (params.has('vmin')) {
                const vmin = parseInt(params.get('vmin')!);
                if (!isNaN(vmin)) {
                    state.velocityMin = vmin;
                }
            }
            
            if (params.has('vmax')) {
                const vmax = parseInt(params.get('vmax')!);
                if (!isNaN(vmax)) {
                    state.velocityMax = vmax;
                }
            }
            
            // Set preset radio button based on URL
            if (params.has('preset')) {
                const presetName = params.get('preset')!;
                if (presetName in presets) {
                    const presetRadio = document.querySelector(`input[name="velocityPreset"][value="${presetName}"]`) as HTMLInputElement;
                    if (presetRadio) {
                        presetRadio.checked = true;
                        
                        // Update input fields if applicable
                        const velocityMinInput = document.getElementById('velocityMin') as HTMLInputElement;
                        const velocityMaxInput = document.getElementById('velocityMax') as HTMLInputElement;
                        
                        if (presetName === 'custom') {
                            // Enable custom inputs
                            velocityMinInput.disabled = false;
                            velocityMaxInput.disabled = false;
                        } else {
                            // Disable custom inputs for fixed presets
                            velocityMinInput.disabled = true;
                            velocityMaxInput.disabled = true;
                        }
                        
                        // Set input values
                        velocityMinInput.value = state.velocityMin.toString();
                        velocityMaxInput.value = state.velocityMax.toString();
                    }
                }
            }
            
            return data;
        });
}

// Add this function to hide the hint on initial load if needed
function checkExampleHintVisibility(): void {
    if (state.exampleHintHidden) {
        const exampleHint = document.querySelector<HTMLElement>('.example-hint');
        if (exampleHint) {
            exampleHint.style.display = 'none';
        }
    }
}

// Function to get the clock state from the DOM
function getClockStateFromDOM(clockSide: 'left' | 'right'): { hour: number, minute: number, ampm: 'AM' | 'PM' } {
    const timeInput = document.getElementById(`timeInput-${clockSide}`) as HTMLInputElement;
    const ampmToggle = document.getElementById(`ampmToggle-${clockSide}`) as HTMLButtonElement;

    const [hourStr, minuteStr] = timeInput.value.split(':');
    const hour = parseInt(hourStr);
    const minute = parseInt(minuteStr);
    const ampm = ampmToggle.textContent as 'AM' | 'PM';

    return { hour, minute, ampm };
}

// Function to update the URL with the clock state
function updateUrlWithClockState(): void {
    const url = new URL(window.location.href);

    // Get clock states from both left and right clocks
    const leftClockState = getClockStateFromDOM('left');
    const rightClockState = getClockStateFromDOM('right');

    // Set URL parameters for left clock
    url.searchParams.set('leftHour', leftClockState.hour.toString());
    url.searchParams.set('leftMinute', leftClockState.minute.toString());
    url.searchParams.set('leftAmPm', leftClockState.ampm);

    // Set URL parameters for right clock
    url.searchParams.set('rightHour', rightClockState.hour.toString());
    url.searchParams.set('rightMinute', rightClockState.minute.toString());
    url.searchParams.set('rightAmPm', rightClockState.ampm);

    window.history.replaceState({}, '', url.toString());
}

// Function to parse clock state from URL parameters
function parseClockStateFromUrl(): void {
    const params = parseUrlParams();

    // Function to set clock state from URL parameters
    const setClockStateFromParams = (clockSide: 'left' | 'right') => {
        const hourParam = params.get(`${clockSide}Hour`);
        const minuteParam = params.get(`${clockSide}Minute`);
        const ampmParam = params.get(`${clockSide}AmPm`);

        if (hourParam && minuteParam && ampmParam) {
            const hour = parseInt(hourParam);
            const minute = parseInt(minuteParam);
            const ampm = ampmParam as 'AM' | 'PM';

            // Update the clock state in the DOM
            const timeInput = document.getElementById(`timeInput-${clockSide}`) as HTMLInputElement;
            const ampmToggle = document.getElementById(`ampmToggle-${clockSide}`) as HTMLButtonElement;

            timeInput.value = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            ampmToggle.textContent = ampm;
        }
    };

    // Set clock states for both left and right clocks
    setClockStateFromParams('left');
    setClockStateFromParams('right');
}

document.addEventListener('DOMContentLoaded', () => {
    initialize();
    setupSolveButton(state);
    setupSearchUI();
    setupvelocityPresets();
    mapService.setupMap();
    setupRouteKeyboardNavigation();
    setupKeyboardShortcuts(); // Add this line to set up keyboard shortcuts
    checkExampleHintVisibility(); // Add this line to check hint visibility on page load
    parseClockStateFromUrl(); // Parse clock state from URL on page load

    // Add event listeners to clock elements to update URL
    const leftAmpmToggle = document.getElementById('ampmToggle-left');
    leftAmpmToggle?.addEventListener('click', updateUrlWithClockState);

    const rightAmpmToggle = document.getElementById('ampmToggle-right');
    rightAmpmToggle?.addEventListener('click', updateUrlWithClockState);

    const leftTimeInput = document.getElementById('timeInput-left');
    leftTimeInput?.addEventListener('input', updateUrlWithClockState);

    const rightTimeInput = document.getElementById('timeInput-right');
    rightTimeInput?.addEventListener('input', updateUrlWithClockState);

    // Dispatch a custom event when the hour hand is dragged
    document.addEventListener('mouseup', () => {
        updateUrlWithClockState();
    });
    document.addEventListener('touchend', () => {
        updateUrlWithClockState();
    });

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
            // NEW: Update the map markers to show numbered labels following the visitation order
            mapService.updateCityMarkersWithLabels(state.visitationOrder);
        } else {
            // Clear state and UI when no route is selected
            state.currentRoute = [];
            if (scaleLabels) {
                scaleLabels.innerHTML = '';
            }
            clearArcs();
            mapService.clearCityMarkers();
            state.selectedCities.forEach((city, index) => {
                mapService.addCityMarker(city, index);
            });
        }
    });
});