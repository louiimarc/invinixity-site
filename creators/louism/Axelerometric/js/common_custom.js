let midi, font, outputLevel;
const entity = [];
const numberOfEntity = 6;
let numberOfShownEntity = 3;
const samples = new Map();
let sounding = false;
let selectedChamber = 0;
let hitGrid = 0.25;
// 1. Pentatonic Scale (Major Pentatonic)
let pentatonicScale = [220, 247.5, 275, 330, 366.67];

// 2. Major Scale
let majorScale = [220, 247.5, 275, 293.33, 330, 366.67, 412.5];

// 3. Minor Scale (Natural)
let minorScale = [220, 247.5, 264, 293.33, 330, 352, 396];

// 4. Harmonic Minor Scale
let harmonicMinorScale = [220, 247.5, 264, 293.33, 330, 352, 412.5];

// 5. Eastern Scale (Japanese Insen)
let japaneseInsenScale = [220, 264, 293.33, 330, 396];

// 6. Blues Scale
let bluesScale = [220, 264, 293.33, 309.38, 330, 396];

// 7. Whole Tone Scale
let wholeToneScale = [220, 247.5, 275, 302.5, 330, 357.5];

// 8. Diminished Scale
let diminishedScale = [220, 234.67, 247.5, 264, 293.33, 330, 352, 412.5];

let slendroScale = [220, 247, 277, 330, 370];

let pelogScale = [220, 235, 270, 290, 330, 350, 390];

function sampleKey(file) {
    return 'file:' + file.size + ':' + file.name;
}
