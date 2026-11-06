import type { RouteId } from '../levels/routes';

export interface Theme {
  skyTop: string;
  skyBottom: string;
  fog: string;
  sun: string;
  sunI: number;
  /** Direction toward the sun. */
  sunDir: [number, number, number];
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  glow: number;
  grass: [string, string];
  grassDark: string;
  concrete: string;
  asphalt: string;
  leaves: string[];
  backdrop: 'suburb' | 'city' | 'resort';
}

export const THEMES: Record<RouteId, Theme> = {
  maple: {
    skyTop: '#7fb6e6', skyBottom: '#fde8c8', fog: '#f2e3c9',
    sun: '#ffe2b0', sunI: 3.1, sunDir: [-0.62, 0.72, 0.42],
    hemiSky: '#cfe4ff', hemiGround: '#6f8a4a', hemiI: 1.15, glow: 0,
    grass: ['#86ad58', '#78a14e'], grassDark: '#5c8540', concrete: '#c9c2b4', asphalt: '#4b4d55',
    leaves: ['#d9832e', '#c95f2a', '#e5a93b', '#6f9e3d', '#558a3a'], backdrop: 'suburb',
  },
  brownstone: {
    skyTop: '#46508f', skyBottom: '#f7a877', fog: '#c98a7e',
    sun: '#ffbd8a', sunI: 3.5, sunDir: [0.62, 0.6, 0.5],
    hemiSky: '#b9b8f0', hemiGround: '#7d6570', hemiI: 1.7, glow: 0.62,
    grass: ['#6e8f55', '#63844d'], grassDark: '#4c6c3e', concrete: '#b5aca6', asphalt: '#474857',
    leaves: ['#4f8a4d', '#3f7a48', '#6a9a4c'], backdrop: 'city',
  },
  palm: {
    skyTop: '#5cc0ee', skyBottom: '#e9f6f0', fog: '#dff1ec',
    sun: '#fff1cf', sunI: 3.4, sunDir: [0.5, 0.82, 0.3],
    hemiSky: '#d7f0ff', hemiGround: '#a8a06a', hemiI: 1.2, glow: 0,
    grass: ['#7cbb62', '#6eae57'], grassDark: '#4f9446', concrete: '#e4dccb', asphalt: '#55565c',
    leaves: ['#2f9a55', '#3cae5f', '#1f8549'], backdrop: 'resort',
  },
};
