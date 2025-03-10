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
    label.textContent = (clockSide === 'left') ? 'Arriving' : 'Departing';
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
    const hourInput = document.createElement('input');
    hourInput.type = 'number';
    hourInput.id = `hourInput-${clockSide}`;
    timeInputs.appendChild(hourInput);
    const minuteInput = document.createElement('input');
    minuteInput.type = 'number';
    minuteInput.id = `minuteInput-${clockSide}`;
    timeInputs.appendChild(minuteInput);
    const ampmToggle = document.createElement('button');
    ampmToggle.id = `ampmToggle-${clockSide}`;
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
    // const secondHand = clock.querySelector('.second-hand') as HTMLElement;
    const hourInput = document.getElementById(`hourInput-${clockSide}`) as HTMLInputElement;
    const minuteInput = document.getElementById(`minuteInput-${clockSide}`) as HTMLInputElement;
    const ampmToggle = document.getElementById(`ampmToggle-${clockSide}`) as HTMLButtonElement;

    // Function to update the clock state immutably
    const updateClockState = (newState: Partial<ClockState>): void => {
        clockState = { ...clockState, ...newState };
        updateClockDisplay();
    };

    // Function to update the clock display based on the current state
    const updateClockDisplay = (): void => {
        hourInput.value = clockState.hour.toString().padStart(2, '0');
        minuteInput.value = clockState.minute.toString().padStart(2, '0');
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

    // Start dragging only on hour hand
    function startDrag(e: MouseEvent): void {
        e.preventDefault();
        draggedHand = e.target as HTMLElement;
        activeClock = clockSide;
    }
    hourHand.addEventListener('mousedown', startDrag);

    // Stop dragging
    document.addEventListener('mouseup', () => {
        draggedHand = null;
        activeClock = null;
    });

    // Drag movement
    document.addEventListener('mousemove', (e) => {
        if (draggedHand && activeClock === clockSide) {
            e.preventDefault();
            const rect = clock.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const dx = e.clientX - centerX;
            const dy = e.clientY - centerY;
            let angle = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
            draggedHand.style.transform = `translateX(-50%) rotate(${angle}deg)`;

            if (draggedHand.classList.contains('hour-hand')) {
                const hours = Math.floor(angle / 30) % 12;
                const hourDisplay = (hours === 0 ? 12 : hours);
                const additionalDegrees = angle % 30;
                const minutesFromHour = Math.floor((additionalDegrees / 30) * 60);
                updateClockState({ hour: hourDisplay, minute: minutesFromHour });
            }
        }
    });

    // Sync clock hands with inputs
    hourInput.addEventListener('input', () => {
        updateClockState({ hour: parseInt(hourInput.value) || 0 });
    });
    minuteInput.addEventListener('input', () => {
        updateClockState({ minute: parseInt(minuteInput.value) || 0 });
    });

    // Second hand
    // function updateSecondHand(): void {
    //     const now = new Date();
    //     const seconds = now.getSeconds();
    //     secondHand.style.transform = `translateX(-50%) rotate(${seconds * 6}deg)`;
    // }

    // Initialize
    updateClockDisplay();
    // updateSecondHand();
    // setInterval(updateSecondHand, 1000);
}

// Create both clocks
createClockDOM('left');
initializeClock('left', 12, 0, 'PM');
createClockDOM('right');
initializeClock('right', 2, 0, 'PM');
