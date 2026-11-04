// Device class from the screen size (not the window): the layout picked at start-up
export function isMobile() {
    return screen.width <= 767;
}

export function isTablet() {
    return !isMobile() && screen.width <= 991;
}
