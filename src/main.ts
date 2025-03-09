import './style.css';
import { Map as OLMap, View } from 'ol';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import Fuse, { FuseResult } from 'fuse.js'

// Types
export interface City {
    name: string;
    latitude: number;
    longitude: number;
    timezone: string;
    country_code: string;
    population: number;
}

// State
const state = {
    cities: [] as City[],
    fuse: null as Fuse<City> | null,
    selectedCities: [] as City[],
    selectedSearchIndex: 0,
    relativeShift: -120, // Default value matching the HTML
    speedMin: 0,        // Default value for minimum speed
    speedMax: 0         // Default value for maximum speed
};

// API
function loadCities(): Promise<City[]> {
    return fetch('/cities.json')
        .then(response => response.json())
        .then(data => {
            state.cities = data;
            state.fuse = new Fuse(state.cities, {
              keys: ['name'],
              threshold: 0.3,
              sortFn: (a, b) => {
                const itemA = state.cities[a.idx];
                const itemB = state.cities[b.idx];
                return itemB.population - itemA.population; // Sort by population (descending)
              }
            });
            console.log(`Loaded ${state.cities.length} cities`);
            return data;
        });
}

// Utilities
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

// DOM Element Helpers
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

// City Search Logic
function searchCities(query: string): FuseResult<City>[] {
    if (!state.fuse || query.trim().length === 0) return [];
    return state.fuse.search(query).slice(0, 10); // Limit to 10 results
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

// Selected Cities Management
function selectCity(city: City): void {
    if (!isCitySelected(city)) {
        state.selectedCities.push(city);
        updateSelectedCitiesUI();
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
        updateSelectedCitiesUI();
    }
}

function updateSelectedCitiesUI(): void {
    const container = getElement<HTMLElement>('.selected-cities');
    container.innerHTML = '<h3>Selected Cities:</h3>';

    const ul = createElement('ul');

    state.selectedCities.forEach(city => {
        const li = createElement('li', { textContent: getCityDisplayName(city) });
        
        const removeBtn = createElement('button', { textContent: 'Remove' });
        removeBtn.addEventListener('click', () => removeCity(city));
        
        li.appendChild(removeBtn);
        ul.appendChild(li);
    });

    container.appendChild(ul);
}

function clearSearch(): void {
    const searchInput = getElement<HTMLInputElement>('.city-search-input');
    const resultsContainer = getElement<HTMLElement>('.search-results');
    searchInput.value = '';
    resultsContainer.innerHTML = '';
}

// Keyboard Navigation
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

function parseNumericInput(value: string): number {
    return parseInt(value, 10) || 0;
}

// Handle relative shift input changes
const handleRelativeShiftChange = (event: Event): void => {
    state.relativeShift = parseNumericInput((event.target as HTMLInputElement).value);
};

// Handle speed min input changes
const handleSpeedMinChange = (event: Event): void => {
    state.speedMin = parseNumericInput((event.target as HTMLInputElement).value);
};

// Handle speed max input changes
const handleSpeedMaxChange = (event: Event): void => {
    state.speedMax = parseNumericInput((event.target as HTMLInputElement).value);
};

// Setup relative shift input
function setupRelativeShiftInput(): void {
    try {
        const relativeShiftInput = getElement<HTMLInputElement>('#relativeShift');
        state.relativeShift = parseNumericInput(relativeShiftInput.value);
        relativeShiftInput.addEventListener('change', handleRelativeShiftChange);
        console.log("Relative shift input setup complete");
    } catch (error) {
        console.error("Failed to set up relative shift input:", error);
    }
}

// Setup speed min input
function setupSpeedMinInput(): void {
    try {
        const speedMinInput = getElement<HTMLInputElement>('#speedMin');
        // Initialize state with current input value
        state.speedMin = parseInt(speedMinInput.value, 10);
        // Add event listener for changes
        speedMinInput.addEventListener('change', handleSpeedMinChange);
        console.log("Speed min input setup complete");
    } catch (error) {
        console.error("Failed to set up speed min input:", error);
    }
}

// Setup speed max input
function setupSpeedMaxInput(): void {
    try {
        const speedMaxInput = getElement<HTMLInputElement>('#speedMax');
        // Initialize state with current input value
        state.speedMax = parseInt(speedMaxInput.value, 10);
        // Add event listener for changes
        speedMaxInput.addEventListener('change', handleSpeedMaxChange);
        console.log("Speed max input setup complete");
    } catch (error) {
        console.error("Failed to set up speed max input:", error);
    }
}

// Setup preset buttons
function setupPresetButtons(): void {
    try {
        // Commercial speeds (typical passenger aircraft: ~500-900 km/h)
        const commercialButton = getElement<HTMLButtonElement>('#commercialButton');
        commercialButton.addEventListener('click', () => {
            // Set state values
            state.speedMin = 500;
            state.speedMax = 900;
            
            // Update input fields
            const speedMinInput = getElement<HTMLInputElement>('#speedMin');
            const speedMaxInput = getElement<HTMLInputElement>('#speedMax');
            speedMinInput.value = state.speedMin.toString();
            speedMaxInput.value = state.speedMax.toString();
        });

        // Concorde speeds (supersonic: ~2000-2500 km/h)
        const concordeButton = getElement<HTMLButtonElement>('#concordeButton');
        concordeButton.addEventListener('click', () => {
            state.speedMin = 500;
            state.speedMax = 2500;
            
            const speedMinInput = getElement<HTMLInputElement>('#speedMin');
            const speedMaxInput = getElement<HTMLInputElement>('#speedMax');
            speedMinInput.value = state.speedMin.toString();
            speedMaxInput.value = state.speedMax.toString();
        });

        // Extreme speeds (pushing toward the upper limit)
        const extremeButton = getElement<HTMLButtonElement>('#extremeButton');
        extremeButton.addEventListener('click', () => {
            state.speedMin = 13;
            state.speedMax = 7200;
            
            const speedMinInput = getElement<HTMLInputElement>('#speedMin');
            const speedMaxInput = getElement<HTMLInputElement>('#speedMax');
            speedMinInput.value = state.speedMin.toString();
            speedMaxInput.value = state.speedMax.toString();
        });

        console.log("Preset buttons setup complete");
    } catch (error) {
        console.error("Failed to set up preset buttons:", error);
    }
}

// Map Setup
function setupMap(): void {
    try {
        new OLMap({
            target: 'map',
            layers: [
                new TileLayer({
                    source: new OSM(),
                }),
            ],
            view: new View({
                center: [0, 0],
                zoom: 2,
            }),
        });
    } catch (error) {
        console.error("Failed to set up map:", error);
    }
}

// UI Setup
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

// Initialization
function initialize(): void {
  
  loadCities().catch(error => {
      console.error('Error loading cities data:', error);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initialize(); 
    setupSearchUI();
    setupRelativeShiftInput();
    setupSpeedMinInput();
    setupSpeedMaxInput();
    setupPresetButtons();
    setupMap();
});
