import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createNoise2D, createNoise3D } from 'simplex-noise';
import { biomeTypes, getBiomeColorByHeight, getBiomeTransition } from './biomes.js';

// Constants
const CHUNK_SIZE = 16;
const CHUNK_RESOLUTION = 1;
const LOAD_RADIUS = 4;
const UNLOAD_RADIUS = 6;
const WORLD_SEED = Math.random() * 1000;

// Main class
class TerrainGenerator {
    constructor() {
        this.setupScene();
        this.setupNoise();
        this.setupUI();
        this.chunks = new Map();
        this.chunkCache = new Map(); // Cache for previously generated chunks
        this.currentBiome = biomeTypes.grassland;
        this.centerChunk = { x: 0, z: 0 };
        this.stats = {
            chunksLoaded: 0,
            minHeight: 0,
            maxHeight: 0,
            vertexCount: 0,
            triangleCount: 0,
            fps: 0,
            featuresFound: []
        };
        this.isPaused = false;
        this.keysPressed = {};
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.highlightedFeature = null;
        
        // Set up keyboard controls
        this.setupControls();
        
        this.loadInitialChunks();
        this.animate();
    }
    
    setupScene() {
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb);
        this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.002);
        
        // Create camera
        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.camera.position.set(0, 80, 100);
        this.camera.lookAt(0, 0, 0);
        
        // Create renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.setPixelRatio(window.devicePixelRatio);
        document.getElementById('terrain-container').appendChild(this.renderer.domElement);
        
        // Add lights
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(this.ambientLight);
        
        this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.directionalLight.position.set(100, 100, 50);
        this.directionalLight.castShadow = true;
        this.directionalLight.shadow.mapSize.width = 2048;
        this.directionalLight.shadow.mapSize.height = 2048;
        const d = 200;
        this.directionalLight.shadow.camera.left = -d;
        this.directionalLight.shadow.camera.right = d;
        this.directionalLight.shadow.camera.top = d;
        this.directionalLight.shadow.camera.bottom = -d;
        this.directionalLight.shadow.camera.far = 500;
        this.scene.add(this.directionalLight);
        
        // Add atmospheric hemisphere light
        this.hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x444444, 0.5);
        this.scene.add(this.hemisphereLight);
        
        // Add skybox
        this.updateSkybox();
        
        // Add controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.1;
        this.controls.minDistance = 20;
        this.controls.maxDistance = 500;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
        this.controls.zoomSpeed = 1.2;
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }
    
    setupNoise() {
        this.noise2D = createNoise2D();
        this.noise3D = createNoise3D();
        this.seed = WORLD_SEED;
    }
    
    setupUI() {
        document.getElementById('toggle-generation').addEventListener('click', () => {
            this.isPaused = !this.isPaused;
            document.getElementById('toggle-generation').textContent = 
                this.isPaused ? 'Resume Generation' : 'Pause Generation';
        });
        
        document.getElementById('biome-select').addEventListener('change', (e) => {
            this.currentBiome = biomeTypes[e.target.value];
            document.getElementById('current-biome').textContent = this.currentBiome.name;
            this.updateSkybox();
            this.updateLighting();
            this.clearAllChunks();
            this.loadInitialChunks();
        });
    }
    
    setupControls() {
        // Keyboard event listeners
        window.addEventListener('keydown', (e) => {
            this.keysPressed[e.key.toLowerCase()] = true;
        });
        
        window.addEventListener('keyup', (e) => {
            this.keysPressed[e.key.toLowerCase()] = false;
        });
        
        // Show controls tooltip
        const controlsTooltip = document.createElement('div');
        controlsTooltip.className = 'controls-tooltip';
        controlsTooltip.innerHTML = `
            <h3>Controls</h3>
            <p><strong>Camera:</strong> Left-click + drag to rotate</p>
            <p><strong>Zoom:</strong> Mouse wheel</p>
            <p><strong>Pan:</strong> Right-click + drag</p>
            <p><strong>Move:</strong> WASD keys</p>
        `;
        document.body.appendChild(controlsTooltip);
        
        // Hide after 10 seconds
        setTimeout(() => {
            controlsTooltip.style.opacity = '0';
            setTimeout(() => controlsTooltip.remove(), 1000);
        }, 10000);
    }
    
    updateSkybox() {
        // Set the scene background and fog color based on biome
        const skyColor = new THREE.Color(this.currentBiome.skyColor || 0x87ceeb);
        this.scene.background = skyColor;
        this.scene.fog.color = skyColor;
        this.scene.fog.density = this.currentBiome.fogDensity || 0.002;
    }
    
    updateLighting() {
        // Update lighting based on biome
        this.ambientLight.intensity = this.currentBiome.ambientIntensity || 0.6;
        this.ambientLight.color.set(this.currentBiome.ambientColor || 0xffffff);
        
        this.directionalLight.intensity = this.currentBiome.sunIntensity || 0.8;
        this.directionalLight.color.set(this.currentBiome.sunColor || 0xffffff);
        
        this.hemisphereLight.skyColor.set(this.currentBiome.skyColor || 0x87ceeb);
        this.hemisphereLight.groundColor.set(this.currentBiome.baseColor);
    }
    
    clearAllChunks() {
        for (const chunkKey of this.chunks.keys()) {
            const chunk = this.chunks.get(chunkKey);
            this.scene.remove(chunk.mesh);
            
            // Remove features
            for (const feature of chunk.featureMeshes) {
                this.scene.remove(feature);
            }
        }
        this.chunks.clear();
        this.stats.chunksLoaded = 0;
        this.stats.vertexCount = 0;
        this.stats.triangleCount = 0;
    }
    
    getHeightAt(x, z, biome = this.currentBiome) {
        // Multiple layers of noise with different frequencies for more natural terrain
        const nx = x * 0.01;
        const nz = z * 0.01;
        
        // Base continent shape (large scale features)
        let continentShape = this.noise2D(nx * 0.2 + this.seed, nz * 0.2) * 0.5 + 0.5;
        continentShape = Math.pow(continentShape, 1.5); // Sharpen continent edges
        
        // Varied terrain features
        let value = 0;
        value += this.noise2D(nx + this.seed, nz) * 0.5;
        value += this.noise2D(nx * 2 + this.seed * 2, nz * 2) * 0.25;
        value += this.noise2D(nx * 4 + this.seed * 3, nz * 4) * 0.125;
        value += this.noise2D(nx * 8 + this.seed * 4, nz * 8) * 0.0625;
        
        // Add ridged mountains
        let ridged = Math.abs(this.noise2D(nx * 3, nz * 3 + this.seed * 5));
        ridged = Math.pow(ridged, 2) * 0.5;
        
        // Combine with continent shape
        value = value * (0.5 + continentShape * 0.5);
        
        // Add mountains where appropriate
        if (biome.mountainous) {
            value += ridged * biome.mountainScale;
        }
        
        // Rivers (negative ridges)
        if (biome.rivers) {
            const riverNoise = Math.abs(this.noise2D(nx * 2.5 + this.seed * 6, nz * 2.5));
            if (riverNoise < 0.05) {
                value -= (0.05 - riverNoise) * 40 * biome.riverDepth;
            }
        }
        
        // Apply biome settings
        value *= biome.roughness;
        return value * biome.heightMultiplier;
    }
    
    getBiomeAt(x, z) {
        // This would implement proper biome blending based on large-scale noise
        // For this simple demo, we just use the currently selected biome
        return this.currentBiome;
    }
    
    generateChunkGeometry(chunkX, chunkZ) {
        const worldX = chunkX * CHUNK_SIZE;
        const worldZ = chunkZ * CHUNK_SIZE;
        
        // Check cache first
        const cacheKey = `${chunkX},${chunkZ},${this.currentBiome.name}`;
        if (this.chunkCache.has(cacheKey)) {
            return JSON.parse(JSON.stringify(this.chunkCache.get(cacheKey)));
        }
        
        // Create geometry
        const geometry = new THREE.PlaneGeometry(
            CHUNK_SIZE, 
            CHUNK_SIZE, 
            CHUNK_SIZE / CHUNK_RESOLUTION, 
            CHUNK_SIZE / CHUNK_RESOLUTION
        );
        geometry.rotateX(-Math.PI / 2);
        
        // Create position attribute
        const positions = geometry.attributes.position;
        const colors = new Float32Array(positions.count * 3);
        
        let minHeight = Infinity;
        let maxHeight = -Infinity;
        
        // Features to place
        const possibleFeatures = [];
        const heightMap = [];
        
        // Apply height map
        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i) + worldX;
            const z = positions.getZ(i) + worldZ;
            
            // Get local biome
            const localBiome = this.getBiomeAt(x, z);
            
            // Get height from noise
            const height = this.getHeightAt(x, z, localBiome);
            positions.setY(i, height);
            heightMap.push(height);
            
            // Track min/max height
            minHeight = Math.min(minHeight, height);
            maxHeight = Math.max(maxHeight, height);
            
            // Calculate slope for feature placement
            let slope = 0;
            if (i > 0 && i % (CHUNK_SIZE / CHUNK_RESOLUTION + 1) !== 0) {
                const prevHeight = positions.getY(i - 1);
                slope = Math.abs(height - prevHeight);
            }
            
            // Set color based on height, biome, and slope
            const color = new THREE.Color(getBiomeColorByHeight(localBiome, height, slope));
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
            
            // Potentially place a feature - but only consider flat areas for most features
            if (i % 25 === 0 && slope < 0.1) { // Check only some vertices for performance
                for (const feature of this.currentBiome.features) {
                    // Check suitable height ranges for features
                    const heightSuitable = 
                        (!feature.minHeight || height >= feature.minHeight) && 
                        (!feature.maxHeight || height <= feature.maxHeight);
                    
                    // Water features should be in low areas
                    if (feature.name.includes("Lake") || feature.name.includes("Oasis")) {
                        if (height > this.currentBiome.waterLevel + 2) continue;
                    }
                    
                    // Only place features at appropriate heights and locations
                    if (heightSuitable && Math.random() < feature.chance) {
                        possibleFeatures.push({
                            name: feature.name,
                            x: x,
                            z: z,
                            y: height,
                            size: feature.size,
                            color: feature.color
                        });
                    }
                }
            }
        }
        
        // Add colors to geometry
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.computeVertexNormals(); // For better lighting
        
        // Update stats
        this.stats.minHeight = Math.min(this.stats.minHeight, minHeight);
        this.stats.maxHeight = Math.max(this.stats.maxHeight, maxHeight);
        this.stats.vertexCount += positions.count;
        this.stats.triangleCount += geometry.index.count / 3;
        
        // Create chunk mesh with improved material
        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            flatShading: true,
            side: THREE.DoubleSide,
            roughness: 0.8,
            metalness: 0.1
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        // Smart feature placement
        const featureMeshes = [];
        
        // Sort features by importance to place important ones first
        possibleFeatures.sort((a, b) => {
            const aIsWater = a.name.includes("Lake") || a.name.includes("Oasis");
            const bIsWater = b.name.includes("Lake") || b.name.includes("Oasis");
            
            if (aIsWater && !bIsWater) return -1;
            if (!aIsWater && bIsWater) return 1;
            return 0;
        });
        
        // Place features with spatial awareness
        for (const feature of possibleFeatures) {
            // Check if this feature is too close to another
            let tooClose = false;
            for (const existing of featureMeshes) {
                const dist = Math.sqrt(
                    Math.pow(existing.position.x - feature.x, 2) +
                    Math.pow(existing.position.z - feature.z, 2)
                );
                
                const minDist = 12; // Minimum distance between features
                if (dist < minDist) {
                    tooClose = true;
                    break;
                }
            }
            if (tooClose) continue;
            
            // Create feature mesh based on its type
            const sizeFactor = feature.size[0] + Math.random() * (feature.size[1] - feature.size[0]);
            
            let featureMesh;
            
            if (feature.name.includes("Ruins") || feature.name.includes("Tomb")) {
                featureMesh = this.createRuinFeature(feature, sizeFactor);
            } else if (feature.name.includes("Lake") || feature.name.includes("Oasis")) {
                featureMesh = this.createWaterFeature(feature, sizeFactor);
            } else if (feature.name.includes("Tree") || feature.name.includes("Thicket")) {
                featureMesh = this.createVegetationFeature(feature, sizeFactor);
            } else if (feature.name.includes("Cave")) {
                featureMesh = this.createCaveFeature(feature, sizeFactor);
            } else {
                featureMesh = this.createGenericFeature(feature, sizeFactor);
            }
            
            featureMesh.userData = { featureType: feature.name };
            featureMesh.castShadow = true;
            featureMesh.receiveShadow = true;
            this.scene.add(featureMesh);
            featureMeshes.push(featureMesh);
            
            // Track this feature
            this.stats.featuresFound.push({
                name: feature.name,
                position: { x: feature.x, y: feature.y, z: feature.z }
            });
            
            // Show feature in UI if it's notable
            if (Math.random() < 0.3) {
                this.updateFeatureHighlight(feature.name);
                this.highlightedFeature = featureMesh;
            }
        }
        
        const result = { mesh, featureMeshes, minHeight, maxHeight, heightMap };
        
        // Store in cache
        this.chunkCache.set(cacheKey, JSON.parse(JSON.stringify(result)));
        
        return result;
    }
    
    createRuinFeature(feature, sizeFactor) {
        const structure = new THREE.Group();
        
        // Base platform
        const baseGeom = new THREE.BoxGeometry(sizeFactor * 2, 1, sizeFactor * 2);
        const baseMat = new THREE.MeshStandardMaterial({ 
            color: feature.color,
            roughness: 0.9,
            metalness: 0.1
        });
        const base = new THREE.Mesh(baseGeom, baseMat);
        base.position.set(0, 0.5, 0);
        structure.add(base);
        
        // Add some pillars with varying heights and positions
        const pillarCount = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < pillarCount; i++) {
            const pillarHeight = 2 + Math.random() * 3;
            const pillarGeom = new THREE.CylinderGeometry(0.5, 0.5, pillarHeight, 6);
            const pillarMat = new THREE.MeshStandardMaterial({ 
                color: feature.color,
                roughness: 0.8,
                metalness: 0.2
            });
            const pillar = new THREE.Mesh(pillarGeom, pillarMat);
            
            // Random position on the platform
            const angle = Math.random() * Math.PI * 2;
            const radius = (Math.random() * 0.6 + 0.2) * sizeFactor;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            
            pillar.position.set(x, pillarHeight / 2, z);
            
            // Random tilt for broken appearance
            if (Math.random() < 0.7) {
                pillar.rotation.x = (Math.random() - 0.5) * 0.2;
                pillar.rotation.z = (Math.random() - 0.5) * 0.2;
            }
            
            structure.add(pillar);
        }
        
        // Add some fallen debris
        for (let i = 0; i < 3; i++) {
            const debrisSize = 0.5 + Math.random() * 0.5;
            const debrisGeom = new THREE.BoxGeometry(debrisSize, debrisSize, debrisSize * 2);
            const debrisMat = new THREE.MeshStandardMaterial({ 
                color: feature.color,
                roughness: 0.9,
                metalness: 0.1
            });
            const debris = new THREE.Mesh(debrisGeom, debrisMat);
            
            // Position around the structure
            const angle = Math.random() * Math.PI * 2;
            const radius = sizeFactor * (1 + Math.random() * 0.5);
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            
            debris.position.set(x, debrisSize / 2, z);
            debris.rotation.y = Math.random() * Math.PI;
            debris.rotation.x = Math.random() * 0.5;
            
            structure.add(debris);
        }
        
        structure.position.set(feature.x, feature.y, feature.z);
        return structure;
    }
    
    createWaterFeature(feature, sizeFactor) {
        const waterBody = new THREE.Group();
        
        // Main water surface
        const waterGeom = new THREE.CircleGeometry(sizeFactor, 24);
        const waterMat = new THREE.MeshStandardMaterial({ 
            color: feature.color,
            transparent: true,
            opacity: 0.8,
            roughness: 0.1,
            metalness: 0.3
        });
        const water = new THREE.Mesh(waterGeom, waterMat);
        water.rotation.x = -Math.PI / 2;
        water.position.y = -0.2; // Slightly below ground
        waterBody.add(water);
        
        // Shore
        const shoreGeom = new THREE.RingGeometry(sizeFactor, sizeFactor * 1.2, 24);
        const shoreMat = new THREE.MeshStandardMaterial({ 
            color: 0xc2b280, // Sandy color
            roughness: 0.9,
            metalness: 0
        });
        const shore = new THREE.Mesh(shoreGeom, shoreMat);
        shore.rotation.x = -Math.PI / 2;
        shore.position.y = -0.1; // Just below ground
        waterBody.add(shore);
        
        // Add some vegetation around (if it's an oasis)
        if (feature.name.includes("Oasis")) {
            const treeCount = Math.floor(Math.random() * 5) + 2;
            for (let i = 0; i < treeCount; i++) {
                const treeGroup = new THREE.Group();
                
                // Tree trunk
                const trunkGeom = new THREE.CylinderGeometry(0.2, 0.3, 2, 5);
                const trunkMat = new THREE.MeshStandardMaterial({ 
                    color: 0x8B4513, // Brown
                    roughness: 0.9
                });
                const trunk = new THREE.Mesh(trunkGeom, trunkMat);
                trunk.position.y = 1;
                treeGroup.add(trunk);
                
                // Tree top
                const topGeom = new THREE.ConeGeometry(1, 2, 6);
                const topMat = new THREE.MeshStandardMaterial({ 
                    color: 0x2d6a22, // Green
                    roughness: 0.8
                });
                const top = new THREE.Mesh(topGeom, topMat);
                top.position.y = 2.5;
                treeGroup.add(top);
                
                // Position around the oasis
                const angle = Math.random() * Math.PI * 2;
                const radius = sizeFactor * 0.8;
                const x = Math.cos(angle) * radius;
                const z = Math.sin(angle) * radius;
                
                treeGroup.position.set(x, 0, z);
                treeGroup.rotation.y = Math.random() * Math.PI;
                
                waterBody.add(treeGroup);
            }
        }
        
        waterBody.position.set(feature.x, feature.y, feature.z);
        return waterBody;
    }
    
    createVegetationFeature(feature, sizeFactor) {
        const vegetation = new THREE.Group();
        
        // Dense vegetation - multiple trees or plants
        const count = Math.floor(Math.random() * 7) + 3;
        
        for (let i = 0; i < count; i++) {
            const treeGroup = new THREE.Group();
            
            // Tree trunk
            const trunkHeight = 1 + Math.random() * 2;
            const trunkGeom = new THREE.CylinderGeometry(0.2, 0.3, trunkHeight, 5);
            const trunkMat = new THREE.MeshStandardMaterial({ 
                color: 0x8B4513, // Brown
                roughness: 0.9
            });
            const trunk = new THREE.Mesh(trunkGeom, trunkMat);
            trunk.position.y = trunkHeight / 2;
            treeGroup.add(trunk);
            
            // Tree canopy
            const isConifer = Math.random() < 0.5;
            
            if (isConifer) {
                // Pine tree with multiple layers
                const layers = Math.floor(Math.random() * 2) + 2;
                for (let j = 0; j < layers; j++) {
                    const layerSize = 1.2 - j * 0.3;
                    const layerHeight = 1;
                    const layerGeom = new THREE.ConeGeometry(layerSize, layerHeight, 6);
                    const layerMat = new THREE.MeshStandardMaterial({ 
                        color: feature.color,
                        roughness: 0.8
                    });
                    const layer = new THREE.Mesh(layerGeom, layerMat);
                    layer.position.y = trunkHeight + j * 0.8;
                    treeGroup.add(layer);
                }
            } else {
                // Broadleaf tree with spherical canopy
                const canopyGeom = new THREE.SphereGeometry(1 + Math.random() * 0.5, 8, 6);
                const canopyMat = new THREE.MeshStandardMaterial({ 
                    color: feature.color,
                    roughness: 0.8
                });
                const canopy = new THREE.Mesh(canopyGeom, canopyMat);
                canopy.position.y = trunkHeight + 0.5;
                canopy.scale.y = 1.2; // Slightly squashed sphere
                treeGroup.add(canopy);
            }
            
            // Position within the feature area
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * sizeFactor;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            
            treeGroup.position.set(x, 0, z);
            vegetation.add(treeGroup);
        }
        
        vegetation.position.set(feature.x, feature.y, feature.z);
        return vegetation;
    }
    
    createCaveFeature(feature, sizeFactor) {
        const cave = new THREE.Group();
        
        // Cave entrance (black hole)
        const entranceGeom = new THREE.CircleGeometry(sizeFactor * 0.5, 16);
        const entranceMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const entrance = new THREE.Mesh(entranceGeom, entranceMat);
        
        // Position and rotate to be vertical
        entrance.position.y = 0.1;
        entrance.rotation.x = -Math.PI / 2;
        
        cave.add(entrance);
        
        // Rocky surroundings
        const rockCount = Math.floor(Math.random() * 6) + 3;
        for (let i = 0; i < rockCount; i++) {
            const rockSize = 0.3 + Math.random() * 0.7;
            const rockGeom = new THREE.DodecahedronGeometry(rockSize, 0);
            const rockMat = new THREE.MeshStandardMaterial({ 
                color: feature.color,
                roughness: 0.9,
                metalness: 0.1
            });
            const rock = new THREE.Mesh(rockGeom, rockMat);
            
            // Position around the entrance
            const angle = Math.random() * Math.PI * 2;
            const radius = sizeFactor * 0.6 + Math.random() * 0.3;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            
            rock.position.set(x, rockSize / 2, z);
            rock.rotation.set(
                Math.random() * Math.PI,
                Math.random() * Math.PI,
                Math.random() * Math.PI
            );
            
            cave.add(rock);
        }
        
        cave.position.set(feature.x, feature.y, feature.z);
        return cave;
    }
    
    createGenericFeature(feature, sizeFactor) {
        // Create feature based on name
        if (feature.name.includes("Hill") || feature.name.includes("Ridge")) {
            // Create a hill/ridge
            const hillGeom = new THREE.ConeGeometry(sizeFactor, sizeFactor * 1.5, 8);
            const hillMat = new THREE.MeshStandardMaterial({ 
                color: feature.color,
                roughness: 0.9,
                metalness: 0
            });
            const hill = new THREE.Mesh(hillGeom, hillMat);
            hill.position.set(feature.x, feature.y + sizeFactor * 0.5, feature.z);
            return hill;
        } else if (feature.name.includes("Path") || feature.name.includes("Clearing")) {
            // Create a path/clearing
            const pathGeom = new THREE.PlaneGeometry(sizeFactor * 0.8, sizeFactor * 3);
            const pathMat = new THREE.MeshStandardMaterial({ 
                color: feature.color,
                roughness: 0.8,
                metalness: 0
            });
            const path = new THREE.Mesh(pathGeom, pathMat);
            path.rotation.x = -Math.PI / 2;
            path.position.set(feature.x, feature.y + 0.05, feature.z);
            path.rotation.y = Math.random() * Math.PI; // Random orientation
            return path;
        } else {
            // Default generic feature
            const genericGeom = new THREE.SphereGeometry(sizeFactor, 8, 6);
            const genericMat = new THREE.MeshStandardMaterial({ 
                color: feature.color,
                roughness: 0.7,
                metalness: 0.1
            });
            const generic = new THREE.Mesh(genericGeom, genericMat);
            generic.position.set(feature.x, feature.y + sizeFactor * 0.5, feature.z);
            return generic;
        }
    }
    
    createChunk(x, z) {
        const key = `${x},${z}`;
        if (this.chunks.has(key)) return;
        
        const { mesh, featureMeshes, minHeight, maxHeight } = this.generateChunkGeometry(x, z);
        mesh.position.set(0, 0, 0);
        this.scene.add(mesh);
        
        this.chunks.set(key, { 
            mesh, 
            featureMeshes,
            x, 
            z, 
            minHeight, 
            maxHeight 
        });
        
        this.stats.chunksLoaded++;
    }
    
    updateChunks() {
        if (this.isPaused) return;
        
        // Get camera position in chunk coordinates
        const cameraWorldX = this.camera.position.x;
        const cameraWorldZ = this.camera.position.z;
        const cameraCenterX = Math.floor(cameraWorldX / CHUNK_SIZE);
        const cameraCenterZ = Math.floor(cameraWorldZ / CHUNK_SIZE);
        
        // Update center chunk based on camera position
        if (cameraCenterX !== this.centerChunk.x || cameraCenterZ !== this.centerChunk.z) {
            this.centerChunk = { x: cameraCenterX, z: cameraCenterZ };
        }
        
        // Load and unload chunks based on distance from center
        const loadedKeys = new Set();
        
        // Load chunks within radius
        for (let x = -LOAD_RADIUS; x <= LOAD_RADIUS; x++) {
            for (let z = -LOAD_RADIUS; z <= LOAD_RADIUS; z++) {
                const chunkX = this.centerChunk.x + x;
                const chunkZ = this.centerChunk.z + z;
                const key = `${chunkX},${chunkZ}`;
                
                // Skip chunks too far away (optimize for circular loading)
                const dist = Math.sqrt(x * x + z * z);
                if (dist > LOAD_RADIUS) continue;
                
                loadedKeys.add(key);
                
                if (!this.chunks.has(key)) {
                    this.createChunk(chunkX, chunkZ);
                }
            }
        }
        
        // Unload chunks outside radius
        for (const key of this.chunks.keys()) {
            if (!loadedKeys.has(key)) {
                const chunk = this.chunks.get(key);
                this.scene.remove(chunk.mesh);
                
                // Remove any feature meshes
                for (const featureMesh of chunk.featureMeshes) {
                    this.scene.remove(featureMesh);
                }
                
                this.chunks.delete(key);
                this.stats.chunksLoaded--;
            }
        }
    }
    
    loadInitialChunks() {
        // First get current camera position
        const cameraWorldX = this.camera.position.x;
        const cameraWorldZ = this.camera.position.z;
        this.centerChunk = {
            x: Math.floor(cameraWorldX / CHUNK_SIZE),
            z: Math.floor(cameraWorldZ / CHUNK_SIZE)
        };
        
        // Load chunks in a spiral pattern from center (more efficient loading)
        const directions = [
            [1, 0], [0, 1], [-1, 0], [0, -1]  // Right, Down, Left, Up
        ];
        
        let x = 0, z = 0;
        let dir = 0;
        let steps = 1;
        let stepCount = 0;
        let stepsTaken = 0;
        
        for (let i = 0; i < Math.pow(LOAD_RADIUS * 2 + 1, 2); i++) {
            const chunkX = this.centerChunk.x + x;
            const chunkZ = this.centerChunk.z + z;
            
            // Skip chunks too far away (for circular loading)
            const dist = Math.sqrt(x * x + z * z);
            if (dist <= LOAD_RADIUS) {
                this.createChunk(chunkX, chunkZ);
            }
            
            // Move in current direction
            x += directions[dir][0];
            z += directions[dir][1];
            
            // Check if we need to change direction
            stepsTaken++;
            if (stepsTaken === steps) {
                dir = (dir + 1) % 4;
                stepsTaken = 0;
                stepCount++;
                if (stepCount === 2) {
                    steps++;
                    stepCount = 0;
                }
            }
            
            // Stop if we've gone too far
            if (Math.abs(x) > LOAD_RADIUS * 2 || Math.abs(z) > LOAD_RADIUS * 2) break;
        }
    }
    
    processKeyboardInput() {
        if (!this.keysPressed) return;
        
        const moveSpeed = 1.0;
        let moved = false;
        
        // Movement directions
        if (this.keysPressed['w'] || this.keysPressed['arrowup']) {
            // Move forward in camera direction
            const forward = new THREE.Vector3(0, 0, -1);
            forward.applyQuaternion(this.camera.quaternion);
            forward.y = 0; // Keep movement horizontal
            forward.normalize();
            
            this.camera.position.add(forward.multiplyScalar(moveSpeed));
            moved = true;
        }
        
        if (this.keysPressed['s'] || this.keysPressed['arrowdown']) {
            // Move backward in camera direction
            const backward = new THREE.Vector3(0, 0, 1);
            backward.applyQuaternion(this.camera.quaternion);
            backward.y = 0; // Keep movement horizontal
            backward.normalize();
            
            this.camera.position.add(backward.multiplyScalar(moveSpeed));
            moved = true;
        }
        
        if (this.keysPressed['a'] || this.keysPressed['arrowleft']) {
            // Move left in camera direction
            const left = new THREE.Vector3(-1, 0, 0);
            left.applyQuaternion(this.camera.quaternion);
            left.y = 0; // Keep movement horizontal
            left.normalize();
            
            this.camera.position.add(left.multiplyScalar(moveSpeed));
            moved = true;
        }
        
        if (this.keysPressed['d'] || this.keysPressed['arrowright']) {
            // Move right in camera direction
            const right = new THREE.Vector3(1, 0, 0);
            right.applyQuaternion(this.camera.quaternion);
            right.y = 0; // Keep movement horizontal
            right.normalize();
            
            this.camera.position.add(right.multiplyScalar(moveSpeed));
            moved = true;
        }
        
        // If moved, adjust camera height to terrain
        if (moved) {
            // Find chunk and height
            const worldX = this.camera.position.x;
            const worldZ = this.camera.position.z;
            const chunkX = Math.floor(worldX / CHUNK_SIZE);
            const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
            const localX = worldX - chunkX * CHUNK_SIZE;
            const localZ = worldZ - chunkZ * CHUNK_SIZE;
            
            // Get chunk if loaded
            const chunk = this.chunks.get(`${chunkX},${chunkZ}`);
            if (chunk) {
                const heightAtCamera = this.getHeightAt(worldX, worldZ);
                
                // Set camera y position to terrain height plus offset
                const targetHeight = heightAtCamera + 10;
                this.camera.position.y = targetHeight;
            }
        }
    }
    
    updateStats() {
        document.getElementById('chunks-loaded').textContent = this.stats.chunksLoaded;
        document.getElementById('height-range').textContent = 
            `${Math.floor(this.stats.minHeight)} - ${Math.floor(this.stats.maxHeight)}`;
        
        // Update current biome
        document.getElementById('current-biome').textContent = this.currentBiome.name;
        
        // Calculate FPS
        this.frameCount++;
        const currentTime = performance.now();
        const elapsed = currentTime - this.lastTime;
        
        if (elapsed >= 1000) {
            this.stats.fps = Math.round(this.frameCount * 1000 / elapsed);
            this.frameCount = 0;
            this.lastTime = currentTime;
            
            // Update FPS display
            const fpsElement = document.getElementById('fps-counter');
            if (fpsElement) {
                fpsElement.textContent = this.stats.fps;
            }
        }
    }
    
    updateFeatureHighlight(featureName) {
        const featureHighlight = document.getElementById('feature-highlight');
        featureHighlight.innerHTML = `<h4>Feature Detected:</h4><p>${featureName}</p>`;
        featureHighlight.classList.add('feature-active');
        
        setTimeout(() => {
            featureHighlight.classList.remove('feature-active');
        }, 3000);
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        this.processKeyboardInput();
        this.updateChunks();
        this.updateStats();
        this.controls.update();
        
        // Highlight feature if any
        if (this.highlightedFeature) {
            const time = Date.now() * 0.001;
            this.highlightedFeature.position.y += Math.sin(time * 3) * 0.01;
        }
        
        this.renderer.render(this.scene, this.camera);
    }
}

// Initialize the terrain generator when the document is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TerrainGenerator();
});