import L from 'leaflet'

export const SEARCH_SVG =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>'

export const searchIcon = L.divIcon({
  className: '',
  html: `<div class="map-pin" role="button" aria-label="Searched place" style="--pin:#2563eb"><span>${SEARCH_SVG}</span></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 26],
  popupAnchor: [0, -22],
})

export const BED_SVG =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M2 17h20"/></svg>'

export const hotelIcon = L.divIcon({
  className: '',
  html: `<div class="map-pin" role="button" aria-label="Hotel" style="--pin:#7c3aed"><span>${BED_SVG}</span></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 26],
  popupAnchor: [0, -22],
})

export const UTENSILS_SVG =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>'

export const restaurantIcon = L.divIcon({
  className: '',
  html: `<div class="map-pin" role="button" aria-label="Restaurant" style="--pin:#e11d48"><span>${UTENSILS_SVG}</span></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 26],
  popupAnchor: [0, -22],
})

export const dirIcon = (letter, color) =>
  L.divIcon({
    className: '',
    html: `<div class="dir-pin" role="button" aria-label="Point ${letter}" style="--c:${color}">${letter}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })

export const createPinIcon = (color, content, isHotel, accessibleName) =>
  L.divIcon({
    className: '',
    html: `<div class="map-pin${isHotel ? ' pin-hotel' : ''}" role="button" aria-label="${accessibleName.replace(/"/g, '&quot;')}" style="--pin:${color}"><span>${content}</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 26],
    popupAnchor: [0, -22],
  })
