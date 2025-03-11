// Define the ClockState interface
interface ClockState {
    hour: number;
    minute: number;
    ampm: 'AM' | 'PM';
}

let draggedHand: HTMLElement | null = null;
let activeClock: 'left' | 'right' | null = null;

// Function to create the clock DOM
function createClockDOM(clockSide: 'left' | 'right'): void {
    const clockWrapper = document.createElement('div');
    clockWrapper.className = 'clock-wrapper';

    // Add a centered label above the clock
    const label = document.createElement('div');
    label.className = 'clock-label';
    label.textContent = (clockSide === 'left') ? 'Arrival' : 'Departure';
    clockWrapper.appendChild(label);

    const clock = document.createElement('div');
    clock.id = `clock-${clockSide}`;
    clock.className = 'clock';

    // Use functional array methods to create hour markers
    Array.from({ length: 12 }).forEach((_, i) => {
        const marker = document.createElement('div');
        marker.className = 'hour-marker';
        marker.style.transform = `rotate(${i * 30}deg)`;
        const innerDiv = document.createElement('div');
        marker.appendChild(innerDiv);
        clock.appendChild(marker);
    });

    const hourHand = document.createElement('div');
    hourHand.className = 'hand hour-hand';
    clock.appendChild(hourHand);
    const minuteHand = document.createElement('div');
    minuteHand.className = 'hand minute-hand';
    clock.appendChild(minuteHand);
    const secondHand = document.createElement('div');
    secondHand.className = 'hand second-hand';
    clock.appendChild(secondHand);
    const centerDot = document.createElement('div');
    centerDot.className = 'center-dot';
    clock.appendChild(centerDot);
    
    const timeInputs = document.createElement('div');
    timeInputs.className = 'time-inputs';
    
    // Create a single time input
    const timeInput = document.createElement('input');
    timeInput.type = 'time';
    timeInput.id = `timeInput-${clockSide}`;
    timeInputs.appendChild(timeInput);
    
    const ampmToggle = document.createElement('button');
    ampmToggle.id = `ampmToggle-${clockSide}`;
    ampmToggle.setAttribute('aria-label', 'Toggle AM/PM');
    timeInputs.appendChild(ampmToggle);
    
    clockWrapper.appendChild(clock);
    clockWrapper.appendChild(timeInputs);
    document.querySelector('.clock-container')?.appendChild(clockWrapper);
}

// Function to initialize the clock state
function initializeClock(clockSide: 'left' | 'right', initialHour: number, initialMinute: number, initialAmPm: 'AM' | 'PM'): void {
    let clockState: ClockState = {
        hour: initialHour,
        minute: initialMinute,
        ampm: initialAmPm
    };

    const clock = document.getElementById(`clock-${clockSide}`) as HTMLElement;
    const hourHand = clock.querySelector('.hour-hand') as HTMLElement;
    const minuteHand = clock.querySelector('.minute-hand') as HTMLElement;
    const timeInput = document.getElementById(`timeInput-${clockSide}`) as HTMLInputElement;
    const ampmToggle = document.getElementById(`ampmToggle-${clockSide}`) as HTMLButtonElement;

    // Function to update the clock state immutably
    const updateClockState = (newState: Partial<ClockState>): void => {
        clockState = { ...clockState, ...newState };
        updateClockDisplay();
    };

    // Function to update the clock display based on the current state
    const updateClockDisplay = (): void => {
        // Format the time for the time input (HH:MM format)
        const formattedHour = clockState.hour.toString().padStart(2, '0');
        const formattedMinute = clockState.minute.toString().padStart(2, '0');
        timeInput.value = `${formattedHour}:${formattedMinute}`;
        
        ampmToggle.textContent = clockState.ampm;

        const hourAngle = (clockState.ampm === 'AM' ? (clockState.hour % 12) : ((clockState.hour % 12) + 12)) * 30 + (clockState.minute / 60) * 30;
        const minuteAngle = clockState.minute * 6;

        hourHand.style.transform = `translateX(-50%) rotate(${hourAngle}deg)`;
        minuteHand.style.transform = `translateX(-50%) rotate(${minuteAngle}deg)`;
    };

    // Event listener for AM/PM toggle
    ampmToggle.addEventListener('click', () => {
        updateClockState({ ampm: clockState.ampm === 'AM' ? 'PM' : 'AM' });
    });

    // Function to handle both mouse and touch events for dragging
    const handleDragStart = (e: MouseEvent | TouchEvent): void => {
        e.preventDefault();
        const target = e.target as HTMLElement;
        draggedHand = target;
        activeClock = clockSide;
        
        // Add a class to indicate dragging state
        document.body.classList.add('dragging-clock-hand');
    };

    // Start dragging on mouse down
    hourHand.addEventListener('mousedown', handleDragStart);
    minuteHand.addEventListener('mousedown', handleDragStart);
    
    // Add touch event support for mobile
    hourHand.addEventListener('touchstart', handleDragStart, { passive: false });
    minuteHand.addEventListener('touchstart', handleDragStart, { passive: false });

    // Stop dragging on mouse up or touch end
    const handleDragEnd = (): void => {
        draggedHand = null;
        activeClock = null;
        document.body.classList.remove('dragging-clock-hand');
    };
    
    document.addEventListener('mouseup', handleDragEnd);
    document.addEventListener('touchend', handleDragEnd);

    // Handle drag movement for both mouse and touch
    const handleDragMove = (e: MouseEvent | TouchEvent): void => {
        if (draggedHand && activeClock === clockSide) {
            e.preventDefault();
            
            const rect = clock.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            // Get coordinates based on event type
            let clientX, clientY;
            
            if (e instanceof MouseEvent) {
                clientX = e.clientX;
                clientY = e.clientY;
            } else {
                // Touch event
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            }
            
            const dx = clientX - centerX;
            const dy = clientY - centerY;
            let angle = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
            
            // Update the appropriate hand based on which one is being dragged
            if (draggedHand.classList.contains('hour-hand')) {
                draggedHand.style.transform = `translateX(-50%) rotate(${angle}deg)`;
                
                const hours = Math.floor(angle / 30) % 12;
                const hourDisplay = (hours === 0 ? 12 : hours);
                const additionalDegrees = angle % 30;
                const minutesFromHour = Math.floor((additionalDegrees / 30) * 60);
                
                updateClockState({ 
                    hour: hourDisplay, 
                    minute: minutesFromHour 
                });
            } else if (draggedHand.classList.contains('minute-hand')) {
                draggedHand.style.transform = `translateX(-50%) rotate(${angle}deg)`;
                
                const minutes = Math.floor(angle / 6) % 60;
                updateClockState({ minute: minutes });
            }
        }
    };

    // Add both mouse and touch move event listeners
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('touchmove', handleDragMove, { passive: false });

    // Sync clock hands with time input
    timeInput.addEventListener('input', () => {
        const timeValue = timeInput.value;
        if (timeValue) {
            const [hourStr, minuteStr] = timeValue.split(':');
            const hour = parseInt(hourStr);
            const minute = parseInt(minuteStr);
            
            // Determine AM/PM based on 24-hour format
            const ampm = hour >= 12 ? 'PM' : 'AM';
            const hour12 = hour % 12 || 12;
            
            updateClockState({ 
                hour: hour12,
                minute: minute,
                ampm: ampm
            });
        }
    });

    // Initialize
    updateClockDisplay();
}

// Create both clocks
createClockDOM('left');
initializeClock('left', 12, 0, 'PM');
createClockDOM('right');
initializeClock('right', 2, 0, 'PM');
