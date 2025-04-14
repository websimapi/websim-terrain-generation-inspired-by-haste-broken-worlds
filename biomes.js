// Biome definitions inspired by Haste Broken Worlds
export const biomeTypes = {
    grassland: {
        name: "Grassland",
        baseColor: 0x4e8a40,
        detailColor: 0x6db35a,
        waterColor: 0x4a99ff,
        heightMultiplier: 50,
        roughness: 0.7,
        waterLevel: -5,
        skyColor: 0x87ceeb,
        fogDensity: 0.002,
        ambientColor: 0xc5eba1,
        ambientIntensity: 0.6,
        sunColor: 0xffffff,
        sunIntensity: 0.8,
        mountainous: false,
        mountainScale: 0.5,
        rivers: true,
        riverDepth: 1.0,
        features: [
            { name: "Ancient Ruins", chance: 0.05, size: [3, 6], color: 0xa9957c, minHeight: 0 },
            { name: "Small Hill", chance: 0.2, size: [2, 4], color: 0x558d46 },
            { name: "Hidden Path", chance: 0.1, size: [1, 8], color: 0xc2b280 },
            { name: "Flower Patch", chance: 0.2, size: [1, 3], color: 0xffcc99 }
        ]
    },
    desert: {
        name: "Desert",
        baseColor: 0xe6cc8f,
        detailColor: 0xd4bc7e,
        waterColor: 0x8ed1fc,
        heightMultiplier: 30,
        roughness: 0.5,
        waterLevel: -15,
        skyColor: 0xffedd4,
        fogDensity: 0.001,
        ambientColor: 0xffebc8,
        ambientIntensity: 0.7,
        sunColor: 0xfff5e0,
        sunIntensity: 1.0,
        mountainous: true,
        mountainScale: 0.7,
        rivers: false,
        features: [
            { name: "Oasis", chance: 0.03, size: [2, 4], color: 0x4a99ff, maxHeight: -10 },
            { name: "Ancient Tomb", chance: 0.04, size: [2, 3], color: 0xc2b280, minHeight: 5 },
            { name: "Dune Ridge", chance: 0.15, size: [3, 7], color: 0xefd8a9 },
            { name: "Desert Rocks", chance: 0.1, size: [1, 3], color: 0xb09c7b }
        ]
    },
    tundra: {
        name: "Tundra",
        baseColor: 0xf0f0f0,
        detailColor: 0xe0e0e0,
        waterColor: 0xadd8e6,
        heightMultiplier: 60,
        roughness: 0.8,
        waterLevel: -8,
        skyColor: 0xc6e4f2,
        fogDensity: 0.003,
        ambientColor: 0xd8e5f7,
        ambientIntensity: 0.5,
        sunColor: 0xdaeeff,
        sunIntensity: 0.7,
        mountainous: true,
        mountainScale: 1.0,
        rivers: true,
        riverDepth: 0.7,
        features: [
            { name: "Ice Cave", chance: 0.04, size: [2, 3], color: 0xc1e3e6 },
            { name: "Frozen Lake", chance: 0.08, size: [3, 6], color: 0xadd8e6, maxHeight: -5 },
            { name: "Snow Ridge", chance: 0.1, size: [2, 5], color: 0xffffff },
            { name: "Frost Stones", chance: 0.1, size: [1, 2], color: 0xe1e1e1 }
        ]
    },
    forest: {
        name: "Forest",
        baseColor: 0x2d6a22,
        detailColor: 0x1d4a17,
        waterColor: 0x3973ac,
        heightMultiplier: 70,
        roughness: 0.75,
        waterLevel: -3,
        skyColor: 0x5ba25c,
        fogDensity: 0.004,
        ambientColor: 0x2c523f,
        ambientIntensity: 0.4,
        sunColor: 0xebffd9,
        sunIntensity: 0.7,
        mountainous: false,
        mountainScale: 0.3,
        rivers: true,
        riverDepth: 1.2,
        features: [
            { name: "Dense Thicket", chance: 0.15, size: [2, 4], color: 0x1a3e11 },
            { name: "Forest Clearing", chance: 0.07, size: [3, 5], color: 0x6eaf5f },
            { name: "Ancient Tree", chance: 0.03, size: [1, 2], color: 0x8b4513 },
            { name: "Forest Pond", chance: 0.05, size: [2, 4], color: 0x3973ac, maxHeight: -1 }
        ]
    }
};

export function getBiomeColorByHeight(biome, height, slope = 0) {
    if (height < biome.waterLevel) {
        return biome.waterColor;
    }
    
    // Base slope factor (steeper terrain has different coloring)
    const slopeFactor = Math.min(slope * 10, 1);
    
    // Gradient between base and detail colors based on height
    const heightFactor = Math.min((height - biome.waterLevel) / 20, 1);
    
    // Combine both factors
    let t = heightFactor * (1 - slopeFactor * 0.5);
    
    // For steep slopes, blend with a rocky color
    if (slopeFactor > 0.3) {
        const rockColor = biome.name === 'Tundra' ? 0xe0e0e0 : 0x7a7a7a;
        return lerpColor(
            lerpColor(biome.baseColor, biome.detailColor, t),
            rockColor, 
            slopeFactor * 0.5
        );
    }
    
    return lerpColor(biome.baseColor, biome.detailColor, t);
}

// Function to blend between biomes
export function getBiomeTransition(biome1, biome2, factor) {
    // Blend colors and properties between biomes
    return {
        name: factor < 0.5 ? biome1.name : biome2.name,
        baseColor: lerpColor(biome1.baseColor, biome2.baseColor, factor),
        detailColor: lerpColor(biome1.detailColor, biome2.detailColor, factor),
        waterColor: lerpColor(biome1.waterColor, biome2.waterColor, factor),
        heightMultiplier: lerp(biome1.heightMultiplier, biome2.heightMultiplier, factor),
        roughness: lerp(biome1.roughness, biome2.roughness, factor),
        waterLevel: lerp(biome1.waterLevel, biome2.waterLevel, factor)
    };
}

function lerpColor(color1, color2, t) {
    const r1 = (color1 >> 16) & 0xff;
    const g1 = (color1 >> 8) & 0xff;
    const b1 = color1 & 0xff;
    
    const r2 = (color2 >> 16) & 0xff;
    const g2 = (color2 >> 8) & 0xff;
    const b2 = color2 & 0xff;
    
    const r = Math.floor(r1 + (r2 - r1) * t);
    const g = Math.floor(g1 + (g2 - g1) * t);
    const b = Math.floor(b1 + (b2 - b1) * t);
    
    return (r << 16) | (g << 8) | b;
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}