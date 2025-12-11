import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// 1. Setup Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0); 
scene.fog = new THREE.Fog(0xf0f0f0, 20, 200); 

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- THE FLOOR ---
const floorGeometry = new THREE.PlaneGeometry(2000, 2000);
const floorMaterial = new THREE.MeshBasicMaterial({ color: 0xe0e0e0 });
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2; 
floor.position.y = -5.1; 
scene.add(floor);

// --- AUDIO LISTENER ---
const listener = new THREE.AudioListener();
camera.add(listener); 

// 2. Movement Variables
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
const speed = 40.0; 

// --- FIXED SHADER CODE ---
const vertexShader = `
varying vec2 vUv;
varying vec3 vPosition;
uniform float uTime;

void main() {
    vUv = uv;
    vPosition = position;

    // Organic Wobble
    float wobble = sin(position.y * 0.2 + uTime) * cos(position.z * 0.2 + uTime);
    vec3 newPosition = position + normal * (wobble * 0.8);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
`;

const fragmentShader = `
uniform sampler2D uTexture;
uniform vec3 uHubColor; 
varying vec2 vUv;
varying vec3 vPosition;

float random (vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233)))* 43758.5453123);
}

float noise (vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

void main() {
    vec4 texColor = texture2D(uTexture, vUv);
    
    // Hole Generation
    float n = noise(vPosition.xz * 0.15 + vPosition.y * 0.1);
    float threshold = 0.45; 
    float edge = smoothstep(threshold - 0.1, threshold + 0.1, n);
    vec3 finalColor = mix(uHubColor, texColor.rgb, edge);

    if(edge < 0.05) discard; 

    gl_FragColor = vec4(finalColor, 1.0);
}
`;

// 4. Room Generator
function createMemoryRoom(imageFile, audioFile, x, z, rotationY) {
    const loader = new THREE.TextureLoader();
    const audioLoader = new THREE.AudioLoader();

    loader.load(imageFile, function(imgTexture) {
        imgTexture.wrapS = THREE.RepeatWrapping;
        imgTexture.wrapT = THREE.RepeatWrapping;

        const organicMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTexture: { value: imgTexture },
                uHubColor: { value: new THREE.Color(0xf0f0f0) },
                uTime: { value: 0.0 }
            },
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            side: THREE.DoubleSide
        });

        const geometry = new THREE.BoxGeometry(15, 10, 40, 30, 20, 60);
        const room = new THREE.Mesh(geometry, organicMaterial);

        room.position.set(x, 0, z);
        room.rotation.y = rotationY;
        
        room.userData.shaderMaterial = organicMaterial;
        scene.add(room);

        const sound = new THREE.PositionalAudio(listener);
        audioLoader.load(audioFile, function(buffer) {
            sound.setBuffer(buffer);
            sound.setRefDistance(10); 
            sound.setMaxDistance(80); 
            sound.setLoop(true);
            sound.setVolume(1.0);
            sound.play(); 
        });
        room.add(sound); 
    });
}

// 5. Generate Rooms
const radius = 80; 
const totalRooms = 5;

for (let i = 0; i < totalRooms; i++) {
    const angle = (i / totalRooms) * Math.PI * 2;
    const x = radius * Math.sin(angle);
    const z = radius * Math.cos(angle);
    const rotation = angle; 

    createMemoryRoom(`room${i + 1}.jpg`, `audio${i + 1}.mp3`, x, z, rotation);
}

// 6. Controls & Title Screen Logic (FIXED)
const controls = new PointerLockControls(camera, document.body);
const titleScreen = document.getElementById('title-screen');

// We listen for a click on the TITLE SCREEN specifically
if (titleScreen) {
    titleScreen.addEventListener('click', () => {
        
        // 1. Fade out the title screen
        titleScreen.classList.add('hidden');
        
        // 2. Wake up Audio Context (Browser Policy)
        if (listener.context.state === 'suspended') {
            listener.context.resume();
        }

        // 3. Lock the mouse (Start the game)
        setTimeout(() => {
            controls.lock();
        }, 100);
    });
}

// Standard controls (re-lock if they hit ESC and click again)
document.addEventListener('click', () => {
    // Only lock if the title screen is ALREADY hidden
    if (titleScreen && titleScreen.classList.contains('hidden')) {
        controls.lock();
    }
});

const onKeyDown = function (event) {
    switch (event.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyD': moveRight = true; break;
    }
};
const onKeyUp = function (event) {
    switch (event.code) {
        case 'KeyW': moveForward = false; break;
        case 'KeyA': moveLeft = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyD': moveRight = false; break;
    }
};
document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);

camera.position.set(0, -3, 0); 

// 7. Animation Loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta(); 
    const elapsedTime = clock.getElapsedTime();

    scene.traverse((object) => {
        if (object.isMesh && object.userData?.shaderMaterial?.uniforms?.uTime) {
            object.userData.shaderMaterial.uniforms.uTime.value = elapsedTime;
        }
    });

    if (controls.isLocked === true) {
        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        if (moveForward || moveBackward) velocity.z -= direction.z * speed * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * speed * delta;

        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);

        camera.position.y = -3; 
    }

    renderer.render(scene, camera);
}
animate();