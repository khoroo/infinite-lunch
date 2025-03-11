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
    // Add new property for visitation order
    visitationOrder: [] as City[]
};

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
        mapService.updateMapView(state.selectedCities);
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
    console.log("Visitation order:", visitationOrder);
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

document.addEventListener('DOMContentLoaded', () => {
    initialize();
    setupSolveButton(state);
    setupSearchUI();
    setupvelocityPresets();
    mapService.setupMap();
    setupRouteKeyboardNavigation();

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
            console.log("Updating markers with visitation order:", state.visitationOrder);
            mapService.updateCityMarkersWithLabels(state.visitationOrder);
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