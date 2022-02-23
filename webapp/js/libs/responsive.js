export function isMobile(){
    return screen.width <= 767;
}

export function isTablet(){
    return !isMobile() && screen.width <= 991;
}

export function isDesktop(){
    return !isTablet() && screen.width <= 1199;
}

export function isLargeMonitor(){
    return !isDesktop() && screen.width <= 1919;
}

export function isWideScreen(){
    return !isLargeMonitor();
}