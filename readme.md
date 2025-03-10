#Infinite Lunch
# Infinite Lunch

A time-traveling route planner that lets you journey between cities while always departing and arriving at the same local time.

## About

Infinite Lunch solves a unique variant of the Traveling Salesman Problem (TSP) where the goal is to visit a sequence of cities while always departing and arriving at the same local time. By leveraging time zone differences and setting speed constraints, you can create continuous loops where it's always the same time of day at each stop.

## Features

- Select cities from around the world
- Set time shifts to adjust arrival/departure times
- Define minimum and maximum travel speeds
- Visualize optimal routes on a map
- Calculate total journey duration

## Installation

### Setup
1. Clone this repository
2. Set up the development environment:
    ```
    nix develop
    ```
3. Fetch required city data:
    ```
    fetch-data
    ```
4. Install dependencies:
    ```
    npm install
    ```

## Usage

### Development
```
npm run start
```

### Build for production
```
npm run build
```

### Deploy to GitHub Pages
```
npm run deploy
```

## How It Works

The application:
1. Calculates distance matrices between cities using the Vincenty formula
2. Generates time matrices based on timezone differences
3. Applies your specified time shift to create duration matrices
4. Computes travel speeds between city pairs
5. Filters connections based on minimum/maximum speed constraints
6. Solves the TSP using a MiniZinc constraint programming model
7. Returns optimal routes that maintain the same local time at arrival/departure

## Technical Details

- Built with TypeScript and Vite
- Uses OpenLayers for mapping
- Leverages MiniZinc for constraint solving
- Calculates geodesic distances with the geodesy library
- Handles timezone calculations with Luxon