declare module 'arc' {
  export class GreatCircle {
    constructor(start: {x: number, y: number}, end: {x: number, y: number});
    Arc(npoints: number): {
      geometries: Array<{
        coords: Array<[number, number]>;
      }>;
    };
  }
}
