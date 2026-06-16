// 🦪 MOSSELKAPITEIN — De Grote Oceaan
// Een kleurrijke 3D mossel-visserij simulatie. Three.js, één wereld, geen build-stap.
import * as THREE from 'three';

// ============================================================================
//  0. GLOBAL STATE
// ============================================================================
const W = {
  gold: 200,
  level: 1, xp: 0, xpNext: 100,
  skills: { navigatie: 1, koken: 1, handel: 1, visserij: 1 },
  skillXp: { navigatie: 0, koken: 0, handel: 0, visserij: 0 },
  // inventory
  inv: { mossel: 0, goudmossel: 0, exoot: 0 },
  dishes: {}, // dishName -> count
  // ship & upgrades
  ship: 0,                 // index in SHIPS
  holdMax: 40,
  engineLvl: 1, harvestLvl: 1, sonarLvl: 1,
  hasWeatherMachine: false, hasSeagull: false, hasRestaurant: false,
  seagullName: 'Pip',
  aquarium: [],            // exotic species names
  // run-time
  time: 9.5,               // hours 0..24 (start on a bright cheerful morning)
  day: 1,
  weather: 'clear', weatherTimer: 35,
  wind: new THREE.Vector2(0.6, -0.4),
  buffs: {},               // name -> seconds remaining
  questsDone: new Set(),
  rescued: 0, treasures: 0, bottles: 0,
  paused: false, started: false,
};

const SHIPS = [
  { name: 'Kleine Vissersboot',  icon:'🛶', hold:40,  speed:1.0,  price:0,     scale:1.0,  hull:0x3a8fd0, style:'fisher',  sail:0x9fc4dd },
  { name: 'Mosselschip',         icon:'⛵', hold:100, speed:1.35, price:2200,  scale:1.35, hull:0x2d7a4f, style:'cutter',  sail:0xeef3e0 },
  { name: 'Snelle Sloep',        icon:'🚤', hold:70,  speed:2.0,  price:5200,  scale:1.15, hull:0xff5a4d, style:'speeder', sail:0xffe1a8 },
  { name: 'Luxe Handelsschip',   icon:'🚢', hold:220, speed:1.6,  price:12000, scale:1.7,  hull:0xb33a3a, style:'trader',  sail:0xf3e2c0 },
  { name: 'Oceaan Trawler',      icon:'🛳️', hold:360, speed:1.85, price:26000, scale:2.0,  hull:0x37506b, style:'trawler', sail:0xcdd6e0 },
  { name: 'Catamaran Racer',     icon:'⛵', hold:150, speed:2.7,  price:42000, scale:1.55, hull:0x18c0b0, style:'cata',    sail:0xffffff },
  { name: 'Experimenteel Schip', icon:'🛸', hold:600, speed:3.4,  price:90000, scale:2.0,  hull:0x6a3ad0, style:'exp',     sail:0x6fffff },
];

const WEATHERS = {
  clear:  { name:'Helder',     ico:'☀️', wave:1.0, fog:0.00018, sun:1.0, tint:0xfff3d0 },
  cloudy: { name:'Bewolkt',    ico:'⛅', wave:1.4, fog:0.00040, sun:0.55,tint:0xcfd8e0 },
  rain:   { name:'Regen',      ico:'🌧️', wave:1.7, fog:0.00070, sun:0.4, tint:0x9fb4c4 },
  fog:    { name:'Mist',       ico:'🌫️', wave:0.9, fog:0.00190, sun:0.5, tint:0xb9c6cf },
  storm:  { name:'Storm',      ico:'⛈️', wave:3.0, fog:0.00090, sun:0.25,tint:0x6b7a8a },
};

// Wave parameters — MUST match the GLSL below.
const WAVES = [
  { dir:[ 0.8,  0.6], amp:0.55, len:34, speed:0.9 },
  { dir:[-0.6,  0.8], amp:0.35, len:21, speed:1.2 },
  { dir:[ 0.3, -0.9], amp:0.22, len:13, speed:1.6 },
  { dir:[ 0.9,  0.2], amp:0.12, len:7.5,speed:2.4 },
];

// ============================================================================
//  1. RENDERER / SCENE / CAMERA
// ============================================================================
const IS_TOUCH = matchMedia('(pointer:coarse)').matches || ('ontouchstart' in window) || navigator.maxTouchPoints>0
  || /[?&]touch=1/.test(location.search); // ?touch=1 forces on-screen controls (handy for testing on desktop)
const IS_MOBILE = IS_TOUCH && Math.min(screen.width, screen.height) < 900;
if(IS_TOUCH) document.body.classList.add('touch');
// Action hint tokens: on touch they point at the on-screen buttons, not keyboard keys.
const A_E  = IS_TOUCH ? '<span class="key">⚓ Actie</span>' : '<span class="key">E</span>';
const A_SP = IS_TOUCH ? '<span class="key">🦪 Vang</span>'  : '<span class="key">Spatie</span>';
const PRESS = IS_TOUCH ? 'Tik' : 'Druk';

const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias:!IS_MOBILE, powerPreference:'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, IS_MOBILE?1.5:2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x9fc4dd, 0.00013);

const camera = new THREE.PerspectiveCamera(58, innerWidth/innerHeight, 0.5, 9000);
camera.position.set(0, 22, 38);

// lighting
const sun = new THREE.DirectionalLight(0xfff0c8, 1.6);
sun.castShadow = true;
sun.shadow.mapSize.set(IS_MOBILE?1024:2048, IS_MOBILE?1024:2048);
sun.shadow.camera.near = 1; sun.shadow.camera.far = 400;
sun.shadow.camera.left=-160; sun.shadow.camera.right=160; sun.shadow.camera.top=160; sun.shadow.camera.bottom=-160;
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(sun.target);
const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x2a5a7a, 0.7);
scene.add(hemi);
const ambient = new THREE.AmbientLight(0xffffff, 0.25);
scene.add(ambient);

// ============================================================================
//  2. SKY DOME
// ============================================================================
const skyGeo = new THREE.SphereGeometry(3000, 32, 16);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite:false,
  uniforms:{
    uTop:{value:new THREE.Color(0x2f7fd0)}, uBot:{value:new THREE.Color(0xcdeaff)},
    uSunDir:{value:new THREE.Vector3(0,1,0)}, uSunColor:{value:new THREE.Color(0xffffff)}, uNight:{value:0},
  },
  vertexShader:`varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`
    varying vec3 vDir; uniform vec3 uTop,uBot,uSunColor,uSunDir; uniform float uNight;
    // simple star hash
    float hash(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
    void main(){
      float h=clamp(vDir.y*0.5+0.5,0.0,1.0);
      vec3 col=mix(uBot,uTop,pow(h,0.6));
      float sd=max(dot(normalize(vDir),normalize(uSunDir)),0.0);
      col += uSunColor*pow(sd,180.0)*2.2;          // sun/moon disc
      col += uSunColor*pow(sd,8.0)*0.18;           // glow
      // stars at night
      if(uNight>0.01 && vDir.y>0.0){
        vec3 g=floor(vDir*320.0);
        float s=step(0.992,hash(g))*uNight;
        col += vec3(s)*0.9;
      }
      gl_FragColor=vec4(col,1.0);
    }`,
});
const sky = new THREE.Mesh(skyGeo, skyMat);
scene.add(sky);

// clouds (billboards)
const cloudGroup = new THREE.Group(); scene.add(cloudGroup);
const cloudTex = makeCloudTexture();
for(let i=0;i<40;i++){
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1,1),
    new THREE.MeshBasicMaterial({map:cloudTex, transparent:true, depthWrite:false, opacity:0.85}));
  const a=Math.random()*Math.PI*2, r=400+Math.random()*2600;
  m.position.set(Math.cos(a)*r, 180+Math.random()*220, Math.sin(a)*r);
  const s=160+Math.random()*260; m.scale.set(s,s*0.55,1);
  m.userData.spd = 2+Math.random()*5;
  cloudGroup.add(m);
}

// ============================================================================
//  3. OCEAN (animated Gerstner-ish waves via shader)
// ============================================================================
const OCEAN_SIZE = 6400;
const OCEAN_SEG = IS_MOBILE ? 200 : 360;
const oceanGeo = new THREE.PlaneGeometry(OCEAN_SIZE, OCEAN_SIZE, OCEAN_SEG, OCEAN_SEG);
oceanGeo.rotateX(-Math.PI/2);
const oceanUniforms = {
  uTime:{value:0}, uWaveScale:{value:1.0},
  uSunDir:{value:new THREE.Vector3(0,1,0)}, uSunColor:{value:new THREE.Color(0xfff0c8)},
  uDeep:{value:new THREE.Color(0x063a6e)}, uShallow:{value:new THREE.Color(0x37e0d6)},
  uSky:{value:new THREE.Color(0xcdeBff)}, uNight:{value:0}, uSunStrength:{value:1.0},
};
const oceanMat = new THREE.ShaderMaterial({
  uniforms: oceanUniforms,
  vertexShader:`
    uniform float uTime,uWaveScale; varying vec3 vN; varying vec3 vWorld; varying float vH; varying float vD;
    // 4 big directional waves (match JS WAVES) + 2 fine detail waves for sparkle (visual only)
    vec2 D[6]; float A[6]; float L[6]; float S[6];
    void initw(){
      D[0]=normalize(vec2(0.8,0.6));  A[0]=0.55; L[0]=34.0; S[0]=0.9;
      D[1]=normalize(vec2(-0.6,0.8)); A[1]=0.35; L[1]=21.0; S[1]=1.2;
      D[2]=normalize(vec2(0.3,-0.9)); A[2]=0.22; L[2]=13.0; S[2]=1.6;
      D[3]=normalize(vec2(0.9,0.2));  A[3]=0.12; L[3]=7.5;  S[3]=2.4;
      D[4]=normalize(vec2(-0.5,-0.7));A[4]=0.06; L[4]=4.4;  S[4]=3.1;
      D[5]=normalize(vec2(0.65,-0.4));A[5]=0.04; L[5]=2.7;  S[5]=3.8;
    }
    void main(){
      initw();
      vec3 p=position; float h=0.0; vec3 n=vec3(0.0,1.0,0.0);
      for(int i=0;i<6;i++){
        float w=6.2831853/L[i]; float ph=S[i]*w;
        float amp=A[i]*uWaveScale;
        float d=dot(D[i],p.xz)*w + uTime*ph;
        h += amp*sin(d);
        float c=amp*w*cos(d);
        n.x -= D[i].x*c; n.z -= D[i].y*c;
      }
      p.y += h; vH=h;
      vN=normalize(n);
      vec4 wp=modelMatrix*vec4(p,1.0); vWorld=wp.xyz;
      vD=length(wp.xz - cameraPosition.xz);
      gl_Position=projectionMatrix*viewMatrix*wp;
    }`,
  fragmentShader:`
    precision highp float;
    varying vec3 vN; varying vec3 vWorld; varying float vH; varying float vD;
    uniform vec3 uSunDir,uSunColor,uDeep,uShallow,uSky; uniform float uNight,uSunStrength;
    void main(){
      vec3 N=normalize(vN);
      vec3 V=normalize(cameraPosition - vWorld);
      vec3 L=normalize(uSunDir);
      float fres=pow(1.0-max(dot(N,V),0.0),4.0);
      // depth-tinted base water colour
      vec3 water=mix(uDeep,uShallow, clamp(vH*0.6+0.45,0.0,1.0));
      // subsurface glow on the up-facing wave backs
      water += uShallow*0.10*max(vH,0.0);
      vec3 col=mix(water, uSky, fres*0.55);
      // soft diffuse
      float diff=max(dot(N,L),0.0);
      col += uSunColor*diff*0.16*uSunStrength;
      // tight sun glitter + broader sheen
      vec3 H=normalize(L+V);
      float ndh=max(dot(N,H),0.0);
      col += uSunColor*pow(ndh,220.0)*3.2*uSunStrength;     // sharp sparkle
      col += uSunColor*pow(ndh,28.0)*0.35*uSunStrength;      // soft sheen
      // crest foam
      float foam=smoothstep(0.5,0.95,vH*1.35);
      col=mix(col, vec3(0.95,0.99,1.0), foam*0.6);
      // fade toward sky colour at the horizon for a softer, deeper look
      float horizon=clamp((vD-900.0)/2600.0,0.0,1.0);
      col=mix(col, uSky*mix(1.0,0.5,uNight), horizon*0.6);
      col*=mix(0.32,1.0,1.0-uNight*0.6);
      gl_FragColor=vec4(col,0.94);
    }`,
  transparent:true,
});
const ocean = new THREE.Mesh(oceanGeo, oceanMat);
ocean.receiveShadow = false;
scene.add(ocean);

// JS-side wave height (matches shader) for floating physics
function waveHeight(x,z,t,scale){
  let h=0;
  for(const w of WAVES){
    const dx=w.dir[0], dz=w.dir[1];
    const len=Math.hypot(dx,dz);
    const k=2*Math.PI/w.len;
    const ph=w.speed*k;
    const d=(dx/len*x + dz/len*z)*k + t*ph;
    h += w.amp*scale*Math.sin(d);
  }
  return h;
}

// ============================================================================
//  4. SHIP
// ============================================================================
const ship = new THREE.Group();
scene.add(ship);
let shipMesh = null;
function makeHull(color){
  const hullGeo = new THREE.BoxGeometry(4.4, 1.8, 11);
  hullGeo.translate(0,0.2,0);
  const pos = hullGeo.attributes.position;          // taper the bow
  for(let i=0;i<pos.count;i++){
    const z=pos.getZ(i);
    if(z<-4){ pos.setX(i, pos.getX(i)*0.35); pos.setY(i, pos.getY(i)*0.7); }
  }
  hullGeo.computeVertexNormals();
  const hull = new THREE.Mesh(hullGeo, new THREE.MeshStandardMaterial({color, roughness:.7, metalness:.12}));
  hull.castShadow=true; return hull;
}
function makeSail(color, w=3.2, h=4.2){
  const sail=new THREE.Mesh(new THREE.PlaneGeometry(w,h,6,6),
    new THREE.MeshStandardMaterial({color, side:THREE.DoubleSide, roughness:.85}));
  // gentle billow
  const p=sail.geometry.attributes.position;
  for(let i=0;i<p.count;i++){ p.setZ(i, Math.sin((p.getX(i)/w+0.5)*Math.PI)*0.5); }
  sail.geometry.computeVertexNormals();
  return sail;
}
function buildShip(){
  if(shipMesh) ship.remove(shipMesh);
  shipMesh = new THREE.Group();
  const spec = SHIPS[W.ship];
  const s = spec.scale;
  const style = spec.style||'fisher';

  // ----- hull (twin hull for catamaran) -----
  if(style==='cata'){
    const hL=makeHull(spec.hull); hL.position.x=-1.7; hL.scale.x=0.7; shipMesh.add(hL);
    const hR=makeHull(spec.hull); hR.position.x= 1.7; hR.scale.x=0.7; shipMesh.add(hR);
    const bridge=new THREE.Mesh(new THREE.BoxGeometry(4.6,0.4,7),
      new THREE.MeshStandardMaterial({color:0xeef2f6, roughness:.5})); bridge.position.y=1.4; shipMesh.add(bridge);
  } else {
    shipMesh.add(makeHull(spec.hull));
  }

  // ----- deck + rails -----
  const deck = new THREE.Mesh(new THREE.BoxGeometry(4.0,0.3,10.4),
    new THREE.MeshStandardMaterial({color:0xe8c98a, roughness:.85}));
  deck.position.y=1.15; deck.castShadow=true; shipMesh.add(deck);
  const railMat=new THREE.MeshStandardMaterial({color:0xb98a52,roughness:.8});
  for(const sx of [-1.9,1.9]){
    const rail=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.5,9.8),railMat);
    rail.position.set(sx,1.55,0); shipMesh.add(rail);
  }

  // ----- cabin (low & sleek for speeders) -----
  const lowCab = (style==='speeder'||style==='cata');
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.2, lowCab?1.2:2.0, lowCab?2.6:3.6),
    new THREE.MeshStandardMaterial({color:0xf5f5f0, roughness:.6}));
  cabin.position.set(0, lowCab?1.9:2.3, lowCab?0.6:1.8); cabin.castShadow=true; shipMesh.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.4,0.3, lowCab?2.8:3.8),
    new THREE.MeshStandardMaterial({color: style==='exp'?0x2affff:0xd0453a, roughness:.5,
      emissive: style==='exp'?0x1a8a8a:0x000000, emissiveIntensity: style==='exp'?0.8:0}));
  roof.position.set(0, lowCab?2.6:3.45, cabin.position.z); shipMesh.add(roof);
  const win = new THREE.Mesh(new THREE.BoxGeometry(2.4,0.9,0.1),
    new THREE.MeshStandardMaterial({color:0x6fd0ff, emissive:0x224455, roughness:.2, metalness:.4}));
  win.position.set(0, cabin.position.y+0.3, cabin.position.z-cabin.geometry.parameters.depth/2-0.02); shipMesh.add(win);

  // ----- mast, sail & flag -----
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.16, style==='exp'?5:7,8),
    new THREE.MeshStandardMaterial({color:0x9a6b3a}));
  mast.position.set(0,4.0,-1.2); mast.castShadow=true; shipMesh.add(mast);
  if(style==='cutter'||style==='cata'||style==='trader'){
    const sail=makeSail(spec.sail,3.4,4.6); sail.position.set(0,4.2,-1.0); shipMesh.add(sail);
  }
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2,1.1),
    new THREE.MeshStandardMaterial({color:0xffd34d, side:THREE.DoubleSide, roughness:.7}));
  flag.position.set(1.1,6.6,-1.2); shipMesh.add(flag);
  shipMesh.userData.flag = flag;

  // ----- trawler / trader cargo cranes & crates -----
  if(style==='trawler'||style==='trader'){
    for(const cz of [3.0,4.2]){
      const crate=new THREE.Mesh(new THREE.BoxGeometry(1.4,1.2,1.4),
        new THREE.MeshStandardMaterial({color:[0xff9d4d,0x5bd97a,0x6fd0ff][Math.floor(Math.random()*3)],roughness:.8}));
      crate.position.set((Math.random()-0.5)*1.6,1.9,cz); crate.castShadow=true; shipMesh.add(crate);
    }
  }

  // ----- harvester arm (animated when fishing) -----
  const arm = new THREE.Group();
  const armBase = new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.22,0.6,8),
    new THREE.MeshStandardMaterial({color:0x444a55, metalness:.6,roughness:.4}));
  armBase.position.set(0,1.4,-4.2); arm.add(armBase);
  const armBoom = new THREE.Mesh(new THREE.BoxGeometry(0.22,0.22,3.4),
    new THREE.MeshStandardMaterial({color:0x666c77, metalness:.6,roughness:.4}));
  armBoom.position.set(0,2.6,-5.6); armBoom.rotation.x=-0.5; arm.add(armBoom);
  const dredge = new THREE.Mesh(new THREE.BoxGeometry(1.2,0.5,1.0),
    new THREE.MeshStandardMaterial({color:0x333840, metalness:.5,roughness:.5}));
  dredge.position.set(0,1.0,-7.2); arm.add(dredge);
  shipMesh.userData.arm=arm; shipMesh.userData.dredge=dredge;
  shipMesh.add(arm);

  // ----- experimental hover glow -----
  if(style==='exp'){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(2.6,0.18,8,32),
      new THREE.MeshStandardMaterial({color:0x6fffff, emissive:0x2affff, emissiveIntensity:1.2}));
    ring.rotation.x=Math.PI/2; ring.position.y=0.5; shipMesh.add(ring);
    shipMesh.userData.ring=ring;
  }

  shipMesh.scale.setScalar(s);
  ship.add(shipMesh);
}
const shipState = { heading:0, speed:0, throttle:0, x:0, z:0 };
buildShip();

// wake particles
const wake = makePointWake();
scene.add(wake.points);

// ============================================================================
//  5. WORLD: harbors, islands, mussel beds, points of interest
// ============================================================================
const HARBORS = [
  { name:'Mosselhaven', x:0,     z:160,   biome:'kust',    icon:'🏘️', demand:1.0,  color:0xff9d4d, r:42 },
  { name:'Zonnebaai',   x:680,   z:420,   biome:'kust',    icon:'⛵', demand:1.15, color:0xffc24d, r:36 },
  { name:'Gouddok',     x:900,   z:-760,  biome:'kust',    icon:'👑', demand:1.5,  color:0xffd34d, r:50 },
  { name:'Noorderkaap', x:-560,  z:-1200, biome:'storm',   icon:'🏚️', demand:1.45, color:0x9fb4c4, r:44 },
  { name:'IJszicht',    x:520,   z:-1750, biome:'storm',   icon:'🗼', demand:1.7,  color:0xbfe3ff, r:40 },
  { name:'Palmbaai',    x:1650,  z:560,   biome:'tropisch',icon:'🏝️', demand:1.25, color:0x5bd97a, r:48 },
  { name:'Verre Rede',  x:2100,  z:-1500, biome:'tropisch',icon:'🌴', demand:1.75, color:0xff7bd0, r:42 },
  { name:'Neveldorp',   x:-1650, z:420,   biome:'mist',    icon:'⚓', demand:1.35, color:0xb9c6cf, r:42 },
  { name:'Schemerkade', x:-2050, z:-1000, biome:'mist',    icon:'🏰', demand:1.6,  color:0x9a86c8, r:46 },
];
const ISLANDS = [
  { name:'Schateiland',   x:-240, z:560,  r:46, treasure:true,  visited:false },
  { name:'Rotsklip',      x:760,  z:-200, r:34, treasure:false },
  { name:'Palmenrif',     x:1300, z:640,  r:52, treasure:true,  visited:false },
  { name:'Verloren Atol', x:-1350,z:-560, r:40, treasure:true,  visited:false },
  { name:'Spiegeleiland', x:280,  z:-1050,r:30, treasure:false },
  { name:'Drakeneiland',  x:1850, z:-560, r:58, treasure:true,  visited:false },
  { name:'Koraalkroon',   x:-1950,z:780,  r:44, treasure:true,  visited:false },
  { name:'Stormrots',     x:-80,  z:-1900,r:36, treasure:false },
  { name:'Smaragdklip',   x:2250, z:240,  r:42, treasure:true,  visited:false },
];

const harborMarkers=[], islandMeshes=[];
const harborCores=[];                 // {x,z,r} solid land used for ship collision
const poiGroup = new THREE.Group(); scene.add(poiGroup);

// build harbors — central land + village + lighthouse + a wooden pier (aanmeerplek)
for(const h of HARBORS){
  const g = new THREE.Group();
  const R = h.r;
  const coreR = R*0.62;               // solid land radius
  // ----- land mass -----
  const land=new THREE.Mesh(new THREE.SphereGeometry(coreR,28,18,0,Math.PI*2,0,Math.PI*0.5),
    new THREE.MeshStandardMaterial({color:0xc9b487, roughness:.95}));
  land.scale.y=0.32; land.position.y=-1; land.receiveShadow=true; g.add(land);
  const rim=new THREE.Mesh(new THREE.CylinderGeometry(coreR,coreR*1.04,2.2,28),
    new THREE.MeshStandardMaterial({color:0x9a7d4e, roughness:1})); rim.position.y=0.2; g.add(rim);
  // ----- village: ring of houses -----
  const houseCols=[0xff6b6b,0x6fd0ff,0xffd34d,0x5bd97a,0xff9d4d,0xc88aff,0x4dd0e1];
  const nHouses=6+Math.floor(R/12);
  for(let i=0;i<nHouses;i++){
    const ang=(i/nHouses)*Math.PI*2 + Math.random()*0.3;
    const rr=coreR*(0.25+Math.random()*0.5);
    const wdt=4+Math.random()*3, hgt=3+Math.random()*4;
    const hh=new THREE.Mesh(new THREE.BoxGeometry(wdt,hgt,wdt),
      new THREE.MeshStandardMaterial({color:houseCols[i%houseCols.length], roughness:.8}));
    hh.position.set(Math.cos(ang)*rr, 1+hgt/2, Math.sin(ang)*rr); hh.castShadow=true; g.add(hh);
    const roof=new THREE.Mesh(new THREE.ConeGeometry(wdt*0.85,2.6,4),
      new THREE.MeshStandardMaterial({color:0x8a4a2a,roughness:.8}));
    roof.position.set(hh.position.x,hh.position.y+hgt/2+1.3,hh.position.z); roof.rotation.y=Math.PI/4; g.add(roof);
  }
  // central market stall (a splash of colour)
  const stall=new THREE.Mesh(new THREE.BoxGeometry(5,0.4,5),
    new THREE.MeshStandardMaterial({color:0xff7bd0,roughness:.7})); stall.position.y=3.2; g.add(stall);
  // ----- lighthouse -----
  const lhAng=Math.PI*0.75;
  const lx=Math.cos(lhAng)*coreR*0.7, lz=Math.sin(lhAng)*coreR*0.7;
  const tower=new THREE.Mesh(new THREE.CylinderGeometry(1.6,2.6,16,14),
    new THREE.MeshStandardMaterial({color:0xffffff,roughness:.6}));
  tower.position.set(lx,8,lz); tower.castShadow=true; g.add(tower);
  const stripe=new THREE.Mesh(new THREE.CylinderGeometry(1.62,2.0,4,14),
    new THREE.MeshStandardMaterial({color:0xff5a4d,roughness:.6})); stripe.position.set(lx,7,lz); g.add(stripe);
  const lamp=new THREE.Mesh(new THREE.SphereGeometry(1.3,12,12),
    new THREE.MeshStandardMaterial({color:0xffe9a8,emissive:0xffcc44,emissiveIntensity:1.4}));
  lamp.position.set(lx,16.8,lz); g.add(lamp); g.userData.lamp=lamp;
  // ----- wooden pier (aanmeerplek), pointing toward open sea / map centre -----
  const plankMat=new THREE.MeshStandardMaterial({color:0xb98a52, roughness:.9});
  const pileMat =new THREE.MeshStandardMaterial({color:0x7a5a34, roughness:1});
  const pierLen=R*1.15, pierW=7;
  const deckBoard=new THREE.Mesh(new THREE.BoxGeometry(pierW,0.7,pierLen),plankMat);
  deckBoard.position.set(0,1.0,-(coreR+pierLen/2-2)); deckBoard.receiveShadow=true; g.add(deckBoard);
  // pilings + mooring bollards along the pier
  for(let i=0;i<=4;i++){
    const pz=-(coreR-2)-(pierLen/4)*i;
    for(const sxp of [-pierW/2+0.5, pierW/2-0.5]){
      const pile=new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.4,4,7),pileMat);
      pile.position.set(sxp,-0.4,pz); g.add(pile);
    }
  }
  // bollards (mooring posts) at the berth end
  for(const sxp of [-pierW/2+0.6, pierW/2-0.6]){
    const boll=new THREE.Mesh(new THREE.CylinderGeometry(0.45,0.55,1.6,8),
      new THREE.MeshStandardMaterial({color:0x33363b,roughness:.6,metalness:.3}));
    boll.position.set(sxp,2.0,-(coreR+pierLen-4)); g.add(boll);
  }
  // a little welcome buoy just off the berth
  const buoy=new THREE.Mesh(new THREE.SphereGeometry(1.1,10,10),
    new THREE.MeshStandardMaterial({color:0xff3b30,emissive:0x661000,emissiveIntensity:.4,roughness:.5}));
  buoy.position.set(pierW/2+5,0.6,-(coreR+pierLen)); g.add(buoy); g.userData.buoy=buoy;

  // orient so the pier faces the map centre, then place
  g.rotation.y=Math.atan2(h.x,h.z);
  g.position.set(h.x,0,h.z);
  poiGroup.add(g);
  harborMarkers.push({...h, group:g});
  harborCores.push({x:h.x, z:h.z, r:coreR});
}

// build islands
for(const isl of ISLANDS){
  const g=new THREE.Group();
  const sand=new THREE.Mesh(new THREE.SphereGeometry(isl.r,24,16,0,Math.PI*2,0,Math.PI*0.5),
    new THREE.MeshStandardMaterial({color:0xf0dca0,roughness:.95}));
  sand.scale.y=0.35; sand.position.y=-2; sand.receiveShadow=true; g.add(sand);
  const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(isl.r*0.45,0),
    new THREE.MeshStandardMaterial({color:0x7a6a52,roughness:1, flatShading:true}));
  rock.position.y=isl.r*0.15; rock.castShadow=true; g.add(rock);
  // palms
  for(let i=0;i<4;i++){
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.8,10,6),
      new THREE.MeshStandardMaterial({color:0x8a5a2a}));
    const a=Math.random()*6.28, rr=isl.r*0.5;
    trunk.position.set(Math.cos(a)*rr,5,Math.sin(a)*rr); trunk.rotation.z=(Math.random()-0.5)*0.3; trunk.castShadow=true; g.add(trunk);
    const leaves=new THREE.Mesh(new THREE.SphereGeometry(3.4,8,6),
      new THREE.MeshStandardMaterial({color:0x3aa34a,roughness:.8,flatShading:true}));
    leaves.position.set(trunk.position.x,10,trunk.position.z); leaves.scale.y=0.6; g.add(leaves);
  }
  if(isl.treasure){
    const chest=new THREE.Mesh(new THREE.BoxGeometry(3,2,2),
      new THREE.MeshStandardMaterial({color:0x8a5a2a,roughness:.7}));
    chest.position.set(0,isl.r*0.15+2,0); chest.castShadow=true;
    const gold=new THREE.Mesh(new THREE.BoxGeometry(2.6,0.6,1.6),
      new THREE.MeshStandardMaterial({color:0xffd34d,emissive:0xaa7700,emissiveIntensity:.6,metalness:.6,roughness:.3}));
    gold.position.set(0,isl.r*0.15+3.1,0);
    g.add(chest); g.add(gold); g.userData.chest=chest; g.userData.gold=gold;
  }
  g.position.set(isl.x,0,isl.z);
  poiGroup.add(g);
  islandMeshes.push({...isl, group:g});
}

// ---- mussel beds (dynamic) ----
const beds = [];
const bedGeo = new THREE.IcosahedronGeometry(0.55,0);
function spawnBed(x,z,opts={}){
  const g=new THREE.Group();
  const count = 8+Math.floor(Math.random()*8);
  const golden = opts.golden || (Math.random()<0.04);
  for(let i=0;i<count;i++){
    const m=new THREE.Mesh(bedGeo, new THREE.MeshStandardMaterial({
      color: golden?0xffd34d:0x2a2a35, emissive: golden?0x6a4a00:0x000000,
      emissiveIntensity: golden?0.5:0, roughness:.7, metalness: golden?.5:.1, flatShading:true}));
    m.position.set((Math.random()-0.5)*5,0,(Math.random()-0.5)*5);
    m.scale.setScalar(0.6+Math.random()*0.8); g.add(m);
  }
  g.position.set(x,-1.2,z);
  poiGroup.add(g);
  const bed={ x,z, group:g, amount: golden? 1+Math.floor(Math.random()*2) : 6+Math.floor(Math.random()*10),
              golden, growth:0, biome:biomeAt(x,z) };
  beds.push(bed);
  return bed;
}
function biomeAt(x,z){
  if(z < -850) return 'storm';
  if(x > 1000) return 'tropisch';
  if(x < -1000) return 'mist';
  return 'kust';
}
// initial beds scattered across the (now much bigger) ocean
function seedBeds(n){
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2, r=120+Math.random()*2600;
    spawnBed(Math.cos(a)*r, Math.sin(a)*r);
  }
}
seedBeds(90);

// ---- floating points of interest: bottles, stranded sailors, exotic fish ----
const bottles=[], sailors=[], exotics=[];
function spawnBottle(){
  const a=Math.random()*6.28, r=200+Math.random()*2400;
  const m=new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.4,2,8),
    new THREE.MeshStandardMaterial({color:0x4a7a4a, transparent:true, opacity:.85, roughness:.2, metalness:.2}));
  m.rotation.z=Math.PI/2; m.position.set(Math.cos(a)*r,0,Math.sin(a)*r);
  poiGroup.add(m); bottles.push({mesh:m, x:m.position.x, z:m.position.z});
}
function spawnSailor(){
  const a=Math.random()*6.28, r=300+Math.random()*2300;
  const g=new THREE.Group();
  const raft=new THREE.Mesh(new THREE.CylinderGeometry(2.4,2.4,0.5,10),
    new THREE.MeshStandardMaterial({color:0xffaa44,roughness:.7})); raft.position.y=0.2; g.add(raft);
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(0.6,1.4,4,8),
    new THREE.MeshStandardMaterial({color:0x3a6ad0})); body.position.y=1.4; g.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.6,12,12),
    new THREE.MeshStandardMaterial({color:0xf0c090})); head.position.y=2.6; g.add(head);
  g.position.set(Math.cos(a)*r,0,Math.sin(a)*r);
  poiGroup.add(g); sailors.push({group:g, x:g.position.x, z:g.position.z});
}
function spawnExotic(){
  const a=Math.random()*6.28, r=200+Math.random()*2500;
  const species=EXOTICS[Math.floor(Math.random()*EXOTICS.length)];
  const m=new THREE.Mesh(new THREE.ConeGeometry(0.8,2.2,7),
    new THREE.MeshStandardMaterial({color:species.color, emissive:species.color, emissiveIntensity:.25, roughness:.4}));
  m.rotation.x=Math.PI/2; m.position.set(Math.cos(a)*r,-0.4,Math.sin(a)*r);
  poiGroup.add(m); exotics.push({mesh:m, x:m.position.x, z:m.position.z, species});
}
const EXOTICS=[
  {name:'Neon Kwal',color:0xff6bff}, {name:'Regenboogvis',color:0x6fd0ff},
  {name:'Gouden Zeepaard',color:0xffd34d}, {name:'Diepzeelantaarn',color:0x9affc8},
  {name:'Koraalrog',color:0xff9d4d},
];
for(let i=0;i<10;i++) spawnBottle();
for(let i=0;i<7;i++) spawnSailor();
for(let i=0;i<14;i++) spawnExotic();

// ---- seagull pet ----
const seagull = new THREE.Group();
(function buildGull(){
  const body=new THREE.Mesh(new THREE.SphereGeometry(0.7,12,12),
    new THREE.MeshStandardMaterial({color:0xffffff,roughness:.7})); body.scale.z=1.5; seagull.add(body);
  const wingMat=new THREE.MeshStandardMaterial({color:0xeeeeee,side:THREE.DoubleSide,roughness:.7});
  const wL=new THREE.Mesh(new THREE.PlaneGeometry(1.6,0.6),wingMat); wL.position.x=-0.8; seagull.add(wL);
  const wR=new THREE.Mesh(new THREE.PlaneGeometry(1.6,0.6),wingMat); wR.position.x=0.8; seagull.add(wR);
  const beak=new THREE.Mesh(new THREE.ConeGeometry(0.18,0.5,6),
    new THREE.MeshStandardMaterial({color:0xff9d3d})); beak.rotation.x=Math.PI/2; beak.position.set(0,0,1.1); seagull.add(beak);
  seagull.userData.wL=wL; seagull.userData.wR=wR;
})();
seagull.visible=false; scene.add(seagull);
const gullState={mode:'follow', target:null, x:0, z:0, found:null};

// rain particle system
const rain = makeRain();
scene.add(rain.points); rain.points.visible=false;
// lightning flash light
const flash = new THREE.PointLight(0xcfe0ff, 0, 2000); flash.position.set(0,300,0); scene.add(flash);

// ============================================================================
//  6. INPUT
// ============================================================================
const keys={};
addEventListener('keydown',e=>{
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
  keys[e.key.toLowerCase()]=true;
  if(!W.started) return;
  const k=e.key.toLowerCase();
  if(k==='f') sonarPing();
  if(k==='e') tryInteract();
  if(k==='c') cycleCamera();
  if(k==='m') toggleMap();
  if(k==='u') openHarbor(nearestHarbor(), 'upgrades'); // quick upgrades (only near harbor? allow anywhere for shop preview)
  if(k==='g') sendSeagull();
  if(k==='p') togglePause();
  if(k==='escape') closeModal();
});
addEventListener('keyup',e=>{ keys[e.key.toLowerCase()]=false; });
addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});

let camMode=0; // 0 chase, 1 close, 2 high
function cycleCamera(){ camMode=(camMode+1)%3; toast('📷 Camera: '+['Volgcamera','Dichtbij','Vogelvlucht'][camMode]); }

// ---------- TOUCH CONTROLS ----------
const touchCtrl = { active:false, throttle:0, turn:0 };
function setupTouch(){
  // virtual joystick
  const joy=document.getElementById('joy'), knob=document.getElementById('joyKnob');
  let joyId=null;
  const R=46; // max knob travel (px)
  function pos(e){ const r=joy.getBoundingClientRect(); return {cx:r.left+r.width/2, cy:r.top+r.height/2}; }
  function move(e){
    const t=[...e.touches||[]].find(t=>t.identifier===joyId) || (e.pointerId!=null?e:null);
    if(!t) return;
    const {cx,cy}=pos(); let dx=t.clientX-cx, dy=t.clientY-cy;
    const len=Math.hypot(dx,dy)||1; const cl=Math.min(len,R);
    dx=dx/len*cl; dy=dy/len*cl;
    knob.style.transform=`translate(${dx}px,${dy}px)`;
    touchCtrl.turn = -(dx/R);                 // left = +turn
    touchCtrl.throttle = (-dy/R)>0 ? (-dy/R) : (-dy/R)*0.6; // forward strong, reverse softer
    touchCtrl.active=true;
  }
  function end(){ joyId=null; touchCtrl.active=false; touchCtrl.throttle=0; touchCtrl.turn=0; knob.style.transform=''; }
  if(window.PointerEvent){
    joy.addEventListener('pointerdown',e=>{ joyId=e.pointerId; joy.setPointerCapture(e.pointerId); move(e); e.preventDefault(); });
    joy.addEventListener('pointermove',e=>{ if(joyId===e.pointerId) move(e); });
    joy.addEventListener('pointerup',end); joy.addEventListener('pointercancel',end);
  } else {
    joy.addEventListener('touchstart',e=>{ joyId=e.changedTouches[0].identifier; move(e); e.preventDefault(); },{passive:false});
    joy.addEventListener('touchmove',e=>{ move(e); e.preventDefault(); },{passive:false});
    joy.addEventListener('touchend',end); joy.addEventListener('touchcancel',end);
  }

  // action buttons
  const catchBtn=document.getElementById('abCatch');
  const hold=(el,on,off)=>{
    const dn=e=>{ e.preventDefault(); el.classList.add('on'); on&&on(); };
    const up=e=>{ e.preventDefault(); el.classList.remove('on'); off&&off(); };
    el.addEventListener('pointerdown',dn); el.addEventListener('pointerup',up);
    el.addEventListener('pointerleave',up); el.addEventListener('pointercancel',up);
  };
  const tap=(el,fn)=> el.addEventListener('pointerdown',e=>{ e.preventDefault(); fn(); });
  // catch = hold space behaviour
  hold(catchBtn, ()=>{ keys[' ']=true; }, ()=>{ keys[' ']=false; });
  tap(document.getElementById('abSonar'), sonarPing);
  tap(document.getElementById('abAct'), tryInteract);
  // util buttons
  tap(document.getElementById('ubMap'), toggleMap);
  tap(document.getElementById('ubUpg'), ()=>openHarbor(nearestHarbor(),'upgrades'));
  tap(document.getElementById('ubCam'), cycleCamera);
  tap(document.getElementById('ubGull'), sendSeagull);
  tap(document.getElementById('ubPause'), togglePause);

  // block page scroll/zoom gestures on the game canvas
  document.addEventListener('touchmove', e=>{ if(e.target.closest('#modal')) return; e.preventDefault(); }, {passive:false});
  document.addEventListener('gesturestart', e=>e.preventDefault());

  // orientation hint
  function checkOrient(){ document.body.classList.toggle('portrait', innerHeight>innerWidth); }
  addEventListener('resize',checkOrient); addEventListener('orientationchange',checkOrient); checkOrient();
}

// ============================================================================
//  7. GAME LOOP HELPERS — sonar, harvest, interact
// ============================================================================
let harvesting=false, harvestTimer=0, harvestTarget=null;
let sonarPulse=-1;

function sonarPing(){
  sonarPulse=0;
  // reveal beds within range -> mark known
  const range = 220 + W.sonarLvl*120;
  let found=0;
  for(const b of beds){
    if(dist2(b.x,b.z,shipState.x,shipState.z) < range*range){ b.known=true; found++; }
  }
  toast(found>0? `📡 Sonar: ${found} mosselbank(en) in bereik!` : '📡 Sonar: niets in de buurt…','good');
  beep(660,0.08); setTimeout(()=>beep(880,0.08),90);
}

function nearestBed(maxD=14){
  let best=null,bd=maxD*maxD;
  for(const b of beds){ if(b.amount<=0) continue; const d=dist2(b.x,b.z,shipState.x,shipState.z); if(d<bd){bd=d;best=b;} }
  return best;
}
function nearestHarbor(extra=36){
  // dock when near the berth — scales with each harbour's size & pier reach
  let best=null,bd=Infinity;
  for(const h of harborMarkers){
    const reach=(h.r||40)*1.6+extra;
    const d=dist2(h.x,h.z,shipState.x,shipState.z);
    if(d<reach*reach && d<bd){ bd=d; best=h; }
  }
  return best;
}
function nearbyBottle(){ for(const b of bottles){ if(dist2(b.x,b.z,shipState.x,shipState.z)<100) return b; } return null; }
function nearbySailor(){ for(const s of sailors){ if(dist2(s.x,s.z,shipState.x,shipState.z)<120) return s; } return null; }
function nearbyExotic(){ for(const e of exotics){ if(dist2(e.x,e.z,shipState.x,shipState.z)<90) return e; } return null; }
function nearbyIsland(){ for(const i of islandMeshes){ if(dist2(i.x,i.z,shipState.x,shipState.z)<(i.r+18)*(i.r+18)) return i; } return null; }

function holdCount(){ return W.inv.mossel + W.inv.goudmossel; }

function tryInteract(){
  if(W.paused) return;
  const h=nearestHarbor(); if(h){ openHarbor(h); return; }
  const isl=nearbyIsland(); if(isl){ visitIsland(isl); return; }
  const b=nearbyBottle(); if(b){ openBottle(b); return; }
  const s=nearbySailor(); if(s){ rescueSailor(s); return; }
  const e=nearbyExotic(); if(e){ catchExotic(e); return; }
  toast('Niets om mee te doen hier. Zoek een 🦪 bank, ⚓ haven of vaar verder.');
}

function startHarvest(){
  const b=nearestBed();
  if(!b){ return; }
  if(holdCount()>=W.holdMax){ toast('🚫 Ruim is vol! Verkoop eerst in een haven.','bad'); return; }
  harvesting=true; harvestTarget=b; harvestTimer=0;
}
function doHarvest(dt){
  if(!harvesting||!harvestTarget) return;
  if(holdCount()>=W.holdMax){ harvesting=false; toast('🚫 Ruim is vol!','bad'); return; }
  const b=harvestTarget;
  if(b.amount<=0 || dist2(b.x,b.z,shipState.x,shipState.z)>16*16){ harvesting=false; harvestTarget=null; return; }
  const rate = (0.9 + W.harvestLvl*0.5) * (1 + (W.skills.visserij-1)*0.12);
  harvestTimer += dt*rate;
  if(harvestTimer>=1){
    harvestTimer-=1; b.amount--;
    if(b.golden){ W.inv.goudmossel++; W.totalGold++; goldenMusselPower(); }
    else W.inv.mossel++;
    W.totalCaught++;
    gainSkill('visserij', b.golden?6:1.4);
    splash(b.x,b.z);
    if(b.amount<=0){ poiGroup.remove(b.group); beds.splice(beds.indexOf(b),1);
      // respawn a new bed elsewhere to keep ocean alive
      const a=Math.random()*6.28,r=200+Math.random()*2600; spawnBed(Math.cos(a)*r,Math.sin(a)*r);
      harvesting=false; harvestTarget=null;
    }
    updateHUD();
    checkQuests();
  }
}

function goldenMusselPower(){
  const powers=[
    ()=>{ addBuff('snelheid',30); toast('🌟 Gouden mossel: TURBO motor (30s)!','gold'); },
    ()=>{ addBuff('vangst',30); toast('🌟 Gouden mossel: supersnelle vangst (30s)!','gold'); },
    ()=>{ addBuff('prijs',45); toast('🌟 Gouden mossel: betere prijzen (45s)!','gold'); },
    ()=>{ W.gold+=120; toast('🌟 Gouden mossel: +120 🪙 schat!','gold'); },
  ];
  powers[Math.floor(Math.random()*powers.length)]();
  updateHUD();
}
function addBuff(name,sec){ W.buffs[name]=Math.max(W.buffs[name]||0,sec); }

// ---- island / bottle / sailor / exotic interactions ----
function visitIsland(isl){
  if(isl.treasure && !isl.visited){
    isl.visited=true;
    const loot = 200 + Math.floor(Math.random()*400) + W.level*30;
    W.gold += loot; W.treasures++;
    if(isl.group.userData.gold) isl.group.userData.gold.visible=false;
    if(isl.group.userData.chest) isl.group.userData.chest.material.color.set(0x5a3a1a);
    toast(`🏴‍☠️ Schatkist op ${isl.name}! +${loot} 🪙`,'gold');
    gainXP(60); checkQuests(); updateHUD(); confettiBurst(isl.x,isl.z);
  } else {
    toast(`🏝️ ${isl.name} — een mooi plekje, maar geen schat (meer).`);
  }
}
const BOTTLE_MISSIONS=[
  {t:'Breng 10 mosselen naar Neveldorp', reward:300, need:()=>true},
  {t:'Vang een gouden mossel', reward:500, need:()=>true},
  {t:'Red een gestrande zeeman', reward:250, need:()=>true},
  {t:'Verkoop een gerecht in Palmbaai', reward:350, need:()=>true},
  {t:'Ontdek een verborgen eiland', reward:400, need:()=>true},
];
function openBottle(b){
  poiGroup.remove(b.mesh); bottles.splice(bottles.indexOf(b),1);
  W.bottles++;
  const m=BOTTLE_MISSIONS[Math.floor(Math.random()*BOTTLE_MISSIONS.length)];
  const reward=m.reward;
  W.gold += Math.floor(reward*0.4); // immediate finder's fee + lore
  toast(`📜 Flessenpost! "${m.t}" — Vindersloon +${Math.floor(reward*0.4)} 🪙`,'gold');
  gainXP(30); updateHUD();
  setTimeout(spawnBottle, 8000);
}
function rescueSailor(s){
  poiGroup.remove(s.group); sailors.splice(sailors.indexOf(s),1);
  W.rescued++;
  const reward=150+Math.floor(Math.random()*200)+W.level*15;
  W.gold+=reward;
  toast(`⛑️ Zeeman gered! Dankbaar geeft hij je +${reward} 🪙`,'good');
  gainXP(45); checkQuests(); updateHUD();
  setTimeout(spawnSailor, 14000);
}
function catchExotic(e){
  poiGroup.remove(e.mesh); exotics.splice(exotics.indexOf(e),1);
  W.inv.exoot++;
  if(!W.aquarium.includes(e.species.name)) W.aquarium.push(e.species.name);
  toast(`🐠 Exotisch gevangen: ${e.species.name}! (aquarium +1)`,'good');
  gainXP(25); checkQuests(); updateHUD();
  setTimeout(spawnExotic, 10000);
}

// ---- seagull ----
function sendSeagull(){
  if(!W.hasSeagull){ toast('🐦 Je hebt nog geen meeuw. Koop er één in een haven (upgrades).'); return; }
  if(gullState.mode!=='follow'){ toast('🐦 '+W.seagullName+' is al op pad…'); return; }
  // find nearest unvisited treasure island or bottle
  let target=null,bd=1e18;
  for(const i of islandMeshes){ if(i.treasure&&!i.visited){ const d=dist2(i.x,i.z,shipState.x,shipState.z); if(d<bd){bd=d;target={x:i.x,z:i.z,kind:'eiland',ref:i};} } }
  for(const b of bottles){ const d=dist2(b.x,b.z,shipState.x,shipState.z); if(d<bd){bd=d;target={x:b.x,z:b.z,kind:'fles',ref:b};} }
  if(!target){ toast('🐦 '+W.seagullName+' vindt niks bijzonders in de buurt.'); return; }
  gullState.mode='scout'; gullState.target=target;
  toast('🐦 '+W.seagullName+' vliegt op verkenning uit…','good');
}

// ============================================================================
//  8. ECONOMY: prices, selling, cooking
// ============================================================================
function musselPrice(harbor){
  let base=14*harbor.demand;
  base *= (1 + (W.skills.handel-1)*0.08);
  if(W.buffs.prijs) base*=1.3;
  return Math.round(base);
}
const RECIPES=[
  {name:'Mosselen Friet',       icon:'🍟', need:6,  base:120,  skill:1},
  {name:'Mosselsoep',           icon:'🥣', need:8,  base:180,  skill:1},
  {name:'Moules Marinière',     icon:'🍲', need:10, base:260,  skill:2},
  {name:'Mosselkroketten',      icon:'🧆', need:12, base:320,  skill:2},
  {name:'Mosselrisotto',        icon:'🍚', need:14, base:400,  skill:3},
  {name:'Mosselcurry',          icon:'🍛', need:16, base:480,  skill:3, exootNeed:1},
  {name:'Gouden Paella',        icon:'🥘', need:18, base:620,  skill:4, goldNeed:1},
  {name:'Bouillabaisse Royale', icon:'🍲', need:22, base:820,  skill:5, goldNeed:1, exootNeed:1},
  {name:'Zeevruchten Platter',  icon:'🍱', need:26, base:1050, skill:6, goldNeed:2},
  {name:'Keizers Banket',       icon:'👑', need:34, base:1600, skill:7, goldNeed:3, exootNeed:2},
];
function dishPrice(r,harbor){
  let p=r.base*harbor.demand*(1+(W.skills.handel-1)*0.1);
  if(W.buffs.prijs) p*=1.3;
  return Math.round(p);
}

// ============================================================================
//  9. RPG: XP / levels / skills
// ============================================================================
function gainXP(n){
  W.xp+=n;
  while(W.xp>=W.xpNext){
    W.xp-=W.xpNext; W.level++; W.xpNext=Math.round(W.xpNext*1.4);
    toast(`⭐ NIVEAU ${W.level}! +1 vaardigheidspunt`,'gold');
    beep(523,.12); setTimeout(()=>beep(659,.12),120); setTimeout(()=>beep(784,.16),240);
  }
  updateHUD();
}
function gainSkill(name,n){
  W.skillXp[name]+=n;
  const need=W.skills[name]*60;
  if(W.skillXp[name]>=need){
    W.skillXp[name]-=need; W.skills[name]++;
    toast(`📈 ${cap(name)} → niveau ${W.skills[name]}!`,'good');
    gainXP(20);
  }
}

// ============================================================================
//  10. QUESTS / LOGBOOK
// ============================================================================
const QUESTS=[
  {id:'q1', t:'Vang je eerste 5 mosselen',     check:()=>W.inv.mossel+W.totalCaught>=5 || W.totalCaught>=5, reward:80},
  {id:'q2', t:'Kook je eerste gerecht',        check:()=>W.totalCooked>=1, reward:120},
  {id:'q3', t:'Verkoop voor 200 🪙',           check:()=>W.totalEarned>=200, reward:150},
  {id:'q4', t:'Ontdek een verborgen eiland',   check:()=>W.treasures>=1, reward:200},
  {id:'q5', t:'Red een gestrande zeeman',      check:()=>W.rescued>=1, reward:200},
  {id:'q6', t:'Vang een gouden mossel',        check:()=>W.inv.goudmossel+W.totalGold>=1, reward:300},
  {id:'q7', t:'Bereik kapitein-niveau 5',      check:()=>W.level>=5, reward:400},
  {id:'q8', t:'Koop een groter schip',         check:()=>W.ship>=1, reward:500},
];
W.totalCaught=0; W.totalCooked=0; W.totalEarned=0; W.totalGold=0;
function checkQuests(){
  for(const q of QUESTS){
    if(!W.questsDone.has(q.id) && q.check()){
      W.questsDone.add(q.id); W.gold+=q.reward;
      toast(`✅ Logboek voltooid: "${q.t}" +${q.reward} 🪙`,'gold');
      gainXP(40);
    }
  }
  renderQuests(); updateHUD();
}
function renderQuests(){
  const el=document.getElementById('questList');
  const open=QUESTS.filter(q=>!W.questsDone.has(q.id)).slice(0,4);
  const done=QUESTS.filter(q=>W.questsDone.has(q.id)).length;
  el.innerHTML = open.map(q=>`<div class="q"><b>○</b> ${q.t} <span style="color:var(--gold)">+${q.reward}</span></div>`).join('')
    + (open.length===0?'<div class="q done">Alle missies voltooid! 🏆</div>':'')
    + `<div class="q" style="color:var(--accent)">Voortgang: ${done}/${QUESTS.length}</div>`;
}

// ============================================================================
//  11. UI — HUD, toasts, prompt, modals
// ============================================================================
const $=id=>document.getElementById(id);
function updateHUD(){
  $('hudGold').textContent=Math.floor(W.gold);
  $('hudLevel').textContent=W.level;
  $('hudXP').style.width=(W.xp/W.xpNext*100)+'%';
  $('hudHoldTxt').textContent=`${holdCount()}/${W.holdMax}`;
  $('hudHold').style.width=(holdCount()/W.holdMax*100)+'%';
  $('hudFish').textContent=W.inv.exoot;
  $('seagullStat').style.display=W.hasSeagull?'flex':'none';
  $('seagullName').textContent=W.seagullName;
}
let toastTimer=0;
function toast(msg,kind=''){
  const el=document.createElement('div');
  el.className='toast '+kind; el.textContent=msg;
  $('toasts').appendChild(el);
  setTimeout(()=>el.remove(),4200);
  const t=$('toasts'); while(t.children.length>5) t.firstChild.remove();
}
function showPrompt(html){ const p=$('prompt'); p.innerHTML=html; p.style.display='block'; }
function hidePrompt(){ $('prompt').style.display='none'; }

function openModal(html){ $('modal').innerHTML=html; $('overlay').style.display='flex'; W.paused=true; }
function closeModal(){ $('overlay').style.display='none'; cookGame.active=false; if(!mapOpen) W.paused=false; }

// ---- Harbor modal ----
let curHarbor=null, curTab='verkoop';
function openHarbor(h, tab='verkoop'){
  if(!h){ toast('⚓ Vaar dichter naar een haven om aan te meren.'); return; }
  curHarbor=h; curTab=tab; renderHarbor();
}
function renderHarbor(){
  const h=curHarbor; if(!h) return;
  const tabs=[['verkoop','💰 Verkoop'],['markt','🛒 Markt'],['kombuis','👨‍🍳 Kombuis'],['upgrades','🔧 Werf'],['schepen','🚢 Schepen'],['kapitein','🧑‍✈️ Kapitein']];
  let body='';
  if(curTab==='verkoop') body=tabVerkoop(h);
  else if(curTab==='markt') body=tabMarkt(h);
  else if(curTab==='kombuis') body=tabKombuis(h);
  else if(curTab==='upgrades') body=tabUpgrades(h);
  else if(curTab==='schepen') body=tabSchepen(h);
  else if(curTab==='kapitein') body=tabKapitein(h);
  openModal(`
    <button class="closeX" onclick="window.__close()">✕</button>
    <h2>${h.icon} ${h.name}</h2>
    <div class="sub">Biome: ${biomeLabel(h.biome)} · Vraag ×${h.demand.toFixed(1)} · Jouw 🪙 ${Math.floor(W.gold)}</div>
    <div class="tabs">${tabs.map(t=>`<div class="tab ${curTab===t[0]?'active':''}" onclick="window.__tab('${t[0]}')">${t[1]}</div>`).join('')}</div>
    <div id="modalBody">${body}</div>
  `);
}
function tabVerkoop(h){
  const mp=musselPrice(h);
  let rows='';
  rows+=invRow('🦪 Mosselen', W.inv.mossel, mp, ()=>`window.__sell('mossel')`);
  rows+=invRow('🌟 Gouden mosselen', W.inv.goudmossel, mp*8, ()=>`window.__sell('goudmossel')`);
  rows+=invRow('🐠 Exotische dieren', W.inv.exoot, 60, ()=>`window.__sell('exoot')`,'(of doneer aan aquarium)');
  // dishes
  let dishRows='';
  for(const r of RECIPES){
    const c=W.dishes[r.name]||0; if(c<=0) continue;
    dishRows+=invRow(`${r.icon} ${r.name}`, c, dishPrice(r,h), ()=>`window.__sellDish('${r.name}')`);
  }
  return `
    <div class="grid"><div class="card2" style="grid-column:1/-1">
      <h3>Rauwe vangst</h3>${rows}
      <button class="btn sell" style="margin-top:10px;width:100%" onclick="window.__sellAll()">Verkoop alle rauwe vangst</button>
    </div>
    ${dishRows?`<div class="card2" style="grid-column:1/-1"><h3>Gerechten 🍽️</h3>${dishRows}
      <button class="btn sell" style="margin-top:10px;width:100%" onclick="window.__sellDishesAll()">Verkoop alle gerechten</button></div>`:''}
    </div>
    ${W.buffs.prijs?'<div class="sub" style="color:var(--gold)">🌟 Prijsbonus actief!</div>':''}`;
}
function invRow(label,count,price,fn,extra=''){
  return `<div class="invrow"><span>${label} <b style="color:var(--accent)">×${count}</b> <small style="color:var(--muted)">${extra}</small></div>
    <div><span class="price">${price} 🪙</span> <button class="btn sell" ${count<=0?'disabled':''} onclick="${fn()}">Verkoop 1</button></div></div>`;
}
function tabMarkt(h){
  // buy bait/charts/aquariumfish? Keep simple: buy fuel-free; sell-side mostly. Add: sea charts reveal beds, weather machine fuel.
  return `<div class="grid">
    <div class="card2"><h3>🗺️ Zeekaart</h3><p>Onthult alle mosselbanken in dit biome op je sonar.</p>
      <button class="btn" onclick="window.__buyChart()">Koop — <span class="price">150 🪙</span></button></div>
    <div class="card2"><h3>🪝 Aas-emmer</h3><p>Lokt direct een verse mosselbank vlak naast je schip.</p>
      <button class="btn" onclick="window.__buyBait()">Koop — <span class="price">80 🪙</span></button></div>
    <div class="card2"><h3>🛠️ Reparatie & Proviand</h3><p>Vol de tank, herstel het schip. (cosmetisch — je zinkt nooit!)</p>
      <button class="btn alt" onclick="window.__repair()">Onderhoud — <span class="price">40 🪙</span></button></div>
    <div class="card2"><h3>🌦️ Weersmachine brandstof</h3><p>${W.hasWeatherMachine?'Lokt beter weer voor 1 cyclus.':'Vereist Weersmachine (Werf).'}</p>
      <button class="btn" ${W.hasWeatherMachine?'':'disabled'} onclick="window.__buyWeatherFuel()">Koop — <span class="price">120 🪙</span></button></div>
  </div>`;
}
function tabKombuis(h){
  let cards='';
  for(const r of RECIPES){
    const locked=W.skills.koken<r.skill;
    const enough=W.inv.mossel>=r.need && (!r.goldNeed||W.inv.goudmossel>=r.goldNeed) && (!r.exootNeed||W.inv.exoot>=r.exootNeed);
    cards+=`<div class="card2">
      <h3>${r.icon} ${r.name} ${locked?`<span class="lvltag">Koken Lv.${r.skill}</span>`:''}</h3>
      <p>Nodig: ${r.need}× 🦪 ${r.goldNeed?`+ ${r.goldNeed}× 🌟`:''}${r.exootNeed?` + ${r.exootNeed}× 🐠`:''}<br>Verkoopwaarde ~<span class="price">${dishPrice(r,h)} 🪙</span></p>
      <button class="btn" ${locked||!enough?'disabled':''} onclick="window.__cook('${r.name}')">${locked?'🔒 Vergrendeld':(enough?'👨‍🍳 Koken (minigame)':'Te weinig ingrediënten')}</button>
    </div>`;
  }
  return `<div class="sub">Kook rauwe mosselen tot gerechten — die brengen véél meer op. Hoe beter je timing, hoe waardevoller het bord!</div>
    <div class="grid">${cards}</div>`;
}
function tabUpgrades(h){
  const items=[
    {k:'hold', name:'🪣 Groter Ruim', desc:`Ruim ${W.holdMax} → ${W.holdMax+30}`, price:Math.round(160*Math.pow(1.6,(W.holdMax-40)/30)), can:true,
      buy:()=>{ W.holdMax+=30; }},
    {k:'engine', name:'⚙️ Sterkere Motor', desc:`Snelheid niveau ${W.engineLvl} → ${W.engineLvl+1}`, price:Math.round(220*Math.pow(1.7,W.engineLvl-1)), can:W.engineLvl<5,
      buy:()=>{ W.engineLvl++; }},
    {k:'harvest', name:'🦾 Betere Mosselhark', desc:`Vangst niveau ${W.harvestLvl} → ${W.harvestLvl+1}`, price:Math.round(260*Math.pow(1.7,W.harvestLvl-1)), can:W.harvestLvl<5,
      buy:()=>{ W.harvestLvl++; }},
    {k:'sonar', name:'📡 Sonar-uitbreiding', desc:`Bereik niveau ${W.sonarLvl} → ${W.sonarLvl+1}`, price:Math.round(200*Math.pow(1.6,W.sonarLvl-1)), can:W.sonarLvl<6,
      buy:()=>{ W.sonarLvl++; }},
    {k:'weather', name:'🌦️ Weersmachine', desc:W.hasWeatherMachine?'Geïnstalleerd ✓':'Beïnvloed het weer beperkt', price:1200, can:!W.hasWeatherMachine,
      buy:()=>{ W.hasWeatherMachine=true; }},
    {k:'gull', name:'🐦 Meeuw (hulpdier)', desc:W.hasSeagull?`${W.seagullName} aan boord ✓`:'Vindt schatten & flessen (toets G)', price:700, can:!W.hasSeagull,
      buy:()=>{ W.hasSeagull=true; seagull.visible=true; }},
    {k:'restaurant', name:'🍽️ Drijvend Restaurant', desc:W.hasRestaurant?'Gebouwd ✓ (passief inkomen)':'Verdient passief geld terwijl je vaart', price:3500, can:!W.hasRestaurant,
      buy:()=>{ W.hasRestaurant=true; }},
  ];
  return `<div class="grid">${items.map(it=>`
    <div class="card2"><h3>${it.name}</h3><p>${it.desc}</p>
      <button class="btn" ${(!it.can||W.gold<it.price)?'disabled':''} onclick="window.__upg('${it.k}',${it.price})">
      ${it.can?`Koop — <span class="price">${it.price} 🪙</span>`:'✓ Bezit'}</button></div>`).join('')}</div>`;
}
let UPG_MAP={};
function tabSchepen(h){
  UPG_MAP={};
  return `<div class="grid">${SHIPS.map((s,i)=>{
    const owned=i<=W.ship; const can=i===W.ship+1;
    return `<div class="card2" style="${i===W.ship?'border-color:var(--gold)':''}">
      <h3>${s.icon} ${s.name} ${i===W.ship?'<span class="lvltag">In gebruik</span>':''}</h3>
      <p>Ruim ${s.hold} · Snelheid ×${s.speed.toFixed(2)}</p>
      <button class="btn" ${owned?'disabled':(can&&W.gold>=s.price?'':'disabled')} onclick="window.__buyShip(${i},${s.price})">
        ${owned?'✓ In bezit':(`Koop — <span class="price">${s.price} 🪙</span>`)}</button>
    </div>`;}).join('')}</div>`;
}
function tabKapitein(h){
  const sk=W.skills;
  const aqua = W.aquarium.length? W.aquarium.map(n=>`🐠 ${n}`).join(' · ') : 'Nog leeg — vang exotische zeedieren!';
  return `<div class="grid">
    <div class="card2"><h3>🧑‍✈️ Kapitein — Niveau ${W.level}</h3>
      <p>XP ${Math.floor(W.xp)}/${W.xpNext}<br>
      🧭 Navigatie ${sk.navigatie} · 👨‍🍳 Koken ${sk.koken}<br>🤝 Handel ${sk.handel} · 🎣 Visserij ${sk.visserij}</p></div>
    <div class="card2"><h3>🏆 Statistieken</h3><p>
      Schatten: ${W.treasures} · Geredde zeelieden: ${W.rescued}<br>
      Flessenpost: ${W.bottles} · Gouden mosselen: ${W.totalGold}<br>
      Dag ${W.day} · Verdiend totaal: ${Math.floor(W.totalEarned)} 🪙</p></div>
    <div class="card2" style="grid-column:1/-1"><h3>🐟 Aquarium aan boord</h3><p>${aqua}</p></div>
    <div class="card2" style="grid-column:1/-1"><h3>🍳 Kookwedstrijd</h3>
      <p>Daag de lokale kapitein uit! Kook een gerecht met perfecte timing en win een prijs.</p>
      <button class="btn" ${(W.inv.mossel<10)?'disabled':''} onclick="window.__contest()">Doe mee (10× 🦪) — prijs tot 600 🪙</button></div>
  </div>`;
}
function biomeLabel(b){ return {kust:'🌅 Rustige kustwateren',storm:'⛈️ Stormachtige noordzee',tropisch:'🏝️ Tropische wateren',mist:'🌫️ Mistige mysterezone'}[b]||b; }

// ---- expose handlers to window (modal onclick) ----
window.__close=closeModal;
window.__tab=t=>{ curTab=t; renderHarbor(); };
window.__sell=kind=>{
  if(W.inv[kind]<=0) return;
  let price = kind==='goudmossel'? musselPrice(curHarbor)*8 : kind==='exoot'? 60 : musselPrice(curHarbor);
  W.inv[kind]--; W.gold+=price; W.totalEarned+=price; gainSkill('handel',1.2);
  beep(720,.05); renderHarbor(); updateHUD(); checkQuests();
};
window.__sellAll=()=>{
  const mp=musselPrice(curHarbor);
  let tot = W.inv.mossel*mp + W.inv.goudmossel*mp*8 + W.inv.exoot*60;
  if(tot<=0) return;
  W.totalEarned+=tot; W.gold+=tot;
  gainSkill('handel', (W.inv.mossel+W.inv.goudmossel+W.inv.exoot)*0.5);
  W.inv.mossel=0; W.inv.goudmossel=0; W.inv.exoot=0;
  toast(`💰 Alles verkocht voor ${Math.floor(tot)} 🪙`,'good'); beep(720,.08);
  renderHarbor(); updateHUD(); checkQuests();
};
window.__sellDish=name=>{
  if((W.dishes[name]||0)<=0) return;
  const r=RECIPES.find(x=>x.name===name); const p=dishPrice(r,curHarbor);
  W.dishes[name]--; W.gold+=p; W.totalEarned+=p; gainSkill('handel',2);
  beep(784,.06); renderHarbor(); updateHUD(); checkQuests();
};
window.__sellDishesAll=()=>{
  let tot=0;
  for(const r of RECIPES){ const c=W.dishes[r.name]||0; if(c>0){ tot+=c*dishPrice(r,curHarbor); W.dishes[r.name]=0; } }
  if(tot<=0) return; W.gold+=tot; W.totalEarned+=tot; gainSkill('handel',4);
  toast(`🍽️ Alle gerechten verkocht: ${Math.floor(tot)} 🪙`,'good');
  renderHarbor(); updateHUD(); checkQuests();
};
window.__buyChart=()=>{ if(W.gold<150)return; W.gold-=150; const bi=curHarbor.biome; let n=0;
  for(const b of beds){ if(b.biome===bi){ b.known=true; n++; } } toast(`🗺️ Kaart onthult ${n} banken in dit biome.`,'good'); renderHarbor(); updateHUD(); };
window.__buyBait=()=>{ if(W.gold<80)return; W.gold-=80;
  const a=Math.random()*6.28; spawnBed(shipState.x+Math.cos(a)*30, shipState.z+Math.sin(a)*30,{}).known=true;
  toast('🪝 Een verse mosselbank verschijnt vlakbij!','good'); renderHarbor(); updateHUD(); };
window.__repair=()=>{ if(W.gold<40)return; W.gold-=40; toast('🛠️ Schip blinkt weer als nieuw!','good'); renderHarbor(); updateHUD(); };
window.__buyWeatherFuel=()=>{ if(W.gold<120||!W.hasWeatherMachine)return; W.gold-=120; setWeather(pick(['clear','clear','cloudy']),true);
  toast('🌦️ Weersmachine: het weer klaart op!','good'); renderHarbor(); updateHUD(); };
window.__upg=(k,price)=>{
  if(W.gold<price) return;
  const items={ hold:()=>W.holdMax+=30, engine:()=>W.engineLvl++, harvest:()=>W.harvestLvl++, sonar:()=>W.sonarLvl++,
    weather:()=>W.hasWeatherMachine=true, gull:()=>{W.hasSeagull=true;seagull.visible=true;}, restaurant:()=>W.hasRestaurant=true };
  W.gold-=price; items[k]();
  toast('🔧 Upgrade gekocht!','good'); beep(660,.08);
  gainSkill('navigatie',1); renderHarbor(); updateHUD(); checkQuests();
};
window.__buyShip=(i,price)=>{
  if(i!==W.ship+1||W.gold<price) return;
  W.gold-=price; W.ship=i; W.holdMax=Math.max(W.holdMax,SHIPS[i].hold); buildShip();
  toast(`🚢 Nieuw schip: ${SHIPS[i].name}!`,'gold'); confettiBurst(shipState.x,shipState.z);
  renderHarbor(); updateHUD(); checkQuests();
};
window.__cook=name=>{ const r=RECIPES.find(x=>x.name===name); startCook(r,false); };
window.__contest=()=>{ if(W.inv.mossel<10)return; const r=RECIPES[1]; startCook(r,true); };
window.__cookTap=()=>cookHit();

// ============================================================================
//  12. COOKING MINIGAME
// ============================================================================
const cookGame={active:false, pos:0, dir:1, speed:1.4, zoneL:0.32, zoneW:0.30, perfL:0.45, perfW:0.08, recipe:null, contest:false, hits:0, need:3};
function startCook(r, contest){
  if(W.inv.mossel<r.need){ toast('Te weinig mosselen.','bad'); return; }
  cookGame.active=true; cookGame.recipe=r; cookGame.contest=contest;
  cookGame.pos=0; cookGame.dir=1; cookGame.hits=0; cookGame.need = contest?4:3;
  cookGame.speed = 1.1 + Math.random()*0.5 + W.skills.koken*0.05;
  // skill makes the green zone a bit wider
  cookGame.zoneW = 0.22 + W.skills.koken*0.02;
  cookGame.zoneL = 0.5 - cookGame.zoneW/2 + (Math.random()-0.5)*0.2;
  cookGame.perfW = 0.06 + W.skills.koken*0.006;
  cookGame.perfL = cookGame.zoneL + cookGame.zoneW/2 - cookGame.perfW/2;
  renderCook();
}
// ---- animated galley scene: the captain stirring a pan of mussels ----
function cookSceneSVG(){
  return `<svg id="cookScene" viewBox="0 0 520 300" width="100%" style="display:block;border-radius:14px;border:1px solid var(--line);margin:6px 0 12px;background:linear-gradient(180deg,#2a1d12,#19120b);max-height:46vh" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="ckSeaG" cx="50%" cy="40%" r="70%"><stop offset="0%" stop-color="#4a6173"/><stop offset="100%" stop-color="#1d2a33"/></radialGradient>
      <clipPath id="ckPort"><circle cx="108" cy="120" r="66"/></clipPath>
      <linearGradient id="ckWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2817"/><stop offset="1" stop-color="#241910"/></linearGradient>
      <style>
        @keyframes ckRise{0%{opacity:0;transform:translateY(0) scale(.6)}25%{opacity:.65}100%{opacity:0;transform:translateY(-78px) scale(1.5)}}
        .ckSteam{transform-box:fill-box;transform-origin:center;animation:ckRise 2.8s ease-in infinite}
        @keyframes ckFlame{0%,100%{transform:scaleY(1) scaleX(1)}50%{transform:scaleY(.68) scaleX(1.12)}}
        .ckFlame{transform-box:fill-box;transform-origin:bottom center;animation:ckFlame .42s ease-in-out infinite}
        @keyframes ckSea{0%{transform:translateX(0)}100%{transform:translateX(-44px)}}
        .ckSea{animation:ckSea 3.4s linear infinite}
        @keyframes ckRain{0%{transform:translateY(-8px);opacity:0}30%{opacity:.5}100%{transform:translateY(46px);opacity:0}}
        .ckRain{animation:ckRain 1s linear infinite}
        @keyframes ckBob{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-3px) rotate(-1deg)}}
        .ckBob{transform-box:fill-box;transform-origin:50% 100%;animation:ckBob 3.4s ease-in-out infinite}
      </style>
    </defs>

    <!-- galley wall + planks -->
    <rect width="520" height="300" fill="url(#ckWall)"/>
    <g stroke="#1c130b" stroke-width="2" opacity=".5">
      <line x1="0" y1="60" x2="520" y2="60"/><line x1="0" y1="150" x2="520" y2="150"/><line x1="0" y1="240" x2="520" y2="240"/>
    </g>

    <!-- porthole with stormy sea -->
    <g clip-path="url(#ckPort)">
      <rect x="42" y="54" width="132" height="132" fill="url(#ckSeaG)"/>
      <g class="ckSea">
        <path d="M30 130 q22 -18 44 0 t44 0 t44 0 t44 0 t44 0 v70 h-264 z" fill="#5a7384" opacity=".85"/>
        <path d="M30 146 q22 -14 44 0 t44 0 t44 0 t44 0 t44 0 v60 h-264 z" fill="#3c5260"/>
      </g>
      <g stroke="#cfe0ea" stroke-width="1.4" opacity=".55">
        <line class="ckRain" x1="70" y1="60" x2="64" y2="76"/><line class="ckRain" x1="100" y1="60" x2="94" y2="76" style="animation-delay:.3s"/>
        <line class="ckRain" x1="130" y1="60" x2="124" y2="76" style="animation-delay:.6s"/><line class="ckRain" x1="86" y1="60" x2="80" y2="76" style="animation-delay:.15s"/>
        <line class="ckRain" x1="116" y1="60" x2="110" y2="76" style="animation-delay:.45s"/>
      </g>
    </g>
    <circle cx="108" cy="120" r="66" fill="none" stroke="#7d6033" stroke-width="9"/>
    <circle cx="108" cy="120" r="66" fill="none" stroke="#a98545" stroke-width="3"/>
    ${[0,1,2,3,4,5,6,7].map(i=>{const a=i/8*6.283; return `<circle cx="${(108+Math.cos(a)*66).toFixed(0)}" cy="${(120+Math.sin(a)*66).toFixed(0)}" r="2.4" fill="#5a4424"/>`;}).join('')}

    <!-- hanging pans -->
    <g stroke="#2a2a2e" stroke-width="2" fill="#3b3b40">
      <line x1="250" y1="20" x2="250" y2="44"/><circle cx="250" cy="52" r="12"/>
      <line x1="290" y1="20" x2="290" y2="50"/><ellipse cx="290" cy="58" rx="14" ry="9"/>
    </g>

    <!-- stove top -->
    <rect x="150" y="232" width="220" height="60" rx="8" fill="#9aa0a6"/>
    <rect x="150" y="232" width="220" height="10" rx="5" fill="#c4c9ce"/>
    <ellipse cx="250" cy="244" rx="62" ry="12" fill="#3b3f44"/>
    <!-- gas flame -->
    <g class="ckFlame"><path d="M236 252 q6 -18 14 -22 q-2 12 6 16 q10 -6 8 -18 q12 12 4 28 q-16 10 -32 0 z" fill="#3aa0ff" opacity=".9"/>
      <path d="M244 250 q4 -10 6 -14 q4 8 8 12 q-4 8 -14 6 z" fill="#ffd34d" opacity=".9"/></g>

    <!-- cast-iron pan + mussels -->
    <ellipse cx="250" cy="214" rx="66" ry="22" fill="#23262b"/>
    <ellipse cx="250" cy="210" rx="60" ry="18" fill="#3a2f25"/>
    <ellipse cx="250" cy="209" rx="56" ry="15" fill="#caa86a" opacity=".9"/>
    ${[[226,206],[248,212],[270,205],[238,213],[262,213],[252,202]].map((m,i)=>`
      <g transform="translate(${m[0]} ${m[1]}) rotate(${i*40-30})"><ellipse rx="9" ry="5.5" fill="#23304a"/><ellipse rx="5" ry="3" fill="#e8a23a" cx="1"/></g>`).join('')}
    <path d="M220 205 q8 -4 16 -1 q-6 4 -16 1z" fill="#3aa34a"/><path d="M268 204 q8 -3 15 1 q-7 3 -15 -1z" fill="#3aa34a"/>

    <!-- rising steam -->
    <g fill="#ffffff" opacity=".0">
      <ellipse class="ckSteam" cx="236" cy="190" rx="9" ry="13" style="animation-delay:0s"/>
      <ellipse class="ckSteam" cx="252" cy="186" rx="11" ry="15" style="animation-delay:.7s"/>
      <ellipse class="ckSteam" cx="268" cy="190" rx="8" ry="12" style="animation-delay:1.4s"/>
    </g>

    <!-- the captain (bobs with the boat) -->
    <g class="ckBob">
      <!-- jacket / body -->
      <path d="M352 300 v-96 q0 -40 46 -40 q46 0 46 40 v96 z" fill="#6b5535"/>
      <path d="M398 300 v-130" stroke="#4f3f27" stroke-width="3"/>
      <path d="M380 176 l18 26 l18 -26 q-18 -12 -36 0z" fill="#23304a"/> <!-- sweater V -->
      <path d="M372 172 q26 -16 52 0 l-6 16 q-20 -12 -40 0z" fill="#7a6240"/> <!-- collar -->
      <!-- head -->
      <ellipse cx="404" cy="120" rx="26" ry="28" fill="#e0b187"/>
      <path d="M384 120 q-6 0 -5 10 q1 8 7 8z" fill="#e0b187"/> <!-- nose toward pan -->
      <path d="M380 128 q-2 22 26 26 q22 -2 22 -20 q-10 8 -26 6 q-16 -2 -22 -12z" fill="#cfd2cf"/> <!-- beard -->
      <circle cx="392" cy="116" r="2.6" fill="#3a2c1c"/> <!-- eye -->
      <path d="M384 108 q6 -4 12 -2" stroke="#7a5a3a" stroke-width="2" fill="none"/> <!-- brow -->
      <!-- captain cap -->
      <path d="M374 104 q30 -22 60 0 q2 6 -4 8 q-26 -10 -52 0 q-6 -2 -4 -8z" fill="#1c2740"/>
      <path d="M372 110 q32 -8 64 0 l-2 8 q-30 -8 -60 0z" fill="#141d30"/>
      <path d="M372 116 q-6 2 -8 8 q14 4 22 -2z" fill="#0e1626"/> <!-- brim -->
      <circle cx="404" cy="98" r="7" fill="#10182a"/>
      <path d="M404 94 v9 M400 99 h8 M401 103 a3 3 0 0 0 6 0" stroke="var(--gold)" stroke-width="1.6" fill="none"/> <!-- gold anchor -->

      <!-- far arm holding the pan handle -->
      <path d="M352 210 q-26 -2 -40 6" stroke="#6b5535" stroke-width="15" stroke-linecap="round" fill="none"/>
      <ellipse cx="312" cy="216" rx="8" ry="6" fill="#e0b187"/>
      <rect x="300" y="208" width="20" height="6" rx="3" fill="#1a1a1d"/> <!-- pan handle -->

      <!-- NEAR (stirring) arm: upper arm fixed, forearm+spoon animated -->
      <path d="M372 190 q-12 4 -22 14" stroke="#6b5535" stroke-width="16" stroke-linecap="round" fill="none"/>
      <g>
        <animateTransform attributeName="transform" type="rotate" values="6 350 204;-8 350 204;6 350 204" dur="1.5s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1"/>
        <path d="M350 204 q-22 0 -40 6" stroke="#6b5535" stroke-width="13" stroke-linecap="round" fill="none"/>
        <ellipse cx="310" cy="210" rx="9" ry="7" fill="#e0b187"/>
        <g>
          <animateTransform attributeName="transform" type="rotate" values="-6 308 210;10 308 210;-6 308 210" dur="1.5s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1"/>
          <rect x="252" y="206" width="62" height="6" rx="3" fill="#b9824a" transform="rotate(8 308 210)"/>
          <ellipse cx="252" cy="210" rx="11" ry="7" fill="#9a6a37"/>
        </g>
      </g>
    </g>
  </svg>`;
}

function renderCook(){
  const r=cookGame.recipe;
  openModal(`
    <h2>👨‍🍳 ${cookGame.contest?'Kookwedstrijd':'Koken'}: ${r.icon} ${r.name}</h2>
    ${cookSceneSVG()}
    <div class="sub">${IS_TOUCH?'Tik op <b>👆 TIK!</b>':'Druk <b>Spatie</b>'} als de naald in de <span style="color:var(--good)">groene zone</span> staat — raak de <span style="color:var(--gold)">gouden kern</span> voor 'perfect'. ${cookGame.need} keer raak = klaar.</div>
    <div id="cookTrack">
      <div id="cookZone" style="left:${cookGame.zoneL*100}%;width:${cookGame.zoneW*100}%"></div>
      <div id="cookPerfect" style="left:${cookGame.perfL*100}%;width:${cookGame.perfW*100}%"></div>
      <div id="cookNeedle" style="left:${cookGame.pos*100}%"></div>
    </div>
    <div id="cookInfo">Treffers: <b id="cookHits">${cookGame.hits}</b>/${cookGame.need} · Kwaliteit: <b id="cookQual">—</b></div>
    <div style="text-align:center;margin-top:12px;display:flex;gap:10px;justify-content:center">
      ${IS_TOUCH?'<button class="btn" style="font-size:17px;padding:12px 26px" onclick="window.__cookTap()">👆 TIK!</button>':''}
      <button class="btn alt" onclick="window.__close()">Stoppen</button></div>
  `);
}
let cookQuality=0;
function cookHit(){
  if(!cookGame.active) return;
  const p=cookGame.pos;
  const inZone = p>=cookGame.zoneL && p<=cookGame.zoneL+cookGame.zoneW;
  const inPerf = p>=cookGame.perfL && p<=cookGame.perfL+cookGame.perfW;
  if(inPerf){ cookGame.hits++; cookQuality+=1.0; beep(900,.06); flashTrack('var(--gold)'); }
  else if(inZone){ cookGame.hits++; cookQuality+=0.6; beep(700,.05); flashTrack('var(--good)'); }
  else { cookQuality-=0.3; beep(200,.08); flashTrack('var(--bad)'); cookGame.speed*=1.04; }
  const ch=$('cookHits'); if(ch) ch.textContent=Math.max(0,cookGame.hits);
  if(cookGame.hits>=cookGame.need) finishCook();
}
function flashTrack(c){ const t=$('cookTrack'); if(t){ t.style.boxShadow=`0 0 18px ${c}`; setTimeout(()=>t&&(t.style.boxShadow=''),140);} }
function updateCook(dt){
  if(!cookGame.active) return;
  cookGame.pos += cookGame.dir*cookGame.speed*dt;
  if(cookGame.pos>=1){ cookGame.pos=1; cookGame.dir=-1; }
  if(cookGame.pos<=0){ cookGame.pos=0; cookGame.dir=1; }
  const n=$('cookNeedle'); if(n) n.style.left=(cookGame.pos*100)+'%';
}
function finishCook(){
  const r=cookGame.recipe;
  W.inv.mossel-=r.need; if(r.goldNeed) W.inv.goudmossel-=r.goldNeed; if(r.exootNeed) W.inv.exoot-=r.exootNeed;
  cookGame.active=false;
  const qual = cookQuality/cookGame.need; // ~0..1
  cookQuality=0;
  W.dishes[r.name]=(W.dishes[r.name]||0)+1;
  W.totalCooked++;
  gainSkill('koken', 3 + (cookGame.contest?3:0));
  if(cookGame.contest){
    const prize = Math.round(200 + qual*400);
    W.gold+=prize; W.totalEarned+=prize;
    toast(`🏆 Kookwedstrijd! Kwaliteit ${(qual*100|0)}% → +${prize} 🪙 en 1× ${r.name}`,'gold');
  } else {
    toast(`🍽️ ${r.name} bereid! Kwaliteit ${(qual*100|0)}%. Verkoop 'm in Verkoop.`,'good');
  }
  gainXP(35);
  updateHUD(); checkQuests();
  curTab='kombuis'; if(curHarbor) renderHarbor(); else closeModal();
}
// space handling in cook game
addEventListener('keydown',e=>{ if(cookGame.active && e.key===' '){ e.preventDefault(); cookHit(); } });

// ============================================================================
//  13. MAP (toets M)
// ============================================================================
let mapOpen=false;
function toggleMap(){ mapOpen?closeMap():openMap(); }
function openMap(){
  mapOpen=true; W.paused=true;
  openModal(`<button class="closeX" onclick="window.__closemap()">✕</button>
    <h2>🗺️ Zeekaart</h2><div class="sub">De grote oceaan en haar biomes. Jouw schip = 🚢.</div>
    <canvas id="bigmap" width="700" height="500" style="width:100%;border-radius:12px;border:1px solid var(--line)"></canvas>
    <div class="sub" style="margin-top:10px">🏘️ haven · 🏝️ eiland · 🦪 bekende bank · 📜 fles · ⛑️ zeeman</div>`);
  drawBigMap();
}
window.__closemap=()=>{ mapOpen=false; closeModal(); W.paused=false; };
function closeMap(){ window.__closemap(); }
function drawBigMap(){
  const cv=$('bigmap'); if(!cv) return; const ctx=cv.getContext('2d');
  const R=3000; const sx=v=>(v/R*0.5+0.5)*cv.width, sy=v=>(v/R*0.5+0.5)*cv.height;
  // biome backdrop
  const grad=ctx.createLinearGradient(0,0,cv.width,cv.height);
  grad.addColorStop(0,'#0a3a63'); grad.addColorStop(1,'#072438'); ctx.fillStyle=grad; ctx.fillRect(0,0,cv.width,cv.height);
  // biome tints (match biomeAt thresholds)
  ctx.globalAlpha=.18;
  ctx.fillStyle='#6b7a8a'; ctx.fillRect(0,0,cv.width,sy(-850));              // storm north
  ctx.fillStyle='#5bd97a'; ctx.fillRect(sx(1000),0,cv.width-sx(1000),cv.height); // tropical east
  ctx.fillStyle='#b9c6cf'; ctx.fillRect(0,0,sx(-1000),cv.height);           // misty west
  ctx.globalAlpha=1;
  ctx.font='16px sans-serif'; ctx.textAlign='center';
  for(const b of beds){ if(b.known){ ctx.fillText(b.golden?'🌟':'🦪',sx(b.x),sy(b.z)); } }
  for(const bt of bottles) ctx.fillText('📜',sx(bt.x),sy(bt.z));
  for(const s of sailors) ctx.fillText('⛑️',sx(s.x),sy(s.z));
  for(const i of islandMeshes) ctx.fillText(i.treasure&&!i.visited?'💰':'🏝️',sx(i.x),sy(i.z));
  ctx.font='20px sans-serif';
  for(const h of harborMarkers){ ctx.fillText(h.icon,sx(h.x),sy(h.z)); ctx.fillStyle='#9fc4dd'; ctx.font='10px sans-serif'; ctx.fillText(h.name,sx(h.x),sy(h.z)+14); ctx.font='20px sans-serif'; }
  // ship
  ctx.fillText('🚢',sx(shipState.x),sy(shipState.z));
}

// ============================================================================
//  14. SONAR RADAR (canvas)
// ============================================================================
const sonarCv=$('sonar'), sctx=sonarCv.getContext('2d');
function drawSonar(){
  const W2=sonarCv.width, H2=sonarCv.height, cx=W2/2, cy=H2/2, R=W2/2-6;
  sctx.clearRect(0,0,W2,H2);
  // rings
  sctx.strokeStyle='rgba(90,180,255,.25)'; sctx.lineWidth=1;
  for(let i=1;i<=3;i++){ sctx.beginPath(); sctx.arc(cx,cy,R*i/3,0,6.28); sctx.stroke(); }
  sctx.beginPath(); sctx.moveTo(cx,cy-R); sctx.lineTo(cx,cy+R); sctx.moveTo(cx-R,cy); sctx.lineTo(cx+R,cy); sctx.stroke();
  const range = 260 + W.sonarLvl*140;
  const toR=(dx,dz)=>{
    // rotate so ship heading is up
    const c=Math.cos(-shipState.heading), s=Math.sin(-shipState.heading);
    const rx=dx*c - dz*s, rz=dx*s + dz*c;
    return [cx + rx/range*R, cy + rz/range*R];
  };
  function blip(x,z,color,size){
    const dx=x-shipState.x, dz=z-shipState.z;
    if(dx*dx+dz*dz>range*range) return;
    const [px,py]=toR(dx,dz);
    sctx.fillStyle=color; sctx.beginPath(); sctx.arc(px,py,size,0,6.28); sctx.fill();
  }
  for(const b of beds){ if(b.known||dist2(b.x,b.z,shipState.x,shipState.z)<(range*0.6)**2) blip(b.x,b.z, b.golden?'#ffd34d':'#5bd97a', b.golden?4:3); }
  for(const h of harborMarkers) blip(h.x,h.z,'#ff9d4d',4);
  for(const i of islandMeshes) blip(i.x,i.z, i.treasure&&!i.visited?'#ffd34d':'#b98a52',3);
  for(const bt of bottles) blip(bt.x,bt.z,'#9affc8',2.5);
  for(const s of sailors) blip(s.x,s.z,'#ff6b6b',3);
  for(const e of exotics) blip(e.x,e.z,'#6fd0ff',2.5);
  // ping sweep
  if(sonarPulse>=0){
    const pr=sonarPulse*R;
    sctx.strokeStyle=`rgba(120,255,180,${1-sonarPulse})`; sctx.lineWidth=2;
    sctx.beginPath(); sctx.arc(cx,cy,pr,0,6.28); sctx.stroke();
  }
  // ship center
  sctx.fillStyle='#fff'; sctx.beginPath(); sctx.moveTo(cx,cy-6); sctx.lineTo(cx-4,cy+5); sctx.lineTo(cx+4,cy+5); sctx.fill();
}

// ============================================================================
//  15. WEATHER / DAY-NIGHT
// ============================================================================
function setWeather(w, forced){
  W.weather=w; W.weatherTimer = forced? 50 : 30+Math.random()*40;
  const wd=WEATHERS[w];
  $('weatherIco').textContent=wd.ico; $('weatherName').textContent=wd.name;
  rain.points.visible = (w==='rain'||w==='storm');
  toast(`${wd.ico} Het weer slaat om: ${wd.name}`);
}
function pick(a){ return a[Math.floor(Math.random()*a.length)]; }
function updateWeather(dt){
  W.weatherTimer-=dt;
  if(W.weatherTimer<=0){
    // weather transitions, biome-biased
    const bi=biomeAt(shipState.x,shipState.z);
    let pool=['clear','clear','cloudy','rain'];
    if(bi==='storm') pool=['cloudy','rain','storm','storm','clear'];
    if(bi==='mist') pool=['fog','fog','cloudy','clear'];
    if(bi==='tropisch') pool=['clear','clear','clear','rain','cloudy'];
    if(W.hasWeatherMachine && Math.random()<0.3) pool=['clear','clear','cloudy'];
    setWeather(pick(pool));
  }
  // storm lightning
  if(W.weather==='storm' && Math.random()<dt*0.4){
    flash.intensity=6; flash.position.set(shipState.x+(Math.random()-0.5)*400,300,shipState.z+(Math.random()-0.5)*400);
    beep(80,.25,0.04); setTimeout(()=>{ beep(60,.4,0.03); },200+Math.random()*400);
  }
  flash.intensity*=Math.pow(0.001,dt);
  // rain growth: beds in rain grow back amount slowly
  if(W.weather==='rain'||W.weather==='storm'){
    for(const b of beds){ if(Math.random()<dt*0.02) b.amount=Math.min(b.amount+1, b.golden?3:18); }
  }
}

// ============================================================================
//  16. MAIN UPDATE
// ============================================================================
let camPos=new THREE.Vector3(0,22,38);
const clock=new THREE.Clock();
function update(){
  let dt=Math.min(clock.getDelta(),0.05);
  if(!W.started){ renderer.render(scene,camera); requestAnimationFrame(update); return; }
  if(!W.paused) stepSim(dt);
  else oceanUniforms.uTime.value += dt*0.3; // gentle idle waves while paused
  updateCook(dt);
  updateSplashes(dt);
  renderer.render(scene,camera);
  requestAnimationFrame(update);
}

function stepSim(dt){
  // ---- time of day ----
  W.time += dt*0.12; // ~ 1 day per ~3.3 real min
  if(W.time>=24){ W.time-=24; W.day++;
    if(W.hasRestaurant){ const inc=80+W.level*20; W.gold+=inc; toast(`🍽️ Drijvend restaurant verdiende vannacht +${inc} 🪙`,'good'); }
    toast(`🌅 Dag ${W.day} breekt aan!`); updateHUD();
  }
  updateClock();

  // ---- weather ----
  updateWeather(dt);
  applyEnvironment(dt);

  // ---- buffs ----
  for(const k of Object.keys(W.buffs)){ W.buffs[k]-=dt; if(W.buffs[k]<=0) delete W.buffs[k]; }

  // ---- ship control ----
  const spec=SHIPS[W.ship];
  const wm=WEATHERS[W.weather];
  let accel = (keys['w']||keys['arrowup'])?1 : (keys['s']||keys['arrowdown'])?-0.5 : 0;
  if(touchCtrl.active && touchCtrl.throttle!==0) accel = touchCtrl.throttle; // analog joystick overrides
  shipState.throttle += (accel-shipState.throttle)*Math.min(1,dt*2);
  let maxSpeed = 36 * spec.speed * (1 + (W.engineLvl-1)*0.32) * (1+(W.skills.navigatie-1)*0.06);
  if(W.buffs.snelheid) maxSpeed*=1.6;
  // weather drag
  maxSpeed *= (W.weather==='storm'?0.7 : W.weather==='rain'?0.88 : 1);
  shipState.speed += (shipState.throttle*maxSpeed - shipState.speed)*Math.min(1,dt*1.4);
  let turn=0;
  if(keys['a']||keys['arrowleft']) turn+=1;
  if(keys['d']||keys['arrowright']) turn-=1;
  if(touchCtrl.active) turn += touchCtrl.turn;
  turn=Math.max(-1,Math.min(1,turn));
  const turnRate = 1.25*(0.42+0.58*Math.min(1,Math.abs(shipState.speed)/12));
  shipState.heading += turn*turnRate*dt * (shipState.speed<0?-1:1);
  // wind nudge
  shipState.x += (Math.sin(shipState.heading)*shipState.speed + W.wind.x* (wm.wave))*dt;
  shipState.z += (Math.cos(shipState.heading)*shipState.speed + W.wind.y* (wm.wave))*dt;
  // clamp to world
  const lim=2900;
  shipState.x=Math.max(-lim,Math.min(lim,shipState.x));
  shipState.z=Math.max(-lim,Math.min(lim,shipState.z));

  // ---- island & harbour-land collision: push the hull back to the edge ----
  const pushOut=(cx,cz,minD)=>{
    const dx=shipState.x-cx, dz=shipState.z-cz;
    const d=Math.hypot(dx,dz);
    if(d<minD && d>0.001){
      const nx=dx/d, nz=dz/d;
      shipState.x=cx+nx*minD;           // slide out along the radial normal
      shipState.z=cz+nz*minD;
      shipState.speed*=0.25;            // bump kills most forward momentum
      shipState.throttle*=0.25;
    }
  };
  for(const isl of islandMeshes) pushOut(isl.x, isl.z, isl.r+6);     // beach edge + hull margin
  for(const c of harborCores)    pushOut(c.x,   c.z,   c.r+6);       // harbour land (pier stays clear)

  // ---- float ship on waves ----
  const t=oceanUniforms.uTime.value, sc=oceanUniforms.uWaveScale.value;
  const h0=waveHeight(shipState.x,shipState.z,t,sc);
  const hF=waveHeight(shipState.x+Math.sin(shipState.heading)*3, shipState.z+Math.cos(shipState.heading)*3, t, sc);
  const hR=waveHeight(shipState.x+Math.cos(shipState.heading)*2, shipState.z-Math.sin(shipState.heading)*2, t, sc);
  ship.position.set(shipState.x, h0+0.2, shipState.z);
  ship.rotation.y=shipState.heading;
  // pitch & roll from wave slope
  shipMesh.rotation.x = Math.atan2(hF-h0,3)*-1.0;
  shipMesh.rotation.z = Math.atan2(hR-h0,2)*1.0;
  // flag waves
  if(shipMesh.userData.flag) shipMesh.userData.flag.rotation.y=Math.sin(t*4)*0.3 + W.wind.x;
  if(shipMesh.userData.ring) shipMesh.userData.ring.rotation.z+=dt*2;

  // harvest arm animation
  const arm=shipMesh.userData.arm;
  if(arm){ const target=harvesting?0.9:0; arm.rotation.x += (target-arm.rotation.x)*Math.min(1,dt*4); }

  // ---- harvesting ----
  if((keys[' ']) ) { if(!harvesting) startHarvest(); }
  else if(harvesting && !nearestBed()) { harvesting=false; }
  doHarvest(dt);

  // ---- wake ----
  updateWake(dt);

  // ---- seagull ----
  updateSeagull(dt);

  // ---- POI bob ----
  for(const bt of bottles) bt.mesh.position.y=waveHeight(bt.x,bt.z,t,sc)+0.3;
  for(const s of sailors) s.group.position.y=waveHeight(s.x,s.z,t,sc);
  for(const e of exotics){ e.mesh.position.y=waveHeight(e.x,e.z,t,sc)-0.6+Math.sin(t*2+e.x)*0.3; e.mesh.rotation.z=Math.sin(t+e.x)*0.4; }
  for(const b of beds){ b.group.children.forEach((c,i)=>{ c.rotation.y+=dt*0.5; }); }
  // harbor beacon pulse + buoy bob
  for(const h of harborMarkers){
    const ud=h.group.userData;
    if(ud.lamp) ud.lamp.material.emissiveIntensity=1.0+Math.sin(t*3)*0.6;
    if(ud.buoy) ud.buoy.position.y=0.6+Math.sin(t*2+h.x)*0.5;
  }
  // island treasure glints
  for(const i of islandMeshes){ if(i.group.userData.gold&&i.group.userData.gold.visible){ i.group.userData.gold.rotation.y+=dt; } }

  // ---- sonar pulse ----
  if(sonarPulse>=0){ sonarPulse+=dt*1.3; if(sonarPulse>1) sonarPulse=-1; }
  drawSonar();

  // ---- camera ----
  updateCamera(dt);

  // ---- clouds drift ----
  for(const c of cloudGroup.children){ c.position.x+=c.userData.spd*dt; if(c.position.x>1600)c.position.x=-1600; c.lookAt(camera.position); }

  // ---- rain follows ship ----
  if(rain.points.visible) updateRain(dt);

  // ---- interaction prompt ----
  updatePrompt();

  // ---- compass ----
  updateCompass();

  // ---- wind info ----
  // (occasionally rotate wind)
  if(Math.random()<dt*0.05){ const a=Math.random()*6.28; W.wind.set(Math.cos(a)*0.8,Math.sin(a)*0.8); }
  $('windInfo').textContent='🧭 Wind: '+headingName(Math.atan2(W.wind.x,W.wind.y))+' '+(8+Math.round(WEATHERS[W.weather].wave*6))+'kn';
}

function applyEnvironment(dt){
  const wm=WEATHERS[W.weather];
  // smooth wave scale
  const targetWave=wm.wave;
  oceanUniforms.uWaveScale.value += (targetWave-oceanUniforms.uWaveScale.value)*Math.min(1,dt*0.7);
  // sun position from time of day
  const ang=(W.time/24)*Math.PI*2 - Math.PI/2; // sunrise ~6
  const sunY=Math.sin(ang), sunX=Math.cos(ang)*0.6, sunZ=0.3;
  const dir=new THREE.Vector3(sunX,Math.max(sunY,-0.3),sunZ).normalize();
  const dayAmt=Math.max(0,sunY);             // 0 night, 1 noon
  const night=1-Math.min(1,Math.max(0,(sunY+0.15)/0.35));
  // sun light
  sun.position.copy(dir).multiplyScalar(220).add(new THREE.Vector3(shipState.x,0,shipState.z));
  sun.target.position.set(shipState.x,0,shipState.z);
  const sunStrength = (0.15+dayAmt*1.4)*wm.sun;
  sun.intensity=sunStrength;
  // warm at horizon
  const horiz=1-Math.min(1,Math.abs(sunY)/0.25);
  sun.color.setHSL(0.09 - horiz*0.07, 0.6+horiz*0.3, 0.6);
  hemi.intensity=0.25+dayAmt*0.6;
  ambient.intensity=0.12+dayAmt*0.22;

  // sky colors
  const dayTop=new THREE.Color(0x2f7fd0), dayBot=new THREE.Color(0xcdeaff);
  const nightTop=new THREE.Color(0x050a1a), nightBot=new THREE.Color(0x10233a);
  const duskTop=new THREE.Color(0x6a3a7a), duskBot=new THREE.Color(0xffa05a);
  let top=new THREE.Color(), bot=new THREE.Color();
  if(horiz>0.3 && dayAmt<0.4){ // dawn/dusk blend
    top.copy(dayTop).lerp(duskTop,horiz); bot.copy(dayBot).lerp(duskBot,horiz);
  } else { top.copy(dayTop); bot.copy(dayBot); }
  top.lerp(nightTop,night); bot.lerp(nightBot,night);
  // weather desaturate
  const wt=new THREE.Color(wm.tint);
  top.lerp(wt, (1-wm.sun)*0.4); bot.lerp(wt,(1-wm.sun)*0.5);
  skyMat.uniforms.uTop.value.copy(top); skyMat.uniforms.uBot.value.copy(bot);
  skyMat.uniforms.uSunDir.value.copy(dir);
  skyMat.uniforms.uSunColor.value.copy(night>0.5? new THREE.Color(0xdfe8ff) : sun.color);
  skyMat.uniforms.uNight.value=night;

  // ocean uniforms
  oceanUniforms.uSunDir.value.copy(dir);
  oceanUniforms.uSunColor.value.copy(sun.color);
  oceanUniforms.uSky.value.copy(bot);
  oceanUniforms.uNight.value=night;
  oceanUniforms.uSunStrength.value=wm.sun*(0.4+dayAmt);
  const deep=new THREE.Color(0x0c4f8a).lerp(wt,(1-wm.sun)*0.3);
  oceanUniforms.uDeep.value.copy(deep);

  // fog
  const baseFog = wm.fog * (0.7+night*0.6);
  scene.fog.density += (baseFog-scene.fog.density)*Math.min(1,dt*0.5);
  scene.fog.color.copy(bot);
  renderer.setClearColor(bot);
  // cloud opacity by weather
  const cloudOp = W.weather==='clear'?0.5 : W.weather==='fog'?0.2 : 0.9;
  for(const c of cloudGroup.children) c.material.opacity += (cloudOp-c.material.opacity)*Math.min(1,dt);
  // moon vs sun icon at night when clear
  if(W.weather==='clear') $('weatherIco').textContent = night>0.5?'🌙':'☀️';
}

function updateCamera(dt){
  let back=42, up=20, lookUp=4;
  if(camMode===1){ back=24; up=11; lookUp=3; }
  if(camMode===2){ back=20; up=60; lookUp=0; }
  const tx=shipState.x - Math.sin(shipState.heading)*back;
  const tz=shipState.z - Math.cos(shipState.heading)*back;
  const ty=ship.position.y+up;
  camPos.lerp(new THREE.Vector3(tx,ty,tz), Math.min(1,dt*2.2));
  camera.position.copy(camPos);
  camera.lookAt(shipState.x, ship.position.y+lookUp, shipState.z);
}

function updatePrompt(){
  if(W.paused){ hidePrompt(); return; }
  const h=nearestHarbor();
  if(h){ showPrompt(`<b>${h.icon} ${h.name}</b><br>${A_E} Aanmeren — verkoop, kook & upgrade`); return; }
  const isl=nearbyIsland();
  if(isl){ showPrompt(`<b>🏝️ ${isl.name}</b><br>${A_E} ${isl.treasure&&!isl.visited?'Ga aan land — schat zoeken!':'Verken het eiland'}`); return; }
  const s=nearbySailor(); if(s){ showPrompt(`<b>⛑️ Gestrande zeeman!</b><br>${A_E} Redden voor beloning`); return; }
  const bt=nearbyBottle(); if(bt){ showPrompt(`<b>📜 Flessenpost drijft voorbij</b><br>${A_E} Openmaken`); return; }
  const ex=nearbyExotic(); if(ex){ showPrompt(`<b>🐠 Exotisch zeedier!</b><br>${A_E} Vangen voor je aquarium`); return; }
  const b=nearestBed();
  if(b){ showPrompt(`<b>${b.golden?'🌟 Gouden mosselbank!':'🦪 Mosselbank'}</b> <small>(${b.amount} over)</small><br>${PRESS} ${A_SP} en houd vast`); return; }
  hidePrompt();
}

function updateClock(){
  const hh=Math.floor(W.time), mm=Math.floor((W.time-hh)*60);
  $('clock').textContent=`${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
}

// compass strip
const compassStrip=$('compassStrip');
(function buildCompass(){
  let html='';
  for(let d=0; d<720; d+=15){
    const dd=d%360;
    const card={0:'N',90:'O',180:'Z',270:'W'}[dd];
    html+=`<div class="${card?'card':'tick'}">${card||(dd%45===0?dd:'·')}</div>`;
  }
  compassStrip.innerHTML=html;
})();
function updateCompass(){
  let deg=(shipState.heading*180/Math.PI)%360; if(deg<0)deg+=360;
  // each tick=30px, 15deg apart => 2px/deg; center offset
  const total=compassStrip.children.length*30;
  const x = -(deg/15)*30 + 130 - 360; // align loop
  compassStrip.style.transform=`translateX(${x}px)`;
}
function headingName(rad){ let d=(rad*180/Math.PI+360)%360; const names=['N','NO','O','ZO','Z','ZW','W','NW']; return names[Math.round(d/45)%8]; }

// ============================================================================
//  17. SEAGULL update
// ============================================================================
function updateSeagull(dt){
  if(!W.hasSeagull) return;
  const t=oceanUniforms.uTime.value;
  let gx,gz,gy;
  if(gullState.mode==='follow'){
    gx=shipState.x - Math.sin(shipState.heading)*6 + Math.sin(t*0.7)*6;
    gz=shipState.z - Math.cos(shipState.heading)*6 + Math.cos(t*0.9)*6;
    gy=14+Math.sin(t*1.5)*2;
  } else if(gullState.mode==='scout'){
    const tg=gullState.target;
    gullState.x = gullState.x||shipState.x; gullState.z=gullState.z||shipState.z;
    gullState.x += (tg.x-gullState.x)*Math.min(1,dt*0.6);
    gullState.z += (tg.z-gullState.z)*Math.min(1,dt*0.6);
    gx=gullState.x; gz=gullState.z; gy=20;
    if(dist2(gx,gz,tg.x,tg.z)<400){
      // found it -> mark known / return with hint
      if(tg.kind==='eiland'){ toast('🐦 '+W.seagullName+' cirkelt boven een schateiland! Volg de blip.','gold'); }
      else { toast('🐦 '+W.seagullName+' vond flessenpost! Markering op sonar.','good'); }
      gullState.mode='return';
    }
  } else { // return
    gullState.x += (shipState.x-gullState.x)*Math.min(1,dt*0.8);
    gullState.z += (shipState.z-gullState.z)*Math.min(1,dt*0.8);
    gx=gullState.x; gz=gullState.z; gy=16;
    if(dist2(gx,gz,shipState.x,shipState.z)<200){ gullState.mode='follow'; }
  }
  seagull.position.set(gx, ship.position.y+gy, gz);
  const dx=gx-seagull.userData.px||0, dz=gz-seagull.userData.pz||0;
  seagull.rotation.y=Math.atan2(gx-(seagull.userData.px??gx), gz-(seagull.userData.pz??gz));
  seagull.userData.px=gx; seagull.userData.pz=gz;
  const flap=Math.sin(t*12)*0.7;
  seagull.userData.wL.rotation.z=flap; seagull.userData.wR.rotation.z=-flap;
}

// ============================================================================
//  18. PARTICLES: wake, rain, splash, confetti
// ============================================================================
function makePointWake(){
  const N=120; const geo=new THREE.BufferGeometry();
  const pos=new Float32Array(N*3); const life=new Float32Array(N);
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const mat=new THREE.PointsMaterial({color:0xffffff,size:3.2,transparent:true,opacity:.6,depthWrite:false,sizeAttenuation:true});
  const points=new THREE.Points(geo,mat); points.frustumCulled=false;
  return {points,pos,life,N,idx:0};
}
function updateWake(dt){
  const t=oceanUniforms.uTime.value,sc=oceanUniforms.uWaveScale.value;
  if(Math.abs(shipState.speed)>3){
    for(let s=0;s<2;s++){
      const i=wake.idx; wake.idx=(wake.idx+1)%wake.N;
      const side=(Math.random()-0.5)*4;
      const bx=shipState.x - Math.sin(shipState.heading)*5 + Math.cos(shipState.heading)*side;
      const bz=shipState.z - Math.cos(shipState.heading)*5 - Math.sin(shipState.heading)*side;
      wake.pos[i*3]=bx; wake.pos[i*3+1]=waveHeight(bx,bz,t,sc)+0.3; wake.pos[i*3+2]=bz; wake.life[i]=1;
    }
  }
  for(let i=0;i<wake.N;i++){ if(wake.life[i]>0){ wake.life[i]-=dt*0.6; wake.pos[i*3+1]-=dt*0.2; } else { wake.pos[i*3+1]=-999; } }
  wake.points.geometry.attributes.position.needsUpdate=true;
}
function makeRain(){
  const N=IS_MOBILE?700:1400; const geo=new THREE.BufferGeometry(); const pos=new Float32Array(N*3);
  for(let i=0;i<N;i++){ pos[i*3]=(Math.random()-0.5)*240; pos[i*3+1]=Math.random()*120; pos[i*3+2]=(Math.random()-0.5)*240; }
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const mat=new THREE.PointsMaterial({color:0xaaccee,size:0.7,transparent:true,opacity:.5,depthWrite:false});
  const points=new THREE.Points(geo,mat); points.frustumCulled=false;
  return {points,pos,N};
}
function updateRain(dt){
  const p=rain.pos; const speed=W.weather==='storm'?160:90;
  for(let i=0;i<rain.N;i++){
    p[i*3+1]-=speed*dt;
    if(p[i*3+1]<0){ p[i*3+1]=120; p[i*3]=(Math.random()-0.5)*240; p[i*3+2]=(Math.random()-0.5)*240; }
  }
  rain.points.position.set(shipState.x,0,shipState.z);
  rain.points.geometry.attributes.position.needsUpdate=true;
}
// splash burst on harvest
const splashPool=[];
function splash(x,z){
  const geo=new THREE.BufferGeometry(); const n=14; const pos=new Float32Array(n*3);
  for(let i=0;i<n;i++){ pos[i*3]=x+(Math.random()-0.5)*3; pos[i*3+1]=1; pos[i*3+2]=z+(Math.random()-0.5)*3; }
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const mat=new THREE.PointsMaterial({color:0xcfeeff,size:1.6,transparent:true,opacity:.9,depthWrite:false});
  const pts=new THREE.Points(geo,mat); scene.add(pts);
  splashPool.push({pts,vel:new Float32Array(n).map(()=>4+Math.random()*5),life:1,n,pos});
}
function confettiBurst(x,z){
  for(let k=0;k<3;k++) setTimeout(()=>splash(x+(Math.random()-0.5)*6,z+(Math.random()-0.5)*6),k*120);
}
function updateSplashes(dt){
  for(let s=splashPool.length-1;s>=0;s--){
    const sp=splashPool[s]; sp.life-=dt*1.5;
    for(let i=0;i<sp.n;i++){ sp.pos[i*3+1]+=sp.vel[i]*dt; sp.vel[i]-=14*dt; }
    sp.pts.material.opacity=Math.max(0,sp.life);
    sp.pts.geometry.attributes.position.needsUpdate=true;
    if(sp.life<=0){ scene.remove(sp.pts); splashPool.splice(s,1); }
  }
}

// ============================================================================
//  19. AUDIO (tiny WebAudio beeps)
// ============================================================================
let actx=null;
function beep(freq,dur=0.1,vol=0.05){
  try{
    if(!actx) actx=new (window.AudioContext||window.webkitAudioContext)();
    const o=actx.createOscillator(), g=actx.createGain();
    o.frequency.value=freq; o.type='triangle';
    g.gain.value=vol; o.connect(g); g.connect(actx.destination);
    o.start(); g.gain.exponentialRampToValueAtTime(0.0001,actx.currentTime+dur);
    o.stop(actx.currentTime+dur);
  }catch(e){}
}

// ============================================================================
//  20. UTIL + TEXTURES
// ============================================================================
function dist2(x1,z1,x2,z2){ const dx=x1-x2,dz=z1-z2; return dx*dx+dz*dz; }
function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
function makeCloudTexture(){
  const c=document.createElement('canvas'); c.width=c.height=128; const ctx=c.getContext('2d');
  const g=ctx.createRadialGradient(64,64,10,64,64,64);
  g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(.5,'rgba(255,255,255,.7)'); g.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=g; ctx.fillRect(0,0,128,128);
  const tex=new THREE.CanvasTexture(c); return tex;
}

// ============================================================================
//  21. PAUSE
// ============================================================================
function togglePause(){
  if($('overlay').style.display==='flex' && !mapOpen) return; // a modal handles its own pause
  W.paused=!W.paused;
  if(W.paused){ openModal(`<h2>⏸️ Pauze</h2><div class="sub">Dag ${W.day} · ${$('clock').textContent} · ${WEATHERS[W.weather].name}</div>
    <div class="grid">
      <div class="card2"><h3>🪙 Munten</h3><p>${Math.floor(W.gold)}</p></div>
      <div class="card2"><h3>⭐ Kapitein</h3><p>Niveau ${W.level} · ${Math.floor(W.xp)}/${W.xpNext} XP</p></div>
      <div class="card2"><h3>🦪 Ruim</h3><p>${holdCount()}/${W.holdMax}</p></div>
      <div class="card2"><h3>🚢 Schip</h3><p>${SHIPS[W.ship].name}</p></div>
    </div>
    <div style="text-align:center;margin-top:16px"><button class="btn" onclick="window.__resume()">▶️ Verder spelen</button></div>`);
  } else closeModal();
}
window.__resume=()=>{ W.paused=false; closeModal(); };

// ============================================================================
//  21b. SAVE / LOAD  (localStorage — survives reloads & app restarts)
// ============================================================================
const SAVE_KEY='mosselkapitein_save_v1';
let loadedFromSave=false;

function saveGame(){
  if(!W.started) return;
  try{
    const data={ v:1,
      gold:W.gold, level:W.level, xp:W.xp, xpNext:W.xpNext,
      skills:W.skills, skillXp:W.skillXp,
      inv:W.inv, dishes:W.dishes,
      ship:W.ship, holdMax:W.holdMax,
      engineLvl:W.engineLvl, harvestLvl:W.harvestLvl, sonarLvl:W.sonarLvl,
      hasWeatherMachine:W.hasWeatherMachine, hasSeagull:W.hasSeagull, hasRestaurant:W.hasRestaurant,
      seagullName:W.seagullName, aquarium:W.aquarium,
      time:W.time, day:W.day,
      questsDone:[...W.questsDone],
      rescued:W.rescued, treasures:W.treasures, bottles:W.bottles,
      totalCaught:W.totalCaught, totalCooked:W.totalCooked, totalEarned:W.totalEarned, totalGold:W.totalGold,
      islandsVisited: islandMeshes.map(i=>!!i.visited),
      ship_x:shipState.x, ship_z:shipState.z, ship_h:shipState.heading,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  }catch(e){ /* private mode / quota — ignore */ }
}

function hasSave(){ try{ return !!localStorage.getItem(SAVE_KEY); }catch(e){ return false; } }

function loadGame(){
  let d; try{ d=JSON.parse(localStorage.getItem(SAVE_KEY)); }catch(e){ return false; }
  if(!d || d.v!==1) return false;
  // scalars & objects
  const keys=['gold','level','xp','xpNext','skills','skillXp','inv','dishes','ship','holdMax',
    'engineLvl','harvestLvl','sonarLvl','hasWeatherMachine','hasSeagull','hasRestaurant',
    'seagullName','aquarium','time','day','rescued','treasures','bottles',
    'totalCaught','totalCooked','totalEarned','totalGold'];
  for(const k of keys){ if(d[k]!==undefined) W[k]=d[k]; }
  W.questsDone = new Set(d.questsDone||[]);
  // rebuild the ship mesh for the saved hull
  buildShip();
  seagull.visible = !!W.hasSeagull;
  // restore island treasure state (visited chests are emptied)
  if(Array.isArray(d.islandsVisited)){
    islandMeshes.forEach((isl,idx)=>{
      isl.visited = !!d.islandsVisited[idx];
      if(isl.visited){
        if(isl.group.userData.gold) isl.group.userData.gold.visible=false;
        if(isl.group.userData.chest) isl.group.userData.chest.material.color.set(0x5a3a1a);
      }
    });
  }
  // restore position
  if(typeof d.ship_x==='number'){ shipState.x=d.ship_x; shipState.z=d.ship_z; shipState.heading=d.ship_h||0; }
  return true;
}

function newGame(){
  try{ localStorage.removeItem(SAVE_KEY); }catch(e){}
  location.reload();
}
window.__newGame=()=>{ if(confirm('Nieuw spel starten? Je huidige voortgang gaat verloren.')) newGame(); };

// Autosave: every few seconds while playing, and whenever the app is hidden/closed
setInterval(()=>{ if(W.started && !W.paused) saveGame(); }, 5000);
addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden') saveGame(); });
addEventListener('pagehide', saveGame);
addEventListener('beforeunload', saveGame);

// ============================================================================
//  22. START
// ============================================================================
function startGame(){
  W.started=true;
  document.getElementById('title').classList.add('hidden');
  if(loadedFromSave){
    setWeather(W.weather||'clear');
    updateHUD(); renderQuests(); checkQuests();
    if(!actx){ try{ actx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} }
    toast(`⚓ Welkom terug, Kapitein! Dag ${W.day} · ${Math.floor(W.gold)} 🪙`,'gold');
    return;
  }
  setWeather('clear');
  updateHUD(); renderQuests(); checkQuests();
  if(!actx){ try{ actx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} }
  toast(IS_TOUCH ? '⚓ Welkom, Kapitein! Tik 📡 Sonar en zoek de groene mosselbanken.'
                 : '⚓ Welkom, Kapitein! Druk F voor sonar en zoek de groene mosselbanken.','gold');
}
$('playBtn').addEventListener('click',startGame);

// Unified close: floating ✕ + tap/click on the dark backdrop close whatever modal is open.
function closeAnyModal(){ if(mapOpen) window.__closemap(); else closeModal(); }
window.__closeAny=closeAnyModal;
$('overlayClose').addEventListener('click',closeAnyModal);
$('overlay').addEventListener('click',e=>{ if(e.target===$('overlay')) closeAnyModal(); });

if(IS_TOUCH){
  setupTouch();
  $('sonarLabel').innerHTML='📡 SONAR';
}

// expose for debugging / test harness
window.W=W; window.shipState=shipState; window.beds=beds; window.setWeatherDbg=setWeather;
window.keys=keys; window.stepSim=stepSim; window.startHarvest=startHarvest; window.doHarvest=doHarvest;
window.openHarbor=openHarbor; window.harborMarkers=harborMarkers; window.startCook=startCook; window.RECIPES=RECIPES;
window.cookGame=cookGame; window.cookHit=cookHit;

// Restore a previous save (if any) and adjust the title screen accordingly
if(hasSave()){
  loadedFromSave = loadGame();
}
if(loadedFromSave){
  $('playBtn').textContent='⚓ Verder spelen';
  const help=document.querySelector('#title .help');
  if(help) help.insertAdjacentHTML('afterend',
    `<button id="newGameBtn" style="margin-top:14px;background:none;border:none;color:var(--muted);
      text-decoration:underline;font-size:13px;cursor:pointer;font-family:inherit">🆕 Nieuw spel beginnen</button>`);
  const nb=$('newGameBtn'); if(nb) nb.addEventListener('click',window.__newGame);
}

// Kick off loop
$('loadNote').textContent= loadedFromSave ? '✅ Opgeslagen reis gevonden — klik Verder spelen.' : '✅ Klaar! Klik Uitvaren.';
requestAnimationFrame(update);
