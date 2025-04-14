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
        features: [
            { name: "Ancient Ruins", chance: 0.05, size: [3, 6], color: 0xa9957c },
            { name: "Small Hill", chance: 0.2, size: [2, 4], color: 0x558d46 },
            { name: "Hidden Path", chance: 0.1, size: [1, 8], color: 0xc2b280 }
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
        features: [
            { name: "Oasis", chance: 0.03, size: [2, 4], color: 0x4a99ff },
            { name: "Ancient Tomb", chance: 0.04, size: [2, 3], color: 0xc2b280 },
            { name: "Dune Ridge", chance: 0.15, size: [3, 7], color: 0xefd8a9 }
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
        features: [
            { name: "Ice Cave", chance: 0.04, size: [2, 3], color: 0xc1e3e6 },
            { name: "Frozen Lake", chance: 0.08, size: [3, 6], color: 0xadd8e6 },
            { name: "Snow Ridge", chance: 0.1, size: [2, 5], color: 0xffffff }
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
        features: [
            { name: "Dense Thicket", chance: 0.15, size: [2, 4], color: 0x1a3e11 },
            { name: "Forest Clearing", chance: 0.07, size: [3, 5], color: 0x6eaf5f },
            { name: "Ancient Tree", chance: 0.03, size: [1, 2], color: 0x8b4513 }
        ]
    }
};

export function getBiomeColorByHeight(biome, height) {
    if (height < biome.waterLevel) {
        return biome.waterColor;
    }
    
    // Gradient between base and detail colors based on height
    const t = Math.min((height - biome.waterLevel) / 20, 1);
    return lerpColor(biome.baseColor, biome.detailColor, t);
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

