import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createNoise2D } from 'simplex-noise';
import { biomeTypes, getBiomeColorByHeight } from './biomes.js';

// Constants
const CHUNK_SIZE = 16;
const CHUNK_RESOLUTION = 1;
const LOAD_RADIUS = 3;
const UNLOAD_RADIUS = 4;

// Main class
class TerrainGenerator {
    constructor() {
        this.setupScene();
        this.setupNoise();
        this.setupUI();
        this.chunks = new Map();
        this.currentBiome = biomeTypes.grassland;
        this.centerChunk = { x: 0, z: 0 };
        this.stats = {
            chunksLoaded: 0,
            minHeight: 0,
            maxHeight: 0,
            featuresFound: []
        };
        this.isPaused = false;
        
        this.loadInitialChunks();
        this.animate();
    }
    
    setupScene() {
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb);
        
        // Create camera
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.camera.position.set(0, 100, 100);
        this.camera.lookAt(0, 0, 0);
        
        // Create renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        document.getElementById('terrain-container').appendChild(this.renderer.domElement);
        
        // Add lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(100, 100, 50);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        this.scene.add(directionalLight);
        
        // Add controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.minDistance = 20;
        this.controls.maxDistance = 500;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.1;
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }
    
    setupNoise() {
        this.noise2D = createNoise2D();
        this.seed = Math.random() * 1000;
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
            this.clearAllChunks();
            this.loadInitialChunks();
        });
    }
    
    clearAllChunks() {
        for (const chunkKey of this.chunks.keys()) {
            const chunk = this.chunks.get(chunkKey);
            this.scene.remove(chunk.mesh);
        }
        this.chunks.clear();
        this.stats.chunksLoaded = 0;
    }
    
    getHeightAt(x, z) {
        // Multiple layers of noise with different frequencies
        const nx = x * 0.01;
        const nz = z * 0.01;
        
        let value = 0;
        value += this.noise2D(nx, nz) * 0.5;
        value += this.noise2D(nx * 2 + this.seed, nz * 2) * 0.25;
        value += this.noise2D(nx * 4, nz * 4 + this.seed) * 0.125;
        value += this.noise2D(nx * 8 + this.seed, nz * 8 + this.seed) * 0.0625;
        
        // Apply biome settings
        value *= this.currentBiome.roughness;
        return value * this.currentBiome.heightMultiplier;
    }
    
    generateChunkGeometry(chunkX, chunkZ) {
        const worldX = chunkX * CHUNK_SIZE;
        const worldZ = chunkZ * CHUNK_SIZE;
        
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
        
        // Apply height map
        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i) + worldX;
            const z = positions.getZ(i) + worldZ;
            
            // Get height from noise
            const height = this.getHeightAt(x, z);
            positions.setY(i, height);
            
            // Track min/max height
            minHeight = Math.min(minHeight, height);
            maxHeight = Math.max(maxHeight, height);
            
            // Set color based on height and biome
            const color = new THREE.Color(getBiomeColorByHeight(this.currentBiome, height));
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
            
            // Potentially place a feature
            if (i % 20 === 0) { // Check only some vertices to save performance
                for (const feature of this.currentBiome.features) {
                    if (Math.random() < feature.chance) {
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
        
        // Update stats
        this.stats.minHeight = Math.min(this.stats.minHeight, minHeight);
        this.stats.maxHeight = Math.max(this.stats.maxHeight, maxHeight);
        
        // Create chunk mesh
        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            flatShading: true,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        // Add features
        const featureMeshes = [];
        for (const feature of possibleFeatures) {
            // Check if this feature is too close to another
            let tooClose = false;
            for (const existing of featureMeshes) {
                const dist = Math.sqrt(
                    Math.pow(existing.position.x - feature.x, 2) +
                    Math.pow(existing.position.z - feature.z, 2)
                );
                if (dist < 10) {
                    tooClose = true;
                    break;
                }
            }
            if (tooClose) continue;
            
            // Create feature mesh based on its type
            const sizeFactor = feature.size[0] + Math.random() * (feature.size[1] - feature.size[0]);
            
            let featureMesh;
            if (feature.name.includes("Ruins") || feature.name.includes("Tomb")) {
                // Create a small structure
                const structure = new THREE.Group();
                
                // Base platform
                const base = new THREE.Mesh(
                    new THREE.BoxGeometry(sizeFactor * 2, 1, sizeFactor * 2),
                    new THREE.MeshStandardMaterial({ color: feature.color })
                );
                base.position.set(0, 0.5, 0);
                structure.add(base);
                
                // Add some pillars
                for (let i = 0; i < 4; i++) {
                    const pillarHeight = 2 + Math.random() * 3;
                    const pillar = new THREE.Mesh(
                        new THREE.BoxGeometry(1, pillarHeight, 1),
                        new THREE.MeshStandardMaterial({ color: feature.color })
                    );
                    
                    const offset = sizeFactor * 0.7;
                    const x = (i % 2 === 0) ? -offset : offset;
                    const z = (i < 2) ? -offset : offset;
                    
                    pillar.position.set(x, pillarHeight / 2, z);
                    structure.add(pillar);
                }
                
                structure.position.set(feature.x, feature.y, feature.z);
                featureMesh = structure;
            } else if (feature.name.includes("Lake") || feature.name.includes("Oasis")) {
                // Create a water body
                const water = new THREE.Mesh(
                    new THREE.CircleGeometry(sizeFactor, 16),
                    new THREE.MeshStandardMaterial({ 
                        color: feature.color,
                        transparent: true,
                        opacity: 0.8
                    })
                );
                water.rotation.x = -Math.PI / 2;
                water.position.set(feature.x, feature.y - 0.2, feature.z);
                featureMesh = water;
            } else {
                // Generic feature (hill, ridge, etc.)
                const genericFeature = new THREE.Mesh(
                    new THREE.ConeGeometry(sizeFactor, sizeFactor * 2, 8),
                    new THREE.MeshStandardMaterial({ color: feature.color })
                );
                genericFeature.position.set(feature.x, feature.y, feature.z);
                featureMesh = genericFeature;
            }
            
            featureMesh.castShadow = true;
            featureMesh.receiveShadow = true;
            this.scene.add(featureMesh);
            featureMeshes.push(featureMesh);
            
            // Track this feature
            this.stats.featuresFound.push({
                name: feature.name,
                position: { x: feature.x, y: feature.y, z: feature.z }
            });
            
            // Show feature in UI if it's new
            this.updateFeatureHighlight(feature.name);
        }
        
        return { mesh, featureMeshes, minHeight, maxHeight };
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
        
        // Move the center chunk slowly to simulate exploration
        const time = Date.now() * 0.0001;
        this.centerChunk = {
            x: Math.floor(Math.sin(time) * 5),
            z: Math.floor(Math.cos(time) * 5)
        };
        
        // Load and unload chunks based on distance from center
        const loadedKeys = new Set();
        
        // Load chunks within radius
        for (let x = -LOAD_RADIUS; x <= LOAD_RADIUS; x++) {
            for (let z = -LOAD_RADIUS; z <= LOAD_RADIUS; z++) {
                const chunkX = this.centerChunk.x + x;
                const chunkZ = this.centerChunk.z + z;
                const key = `${chunkX},${chunkZ}`;
                
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
        for (let x = -LOAD_RADIUS; x <= LOAD_RADIUS; x++) {
            for (let z = -LOAD_RADIUS; z <= LOAD_RADIUS; z++) {
                this.createChunk(x, z);
            }
        }
    }
    
    updateStats() {
        document.getElementById('chunks-loaded').textContent = this.stats.chunksLoaded;
        document.getElementById('height-range').textContent = 
            `${Math.floor(this.stats.minHeight)} - ${Math.floor(this.stats.maxHeight)}`;
        
        // Update current biome
        document.getElementById('current-biome').textContent = this.currentBiome.name;
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
        
        this.updateChunks();
        this.updateStats();
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}

// Initialize the terrain generator when the document is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TerrainGenerator();
});

