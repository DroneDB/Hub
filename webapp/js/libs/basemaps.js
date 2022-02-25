const Basemaps = {
    'satellite': {
        label: "Satellite",
        url: "https://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}",
        attributions: ["&copy; Google Maps"]
    },
    'hybrid': {
        label: "Hybrid",
        url: "https://mt0.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}",
        attributions: ["&copy; Google Maps"]
    },
    'osm': {
        label: "OpenStreetMap",
        url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        attributions: ["&copy; OpenStreetMap"]
    }
};

export { Basemaps };