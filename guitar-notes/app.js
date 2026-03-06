const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
// Diatonic index relative to C (used for staff positioning)
const DIATONIC_INDEX = { 'C': 0, 'C#': 0, 'D': 1, 'D#': 1, 'E': 2, 'F': 3, 'F#': 3, 'G': 4, 'G#': 4, 'A': 5, 'A#': 5, 'B': 6 };

// Tuning from High E (Top visual string / String 1 in Tabs) to Low E (Bottom visual string / String 6 in Tabs)
// Standard tuning: High E=E5(64), B4(59), G4(55), D4(50), A3(45), Low E=E3(40)
const TUNING_ABS = [64, 59, 55, 50, 45, 40]; 
const NUM_FRETS = 12;

// DOM Elements
const modeSelector = document.getElementById('practice-mode');
const realGuitarControls = document.getElementById('real-guitar-controls');
const speedSlider = document.getElementById('speed-slider');
const speedDisplay = document.getElementById('speed-display');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const scoreDisplay = document.getElementById('score');
const accuracyDisplay = document.getElementById('accuracy');
const fretboardContainer = document.getElementById('fretboard');

// Staff elements
const targetNoteContainer = document.getElementById('target-note');
const noteHead = document.getElementById('note-head');
const accidentalDisplay = document.getElementById('accidental');
const noteNameOverlay = document.getElementById('note-name-overlay');

// Settings Elements
const minFretInput = document.getElementById('min-fret');
const maxFretInput = document.getElementById('max-fret');
const stringCheckboxes = document.querySelectorAll('#string-filters input');
const noteCheckboxes = document.querySelectorAll('#note-filters input');
const customNoteInput = document.getElementById('custom-note-list');

// State
let isPlaying = false;
let currentMode = 'interactive'; 
let autoAdvanceInterval = null;
let currentTarget = null; // object { noteName, octave, abs, string, fret }
let lastTargetAbs = null; // tracks the immediately preceding note
let score = 0;
let totalGuesses = 0;
let availableNotes = []; // Pool of notes matching filters

function init() {
    buildFretboard();
    buildNotePool(); // initialize the pool right away so preview works
    
    // Event Listeners
    modeSelector.addEventListener('change', (e) => {
        currentMode = e.target.value;
        if (currentMode === 'real-guitar') {
            realGuitarControls.classList.remove('hidden');
            document.querySelector('.score-container').classList.add('hidden');
        } else {
            realGuitarControls.classList.add('hidden');
            document.querySelector('.score-container').classList.remove('hidden');
        }
    });

    speedSlider.addEventListener('input', (e) => {
        speedDisplay.textContent = `${e.target.value}s`;
        if (isPlaying && currentMode === 'real-guitar') {
            startAutoAdvance();
        }
    });

    startBtn.addEventListener('click', startGame);
    stopBtn.addEventListener('click', stopGame);
    settingsBtn.addEventListener('click', () => {
        const isHidden = settingsPanel.classList.toggle('hidden');
        if (!isHidden && !isPlaying) {
            updatePreview();
        } else if (isHidden && !isPlaying) {
            clearPreview();
        }
    });

    // Update pool when filters change
    const updatePool = () => { 
        if(isPlaying) { 
            stopGame(); 
        } else {
            buildNotePool();
            if (!settingsPanel.classList.contains('hidden')) {
                updatePreview();
            }
        }
    };
    minFretInput.addEventListener('change', updatePool);
    maxFretInput.addEventListener('change', updatePool);
    stringCheckboxes.forEach(cb => cb.addEventListener('change', updatePool));
    noteCheckboxes.forEach(cb => cb.addEventListener('change', updatePool));
    customNoteInput.addEventListener('input', updatePool);
}

function getNoteData(stringIndex, fretIndex) {
    const abs = TUNING_ABS[stringIndex] + fretIndex;
    const octave = Math.floor(abs / 12);
    const noteIndex = abs % 12;
    const noteName = NOTE_NAMES[noteIndex];
    return { string: stringIndex, fret: fretIndex, abs, octave, noteName };
}

function buildFretboard() {
    fretboardContainer.innerHTML = '';
    
    const markerContainer = document.createElement('div');
    markerContainer.className = 'marker-container';
    
    for (let f = 0; f <= NUM_FRETS; f++) {
        const m = document.createElement('div');
        m.className = 'marker-fret' + (f === 0 ? ' first-fret' : '');
        if ([3, 5, 7, 9].includes(f)) m.innerHTML = '<div class="marker-dot"></div>';
        else if (f === 12) m.innerHTML = '<div class="marker-double"><div class="marker-dot"></div><div class="marker-dot"></div></div>';
        markerContainer.appendChild(m);
    }
    fretboardContainer.appendChild(markerContainer);

    for (let s = 0; s < 6; s++) {
        const stringDiv = document.createElement('div');
        stringDiv.className = 'string';
        stringDiv.dataset.string = s;

        for (let f = 0; f <= NUM_FRETS; f++) {
            const data = getNoteData(s, f);
            const fretDiv = document.createElement('div');
            fretDiv.className = 'fret';
            fretDiv.dataset.fret = f;
            fretDiv.dataset.string = s;
            fretDiv.dataset.abs = data.abs;
            
            const overlay = document.createElement('div');
            overlay.className = 'note-overlay';
            overlay.innerHTML = `<span>${data.noteName}</span>`;
            
            fretDiv.appendChild(overlay);
            fretDiv.addEventListener('click', () => handleFretClick(data, fretDiv));
            stringDiv.appendChild(fretDiv);
        }
        fretboardContainer.appendChild(stringDiv);
    }
}

function buildNotePool() {
    availableNotes = [];
    const minFret = parseInt(minFretInput.value, 10);
    const maxFret = parseInt(maxFretInput.value, 10);
    
    const activeStrings = Array.from(stringCheckboxes).filter(cb => cb.checked).map(cb => parseInt(cb.value, 10));
    const activeNotes = Array.from(noteCheckboxes).filter(cb => cb.checked).map(cb => cb.value);
    
    // Check if custom exact notes are provided
    const customText = customNoteInput.value.trim();
    const useCustomList = customText.length > 0;
    const customListNotes = useCustomList ? customText.split(',').map(s => s.trim().toUpperCase()).filter(s => s) : [];

    for (let s of activeStrings) {
        for (let f = Math.max(0, minFret); f <= Math.min(NUM_FRETS, maxFret); f++) {
            const data = getNoteData(s, f);
            
            if (useCustomList) {
                // e.g. "E3", "F#4" -> check if data matches noteName + octave
                const exactName = `${data.noteName}${data.octave}`.toUpperCase();
                if (customListNotes.includes(exactName)) {
                    availableNotes.push(data);
                }
            } else {
                // Use standard filters
                if (activeNotes.includes(data.noteName)) {
                    availableNotes.push(data);
                }
            }
        }
    }
}

function startGame() {
    buildNotePool();
    if (availableNotes.length === 0) {
        alert("Please select at least one valid note, string, and fret range in settings.");
        return;
    }

    isPlaying = true;
    score = 0;
    totalGuesses = 0;
    lastTargetAbs = null;
    updateScoreDisplay();
    
    startBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');
    settingsPanel.classList.add('hidden');
    fretboardContainer.classList.remove('disabled');
    modeSelector.disabled = true;
    
    clearPreview(); // Remove the preview notes from the staff

    if (currentMode === 'real-guitar') {
        startAutoAdvance();
    }
    
    setNextNote();
}

function stopGame() {
    isPlaying = false;
    stopAutoAdvance();
    
    startBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
    fretboardContainer.classList.add('disabled');
    modeSelector.disabled = false;
    clearPreview();
    
    // clear ledgers
    document.querySelectorAll('.ledger-line').forEach(l => l.remove());
    clearAllHighlights();
}

function clearPreview() {
    noteHead.classList.add('hidden');
    accidentalDisplay.classList.add('hidden');
    noteNameOverlay.textContent = '--';
    noteNameOverlay.style.opacity = '1'; // Restore visibility when idle
    document.querySelectorAll('.preview-note, .preview-accidental').forEach(el => el.remove());
}

function updatePreview() {
    clearPreview();
    if (availableNotes.length === 0) return;
    
    // We only want to draw one of each unique absolute pitch for the preview
    // to avoid stacking notes on top of each other if multiple strings share the note
    const uniqueAbsPitches = [...new Set(availableNotes.map(n => n.abs))];
    const notesToDraw = uniqueAbsPitches.map(abs => availableNotes.find(n => n.abs === abs));
    
    notesToDraw.forEach(data => drawStaffNote(data, true));
    
    noteNameOverlay.innerHTML = `Previewing <strong>${notesToDraw.length}</strong> unique written notes`;
}

function drawStaffNote(data, isPreview = false) {
    let currentNoteHead = noteHead;
    let currentAccidental = accidentalDisplay;
    
    if (isPreview) {
        currentNoteHead = document.createElement('div');
        currentNoteHead.className = 'note-head preview-note';
        targetNoteContainer.appendChild(currentNoteHead);
        
        currentAccidental = document.createElement('div');
        currentAccidental.className = 'accidental preview-accidental';
        targetNoteContainer.appendChild(currentAccidental);
    } else {
        currentNoteHead.classList.remove('hidden');
    }

    // E4 (written bottom line) is 4*7 + 2 = 30
    const diatonicBase = data.noteName.replace('#', '');
    const diatonicAbs = data.octave * 7 + DIATONIC_INDEX[diatonicBase];
    
    // Staff lines: 80, 110, 140, 170, 200
    // E4 is bottom line = 200
    const E4_Y = 200;
    const y = E4_Y - (diatonicAbs - 30) * 15;
    
    currentNoteHead.style.top = `${y - 15}px`; // note height is 30px, offset by half
    
    // If preview Mode, offset horizontally slightly purely for visual spread (optional, skipping to keep aligned)
    
    // Stem direction: B4 (middle line, diatonic 34) and above have stem down
    if (diatonicAbs >= 34) {
        currentNoteHead.classList.add('stem-down');
    } else {
        currentNoteHead.classList.remove('stem-down');
    }
    
    // Accidental
    if (data.noteName.includes('#')) {
        currentAccidental.classList.remove('hidden');
        currentAccidental.style.top = `${y - 24}px`;
        currentAccidental.textContent = '#';
    } else {
        currentAccidental.classList.add('hidden');
    }
    
    // Ledger lines - only clear if NOT in preview mode (preview mode draws many ledgers simultaneously)
    if (!isPreview) {
        document.querySelectorAll('.ledger-line').forEach(l => l.remove());
    }
    
    // Add ledger lines if below E4 or above F5
    if (diatonicAbs <= 28) { // Middle C (C4) and below
        for (let l = 28; l >= diatonicAbs; l -= 2) {
            const ly = E4_Y - (l - 30) * 15;
            // Add a class that identifies the Y position to avoid adding the same ledger line over and over during preview
            const ledgerClass = `ledger-line-${ly.toString().replace('.','-')}`;
            if (!document.querySelector(`.${ledgerClass}`)) {
                const ledger = document.createElement('div');
                ledger.className = `ledger-line ${ledgerClass}`;
                ledger.style.top = `${ly}px`;
                targetNoteContainer.appendChild(ledger);
            }
        }
    } else if (diatonicAbs >= 40) { // A5 and above
        for (let l = 40; l <= diatonicAbs; l += 2) {
            const ly = E4_Y - (l - 30) * 15;
            const ledgerClass = `ledger-line-${ly.toString().replace('.','-')}`;
            if (!document.querySelector(`.${ledgerClass}`)) {
                const ledger = document.createElement('div');
                ledger.className = `ledger-line ${ledgerClass}`;
                ledger.style.top = `${ly}px`;
                targetNoteContainer.appendChild(ledger);
            }
        }
    }
    
    if (!isPreview) {
        // Hide the explicit note name during training so the user is forced to read the staff!
        noteNameOverlay.style.opacity = '0';
        noteNameOverlay.textContent = `${data.noteName}${data.octave}`;
    } else {
        noteNameOverlay.style.opacity = '1';
    }
}

function setNextNote() {
    if (availableNotes.length === 0) return;

    let randomData;
    do {
        randomData = availableNotes[Math.floor(Math.random() * availableNotes.length)];
    } while (availableNotes.length > 1 && currentTarget && randomData.abs === currentTarget.abs);
    
    lastTargetAbs = currentTarget ? currentTarget.abs : null;
    currentTarget = randomData;
    drawStaffNote(currentTarget);
    
    // Add small animation
    noteHead.style.transform = 'rotate(-15deg) scale(1.3)';
    setTimeout(() => {
        noteHead.style.transform = 'rotate(-15deg) scale(1)';
    }, 150);

    // Clear previous highlights
    clearAllHighlights();
    
    // Highlight the previous note so it remains visible on the fretboard (Interactive Mode only)
    if (lastTargetAbs !== null && currentMode === 'interactive') {
        highlightNoteInstances(lastTargetAbs, 'last-note');
    }

    if (currentMode === 'real-guitar') {
        highlightNoteInstances(currentTarget.abs);
    }
}

function handleFretClick(data, fretElement) {
    if (!isPlaying || currentMode !== 'interactive') return;

    totalGuesses++;
    
    // Must match the exact absolute pitch now, because the staff explicitly differentiates octaves
    if (data.abs === currentTarget.abs) {
        // Correct guess
        score++;
        fretElement.classList.add('correct');
        updateScoreDisplay();
        
        setTimeout(() => {
            if (isPlaying) setNextNote();
        }, 500);
    } else {
        // Incorrect guess
        fretElement.classList.add('incorrect');
        updateScoreDisplay();
        
        // Show correct answers temporarily
        highlightNoteInstances(currentTarget.abs, 'active');
        
        setTimeout(() => {
            fretElement.classList.remove('incorrect');
            clearHighlights('active');
            if (isPlaying) setNextNote();
        }, 1000);
    }
}

function highlightNoteInstances(abs, className = 'active') {
    const frets = document.querySelectorAll(`.fret[data-abs="${abs}"]`);
    frets.forEach(f => f.classList.add(className));
}

function clearAllHighlights() {
    clearHighlights('active');
    clearHighlights('correct');
    clearHighlights('incorrect');
    clearHighlights('last-note');
}

function clearHighlights(className) {
    const highlighted = document.querySelectorAll(`.${className}`);
    highlighted.forEach(el => el.classList.remove(className));
}

function updateScoreDisplay() {
    scoreDisplay.textContent = score;
    const acc = totalGuesses === 0 ? 0 : Math.round((score / totalGuesses) * 100);
    accuracyDisplay.textContent = `${acc}%`;
}

function startAutoAdvance() {
    stopAutoAdvance();
    const ms = parseInt(speedSlider.value, 10) * 1000;
    autoAdvanceInterval = setInterval(setNextNote, ms);
}

function stopAutoAdvance() {
    if (autoAdvanceInterval) {
        clearInterval(autoAdvanceInterval);
        autoAdvanceInterval = null;
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
