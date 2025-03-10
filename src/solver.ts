import { Model } from 'https://cdn.jsdelivr.net/npm/minizinc/dist/minizinc.mjs';
import { City } from './main';
import LatLon from 'geodesy/latlon-ellipsoidal-vincenty.js';
import { DateTime } from 'luxon';


// --- Matrix Calculation Functions ---
function calculateDistanceMatrix(cities: City[]): number[][] {
    return cities.map((from, i) =>
        cities.map((to, j) =>
            i === j ? 0 : new LatLon(from.latitude, from.longitude).distanceTo(new LatLon(to.latitude, to.longitude))
        )
    );
}

function calculateTimeMatrix(cities: City[]): number[][] {
    return cities.map(cityI =>
        cities.map(cityJ => DateTime.now().setZone(cityI.timezone).offset - DateTime.now().setZone(cityJ.timezone).offset)
    );
}

function calculateDurationMatrix(timeMatrix: number[][], timeDelta: number): number[][] {
    return timeMatrix.map(row =>
        row.map(value => {
            const adjusted = value + timeDelta;
            return adjusted < 0 ? adjusted + 24 * 60 : adjusted;
        })
    );
}

function calculateSpeedMatrix(distanceMatrix: number[][], durationMatrix: number[][]): number[][] {
    return distanceMatrix.map((distRow, i) =>
        distRow.map((distance, j) => {
            if (i === j) return 0;
            const duration = durationMatrix[i][j];
            return duration === 0 ? 0 : Math.round((distance / 1000) / (duration / 60));
        })
    );
}

// --- Model Data Creation ---
interface ModelData {
    n: number;
    num_edges: number;
    E: [number, number][];
    c: number[];
}

function createModelData(
    speedMatrix: number[][],
    durationMatrix: number[][],
    speedMin: number,
    speedMax: number
): ModelData {
    const edges: [number, number][] = [];
    const costs: number[] = [];
    const n = speedMatrix.length;

    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            if (i === j) continue;
            const speed = speedMatrix[i][j];
            if (speed >= speedMin && speed <= speedMax) {
                edges.push([i + 1, j + 1]);
                costs.push(speed > 0 ? Math.round(durationMatrix[i][j]) : 0);
            }
        }
    }

    return { n, num_edges: edges.length, E: edges, c: costs };
}

/*

x: This is an array of binary variables (0 or 1). Each element x[i] represents
whether the salesman travels along the i-th arc in the set of arcs E. If x[i] is
1, it means the salesman travels along that arc; if x[i] is 0, it means the
salesman does not travel along that arc.

y: This is an array of integer variables. Each element y[i] represents the
number of cars the salesman has after leaving the starting node and before
entering the next node through the i-th arc in the set of arcs E. In terms of
network analysis, y[i] represents the flow through the arc (i, j).

*/
// --- Solution Parsing ---
function generateRouteHtml(route: Array<{ from: string; to: string; duration: string; speed: number }>): string {
    let html = `<table class="route-table">
        <tr>
            <th>From</th>
            <th>To</th>
            <th>Duration</th>
            <th>Speed</th>
        </tr>`;
    let totalDurationMinutes = 0;
    route.forEach(leg => {
        const durationParts = leg.duration.split(' ');
        let legDurationMinutes = 0;
        durationParts.forEach(part => {
            if (part.includes('hrs')) {
                legDurationMinutes += parseInt(part) * 60;
            } else if (part.includes('mins')) {
                legDurationMinutes += parseInt(part);
            }
        });
        totalDurationMinutes += legDurationMinutes;
        html += `<tr>
            <td>${leg.from}</td>
            <td>${leg.to}</td>
            <td>${leg.duration}</td>
            <td>${leg.speed} km/h</td>
        </tr>`;
    });
    const totalDurationHours = Math.floor(totalDurationMinutes / 60);
    const remainingMinutes = totalDurationMinutes % 60;
    let totalDurationString = `${totalDurationHours}hrs`;
    if (remainingMinutes > 0) {
        totalDurationString += ` ${remainingMinutes}mins`;
    }
    html += `<tr class="total-row">
        <td colspan="2"><b>Total Duration</b></td>
        <td colspan="2"><b>${totalDurationString}</b></td>
    </tr>`;
    html += `</table>`;
    return html;
}

function parseSolution(solution: any, modelData: ModelData, cities: City[], speedMatrix: number[][]): string {
    const { x } = solution.output.json;
    const edges = modelData.E;
    const costs = modelData.c;

    let route = [];
    let currentCityIndex = 0;

    for (let i = 0; i < cities.length - 1; i++) {
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
            let durationString = `${durationHours}hrs`;
            if (remainingMinutes > 0) {
                durationString += ` ${remainingMinutes}mins`;
            }

            const speed = speedMatrix[currentCityIndex][nextCityIndex];

            route.push({ from: cities[currentCityIndex].name, to: cities[nextCityIndex].name, duration: durationString, speed: speed });
            currentCityIndex = nextCityIndex;
        } else {
            console.warn("No outgoing edge found from city", currentCityIndex + 1);
            break;
        }
    }

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

    // Ensure we have a #routeContainer
    let routeContainer = document.querySelector<HTMLElement>('#routeContainer');
    if (!routeContainer) {
        routeContainer = document.createElement('div'); // Added creation here
        routeContainer.id = 'routeContainer';
        routeContainer.style.display = 'none'; // Hide by default
        outputDiv.appendChild(routeContainer);
    }

    solveButton.addEventListener('click', () => {
        routeContainer.innerHTML = ''; // Resets every time Solve is clicked
        routeContainer.style.display = 'block'; // Show on click

        if (state.selectedCities.length < 2) {
            routeContainer.innerHTML = '<p>Select at least two cities</p>';
            return;
        }

        const distanceMatrix = calculateDistanceMatrix(state.selectedCities);
        const timeMatrix = calculateTimeMatrix(state.selectedCities);
        const durationMatrix = calculateDurationMatrix(timeMatrix, state.relativeShift);
        const speedMatrix = calculateSpeedMatrix(distanceMatrix, durationMatrix);
        const modelData = createModelData(speedMatrix, durationMatrix, state.speedMin, state.speedMax);

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
                        speedMatrix
                    );
                    routeContainer.innerHTML += routeString;
                });

                return solve;
            })
            .then(result => {
                routeContainer.innerHTML += `<p>Status: ${result.status}</p>`;
                // Add click event listener to solution containers
                const solutionContainers = routeContainer.querySelectorAll('.solution-container');
                solutionContainers.forEach(container => {
                    container.addEventListener('click', (event) => {
                        // First, remove 'selected' class from all solutions
                        document.querySelectorAll('.solution-container').forEach(c => {
                            if (c !== container) c.classList.remove('selected');
                        });
                        
                        const target = event.currentTarget as HTMLElement;
                        // Toggle 'selected' class
                        target.classList.toggle('selected');
                        
                        // Dispatch custom event with proper data structure
                        const solutionClickEvent = new CustomEvent('solution-click', { 
                            detail: {
                                html: target.innerHTML,
                                target: target,
                                isSelected: target.classList.contains('selected')
                            }
                        });
                        console.log("Dispatching solution-click event", target.classList.contains('selected'));
                        document.dispatchEvent(solutionClickEvent);
                    });
                });
            })
            .catch(error => {
                console.error('Error loading TSP model or solving:', error);
                routeContainer.innerHTML = `<p>Error: ${error.message}</p>`;
            });
    });
}

export { setupSolveButton };