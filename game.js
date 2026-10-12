// 🦪 MOSSELKAPITEIN De Grote Oceaan
// Een kleurrijke 3D mossel-visserij simulatie. Three.js, één wereld, geen build-stap.
import * as THREE from 'three';
// Progress marks for the load-watchdog in index.html (shows where loading stalls on a phone).
const mark=s=>{ try{ if(window.__mark) window.__mark(s); }catch(e){} };
mark('three geladen');
// Safe mode: the watchdog sets mk_safe after a failed load, ?fx=0 forces it. No post-processing then.
const SAFE_MODE=(()=>{ try{ return sessionStorage.getItem('mk_safe')==='1' || new URLSearchParams(location.search).get('fx')==='0'; }catch(e){ return false; } })();

// ============================================================================
//  0. GLOBAL STATE
// ============================================================================
const W = {
  gold: 200,
  level: 1, xp: 0, xpNext: 100,
  skills: { navigatie: 1, koken: 1, handel: 1, visserij: 1 },
  skillXp: { navigatie: 0, koken: 0, handel: 0, visserij: 0 },
  // inventory
  inv: { mossel: 0, goudmossel: 0, exoot: 0, krakeninkt: 0, schub: 0, schaar: 0,
         zalm: 0, parel: 0, inktvis: 0 },
  dishes: {}, // dishName -> count
  // ship & upgrades
  ship: 0,                 // index in SHIPS
  holdMax: 40,
  engineLvl: 1, harvestLvl: 1, sonarLvl: 1,
  hasWeatherMachine: false, hasSeagull: false, hasRestaurant: false,
  hasHarpoon: false, hull: 100, hullMax: 100,   // harpoon + hull integrity for monster fights
  krakensSlain: 0, krakenGoneUntilDay: 0,       // boss progress
  serpentsSlain: 0, serpentGoneUntilDay: 0,     // sea serpent progress
  ghostsLooted: 0,                              // ghost ship plunders
  crabsSlain: 0, crabNextDay: 2,                // giant crab sieges (first from day 2)
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
  paused: false, started: false, dead: false,
  dirt: 0,                                      // hull fouling 0..1, scrubbed off in harbour
  totalSold: 0,
  dishQual: {},
  fame: 0, legendShown: false,                  // roem uit contracten, missies en monsters
  contracts: [], contractsDone: [], contractsDelivered: 0,
  contractSeed: Math.floor(Math.random()*1e9),  // maakt het dagelijkse aanbod per reis anders
  market: {}, boom: null,                       // verzadiging per haven/product + vraagpiek
};

const SHIPS = [
  { name: 'Kleine Vissersboot',  icon:'🛶', hold:40,  speed:1.0,  price:0,     scale:1.0,  hull:0x3a8fd0, style:'fisher',  sail:0x9fc4dd },
  { name: 'Mosselschip',         icon:'⛵', hold:100, speed:1.35, price:2200,  scale:1.35, hull:0x2d7a4f, style:'cutter',  sail:0xeef3e0 },
  { name: 'Snelle Sloep',        icon:'🚤', hold:70,  speed:2.0,  price:5200,  scale:1.15, hull:0xff5a4d, style:'speeder', sail:0xffe1a8 },
  { name: 'Luxe Handelsschip',   icon:'🚢', hold:220, speed:1.6,  price:12000, scale:1.7,  hull:0xb33a3a, style:'trader',  sail:0xf3e2c0 },
  { name: 'Oceaan Trawler',      icon:'🛳️', hold:360, speed:1.85, price:26000, scale:2.0,  hull:0x37506b, style:'trawler', sail:0xcdd6e0 },
  { name: 'Catamaran Racer',     icon:'⛵', hold:150, speed:2.7,  price:42000, scale:1.55, hull:0x18c0b0, style:'cata',    sail:0xffffff },
  { name: 'Marinefregat M-05',   icon:'⚓', hold:600, speed:3.4,  price:90000, scale:2.0,  hull:0xb4bac0, style:'exp',     sail:0xd7dce0 },
];

const WEATHERS = {
  clear:  { name:'Helder',     ico:'☀️', wave:1.0, fog:0.00018, sun:1.0, tint:0xfff3d0 },
  cloudy: { name:'Bewolkt',    ico:'⛅', wave:1.4, fog:0.00040, sun:0.55,tint:0xcfd8e0 },
  rain:   { name:'Regen',      ico:'🌧️', wave:1.7, fog:0.00070, sun:0.4, tint:0x9fb4c4 },
  fog:    { name:'Mist',       ico:'🌫️', wave:0.9, fog:0.00190, sun:0.5, tint:0xb9c6cf },
  storm:  { name:'Storm',      ico:'⛈️', wave:3.0, fog:0.00090, sun:0.25,tint:0x6b7a8a },
};

// Wave parameters MUST match the GLSL below.
const WAVES = [
  { dir:[ 0.8,  0.6], amp:0.48, len:44, speed:0.8 },
  { dir:[-0.6,  0.8], amp:0.30, len:27, speed:1.05 },
  { dir:[ 0.3, -0.9], amp:0.18, len:16, speed:1.4 },
  { dir:[ 0.9,  0.2], amp:0.10, len:9,  speed:2.0 },
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
// Creating the WebGL context can fail on iOS when Safari's GPU process has
// crashed earlier: every new context is then refused until Safari is fully
// closed. Try a few option sets, then explain the fix instead of hanging.
function makeRenderer(){
  const tries=[
    { antialias:!IS_MOBILE, powerPreference:'high-performance' },
    { antialias:false, powerPreference:'default' },
    { antialias:false, powerPreference:'default', failIfMajorPerformanceCaveat:false, depth:true, stencil:false },
  ];
  let err=null;
  for(const o of tries){ try{ return new THREE.WebGLRenderer(o); }catch(e){ err=e; } }
  mark('webgl mislukt');
  const msg='Je telefoon blokkeert 3D-beeld (WebGL). Staat de Vergrendelingsmodus aan? Instellingen, Privacy en beveiliging, Vergrendelingsmodus. Zet hem uit, of sluit deze site ervan uit via het aA-menu in Safari. Je opgeslagen reis blijft bewaard.';
  try{ if(window.__showFail) window.__showFail(msg, String(err && err.message || err)); }catch(e){}
  throw err || new Error('WebGL niet beschikbaar');
}
const renderer = makeRenderer();
// Lost GPU context (memory pressure on phones): reload so the saved game continues.
renderer.domElement.addEventListener('webglcontextlost', e=>{ e.preventDefault(); setTimeout(()=>location.reload(), 400); });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, IS_MOBILE?1.5:2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x9fc4dd, 0.00013);

const camera = new THREE.PerspectiveCamera(58, innerWidth/innerHeight, 0.5, 9000);

// ============================================================================
//  1b. POST-PROCESSING: bloom glow + soft vignette. The scene is rendered into
//  an HDR (half-float, multisampled) target; OutputPass then applies the ACES
//  tone mapping and sRGB conversion once for the whole frame.
// ============================================================================
const postFX = { enabled: (()=>{ try{ return localStorage.getItem('mk_fx')!=='off'; }catch(e){ return true; } })(),
                 available:false, error:null };
let composer=null, bloomPass=null, vignettePass=null;
const BLOOM_SCALE = IS_MOBILE ? 0.5 : 0.75;     // bloom is blurred anyway: cheaper at reduced resolution
function fitComposer(){
  if(!composer) return;
  composer.setSize(innerWidth, innerHeight);
  bloomPass.setSize(innerWidth*BLOOM_SCALE, innerHeight*BLOOM_SCALE);
}
// The post-processing modules are loaded dynamically: if anything about them
// fails on a device (import, half-float target, shader), the game simply runs
// without bloom instead of never starting. Colours are identical either way,
// because the ocean/sky shaders invert the tone mapping that OutputPass applies.
if(SAFE_MODE){ mark('veilige modus, geen gloed'); postFX.error='veilige modus'; }
else try{
  mark('gloed-modules laden');
  const [{EffectComposer},{RenderPass},{UnrealBloomPass},{ShaderPass},{OutputPass}] = await Promise.all([
    import('three/addons/postprocessing/EffectComposer.js'),
    import('three/addons/postprocessing/RenderPass.js'),
    import('three/addons/postprocessing/UnrealBloomPass.js'),
    import('three/addons/postprocessing/ShaderPass.js'),
    import('three/addons/postprocessing/OutputPass.js'),
  ]);
  mark('gloed opbouwen');
  const fxTarget = new THREE.WebGLRenderTarget(innerWidth, innerHeight, {
    type: THREE.HalfFloatType, samples: IS_MOBILE ? 0 : 4 });   // phones never had MSAA: keep GPU memory low
  composer = new EffectComposer(renderer, fxTarget);
  composer.addPass(new RenderPass(scene, camera));
  // bloom: only genuinely bright things glow (sun glitter, lamps, aurora, monster eyes)
  bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.35, 0.9);
  composer.addPass(bloomPass);
  // vignette: a gentle darkening toward the corners for a more filmic frame
  vignettePass = new ShaderPass({
    uniforms: { tDiffuse:{value:null}, uAmount:{value:0.32} },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uAmount; varying vec2 vUv;
      void main(){ vec4 c=texture2D(tDiffuse,vUv); float d=distance(vUv,vec2(0.5));
        c.rgb*=1.0-smoothstep(0.42,0.95,d)*uAmount; gl_FragColor=c; }`,
  });
  composer.addPass(vignettePass);
  composer.addPass(new OutputPass());
  fitComposer();
  postFX.available=true;
  mark('gloed klaar');
}catch(e){
  postFX.available=false; postFX.error=String(e && e.message || e);
  console.warn('Post-processing niet beschikbaar, spel draait zonder gloed:', postFX.error);
}
function renderFrame(){
  if(composer){
    bloomPass.enabled=postFX.enabled; vignettePass.enabled=postFX.enabled;   // colours stay identical either way
    try{ composer.render(); return; }
    catch(e){ composer=null; postFX.available=false; postFX.error=String(e && e.message || e); }
  }
  renderer.render(scene, camera);
}
function setPostFX(on){
  postFX.enabled=!!on;
  try{ localStorage.setItem('mk_fx', on?'on':'off'); }catch(e){}
}
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
mark('lucht');
const skyGeo = new THREE.SphereGeometry(3000, 32, 16);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite:false,
  uniforms:{ uExposure:{value:renderer.toneMappingExposure},
    uTop:{value:new THREE.Color(0x2f7fd0)}, uBot:{value:new THREE.Color(0xcdeaff)},
    uSunDir:{value:new THREE.Vector3(0,1,0)}, uSunColor:{value:new THREE.Color(0xffffff)}, uNight:{value:0},
  },
  vertexShader:`varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`
    varying vec3 vDir; uniform vec3 uTop,uBot,uSunColor,uSunDir; uniform float uNight;
    // simple star hash
    float hash(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
    // ---- exact inverse of three.js' ACESFilmic + sRGB output, so colours tuned as
    //      display values come out of the OutputPass pixel-for-pixel unchanged ----
    uniform float uExposure;
    vec3 srgbToLin(vec3 c){ vec3 lo=c/12.92; vec3 hi=pow((c+0.055)/1.055, vec3(2.4)); return mix(lo,hi,step(0.04045,c)); }
    vec3 rrtOdtInv(vec3 y){
      vec3 A=1.0-0.983729*y, B=0.0245786-0.4329510*y, C=-0.000090537-0.238081*y;
      return (-B+sqrt(max(B*B-4.0*A*C,0.0)))/(2.0*A);
    }
    vec3 displayToScene(vec3 v){
      const mat3 outInv=mat3(vec3(0.643038,0.059269,0.005962), vec3(0.311187,0.931436,0.063929), vec3(0.045775,0.009295,0.930118));
      const mat3 inInv =mat3(vec3(1.764741,-0.147028,-0.036337), vec3(-0.675778,1.160252,-0.162436), vec3(-0.088963,-0.013224,1.198773));
      vec3 c=srgbToLin(clamp(v,0.0,0.999));
      c=clamp(outInv*c, 0.0, 0.999); c=rrtOdtInv(c); c=inInv*c;
      return c*0.6/uExposure;
    }
    void main(){
      float h=clamp(vDir.y*0.5+0.5,0.0,1.0);
      vec3 col=mix(uBot,uTop,pow(h,0.6));
      float sd=max(dot(normalize(vDir),normalize(uSunDir)),0.0);
      vec3 disc = uSunColor*pow(sd,180.0)*2.2;      // sun/moon disc, HDR for bloom
      col += uSunColor*pow(sd,8.0)*0.18;           // glow
      // stars at night
      if(uNight>0.01 && vDir.y>0.0){
        vec3 g=floor(vDir*320.0);
        float s=step(0.992,hash(g))*uNight;
        col += vec3(s)*0.9;
      }
      gl_FragColor=vec4(displayToScene(col) + disc, 1.0);
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
mark('oceaan');
const OCEAN_SIZE = 6400;
const OCEAN_SEG = IS_MOBILE ? 200 : 360;
const oceanGeo = new THREE.PlaneGeometry(OCEAN_SIZE, OCEAN_SIZE, OCEAN_SEG, OCEAN_SEG);
oceanGeo.rotateX(-Math.PI/2);
const LAND_MAX = 30;   // island/harbour/reef discs that tint the shallows (filled after world build)
const oceanUniforms = {
  uTime:{value:0}, uWaveScale:{value:1.0},
  uSunDir:{value:new THREE.Vector3(0,1,0)}, uSunColor:{value:new THREE.Color(0xfff0c8)},
  uDeep:{value:new THREE.Color(0x05335e)}, uMid:{value:new THREE.Color(0x0e6493)},
  uShallow:{value:new THREE.Color(0x2fd9c0)},
  uSky:{value:new THREE.Color(0xcdeBff)}, uNight:{value:0}, uSunStrength:{value:1.0},
  uExposure:{value:renderer.toneMappingExposure},
  uLand:{value:Array.from({length:LAND_MAX},()=>new THREE.Vector3(0,0,0))},
};
const oceanMat = new THREE.ShaderMaterial({
  uniforms: oceanUniforms,
  vertexShader:`
    uniform float uTime,uWaveScale; varying vec3 vN; varying vec3 vWorld; varying float vH; varying float vD;
    // 4 big directional swells (match JS WAVES) + 2 fine detail waves (visual only)
    vec2 D[6]; float A[6]; float L[6]; float S[6];
    void initw(){
      D[0]=normalize(vec2(0.8,0.6));  A[0]=0.48; L[0]=44.0; S[0]=0.8;
      D[1]=normalize(vec2(-0.6,0.8)); A[1]=0.30; L[1]=27.0; S[1]=1.05;
      D[2]=normalize(vec2(0.3,-0.9)); A[2]=0.18; L[2]=16.0; S[2]=1.4;
      D[3]=normalize(vec2(0.9,0.2));  A[3]=0.10; L[3]=9.0;  S[3]=2.0;
      D[4]=normalize(vec2(-0.5,-0.7));A[4]=0.05; L[4]=5.2;  S[4]=2.6;
      D[5]=normalize(vec2(0.65,-0.4));A[5]=0.035;L[5]=3.2;  S[5]=3.2;
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
    uniform vec3 uSunDir,uSunColor,uDeep,uMid,uShallow,uSky;
    uniform float uNight,uSunStrength,uTime,uWaveScale;
    uniform vec3 uLand[${LAND_MAX}];
    // ---- exact inverse of three.js' ACESFilmic + sRGB output, so colours tuned as
    //      display values come out of the OutputPass pixel-for-pixel unchanged ----
    uniform float uExposure;
    vec3 srgbToLin(vec3 c){ vec3 lo=c/12.92; vec3 hi=pow((c+0.055)/1.055, vec3(2.4)); return mix(lo,hi,step(0.04045,c)); }
    vec3 rrtOdtInv(vec3 y){
      vec3 A=1.0-0.983729*y, B=0.0245786-0.4329510*y, C=-0.000090537-0.238081*y;
      return (-B+sqrt(max(B*B-4.0*A*C,0.0)))/(2.0*A);
    }
    vec3 displayToScene(vec3 v){
      const mat3 outInv=mat3(vec3(0.643038,0.059269,0.005962), vec3(0.311187,0.931436,0.063929), vec3(0.045775,0.009295,0.930118));
      const mat3 inInv =mat3(vec3(1.764741,-0.147028,-0.036337), vec3(-0.675778,1.160252,-0.162436), vec3(-0.088963,-0.013224,1.198773));
      vec3 c=srgbToLin(clamp(v,0.0,0.999));
      c=clamp(outInv*c, 0.0, 0.999); c=rrtOdtInv(c); c=inInv*c;
      return c*0.6/uExposure;
    }
    // ---- cheap animated value noise for surface ripple detail ----
    float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    float vnoise(vec2 p){
      vec2 i=floor(p), f=fract(p);
      f=f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
                 mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y);
    }
    float ripple(vec2 p){
      float v =vnoise(p*0.35 + vec2(uTime*0.55, uTime*0.30))*0.62;
      v+=vnoise(p*0.95 - vec2(uTime*0.42,-uTime*0.66))*0.38;
      return v;
    }
    void main(){
      vec3 V=normalize(cameraPosition - vWorld);
      vec3 L=normalize(uSunDir);
      // ---- detail normal from noise gradient, fading with distance ----
      float att=1.0/(1.0+vD*0.0045);
      float e=0.6;
      float r0=ripple(vWorld.xz);
      float rx=ripple(vWorld.xz+vec2(e,0.0));
      float rz=ripple(vWorld.xz+vec2(0.0,e));
      vec3 N=normalize(normalize(vN) + vec3((r0-rx)/e, 0.0, (r0-rz)/e)*0.55*att);
      // ---- shallows: turquoise ring + breaking foam around land ----
      float shal=0.0, shore=0.0;
      for(int i=0;i<${LAND_MAX};i++){
        float r=uLand[i].z; if(r<1.0) continue;
        float d=distance(vWorld.xz, uLand[i].xy);
        shal=max(shal, 1.0-smoothstep(r*0.85, r*2.6, d));
        shore=max(shore, (1.0-smoothstep(r*0.95, r*1.45, d)));
      }
      // ---- base colour: deep -> mid by wave lift & noise, then to tropical shallow near land ----
      float relH=vH/max(uWaveScale,0.7);
      float lift=clamp(relH*0.5+0.5,0.0,1.0);
      vec3 water=mix(uDeep, uMid, lift*0.7 + r0*0.25);
      water=mix(water, uShallow, shal*0.85);
      // subsurface glow through the top of swells
      water += uShallow*0.07*max(vH,0.0)*(1.0-shal);
      // ---- sky reflection (fresnel) ----
      float fres=pow(1.0-max(dot(N,V),0.0),4.0);
      vec3 col=mix(water, uSky, clamp(fres*0.75,0.0,0.8)*(1.0-shal*0.4));
      // soft diffuse
      col += uSunColor*max(dot(N,L),0.0)*0.14*uSunStrength;
      // ---- sun glitter: sharp sparkle over the ripple field + wide sheen ----
      vec3 H=normalize(L+V);
      float ndh=max(dot(N,H),0.0);
      vec3 glitter = uSunColor*pow(ndh,340.0)*4.5*uSunStrength;   // sharp sparkle, kept HDR for bloom
      col += uSunColor*pow(ndh,32.0)*0.30*uSunStrength;
      // ---- foam: crests offshore + animated surf along shorelines ----
      // height relative to the current sea state, so storms don't whitewash the surface
      float crest=smoothstep(0.55,0.95,relH*1.3)*(0.35+0.65*r0);
      float surf=shore*smoothstep(0.35,0.75, vnoise(vWorld.xz*0.5+vec2(uTime*0.8,0.0)) )*0.9;
      float foam=clamp(crest*0.55+surf,0.0,1.0);
      col=mix(col, vec3(0.94,0.98,1.0), foam);
      // ---- horizon blend + night ----
      float horizon=clamp((vD-900.0)/2600.0,0.0,1.0);
      col=mix(col, uSky*mix(1.0,0.5,uNight), horizon*0.65);
      col*=mix(0.30,1.0,1.0-uNight*0.6);
      gl_FragColor=vec4(displayToScene(col) + glitter*0.8, 0.96);
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
mark('schip');
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
  let win=null, flag=null;

  if(style==='exp'){
    // =========== MARINEFREGAT: sleek grey warship (bow = +z) ===========
    const greyHull=new THREE.MeshStandardMaterial({color:0xb4bac0, roughness:.55, metalness:.35});
    const greySup =new THREE.MeshStandardMaterial({color:0xc6ccd2, roughness:.6,  metalness:.25});
    const greyDark=new THREE.MeshStandardMaterial({color:0x3a3f45, roughness:.5,  metalness:.4});
    // hull with a sharply raked bow and a squared-off stern
    const hullGeo=new THREE.BoxGeometry(4.6,1.7,15);
    hullGeo.translate(0,0.25,0);
    { const p=hullGeo.attributes.position;
      for(let i=0;i<p.count;i++){
        const z=p.getZ(i);
        if(z>4.5){ const f=Math.max(0.04, 1-(z-4.5)/3.4); p.setX(i,p.getX(i)*f); p.setY(i,p.getY(i)*0.9+0.18); }
        if(z<-6.9){ p.setX(i,p.getX(i)*0.88); }
      }
      hullGeo.computeVertexNormals(); }
    const hull=new THREE.Mesh(hullGeo,greyHull); hull.castShadow=true; shipMesh.add(hull);
    // main deck
    const fdeck=new THREE.Mesh(new THREE.BoxGeometry(4.1,0.22,13.6),
      new THREE.MeshStandardMaterial({color:0x8f969c,roughness:.8})); fdeck.position.y=1.12; shipMesh.add(fdeck);
    // side rails
    for(const sx of [-2.12,2.12]){
      const rail=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.42,12.6),
        new THREE.MeshStandardMaterial({color:0xd7dce0,roughness:.6}));
      rail.position.set(sx,1.5,-0.4); shipMesh.add(rail);
    }
    // bow gun: mount + turret dome + barrel
    const gmount=new THREE.Mesh(new THREE.CylinderGeometry(0.95,1.1,0.7,10),greySup);
    gmount.position.set(0,1.55,4.4); shipMesh.add(gmount);
    const gdome=new THREE.Mesh(new THREE.SphereGeometry(0.85,10,8,0,Math.PI*2,0,Math.PI/2),greySup);
    gdome.scale.y=0.9; gdome.position.set(0,1.9,4.4); gdome.castShadow=true; shipMesh.add(gdome);
    const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.10,0.13,2.7,7),greyDark);
    barrel.rotation.x=Math.PI/2-0.06; barrel.position.set(0,2.25,5.9); shipMesh.add(barrel);
    // superstructure + bridge
    const sup=new THREE.Mesh(new THREE.BoxGeometry(3.4,1.9,4.4),greySup);
    sup.position.set(0,2.25,0.9); sup.castShadow=true; shipMesh.add(sup);
    const bridge=new THREE.Mesh(new THREE.BoxGeometry(3.0,1.25,2.6),greySup);
    bridge.position.set(0,3.85,1.5); bridge.castShadow=true; shipMesh.add(bridge);
    win=new THREE.Mesh(new THREE.BoxGeometry(2.6,0.5,0.08),
      new THREE.MeshStandardMaterial({color:0x22303c, emissive:0x3a6a88, roughness:.2, metalness:.5}));
    win.position.set(0,4.05,2.86); shipMesh.add(win);
    // angular radar tower (4-sided, rotated 45deg) + antenna + panels
    const tower=new THREE.Mesh(new THREE.CylinderGeometry(0.55,1.3,3.6,4),greySup);
    tower.rotation.y=Math.PI/4; tower.position.set(0,5.6,-0.6); tower.castShadow=true; shipMesh.add(tower);
    const ant=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.07,2.4,6),greyDark);
    ant.position.set(0,8.4,-0.6); shipMesh.add(ant);
    for(let k=0;k<4;k++){
      const pan=new THREE.Mesh(new THREE.BoxGeometry(0.85,0.85,0.1),
        new THREE.MeshStandardMaterial({color:0x9aa0a8,roughness:.5,metalness:.3}));
      const a=k*Math.PI/2+Math.PI/4;
      pan.position.set(Math.cos(a)*0.98, 5.9, -0.6+Math.sin(a)*0.98);
      pan.rotation.y=-a+Math.PI/2; shipMesh.add(pan);
    }
    // radome on a stub mast
    const rmast=new THREE.Mesh(new THREE.CylinderGeometry(0.13,0.17,1.5,6),greySup);
    rmast.position.set(0,4.6,-2.5); shipMesh.add(rmast);
    const dome=new THREE.Mesh(new THREE.SphereGeometry(0.72,12,10),
      new THREE.MeshStandardMaterial({color:0xe9edf0,roughness:.35}));
    dome.position.set(0,5.6,-2.5); dome.castShadow=true; shipMesh.add(dome);
    // aft block + flat helideck
    const aft=new THREE.Mesh(new THREE.BoxGeometry(3.2,1.1,2.6),greySup);
    aft.position.set(0,1.85,-2.4); shipMesh.add(aft);
    const heli=new THREE.Mesh(new THREE.BoxGeometry(3.7,0.14,3.2),
      new THREE.MeshStandardMaterial({color:0x767d84,roughness:.85}));
    heli.position.set(0,1.5,-5.7); shipMesh.add(heli);
    // hull number on both sides (canvas, mirrored for port side)
    const mkNum=(mirror)=>{
      const c=document.createElement('canvas'); c.width=128; c.height=64;
      const x=c.getContext('2d');
      if(mirror){ x.translate(128,0); x.scale(-1,1); }
      x.font='bold 44px sans-serif'; x.textAlign='center'; x.textBaseline='middle';
      x.fillStyle='#eef1f4'; x.fillText('M 05',64,34);
      const t=new THREE.CanvasTexture(c); t.anisotropy=4; return t;
    };
    for(const side of [1,-1]){
      const num=new THREE.Mesh(new THREE.PlaneGeometry(2.3,1.15),
        new THREE.MeshBasicMaterial({map:mkNum(false), transparent:true}));
      num.position.set(side*2.33,0.72,3.1); num.rotation.y=side*Math.PI/2; shipMesh.add(num);
    }
    // stern mast + the fleet's gold flag
    const smast=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.09,2.4,6),greyDark);
    smast.position.set(0,2.8,-6.9); shipMesh.add(smast);
    flag=new THREE.Mesh(new THREE.PlaneGeometry(1.6,0.85),
      new THREE.MeshStandardMaterial({color:0xffd34d, side:THREE.DoubleSide, roughness:.7}));
    flag.position.set(0.8,3.6,-6.9); shipMesh.add(flag);
    shipMesh.userData.flag=flag;
  } else {

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
    new THREE.MeshStandardMaterial({color:0xd0453a, roughness:.5}));
  roof.position.set(0, lowCab?2.6:3.45, cabin.position.z); shipMesh.add(roof);
  win = new THREE.Mesh(new THREE.BoxGeometry(2.4,0.9,0.1),
    new THREE.MeshStandardMaterial({color:0x6fd0ff, emissive:0x224455, roughness:.2, metalness:.4}));
  win.position.set(0, cabin.position.y+0.3, cabin.position.z-cabin.geometry.parameters.depth/2-0.02); shipMesh.add(win);

  // ----- mast, sail & flag -----
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.16, 7,8),
    new THREE.MeshStandardMaterial({color:0x9a6b3a}));
  mast.position.set(0,4.0,-1.2); mast.castShadow=true; shipMesh.add(mast);
  if(style==='cutter'||style==='cata'||style==='trader'){
    const sail=makeSail(spec.sail,3.4,4.6); sail.position.set(0,4.2,-1.0); shipMesh.add(sail);
  }
  flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2,1.1),
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
  } // end standard-ship branch

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

  // ----- the captain himself: steps onto the foredeck during monster fights -----
  const cap=new THREE.Group();
  const legMat=new THREE.MeshStandardMaterial({color:0x2a3040,roughness:.8});
  for(const lx of [-0.35,0.35]){ const leg=new THREE.Mesh(new THREE.BoxGeometry(0.5,1.2,0.5),legMat);
    leg.position.set(lx,0.6,0); cap.add(leg); }
  const coat=new THREE.Mesh(new THREE.BoxGeometry(1.5,1.6,0.9),
    new THREE.MeshStandardMaterial({color:0x6b5535,roughness:.8}));       // leather jacket
  coat.position.y=2.0; cap.add(coat);
  const headC=new THREE.Mesh(new THREE.SphereGeometry(0.55,10,10),
    new THREE.MeshStandardMaterial({color:0xe0b187,roughness:.7}));
  headC.position.y=3.15; cap.add(headC);
  const beard=new THREE.Mesh(new THREE.SphereGeometry(0.4,8,8),
    new THREE.MeshStandardMaterial({color:0xcfd2cf,roughness:.9}));
  beard.position.set(0,2.9,0.3); beard.scale.set(1,0.7,0.8); cap.add(beard);
  const capHat=new THREE.Mesh(new THREE.CylinderGeometry(0.62,0.62,0.35,10),
    new THREE.MeshStandardMaterial({color:0x1c2740,roughness:.6}));
  capHat.position.y=3.6; cap.add(capHat);
  const brim=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.12,0.5),
    new THREE.MeshStandardMaterial({color:0x0e1626,roughness:.6}));
  brim.position.set(0,3.45,0.55); cap.add(brim);
  // rifle, held forward
  const rifle=new THREE.Group();
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.09,2.6,6),
    new THREE.MeshStandardMaterial({color:0x3a3d44,metalness:.7,roughness:.35}));
  barrel.rotation.x=Math.PI/2; barrel.position.z=1.3; rifle.add(barrel);
  const stock=new THREE.Mesh(new THREE.BoxGeometry(0.22,0.35,1.1),
    new THREE.MeshStandardMaterial({color:0x8a5a2a,roughness:.8}));
  stock.position.set(0,-0.08,-0.1); rifle.add(stock);
  const armF=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.4,1.2),
    new THREE.MeshStandardMaterial({color:0x6b5535,roughness:.8}));
  armF.position.set(0.45,-0.05,0.5); rifle.add(armF);
  // muzzle flash (hidden until a shot)
  const muzzle=new THREE.Mesh(new THREE.SphereGeometry(0.42,8,8),
    new THREE.MeshStandardMaterial({color:0xffe9a8,emissive:0xffb020,emissiveIntensity:3,transparent:true,opacity:0.95}));
  muzzle.position.z=2.75; muzzle.visible=false; rifle.add(muzzle);
  rifle.position.set(0.15,2.5,0.65);
  cap.add(rifle);
  if(style==='exp') cap.position.set(1.25,1.3,3.6);   // frigate: beside the bow gun
  else cap.position.set(0,1.3,-3.2);                   // open working deck
  cap.visible=false;
  shipMesh.add(cap);
  shipMesh.userData.captain=cap; shipMesh.userData.rifle=rifle; shipMesh.userData.muzzle=muzzle;

  // ----- navigation & deck lights (switched on automatically after dark) -----
  const lamps=[];
  const lampMat=(col,emis)=>new THREE.MeshStandardMaterial({color:col, emissive:emis, emissiveIntensity:0, roughness:.35});
  const mkLamp=(col,emis,x,y,z,r=0.32)=>{
    const m=new THREE.Mesh(new THREE.SphereGeometry(r,8,8), lampMat(col,emis));
    m.position.set(x,y,z); shipMesh.add(m); lamps.push(m); return m;
  };
  mkLamp(0xff5a4d,0xff2a1a, -2.1, 2.0,  1.2);   // port (red)
  mkLamp(0x5bff8a,0x1aff5a,  2.1, 2.0,  1.2);   // starboard (green)
  mkLamp(0xffffff,0xffe9a8,  0.0, 7.2, -1.2, 0.28); // masthead
  mkLamp(0xffe0a0,0xffb040,  0.0, 2.6, -3.6, 0.30); // stern / deck lamp
  // one real light so the deck actually glows at night
  const deckLight=new THREE.PointLight(0xffd9a0, 0, 34, 2);
  deckLight.position.set(0,4.2,0); shipMesh.add(deckLight);
  shipMesh.userData.lamps=lamps; shipMesh.userData.deckLight=deckLight;
  // cabin window can glow too
  shipMesh.userData.win=win;

  // remember every paintable surface so grime can tint the whole ship
  const dirtMats=[];
  shipMesh.traverse(o=>{
    if(o.isMesh && o.material && o.material.color && !o.material.map){
      const e=o.material.emissive;
      if(!e || e.getHex()===0 || o.material.emissiveIntensity===0)
        dirtMats.push({mat:o.material, base:o.material.color.clone()});
    }
  });
  shipMesh.userData.dirtMats=dirtMats;

  shipMesh.scale.setScalar(s);
  ship.add(shipMesh);
}
// grime slowly browns the ship; a harbour scrub restores her
const GRIME=new THREE.Color(0x4e4a38);
function updateShipDirt(){
  if(!shipMesh || !shipMesh.userData.dirtMats) return;
  const k=W.dirt*0.55;
  for(const d of shipMesh.userData.dirtMats) d.mat.color.copy(d.base).lerp(GRIME,k);
}
// Fade the ship's lights in as dusk falls (0 = broad daylight, 1 = full dark)
function updateShipLights(nightAmt){
  if(!shipMesh) return;
  const ud=shipMesh.userData;
  if(ud.lamps) for(const m of ud.lamps) m.material.emissiveIntensity = 1.6*nightAmt;
  if(ud.deckLight) ud.deckLight.intensity = 1.5*nightAmt;
  if(ud.win) ud.win.material.emissiveIntensity = 0.25 + 1.2*nightAmt;
}
const shipState = { heading:0, speed:0, throttle:0, x:0, z:0 };
buildShip();

// wake particles
const wake = makePointWake();
scene.add(wake.points);

// ============================================================================
//  5. WORLD: harbors, islands, mussel beds, points of interest
// ============================================================================
mark('wereld');
const HARBORS = [
  { name:'Mosselhaven', x:0,     z:160,   icon:'🏘️', demand:1.0,  color:0xff9d4d, r:42 },
  { name:'Zonnebaai',   x:680,   z:420,   icon:'⛵', demand:1.15, color:0xffc24d, r:36 },
  { name:'Gouddok',     x:900,   z:-760,  icon:'👑', demand:1.5,  color:0xffd34d, r:50 },
  { name:'Noorderkaap', x:-560,  z:-1200, icon:'🏚️', demand:1.45, color:0x9fb4c4, r:44 },
  { name:'IJszicht',    x:520,   z:-1750, icon:'🗼', demand:1.7,  color:0xbfe3ff, r:40 },
  { name:'Palmbaai',    x:1650,  z:560,   icon:'🏝️', demand:1.25, color:0x5bd97a, r:48 },
  { name:'Verre Rede',  x:2100,  z:-1500, icon:'🌴', demand:1.75, color:0xff7bd0, r:42 },
  { name:'Neveldorp',   x:-1650, z:420,   icon:'⚓', demand:1.35, color:0xb9c6cf, r:42 },
  { name:'Schemerkade', x:-2050, z:-1000, icon:'🏰', demand:1.6,  color:0x9a86c8, r:46 },
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

// build harbors central land + village + lighthouse + a wooden pier (aanmeerplek)
for(const h of HARBORS){
  const g = new THREE.Group();
  const R = h.r;
  const coreR = R*0.62;               // solid land radius
  // ----- land mass: gentle grassy mound with a sandy edge + stone quay -----
  const hbBiome=biomeAt(h.x,h.z);
  const land=new THREE.Mesh(new THREE.SphereGeometry(coreR,32,20,0,Math.PI*2,0,Math.PI*0.5),
    new THREE.MeshStandardMaterial({color:hbBiome==='storm'?0xe8eef4 : hbBiome==='mist'?0x54604e : 0x5d7a44, roughness:hbBiome==='storm'?.7:.95}));
  land.scale.y=0.22; land.position.y=-0.5; land.receiveShadow=true; g.add(land);
  const beachRing=new THREE.Mesh(new THREE.CylinderGeometry(coreR*1.02,coreR*1.1,1.6,32),
    new THREE.MeshStandardMaterial({color:0xbfae88, roughness:1})); beachRing.position.y=0; g.add(beachRing);
  const quay=new THREE.Mesh(new THREE.CylinderGeometry(coreR*0.99,coreR*1.03,1.2,32),
    new THREE.MeshStandardMaterial({color:0x7d7568, roughness:.9})); quay.position.y=1.1; quay.receiveShadow=true; g.add(quay);
  // ----- village: ring of weathered fishing cottages -----
  const houseCols=[0xa8574e,0x86776a,0xb9a06a,0x6d7f8a,0x8a6f56,0x9c8b74,0x746a5a];
  const roofCols=[0x5a3f33,0x4a423b,0x6a4a35];
  const nHouses=6+Math.floor(R/12);
  for(let i=0;i<nHouses;i++){
    const ang=(i/nHouses)*Math.PI*2 + Math.random()*0.3;
    const rr=coreR*(0.25+Math.random()*0.5);
    const wdt=4+Math.random()*3, hgt=3+Math.random()*3;
    const hh=new THREE.Mesh(new THREE.BoxGeometry(wdt,hgt,wdt),
      new THREE.MeshStandardMaterial({color:houseCols[i%houseCols.length], roughness:.85}));
    hh.position.set(Math.cos(ang)*rr, 1.4+hgt/2, Math.sin(ang)*rr); hh.castShadow=true; g.add(hh);
    const roof=new THREE.Mesh(new THREE.ConeGeometry(wdt*0.85,2.6,4),
      new THREE.MeshStandardMaterial({color:roofCols[i%roofCols.length],roughness:.85}));
    roof.position.set(hh.position.x,hh.position.y+hgt/2+1.3,hh.position.z); roof.rotation.y=Math.PI/4; g.add(roof);
    // warm little window that reads at dusk
    const win=new THREE.Mesh(new THREE.PlaneGeometry(0.9,0.9),
      new THREE.MeshStandardMaterial({color:0xffdf9a,emissive:0xcc8830,emissiveIntensity:.7}));
    win.position.set(hh.position.x+Math.cos(ang)*(wdt/2+0.02), hh.position.y, hh.position.z+Math.sin(ang)*(wdt/2+0.02));
    win.rotation.y=-ang+Math.PI/2; g.add(win);
  }
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

// ---- realistic island terrain: noise-displaced dome with height-based colours ----
function terrainNoise(x,z){ // small deterministic 2D noise
  return Math.sin(x*0.7)*Math.cos(z*0.9)*0.5 + Math.sin(x*2.3+z*1.7)*0.3 + Math.sin(x*4.1-z*3.3)*0.2;
}
const ISLAND_PALETTES={
  kust:    { sand:0xcdb98a, grass:0x4a7a3a, forest:0x33582b, rock:0x6f675a },
  storm:   { sand:0xcfdce6, grass:0xeef3f7, forest:0xd8e4ec, rock:0x8a96a4 },  // ice shore, snow, grey rock
  tropisch:{ sand:0xe9d6a2, grass:0x55a047, forest:0x2c7a3a, rock:0x8f7d5e },
  mist:    { sand:0x9a9384, grass:0x5a6656, forest:0x3d4a42, rock:0x56525b },
};
function makeIslandTerrain(r, biome='kust'){
  const geo=new THREE.SphereGeometry(r,36,22,0,Math.PI*2,0,Math.PI*0.5);
  geo.scale(1,0.42,1);
  const pos=geo.attributes.position;
  const colors=new Float32Array(pos.count*3);
  const pal=ISLAND_PALETTES[biome]||ISLAND_PALETTES.kust;
  const sand=new THREE.Color(pal.sand), grass=new THREE.Color(pal.grass),
        forest=new THREE.Color(pal.forest), rock=new THREE.Color(pal.rock);
  const maxH=r*0.42;
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i), y=pos.getY(i), z=pos.getZ(i);
    // ripple the coastline & slopes so it stops looking like a smooth ball
    const n=terrainNoise(x*3/r, z*3/r);
    const edge=1-Math.min(1, Math.sqrt(x*x+z*z)/r);      // 0 at coast, 1 at centre
    pos.setX(i, x*(1+n*0.10*(1-edge)));
    pos.setZ(i, z*(1+n*0.10*(1-edge)));
    pos.setY(i, Math.max(-1.5, y*(1+n*0.35) ));
    // colour by height with noisy banding: beach → grass → forest → rocky top
    const h=pos.getY(i)/maxH + n*0.12;
    const c=new THREE.Color();
    if(h<0.14) c.copy(sand);
    else if(h<0.30) c.copy(sand).lerp(grass,(h-0.14)/0.16);
    else if(h<0.66) c.copy(grass).lerp(forest,(h-0.30)/0.36);
    else c.copy(forest).lerp(rock,Math.min(1,(h-0.66)/0.3));
    colors[i*3]=c.r; colors[i*3+1]=c.g; colors[i*3+2]=c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors,3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({vertexColors:true, roughness:biome==='storm'?.75:.92, metalness:0}));
}
function makePalm(px,pz,py,scale=1){
  const palm=new THREE.Group();
  const lean=(Math.random()-0.5)*0.35;
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.35*scale,0.7*scale,9*scale,7),
    new THREE.MeshStandardMaterial({color:0x7a5a34,roughness:.9}));
  trunk.position.y=4.5*scale; trunk.rotation.z=lean; trunk.castShadow=true; palm.add(trunk);
  // fronds: crossed, drooping planes read far better than a blob
  const frondMat=new THREE.MeshStandardMaterial({color:0x2f6b33,roughness:.85,side:THREE.DoubleSide});
  for(let f=0;f<6;f++){
    const frond=new THREE.Mesh(new THREE.PlaneGeometry(6.5*scale,1.5*scale,5,1), frondMat);
    const fp=frond.geometry.attributes.position;
    for(let vi=0;vi<fp.count;vi++){ const fx=fp.getX(vi); fp.setY(vi, fp.getY(vi)-Math.pow(Math.abs(fx)/(3.25*scale),2)*2.2*scale); }
    frond.geometry.computeVertexNormals();
    frond.position.set(Math.sin(lean)*9*scale*0.5, 9*scale, 0);
    frond.rotation.y=(f/6)*Math.PI*2; frond.rotation.z=lean*0.5;
    palm.add(frond);
  }
  palm.position.set(px,py,pz);
  return palm;
}
function makePine(px,pz,py,scale=1){
  const pine=new THREE.Group();
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.35*scale,0.55*scale,3.5*scale,6),
    new THREE.MeshStandardMaterial({color:0x5a4630,roughness:.9}));
  trunk.position.y=1.7*scale; trunk.castShadow=true; pine.add(trunk);
  for(let l=0;l<3;l++){
    const cone=new THREE.Mesh(new THREE.ConeGeometry((3.2-l*0.8)*scale,(3.2-l*0.4)*scale,8),
      new THREE.MeshStandardMaterial({color:0x2c5238,roughness:.85}));
    cone.position.y=(3.6+l*2.1)*scale; cone.castShadow=true; pine.add(cone);
  }
  const snowCap=new THREE.Mesh(new THREE.ConeGeometry(1.1*scale,1.2*scale,8),
    new THREE.MeshStandardMaterial({color:0xf2f6fa,roughness:.6}));
  snowCap.position.y=8.6*scale; pine.add(snowCap);
  pine.position.set(px,py,pz);
  return pine;
}
function makeDeadTree(px,pz,py,scale=1){
  const tree=new THREE.Group();
  const mat=new THREE.MeshStandardMaterial({color:0x453c33,roughness:1});
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.28*scale,0.5*scale,7*scale,6), mat);
  trunk.position.y=3.5*scale; trunk.rotation.z=(Math.random()-0.5)*0.25; trunk.castShadow=true; tree.add(trunk);
  for(let b=0;b<3;b++){
    const br=new THREE.Mesh(new THREE.CylinderGeometry(0.10*scale,0.16*scale,3*scale,5), mat);
    br.position.set((Math.random()-0.5)*1.6*scale,(4+b*1.4)*scale,(Math.random()-0.5)*1.6*scale);
    br.rotation.z=0.7+Math.random()*0.8; br.rotation.y=Math.random()*6.28; tree.add(br);
  }
  tree.position.set(px,py,pz);
  return tree;
}
// build islands
for(const isl of ISLANDS){
  const g=new THREE.Group();
  const biome=biomeAt(isl.x,isl.z);
  const terrain=makeIslandTerrain(isl.r,biome);
  terrain.position.y=-1.5; terrain.receiveShadow=true; terrain.castShadow=true; g.add(terrain);
  // scattered boulders along the coast
  for(let i=0;i<5;i++){
    const a=Math.random()*6.28, rr=isl.r*(0.75+Math.random()*0.2);
    const boulder=new THREE.Mesh(new THREE.IcosahedronGeometry(1.5+Math.random()*2.5,0),
      new THREE.MeshStandardMaterial({color:biome==='storm'?0x8a94a0:0x6b6257,roughness:1,flatShading:true}));
    boulder.position.set(Math.cos(a)*rr, 0.4, Math.sin(a)*rr);
    boulder.rotation.set(Math.random()*3,Math.random()*3,0); boulder.castShadow=true; g.add(boulder);
  }
  // trees fit the climate: pines in the IJszee, bare trunks in the mist, palms elsewhere
  const nTrees=3+Math.floor(isl.r/16);
  for(let i=0;i<nTrees;i++){
    const a=Math.random()*6.28, rr=isl.r*(0.3+Math.random()*0.3);
    const tx=Math.cos(a)*rr, tz=Math.sin(a)*rr, ty=isl.r*0.16, ts=0.8+Math.random()*0.5;
    g.add(biome==='storm'?makePine(tx,tz,ty,ts) : biome==='mist'?makeDeadTree(tx,tz,ty,ts) : makePalm(tx,tz,ty,ts));
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

// ---- ice floes drifting through the IJszee ----
const floes=[];
{
  const floeMat=new THREE.MeshStandardMaterial({color:0xeef4f8, roughness:.55, flatShading:true});
  for(let i=0;i<14;i++){
    const r=5+Math.random()*9;
    const m=new THREE.Mesh(new THREE.CylinderGeometry(r, r*1.12, 1.1, 7), floeMat);
    m.scale.set(1, 1, 0.65+Math.random()*0.5);
    m.rotation.y=Math.random()*6.28;
    const x=(Math.random()-0.5)*2000, z=-1250-Math.random()*1500;   // IJszee spans x -1000..1000
    m.position.set(x, 0, z);
    scene.add(m);
    floes.push({mesh:m, x, z, spin:(Math.random()-0.5)*0.05, drift:2+Math.random()*3});
  }
}

// ---- aurora borealis: shimmering curtains high above the IJszee at night ----
const auroras=[];
{
  const mkAurora=(phase)=>new THREE.ShaderMaterial({
    uniforms:{ uTime:{value:0}, uOpacity:{value:0}, uPhase:{value:phase} },
    vertexShader:`
      uniform float uTime,uPhase; varying vec2 vUv;
      void main(){
        vUv=uv;
        vec3 p=position;
        p.x += sin(uv.x*5.0 + uTime*0.4 + uPhase)*36.0*uv.y;   // slow sway, wider at the top
        p.z += cos(uv.x*3.0 + uTime*0.3 + uPhase)*24.0*uv.y;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
      }`,
    fragmentShader:`
      precision highp float;
      uniform float uTime,uOpacity,uPhase; varying vec2 vUv;
      void main(){
        float bands = 0.5 + 0.5*sin(vUv.x*46.0 + uTime*0.7 + uPhase + sin(vUv.x*7.0 + uTime*0.33)*2.6);
        bands = pow(max(bands,0.0), 1.6);           // never pow() a negative: NaN would blank the frame via bloom
        float fade = pow(max(1.0-vUv.y,0.0), 1.4) * smoothstep(0.0, 0.06, vUv.y);
        vec3 col = mix(vec3(0.15,1.0,0.55), vec3(0.55,0.30,0.95), vUv.y*1.2);
        float a = bands * fade * uOpacity;
        gl_FragColor = vec4(col*a, a);
      }`,
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide,
  });
  for(let i=0;i<3;i++){
    const mat=mkAurora(i*2.1);
    const m=new THREE.Mesh(new THREE.PlaneGeometry(2000,300,64,1), mat);
    m.position.set(-800+i*850, 330+i*40, -2450-i*160);
    m.rotation.y=(i-1)*0.18;
    m.frustumCulled=false; m.visible=false;
    scene.add(m); auroras.push(m);
  }
}
function updateAurora(dt,night){
  const on = night>0.05;
  for(const a of auroras){
    a.visible=on;
    if(!on) continue;
    a.material.uniforms.uTime.value += dt;
    a.material.uniforms.uOpacity.value = night*0.85;
  }
}

// ---- ambient gulls circling islands & harbours (life in the world) ----
const ambientGulls=[];
{
  const gullMat=new THREE.MeshStandardMaterial({color:0xf2f4f6,roughness:.8});
  const spots=[...ISLANDS, ...HARBORS].filter((_,i)=>i%2===0);   // half the spots, keeps it light
  for(const s of spots){
    for(let i=0;i<2;i++){
      const b=new THREE.Group();
      const body=new THREE.Mesh(new THREE.SphereGeometry(0.5,6,5),gullMat); body.scale.z=1.6; b.add(body);
      const wL=new THREE.Mesh(new THREE.PlaneGeometry(2.4,0.7),gullMat); wL.position.x=-1.2; b.add(wL);
      const wR=new THREE.Mesh(new THREE.PlaneGeometry(2.4,0.7),gullMat); wR.position.x=1.2; b.add(wR);
      scene.add(b);
      ambientGulls.push({obj:b, cx:s.x, cz:s.z, r:(s.r||40)*0.9+8+Math.random()*14,
        h:22+Math.random()*14, a:Math.random()*6.28, spd:0.25+Math.random()*0.2, wL, wR, ph:Math.random()*6.28});
    }
  }
}
function updateAmbientGulls(dt,t){
  for(const gl of ambientGulls){
    gl.a+=gl.spd*dt;
    const x=gl.cx+Math.cos(gl.a)*gl.r, z=gl.cz+Math.sin(gl.a)*gl.r;
    gl.obj.position.set(x, gl.h+Math.sin(t*0.7+gl.ph)*2, z);
    gl.obj.rotation.y=-gl.a;                       // face along the circle
    const flap=Math.sin(t*7+gl.ph)*0.55;
    gl.wL.rotation.z=flap; gl.wR.rotation.z=-flap;
  }
}

// ---- coral reefs in the Parelzee: beautiful, shallow and rough on the hull ----
const reefs=[];
{
  const CORAL_COLS=[0xff7f6a,0xff9d4d,0xd867a0,0x9a5ade,0x4dd0c1,0xf2e06a];
  const clearOf=(x,z)=>{
    for(const i of ISLANDS)  if(dist2(x,z,i.x,i.z)<(i.r+55)**2) return false;
    for(const h of HARBORS)  if(dist2(x,z,h.x,h.z)<((h.r||40)*2+70)**2) return false;
    for(const rf of reefs)   if(dist2(x,z,rf.x,rf.z)<130*130) return false;
    return true;
  };
  let tries=0;
  while(reefs.length<10 && tries++<300){
    const x=1150+Math.random()*1500, z=-700+Math.random()*3300;
    if(biomeAt(x,z)!=='tropisch' || !clearOf(x,z)) continue;
    const r=9+Math.random()*7;
    const g=new THREE.Group();
    // sandy shoal just under the surface
    const shoal=new THREE.Mesh(new THREE.SphereGeometry(r,20,12,0,Math.PI*2,0,Math.PI*0.5),
      new THREE.MeshStandardMaterial({color:0xd9c6a0,roughness:.95}));
    shoal.scale.y=0.25; shoal.position.y=-1.6; g.add(shoal);
    // coral heads poking through the water
    const n=9+Math.floor(Math.random()*5);
    for(let i=0;i<n;i++){
      const a=Math.random()*6.28, rr=Math.random()*r*0.8;
      const col=CORAL_COLS[Math.floor(Math.random()*CORAL_COLS.length)];
      const kind=Math.random();
      let m;
      if(kind<0.45){        // branching coral
        m=new THREE.Mesh(new THREE.ConeGeometry(0.6+Math.random()*0.5, 2.8+Math.random()*2.0, 5),
          new THREE.MeshStandardMaterial({color:col,roughness:.7,flatShading:true}));
      } else if(kind<0.75){ // brain coral
        m=new THREE.Mesh(new THREE.SphereGeometry(1.2+Math.random()*1.0, 8, 6),
          new THREE.MeshStandardMaterial({color:col,roughness:.85,flatShading:true}));
        m.scale.y=0.7;
      } else {              // fan coral
        m=new THREE.Mesh(new THREE.PlaneGeometry(2.4+Math.random()*1.2,1.9+Math.random()),
          new THREE.MeshStandardMaterial({color:col,roughness:.8,side:THREE.DoubleSide}));
        m.rotation.y=Math.random()*6.28;
      }
      // sit on top of the sand dome and poke clearly above the water
      const domeY=Math.sqrt(Math.max(0, r*r-rr*rr))*0.25 - 1.6;
      m.position.set(Math.cos(a)*rr, Math.max(0.4, domeY+0.6+Math.random()*0.8), Math.sin(a)*rr);
      m.rotation.z=(Math.random()-0.5)*0.4;
      g.add(m);
    }
    g.position.set(x,0,z);
    scene.add(g);
    reefs.push({x,z,r,group:g});
  }
}
let reefToastCd=0;

// feed island + harbour + reef discs to the water shader (turquoise shallows & surf)
{
  let li=0;
  for(const isl of ISLANDS){ if(li<LAND_MAX) oceanUniforms.uLand.value[li++].set(isl.x, isl.z, isl.r); }
  for(const c of harborCores){ if(li<LAND_MAX) oceanUniforms.uLand.value[li++].set(c.x, c.z, c.r); }
  for(const rf of reefs){ if(li<LAND_MAX) oceanUniforms.uLand.value[li++].set(rf.x, rf.z, rf.r*1.7); }
}

// ---- mussel beds (dynamic) ----
const beds = [];
const bedGeo = new THREE.IcosahedronGeometry(0.55,0);
// Bed kinds per sea: 'mossel' (everywhere), 'zalm' (swimming schools, IJszee),
// 'parel' (pearl oysters, tropics), 'inktvis' (squid swarms, mist zone, night only).
function spawnBed(x,z,opts={}){
  const g=new THREE.Group();
  const kind = opts.kind || 'mossel';
  const golden = kind==='mossel' && (opts.golden || Math.random()<0.04);
  if(kind==='zalm'){
    // a school of silvery fish that swims about
    for(let i=0;i<5;i++){
      const f=new THREE.Mesh(new THREE.ConeGeometry(0.5,2.4,6),
        new THREE.MeshStandardMaterial({color:0xc5d4de, roughness:.35, metalness:.5}));
      f.rotation.x=Math.PI/2;
      f.position.set((Math.random()-0.5)*6, -0.4-Math.random()*0.5, (Math.random()-0.5)*6);
      g.add(f);
    }
  } else if(kind==='parel'){
    // pale oyster shells with a soft pink sheen
    for(let i=0;i<5;i++){
      const m=new THREE.Mesh(bedGeo, new THREE.MeshStandardMaterial({
        color:0xf3e8e2, emissive:0xb96a8a, emissiveIntensity:.18, roughness:.35, metalness:.3, flatShading:true}));
      m.position.set((Math.random()-0.5)*4,0,(Math.random()-0.5)*4);
      m.scale.setScalar(0.7+Math.random()*0.6); g.add(m);
    }
  } else if(kind==='inktvis'){
    // glowing violet squid, hovering just under the surface
    for(let i=0;i<4;i++){
      const s=new THREE.Mesh(new THREE.ConeGeometry(0.8,2.6,7),
        new THREE.MeshStandardMaterial({color:0x8a5ad0, emissive:0x6a2aff, emissiveIntensity:.8,
          transparent:true, opacity:.9, roughness:.4}));
      s.position.set((Math.random()-0.5)*5, -0.8, (Math.random()-0.5)*5);
      g.add(s);
    }
  } else {
    const count = 8+Math.floor(Math.random()*8);
    for(let i=0;i<count;i++){
      const m=new THREE.Mesh(bedGeo, new THREE.MeshStandardMaterial({
        color: golden?0xffd34d:0x2a2a35, emissive: golden?0x6a4a00:0x000000,
        emissiveIntensity: golden?0.5:0, roughness:.7, metalness: golden?.5:.1, flatShading:true}));
      m.position.set((Math.random()-0.5)*5,0,(Math.random()-0.5)*5);
      m.scale.setScalar(0.6+Math.random()*0.8); g.add(m);
    }
  }
  g.position.set(x,-1.2,z);
  poiGroup.add(g);
  const amount = golden? 1+Math.floor(Math.random()*2)
    : kind==='parel'? 2+Math.floor(Math.random()*3)
    : kind==='zalm'? 8+Math.floor(Math.random()*8)
    : kind==='inktvis'? 4+Math.floor(Math.random()*4)
    : 6+Math.floor(Math.random()*10);
  const bed={ x,z, group:g, amount, kind, golden, growth:0, biome:biomeAt(x,z),
              heading:Math.random()*6.28 };
  beds.push(bed);
  return bed;
}
function biomeAt(x,z){
  // East/west must win over north so the NE/NW corners match the four seas
  // (and the map tints). Checking z first made Verre Rede and Schemerkade
  // spawn ice catch while paying tropical/mist prices.
  if(x > 1000) return 'tropisch';
  if(x < -1000) return 'mist';
  if(z < -850) return 'storm';
  return 'kust';
}
// pick a bed kind that suits the local sea
function bedKindFor(x,z){
  const bi=biomeAt(x,z), r=Math.random();
  if(bi==='storm')    return r<0.55 ? 'zalm'    : 'mossel';
  if(bi==='tropisch') return r<0.40 ? 'parel'   : 'mossel';
  if(bi==='mist')     return r<0.45 ? 'inktvis' : 'mossel';
  return 'mossel';
}
// initial beds scattered across the (now much bigger) ocean
function seedBeds(n){
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2, r=120+Math.random()*2600;
    const x=Math.cos(a)*r, z=Math.sin(a)*r;
    spawnBed(x,z,{kind:bedKindFor(x,z)});
  }
}
seedBeds(100);
// pearl oysters like the shelter of a reef
for(const rf of reefs){
  if(Math.random()<0.6){
    const a=Math.random()*6.28, d=rf.r+10+Math.random()*12;
    spawnBed(rf.x+Math.cos(a)*d, rf.z+Math.sin(a)*d, {kind:'parel'});
  }
}

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

// ============================================================================
//  5b. KRAKEN the giant octopus boss (lurks in the misty deep)
// ============================================================================
const KRAKEN_LAIR = { x:-2150, z:-1500 };   // far in the misty mystery zone
function buildTentacle(len, thick){
  const root=new THREE.Group();
  const segs=6, segLen=len/segs;
  const mat=new THREE.MeshStandardMaterial({color:0x7b3fb0, roughness:.55, metalness:.05,
    flatShading:true, emissive:0x2a0f4a, emissiveIntensity:.18});
  let parent=root; const chain=[];
  for(let i=0;i<segs;i++){
    const t0=i/segs, t1=(i+1)/segs;
    const r0=Math.max(thick*(1-t0*0.82),0.6), r1=Math.max(thick*(1-t1*0.82),0.4);
    const pivot=new THREE.Group();
    pivot.position.y = i===0?0:segLen;
    const m=new THREE.Mesh(new THREE.CylinderGeometry(r1,r0,segLen,7), mat);
    m.position.y=segLen/2; m.castShadow=true; pivot.add(m);
    // suckers on a couple of segments
    if(i>0 && i<5){ for(const sy of [0.3,0.6]){ const s=new THREE.Mesh(new THREE.SphereGeometry(r1*0.4,6,6),
      new THREE.MeshStandardMaterial({color:0xe6c9f5,roughness:.6})); s.position.set(0,segLen*sy,r0*0.7); pivot.add(s); } }
    parent.add(pivot); parent=pivot; chain.push(pivot);
  }
  root.userData.segs=chain; root.userData.phase=Math.random()*6.28; root.userData.baseCurl=0.12+Math.random()*0.08;
  return root;
}
const kraken = { group:new THREE.Group(), state:'lurking', hp:0, hpMax:120, surface:0,
  x:KRAKEN_LAIR.x, z:KRAKEN_LAIR.z, attackTimer:3, lootDropped:false, tentacles:[], known:false, lash:0 };
(function buildKraken(){
  const g=kraken.group;
  const bodyMat=new THREE.MeshStandardMaterial({color:0x7b3fb0, roughness:.5, metalness:.08,
    flatShading:true, emissive:0x2a0f4a, emissiveIntensity:.2});
  // mantle (head)
  const mantle=new THREE.Mesh(new THREE.SphereGeometry(20,20,16), bodyMat);
  mantle.scale.set(1,1.25,1.05); mantle.position.y=14; mantle.castShadow=true; g.add(mantle);
  const hood=new THREE.Mesh(new THREE.ConeGeometry(15,20,14), bodyMat);
  hood.position.y=30; g.add(hood);
  // belly highlight
  const belly=new THREE.Mesh(new THREE.SphereGeometry(14,16,12,0,Math.PI*2,0,Math.PI*0.6),
    new THREE.MeshStandardMaterial({color:0xa56fd6,roughness:.6,flatShading:true}));
  belly.position.set(0,10,7); belly.scale.set(1,1.1,0.6); g.add(belly);
  // bioluminescent spots
  for(let i=0;i<10;i++){ const a=Math.random()*6.28, rr=8+Math.random()*8;
    const c=[0x43c6ff,0x5bd97a][i%2];
    const sp=new THREE.Mesh(new THREE.SphereGeometry(0.9+Math.random(),8,8),
      new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:.9,roughness:.4}));
    sp.position.set(Math.cos(a)*rr,10+Math.random()*18,Math.sin(a)*rr*0.6+6); g.add(sp); }
  // eyes (front = local +Z, toward the ship)
  const eyeMat=new THREE.MeshStandardMaterial({color:0xffd34d,emissive:0xffb020,emissiveIntensity:1.2,roughness:.3});
  const pupilMat=new THREE.MeshStandardMaterial({color:0x1a0f2a,roughness:.4});
  kraken.eyes=[];
  for(const ex of [-7,7]){ const eye=new THREE.Mesh(new THREE.SphereGeometry(4.2,14,14),eyeMat);
    eye.position.set(ex,15,15.5); g.add(eye); kraken.eyes.push(eye);
    const pup=new THREE.Mesh(new THREE.SphereGeometry(1.7,10,10),pupilMat); pup.position.set(ex,15,19); g.add(pup); }
  // beak
  const beak=new THREE.Mesh(new THREE.ConeGeometry(3,5,6),new THREE.MeshStandardMaterial({color:0x201020,roughness:.6}));
  beak.position.set(0,4,10); beak.rotation.x=0.4; g.add(beak);
  // 8 tentacles around the base
  for(let i=0;i<8;i++){ const a=i/8*Math.PI*2;
    const tent=buildTentacle(34,4.4);
    tent.position.set(Math.cos(a)*15,2,Math.sin(a)*15);
    tent.rotation.y=a; tent.rotation.x=-0.35-Math.random()*0.2;
    g.add(tent); kraken.tentacles.push(tent);
  }
  g.position.set(kraken.x,-60,kraken.z); g.visible=false;
  scene.add(g);
})();

// ---- kraken combat ----
const harpoons=[]; let harpoonCd=0;
const harpoonGeo=new THREE.CylinderGeometry(0.18,0.05,7,6);
const harpoonMat=new THREE.MeshStandardMaterial({color:0xcfd6de,metalness:.7,roughness:.3,emissive:0x223,emissiveIntensity:.2});

function krakenActive(){ return kraken.state==='rising'||kraken.state==='fight'; }
function refreshHarpoonBtn(){ const b=$('abHarpoon'); if(b) b.style.display=W.hasHarpoon?'flex':'none'; }
function bossbarShow(v,title){ const b=$('bossbar'); if(b) b.style.display=v?'flex':'none';
  if(title){ const t=$('bossTitle'); if(t) t.textContent=title; } }
// nearest harpoon-able monster (kraken and/or sea serpent)
function activeTargets(){
  const list=[];
  if(krakenActive()) list.push({x:kraken.x, z:kraken.z, r:22, hit:krakenHit});
  if(serpent.state==='chase'||serpent.state==='fight') list.push({x:serpent.x, z:serpent.z, r:16, hit:serpentHit});
  if(crabActive()) list.push({x:crab.x, z:crab.z, r:30, hit:crabHit});
  return list;
}
let currentBoss=null; // whichever monster the boss bar is tracking
function bossbarUpdate(){
  const b=currentBoss||kraken;
  const hp=$('bossHp'); if(hp) hp.style.width=Math.max(0,b.hp/b.hpMax*100)+'%';
  const hu=$('hullFill'); if(hu) hu.style.width=Math.max(0,W.hull/W.hullMax*100)+'%';
}
function flashDamage(){ const f=$('dmgFlash'); if(!f) return; f.style.transition='none'; f.style.opacity='.55';
  requestAnimationFrame(()=>{ f.style.transition='opacity .5s'; f.style.opacity='0'; }); }

function beginKrakenFight(){
  kraken.state='rising'; kraken.known=true; kraken.lootDropped=false; currentBoss=kraken;
  kraken.hpMax = 90 + W.level*12; kraken.hp=kraken.hpMax;
  W.hull=W.hullMax; kraken.group.visible=true; kraken.attackTimer=3.2;
  bossbarShow(true,'🦑 De Kraken'); bossbarUpdate();
  toast('🦑 DE KRAKEN ONTWAAKT! Vuur je harpoen (🔱) en overleef!','bad');
  beep(120,.4,0.05); setTimeout(()=>beep(90,.5,0.05),260); setTimeout(()=>beep(70,.6,0.05),560);
}
function fireHarpoon(){
  if(!W.started||W.paused) return;
  if(!W.hasHarpoon){ toast('🔱 Je hebt nog geen harpoen koop er een op de Werf.','bad'); return; }
  const targets=activeTargets();
  if(!targets.length){ toast('🔱 Geen doelwit in zicht. Monsters schuilen in mist, storm en nacht…'); return; }
  if(harpoonCd>0) return;
  harpoonCd=0.6;
  // aim at the nearest active monster
  let tg=targets[0], bd=Infinity;
  for(const t of targets){ const d=dist2(t.x,t.z,shipState.x,shipState.z); if(d<bd){bd=d; tg=t;} }
  const sp=new THREE.Mesh(harpoonGeo,harpoonMat);
  sp.scale.setScalar(1 + W.ship*0.18);          // heavier ordnance on bigger ships
  const sx=shipState.x, sz=shipState.z, sy=ship.position.y+2.5;
  sp.position.set(sx,sy,sz);
  const dx=tg.x-sx, dz=tg.z-sz, d=Math.hypot(dx,dz)||1;
  sp.rotation.z=Math.PI/2; sp.rotation.y=Math.atan2(dx,dz);
  scene.add(sp);
  harpoons.push({mesh:sp, x:sx, z:sz, dx:dx/d, dz:dz/d, life:0});
  // muzzle flash on the captain's rifle
  const mz=shipMesh&&shipMesh.userData.muzzle;
  if(mz){ mz.visible=true; muzzleTimer=0.09; }
  beep(880,.05); setTimeout(()=>beep(520,.05),40);
}
function weaponDamage(){ return Math.round((11 + W.harvestLvl*2) * (1 + W.ship*0.22)); }
let muzzleTimer=0;
function updateHarpoons(dt){
  if(muzzleTimer>0){ muzzleTimer-=dt;
    if(muzzleTimer<=0 && shipMesh&&shipMesh.userData.muzzle) shipMesh.userData.muzzle.visible=false; }
  for(let i=harpoons.length-1;i>=0;i--){
    const h=harpoons[i]; h.life+=dt;
    h.x+=h.dx*150*dt; h.z+=h.dz*150*dt;
    h.mesh.position.set(h.x, ship.position.y+2.5, h.z);
    let struck=null;
    for(const t of activeTargets()){ if(dist2(h.x,h.z,t.x,t.z) < t.r*t.r){ struck=t; break; } }
    if(struck || h.life>2.2){
      if(struck) struck.hit(weaponDamage());
      scene.remove(h.mesh); harpoons.splice(i,1);
    }
  }
}
// captain steps onto the deck and tracks the nearest monster while a fight is on
function updateCaptainFigure(){
  const cap=shipMesh&&shipMesh.userData.captain;
  if(!cap) return;
  const targets=W.hasHarpoon?activeTargets():[];
  let tg=null, bd=400*400;   // only man the deck when a monster is within ~400
  for(const t of targets){ const d=dist2(t.x,t.z,shipState.x,shipState.z); if(d<bd){bd=d; tg=t;} }
  if(!tg){ cap.visible=false; return; }
  cap.visible=true;
  // world angle to target, converted into ship-local yaw (rifle points along local +z)
  cap.rotation.y = Math.atan2(tg.x-shipState.x, tg.z-shipState.z) - shipState.heading;
}
function krakenHit(dmg){
  if(!krakenActive()) return;
  kraken.hp-=dmg; kraken.lash=0.25;
  splash(kraken.x+(Math.random()-0.5)*24, kraken.z+(Math.random()-0.5)*24);
  beep(300,.06); bossbarUpdate();
  if(kraken.hp<=0) krakenDefeated();
}
function krakenAttack(){
  const d=Math.hypot(shipState.x-kraken.x, shipState.z-kraken.z);
  if(d<150){
    kraken.lash=0.4;
    damageHull(15+Math.floor(W.level*0.6));
    // knock the ship away from the kraken
    const nx=(shipState.x-kraken.x)/(d||1), nz=(shipState.z-kraken.z)/(d||1);
    shipState.x+=nx*10; shipState.z+=nz*10; shipState.speed*=0.4;
    splash(shipState.x,shipState.z); beep(140,.25,0.05);
    if(W.inv.mossel>0 && Math.random()<0.5){ const steal=Math.min(3,W.inv.mossel); W.inv.mossel-=steal;
      toast(`🦑 Een tentakel griste ${steal}× 🦪 mee!`,'bad'); }
  }
}
function damageHull(n){
  if(W.dead) return;
  W.hull=Math.max(0,W.hull-n); flashDamage(); bossbarUpdate(); updateHUD();
  if(W.hull<=0) sinkShip();
}
// ---- sinking: the run is over and the save is wiped ----
function sinkShip(){
  if(W.dead) return;
  W.dead=true; W.paused=true;
  bossbarShow(false); currentBoss=null;
  // end every fight so nothing keeps hitting a wreck
  if(krakenActive()) kraken.state='lurking';
  if(serpentActive()) serpent.state='roam';
  if(crabActive()){ crab.state='hidden'; crab.group.visible=false; }
  harvesting=false;
  beep(90,.6,0.06); setTimeout(()=>beep(70,.9,0.05),300);
  try{ localStorage.removeItem(SAVE_KEY); }catch(e){}   // progress is lost
  openModal(`<h2>🌊 Je schip is gezonken</h2>
    <div class="sub">De zee heeft je te pakken gekregen, Kapitein. Je voortgang is verloren.</div>
    <div class="grid">
      <div class="card2"><h3>Bereikt</h3><p>Dag ${W.day} · Niveau ${W.level}</p></div>
      <div class="card2"><h3>Verdiend</h3><p>${Math.floor(W.totalEarned)} 🪙 totaal</p></div>
      <div class="card2"><h3>Gevangen</h3><p>${W.totalCaught} mosselen</p></div>
      <div class="card2"><h3>Monsters</h3><p>${W.krakensSlain+W.serpentsSlain+W.crabsSlain} verslagen</p></div>
    </div>
    <div style="text-align:center;margin-top:18px"><button class="btn" onclick="window.__restart()">⚓ Opnieuw uitvaren</button></div>`);
}
window.__restart=()=>{ try{ localStorage.removeItem(SAVE_KEY); }catch(e){} location.reload(); };
function krakenDefeated(){
  kraken.state='dying'; kraken.lootDropped=false;
  const ink=4+Math.floor(W.level/3); W.inv.krakeninkt+=ink;
  const gold=1500+W.level*80; W.gold+=gold; W.totalEarned+=gold;
  W.krakensSlain++; W.krakenGoneUntilDay=W.day+4; gainFame(30,'Kraken verslagen');
  toast(`🏆 KRAKEN VERSLAGEN! +${ink}× 🖋️ krakeninkt, +${gold} 🪙 en dikke roem!`,'gold');
  gainXP(300); confettiBurst(kraken.x,kraken.z);
  beep(523,.14); setTimeout(()=>beep(659,.14),150); setTimeout(()=>beep(784,.2),320); setTimeout(()=>beep(1047,.3),520);
  bossbarShow(false); W.hull=W.hullMax; checkQuests(); updateHUD();
  if(typeof saveGame==='function') saveGame();
}
function updateKraken(dt){
  const t=oceanUniforms.uTime.value, sc=oceanUniforms.uWaveScale.value;
  if(harpoonCd>0) harpoonCd-=dt;
  updateHarpoons(dt);
  // respawn after enough days have passed
  if(kraken.state==='gone'){ if(W.day>=W.krakenGoneUntilDay){ kraken.state='lurking'; kraken.hp=kraken.hpMax;
    kraken.x=KRAKEN_LAIR.x; kraken.z=KRAKEN_LAIR.z; kraken.group.position.set(kraken.x,-60,kraken.z); } return; }
  // hull slowly self-repairs outside of any monster fight
  if(kraken.state!=='fight' && !serpentActive() && !crabActive() && W.hull<W.hullMax) W.hull=Math.min(W.hullMax, W.hull+dt*4);

  if(kraken.state==='lurking'){
    kraken.group.visible=false;
    const near = dist2(shipState.x,shipState.z,kraken.x,kraken.z) < 250*250;
    if(near) kraken.known=true;
    if(near && W.started && !W.paused && W.day>=W.krakenGoneUntilDay) beginKrakenFight();
    return;
  }
  kraken.group.visible=true;
  kraken.group.position.x=kraken.x; kraken.group.position.z=kraken.z;
  // face the ship
  const ang=Math.atan2(shipState.x-kraken.x, shipState.z-kraken.z);
  let ry=kraken.group.rotation.y;
  let diff=((ang-ry+Math.PI)%(Math.PI*2))-Math.PI;
  kraken.group.rotation.y = ry + diff*Math.min(1,dt*1.5);
  // animate tentacles
  if(kraken.lash>0) kraken.lash-=dt;
  for(const tent of kraken.tentacles){ const segs=tent.userData.segs;
    for(let i=0;i<segs.length;i++){ segs[i].rotation.x = tent.userData.baseCurl
      + Math.sin(t*1.7+tent.userData.phase+i*0.7)*0.16
      + (kraken.lash>0? Math.sin(t*10+i)*0.25*kraken.lash : 0); } }
  // eye pulse
  const ep=1.0+Math.sin(t*4)*0.5; for(const e of kraken.eyes) e.material.emissiveIntensity=ep;

  const bob=waveHeight(kraken.x,kraken.z,t,sc);
  if(kraken.state==='rising'){
    kraken.surface=Math.min(1,kraken.surface+dt*0.6);
    kraken.group.position.y=-55+kraken.surface*55+bob;
    if(kraken.surface>=1){ kraken.state='fight'; kraken.attackTimer=2.4; }
  } else if(kraken.state==='fight'){
    kraken.group.position.y=bob;
    // disengage if the player flees far away
    if(dist2(shipState.x,shipState.z,kraken.x,kraken.z) > 620*620){
      kraken.state='lurking'; kraken.hp=kraken.hpMax; W.hull=W.hullMax; bossbarShow(false);
      kraken.x=KRAKEN_LAIR.x; kraken.z=KRAKEN_LAIR.z; kraken.group.position.set(kraken.x,-60,kraken.z);
      toast('🌫️ De Kraken zakt terug in de diepte…'); return;
    }
    // pursue the ship so it can strike (player must keep moving)
    const dxs=shipState.x-kraken.x, dzs=shipState.z-kraken.z, ds=Math.hypot(dxs,dzs)||1;
    if(ds>70){ const spd=15; kraken.x+=dxs/ds*spd*dt; kraken.z+=dzs/ds*spd*dt; }
    kraken.attackTimer-=dt;
    if(kraken.attackTimer<=0){ krakenAttack(); kraken.attackTimer=3.2+Math.random()*1.4; }
  } else if(kraken.state==='dying'){
    kraken.surface=Math.max(0,kraken.surface-dt*0.5);
    kraken.group.rotation.y+=dt*2.4;
    kraken.group.position.y-=dt*14;
    for(const e of kraken.eyes) e.material.emissiveIntensity*=0.94;
    if(kraken.group.position.y<-70){ kraken.state='gone'; kraken.group.visible=false; }
  }
}

// ============================================================================
//  5c. ZEESLANG serpent that hunts the stormy north
// ============================================================================
const SERPENT_HOME = { x:0, z:-1800 };
const serpent = { group:new THREE.Group(), segs:[], state:'roam', hp:70, hpMax:70,
  x:SERPENT_HOME.x, z:SERPENT_HOME.z, heading:0, wander:0, attackTimer:2.5, known:false, sink:0 };
(function buildSerpent(){
  const g=serpent.group;
  const mat=new THREE.MeshStandardMaterial({color:0x2fa88a, roughness:.5, metalness:.1,
    flatShading:true, emissive:0x0a3a2e, emissiveIntensity:.25});
  const bellyMat=new THREE.MeshStandardMaterial({color:0x9fe8c8, roughness:.7, flatShading:true});
  const finMat=new THREE.MeshStandardMaterial({color:0xff9d4d, roughness:.6, flatShading:true, side:THREE.DoubleSide});
  // head
  const head=new THREE.Group();
  const skull=new THREE.Mesh(new THREE.SphereGeometry(5,12,10), mat); skull.scale.set(1,0.9,1.4); head.add(skull);
  const jaw=new THREE.Mesh(new THREE.ConeGeometry(3.2,7,8), mat); jaw.rotation.x=Math.PI/2; jaw.position.set(0,-1,5.4); head.add(jaw);
  for(const ex of [-2.2,2.2]){ const eye=new THREE.Mesh(new THREE.SphereGeometry(1.2,10,10),
    new THREE.MeshStandardMaterial({color:0xffd34d,emissive:0xffb020,emissiveIntensity:1.1}));
    eye.position.set(ex,1.6,2.6); head.add(eye); }
  for(const hx of [-1.6,1.6]){ const horn=new THREE.Mesh(new THREE.ConeGeometry(0.8,4,6),
    new THREE.MeshStandardMaterial({color:0xf0e6c8,roughness:.8}));
    horn.position.set(hx,4,-0.5); horn.rotation.x=-0.3; head.add(horn); }
  g.add(head); serpent.head=head; serpent.segs.push({obj:head, x:serpent.x, z:serpent.z, y:0});
  // body segments with dorsal fins
  const N=9;
  for(let i=1;i<=N;i++){
    const r=4.2*(1-i/(N+2));
    const seg=new THREE.Group();
    const body=new THREE.Mesh(new THREE.SphereGeometry(Math.max(r,1),10,8), mat); seg.add(body);
    const belly=new THREE.Mesh(new THREE.SphereGeometry(Math.max(r*0.75,0.7),8,6), bellyMat);
    belly.position.y=-r*0.35; seg.add(belly);
    if(i<N-1){ const fin=new THREE.Mesh(new THREE.ConeGeometry(r*0.5,r*1.4,4), finMat);
      fin.position.y=r*1.1; seg.add(fin); }
    if(i===N){ const tail=new THREE.Mesh(new THREE.ConeGeometry(r*1.6,r*3,4), finMat);
      tail.rotation.x=Math.PI/2; tail.position.z=-r*2; seg.add(tail); }
    g.add(seg);
    serpent.segs.push({obj:seg, x:serpent.x, z:serpent.z-i*9, y:0});
  }
  g.visible=false; scene.add(g);
})();

function serpentActive(){ return serpent.state==='chase'||serpent.state==='fight'; }
function serpentHit(dmg){
  if(serpent.state==='gone'||serpent.state==='dying') return;
  serpent.hp-=dmg;
  splash(serpent.x+(Math.random()-0.5)*14, serpent.z+(Math.random()-0.5)*14);
  beep(340,.06); bossbarUpdate();
  if(serpent.hp<=0) serpentDefeated();
}
function serpentDefeated(){
  serpent.state='dying'; serpent.sink=0;
  const scales=3+Math.floor(W.level/4); W.inv.schub+=scales;
  const gold=900+W.level*50; W.gold+=gold; W.totalEarned+=gold;
  W.serpentsSlain++; W.serpentGoneUntilDay=W.day+3; gainFame(25,'Zeeslang verslagen');
  toast(`🏆 ZEESLANG VERSLAGEN! +${scales}× 🐲 schubben en +${gold} 🪙!`,'gold');
  gainXP(200); confettiBurst(serpent.x,serpent.z);
  beep(523,.12); setTimeout(()=>beep(659,.12),140); setTimeout(()=>beep(880,.2),300);
  bossbarShow(false); W.hull=W.hullMax; checkQuests(); updateHUD();
  if(typeof saveGame==='function') saveGame();
}
function updateSerpent(dt){
  const t=oceanUniforms.uTime.value, sc=oceanUniforms.uWaveScale.value;
  if(serpent.state==='gone'){
    if(W.day>=W.serpentGoneUntilDay){ serpent.state='roam'; serpent.hp=serpent.hpMax=70+W.level*8;
      serpent.x=SERPENT_HOME.x; serpent.z=SERPENT_HOME.z;
      for(const s of serpent.segs){ s.x=serpent.x; s.z=serpent.z; } }
    return;
  }
  serpent.group.visible = W.started;
  if(serpent.state==='roam'){
    // wander the storm biome
    serpent.wander+=dt;
    serpent.heading += Math.sin(serpent.wander*0.35)*0.5*dt;
    const spd=14;
    serpent.x += Math.sin(serpent.heading)*spd*dt;
    serpent.z += Math.cos(serpent.heading)*spd*dt;
    // stay inside the storm zone
    if(serpent.z>-1000) serpent.heading=Math.PI+((Math.random()-0.5)*0.6), serpent.z=-1000;
    if(serpent.z<-2700) serpent.z=-2700, serpent.heading=(Math.random()-0.5)*0.6;
    if(serpent.x>1000) serpent.x=1000, serpent.heading=-Math.PI/2;     // stay out of the Parelzee corner
    if(serpent.x<-1000) serpent.x=-1000, serpent.heading=Math.PI/2;    // and out of the Schemerzee corner
    // spot the player
    const d2=dist2(shipState.x,shipState.z,serpent.x,serpent.z);
    if(d2<90*90) serpent.known=true;
    if(d2<240*240 && W.started && !W.paused){
      serpent.state='chase'; serpent.known=true; currentBoss=serpent; W.hull=W.hullMax;
      bossbarShow(true,'🐉 De Zeeslang'); bossbarUpdate();
      toast('🐉 DE ZEESLANG heeft je gezien! Vlucht of vecht (🔱)!','bad');
      beep(160,.3,0.05); setTimeout(()=>beep(120,.4,0.05),200);
    }
  } else if(serpent.state==='chase'){
    const dx=shipState.x-serpent.x, dz=shipState.z-serpent.z, d=Math.hypot(dx,dz)||1;
    serpent.heading=Math.atan2(dx,dz);
    const spd = 26; // fast outrun it with a quick boat or fight
    if(d>26){ serpent.x+=dx/d*spd*dt; serpent.z+=dz/d*spd*dt; }
    serpent.attackTimer-=dt;
    if(serpent.attackTimer<=0 && d<42){
      serpent.attackTimer=2.8+Math.random();
      damageHull(10+Math.floor(W.level*0.5));
      const nx=dx/d, nz=dz/d;
      shipState.x+=nx*8; shipState.z+=nz*8; shipState.speed*=0.5;
      splash(shipState.x,shipState.z); beep(150,.2,0.05);
      toast('🐉 De zeeslang ramt je schip!','bad');
    }
    // escaped?
    if(d>600){ serpent.state='roam'; serpent.hp=serpent.hpMax; W.hull=W.hullMax; bossbarShow(false);
      toast('🌊 De zeeslang geeft de jacht op…'); }
  } else if(serpent.state==='dying'){
    serpent.sink+=dt;
    if(serpent.sink>3){ serpent.state='gone'; serpent.group.visible=false; return; }
  }
  // ---- chain: each segment trails the one before it ----
  const segs=serpent.segs, spacing=9;
  segs[0].x=serpent.x; segs[0].z=serpent.z;
  for(let i=1;i<segs.length;i++){
    const p=segs[i-1], s=segs[i];
    const dx=s.x-p.x, dz=s.z-p.z, d=Math.hypot(dx,dz)||1;
    s.x=p.x+dx/d*spacing; s.z=p.z+dz/d*spacing;
  }
  // undulate over/under the surface; sink when dying
  const sinkY = serpent.state==='dying' ? -serpent.sink*8 : 0;
  for(let i=0;i<segs.length;i++){
    const s=segs[i];
    const wave = Math.sin(t*2.2 - i*0.85)*3.2;
    const y = waveHeight(s.x,s.z,t,sc) + wave + (i===0?2.5:0) + sinkY;
    s.obj.position.set(s.x, y, s.z);
    if(i<segs.length-1){ const n=segs[i+1]; s.obj.lookAt(n.obj.position.x, y, n.obj.position.z); s.obj.rotateY(Math.PI); }
  }
}

// ============================================================================
//  5d. SPOOKSCHIP a ghostly ship that drifts through the night
// ============================================================================
const ghost = { group:new THREE.Group(), state:'hidden', x:0, z:0, heading:0, fade:0, spawnedNight:false };
(function buildGhost(){
  const g=ghost.group;
  const mat=new THREE.MeshStandardMaterial({color:0x9fffcf, transparent:true, opacity:0.4,
    roughness:.3, emissive:0x2fae7a, emissiveIntensity:.7, depthWrite:false});
  const sailMat=new THREE.MeshStandardMaterial({color:0xcfffe8, transparent:true, opacity:0.28,
    emissive:0x3fdF9a, emissiveIntensity:.5, side:THREE.DoubleSide, depthWrite:false});
  ghost.mats=[mat,sailMat];
  // hull
  const hull=new THREE.Mesh(new THREE.BoxGeometry(6,3,20), mat);
  hull.position.y=1.5; g.add(hull);
  const bow=new THREE.Mesh(new THREE.ConeGeometry(3,6,4), mat); bow.rotation.x=Math.PI/2; bow.rotation.y=Math.PI/4; bow.position.set(0,1.5,12); g.add(bow);
  // masts + tattered sails
  for(const mz of [-5,3]){
    const mast=new THREE.Mesh(new THREE.CylinderGeometry(0.25,0.3,16,6), mat);
    mast.position.set(0,10,mz); g.add(mast);
    const sail=new THREE.Mesh(new THREE.PlaneGeometry(7,8,4,4), sailMat);
    // ragged bottom edge
    const p=sail.geometry.attributes.position;
    for(let i=0;i<p.count;i++){ if(p.getY(i)<-3) p.setY(i, -3-Math.random()*1.6); }
    sail.geometry.computeVertexNormals();
    sail.position.set(0,10,mz-0.6); g.add(sail);
  }
  // eerie lantern
  const lamp=new THREE.Mesh(new THREE.SphereGeometry(0.9,8,8),
    new THREE.MeshStandardMaterial({color:0xbaffdf,emissive:0x6fffc0,emissiveIntensity:2}));
  lamp.position.set(0,4.5,-9); g.add(lamp); ghost.lamp=lamp;
  g.visible=false; scene.add(g);
})();

function isNight(){ return W.time>=DUSK || W.time<DAWN; }   // matches the sun's arc
function nearbyGhost(){ return (ghost.state==='sailing' && ghost.fade>0.5 &&
  dist2(ghost.x,ghost.z,shipState.x,shipState.z)<45*45) ? ghost : null; }
function lootGhost(){
  const g=250+W.level*40+Math.floor(Math.random()*200);
  W.gold+=g; W.totalEarned+=g; W.ghostsLooted++; gainFame(5,'spookschip');
  if(Math.random()<0.3){
    W.buffs.spookvloek=50;
    toast(`👻 Spookgoud: +${g} 🪙 … maar een VLOEK grijpt je schip! (traag tot hij wegebt)`,'bad');
    beep(110,.5,0.05);
  } else {
    toast(`👻 Je plundert het spookschip: +${g} 🪙 spookgoud!`,'gold');
    beep(660,.1); setTimeout(()=>beep(880,.12),120);
  }
  gainXP(80); confettiBurst(ghost.x,ghost.z);
  ghost.state='hidden'; ghost.group.visible=false;
  checkQuests(); updateHUD();
}
function applyGhostFade(){
  for(const m of ghost.mats) m.opacity=(m===ghost.mats[0]?0.4:0.28)*ghost.fade;
  if(ghost.lamp) ghost.lamp.material.emissiveIntensity=2*ghost.fade*(1+Math.sin(oceanUniforms.uTime.value*3)*0.3);
}
function ghostDrift(dt){
  const t=oceanUniforms.uTime.value, sc=oceanUniforms.uWaveScale.value;
  ghost.heading+=Math.sin(t*0.2)*0.15*dt;
  ghost.x+=Math.sin(ghost.heading)*6*dt; ghost.z+=Math.cos(ghost.heading)*6*dt;
  ghost.group.position.set(ghost.x, waveHeight(ghost.x,ghost.z,t,sc), ghost.z);
  ghost.group.rotation.y=ghost.heading;
}
function updateGhost(dt){
  if(!isNight()){
    ghost.spawnedNight=false;
    if(ghost.state==='sailing'){       // dawn: fade away
      ghost.fade-=dt*0.4;
      if(ghost.fade<=0){ ghost.state='hidden'; ghost.group.visible=false; return; }
      applyGhostFade(); ghostDrift(dt);
    }
    return;
  }
  // night: spawn once per night, somewhere off in the dark
  if(ghost.state==='hidden' && !ghost.spawnedNight && W.started){
    ghost.spawnedNight=true;
    const a=Math.random()*6.28, r=380+Math.random()*260;
    ghost.x=shipState.x+Math.cos(a)*r; ghost.z=shipState.z+Math.sin(a)*r;
    const lim=2800; ghost.x=Math.max(-lim,Math.min(lim,ghost.x)); ghost.z=Math.max(-lim,Math.min(lim,ghost.z));
    ghost.heading=Math.random()*6.28; ghost.fade=0; ghost.state='sailing'; ghost.group.visible=true;
    toast('👻 Een bleek schijnsel glijdt over het water… een spookschip!','gold');
  }
  if(ghost.state==='sailing'){
    ghost.fade=Math.min(1,ghost.fade+dt*0.3);
    applyGhostFade(); ghostDrift(dt);
  }
}

// ============================================================================
//  5e. REUZENKRAB a colossal crab that lays siege to a harbour
// ============================================================================
const crab = { group:new THREE.Group(), state:'hidden', x:0, z:0, harbor:null,
  hp:150, hpMax:150, attackTimer:3, strafe:0, anchor:{x:0,z:0}, sink:0, claws:[], clawAnim:0 };
(function buildCrab(){
  const g=crab.group;
  const shellMat=new THREE.MeshStandardMaterial({color:0xd6452e, roughness:.55, flatShading:true});
  const darkMat =new THREE.MeshStandardMaterial({color:0x8a2a1a, roughness:.7, flatShading:true});
  const toothMat=new THREE.MeshStandardMaterial({color:0xf0e6d0, roughness:.8, flatShading:true});
  // body shell (broad, flattened, spiky ridge)
  const body=new THREE.Mesh(new THREE.DodecahedronGeometry(16,1), shellMat);
  body.scale.set(1.5,0.85,1.1); body.position.y=14; body.castShadow=true; g.add(body);
  const belly=new THREE.Mesh(new THREE.SphereGeometry(13,12,10), darkMat);
  belly.scale.set(1.5,0.7,1.05); belly.position.y=10; g.add(belly);
  for(let i=0;i<5;i++){ const spike=new THREE.Mesh(new THREE.ConeGeometry(2.2,6,5), darkMat);
    spike.position.set(-12+i*6, 25, -2+Math.sin(i)*3); spike.rotation.z=(Math.random()-0.5)*0.4; g.add(spike); }
  // eyes on stalks
  for(const ex of [-6,6]){
    const stalk=new THREE.Mesh(new THREE.CylinderGeometry(0.9,1.2,7,6), darkMat);
    stalk.position.set(ex,24,10); stalk.rotation.x=0.35; g.add(stalk);
    const eye=new THREE.Mesh(new THREE.SphereGeometry(2.6,10,10),
      new THREE.MeshStandardMaterial({color:0x14181f, roughness:.25, metalness:.4,
        emissive:0x330000, emissiveIntensity:.6}));
    eye.position.set(ex,28,12); g.add(eye);
  }
  // toothy mouth plates
  for(let i=0;i<6;i++){ const th=new THREE.Mesh(new THREE.ConeGeometry(1.5,3.6,4), toothMat);
    th.position.set(-7+i*2.8, 11.5, 13.5); th.rotation.x=Math.PI; g.add(th); }
  // giant claws (left/right groups so they can snap)
  for(const side of [-1,1]){
    const cl=new THREE.Group();
    const arm=new THREE.Mesh(new THREE.CylinderGeometry(2.6,3.4,14,7), shellMat);
    arm.rotation.z=side*1.1; arm.position.set(side*8,0,2); cl.add(arm);
    const hand=new THREE.Mesh(new THREE.SphereGeometry(7.5,10,8), shellMat);
    hand.scale.set(1.25,0.95,1.5); hand.position.set(side*15,-2,6); cl.add(hand);
    const pincerT=new THREE.Mesh(new THREE.ConeGeometry(3.4,10,6), shellMat);
    pincerT.rotation.x=Math.PI/2; pincerT.position.set(side*15,1.5,14); cl.add(pincerT);
    const pincerB=new THREE.Mesh(new THREE.ConeGeometry(2.6,8,6), darkMat);
    pincerB.rotation.x=Math.PI/2; pincerB.position.set(side*15,-4,13); cl.add(pincerB);
    cl.position.set(side*14,14,8);
    g.add(cl); crab.claws.push(cl);
  }
  // six legs
  for(const side of [-1,1]) for(let i=0;i<3;i++){
    const leg=new THREE.Mesh(new THREE.CylinderGeometry(1.3,0.6,18,6), shellMat);
    leg.position.set(side*20, 8, -8+i*7);
    leg.rotation.z=side*0.9; leg.rotation.x=(i-1)*0.2; g.add(leg);
    const foot=new THREE.Mesh(new THREE.ConeGeometry(1.1,6,5), darkMat);
    foot.position.set(side*27, 0.5, -8+i*7); foot.rotation.z=side*0.5; g.add(foot);
  }
  g.visible=false; scene.add(g);
})();

function crabActive(){ return crab.state==='siege'; }
function crabHit(dmg){
  if(!crabActive()) return;
  crab.hp-=dmg; crab.clawAnim=0.3;
  splash(crab.x+(Math.random()-0.5)*30, crab.z+(Math.random()-0.5)*30);
  beep(260,.06); bossbarUpdate();
  if(crab.hp<=0) crabDefeated();
}
function crabDefeated(){
  crab.state='dying'; crab.sink=0;
  const claws=2+Math.floor(W.level/5); W.inv.schaar+=claws;
  const gold=1200+W.level*60; W.gold+=gold; W.totalEarned+=gold;
  W.crabsSlain++; W.crabNextDay=W.day+3+Math.floor(Math.random()*2); gainFame(25,'haven gered');
  toast(`🏆 REUZENKRAB VERSLAGEN! ${crab.harbor?crab.harbor.name+' is gered ':''}+${claws}× 🦀 scharen en +${gold} 🪙!`,'gold');
  gainXP(250); confettiBurst(crab.x,crab.z);
  beep(523,.12); setTimeout(()=>beep(659,.12),140); setTimeout(()=>beep(880,.2),300);
  bossbarShow(false); W.hull=W.hullMax; checkQuests(); updateHUD();
  if(typeof saveGame==='function') saveGame();
}
function beginCrabSiege(){
  // the crab rises beside a random harbour's berth
  const h=harborMarkers[Math.floor(Math.random()*harborMarkers.length)];
  crab.harbor=h;
  const toCenter=Math.atan2(-h.x,-h.z);   // pier points toward map centre
  const dist=(h.r||40)*1.9+30;
  crab.anchor.x=h.x+Math.sin(toCenter)*dist;
  crab.anchor.z=h.z+Math.cos(toCenter)*dist;
  crab.x=crab.anchor.x; crab.z=crab.anchor.z;
  crab.hp=crab.hpMax=150+W.level*15;
  crab.state='siege'; crab.group.visible=true; crab.strafe=Math.random()*6.28;
  toast(`🦀 ALARM! Een REUZENKRAB valt ${h.name} aan! Jaag hem weg met je harpoen!`,'bad');
  beep(180,.3,0.05); setTimeout(()=>beep(140,.4,0.05),250);
}
function updateCrab(dt){
  const t=oceanUniforms.uTime.value, sc=oceanUniforms.uWaveScale.value;
  if(crab.state==='hidden'){
    if(W.started && W.hasHarpoon && W.day>=W.crabNextDay) beginCrabSiege();
    return;
  }
  if(crab.state==='dying'){
    crab.sink+=dt;
    crab.group.position.y=waveHeight(crab.x,crab.z,t,sc)-6-crab.sink*10;
    crab.group.rotation.z+=dt*0.3;
    if(crab.sink>3.5){ crab.state='hidden'; crab.group.visible=false; crab.group.rotation.z=0; }
    return;
  }
  // siege: sidestep around the anchor point, claws snapping
  crab.strafe+=dt*0.25;
  // sidestep around the harbour, but stalk toward the player when they come close
  const pd=Math.hypot(shipState.x-crab.x, shipState.z-crab.z);
  if(pd<200){
    const px=crab.anchor.x+(shipState.x-crab.anchor.x)*0.55;
    const pz=crab.anchor.z+(shipState.z-crab.anchor.z)*0.55;
    crab.anchor.x+=(px-crab.anchor.x)*Math.min(1,dt*0.35);
    crab.anchor.z+=(pz-crab.anchor.z)*Math.min(1,dt*0.35);
  }
  crab.x=crab.anchor.x+Math.cos(crab.strafe)*22;
  crab.z=crab.anchor.z+Math.sin(crab.strafe)*22;
  crab.group.position.set(crab.x, waveHeight(crab.x,crab.z,t,sc)-6+Math.sin(t*1.4)*1.2, crab.z);
  crab.group.rotation.y=Math.atan2(shipState.x-crab.x, shipState.z-crab.z); // face the player
  // claw snap animation
  crab.clawAnim=Math.max(0,crab.clawAnim-dt);
  for(let i=0;i<crab.claws.length;i++){
    const cl=crab.claws[i];
    const snap=crab.clawAnim>0 ? Math.sin(crab.clawAnim*20)*0.5 : Math.sin(t*2+i*2.5)*0.15;
    cl.rotation.x=-0.2+snap;
  }
  const d=Math.hypot(shipState.x-crab.x, shipState.z-crab.z);
  // engage the boss bar when the player is near
  if(d<220 && currentBoss!==crab && !krakenActive() && !serpentActive()){
    currentBoss=crab; bossbarShow(true,'🦀 De Reuzenkrab'); bossbarUpdate();
  } else if(d>320 && currentBoss===crab){
    currentBoss=null; bossbarShow(false);
  }
  // claw slam on ships that come too close
  crab.attackTimer-=dt;
  if(crab.attackTimer<=0 && d<85){
    crab.attackTimer=2.4+Math.random();
    crab.clawAnim=0.35;
    const nx=(shipState.x-crab.x)/(d||1), nz=(shipState.z-crab.z)/(d||1);
    shipState.x+=nx*12; shipState.z+=nz*12; shipState.speed*=0.4;
    splash(shipState.x,shipState.z); beep(120,.25,0.06);
    toast('🦀 KLAUWSLAG! De reuzenkrab beukt je romp!','bad');
    damageHull(14+Math.floor(W.level*0.5));   // may sink the ship
  }
}

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
mark('besturing');
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
  if(k==='h') fireHarpoon();
  if(k==='p') togglePause();
  if(k==='n') toggleMusic();
  // Esc: close whatever is open, otherwise pause the game
  if(k==='escape' && !W.dead){
    if($('overlay').style.display==='flex'){ if(mapOpen) window.__closemap(); else closeModal(); }
    else togglePause();
  }
});
addEventListener('keyup',e=>{ keys[e.key.toLowerCase()]=false; });
addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
  fitComposer();
});

let camMode=0; // 0 chase, 1 close, 2 high
function cycleCamera(){ camMode=(camMode+1)%3; toast('📷 Camera: '+['Volgcamera','Dichtbij','Vogelvlucht'][camMode]); }

// ---- free-look: drag a finger (or mouse) over the water to orbit the camera ----
const camLook = { yaw:0, pitch:0, active:false };
const clampN = (v,a,b)=>Math.max(a,Math.min(b,v));
function setupLook(){
  const surf = document.getElementById('game');
  if(!surf) return;
  let id=null, lx=0, ly=0;
  const onUI = t => t && t.closest && t.closest('#joy,.abtn,.ubtn,#utilbtns,#prompt,.stat,#sonarWrap,#questBox,#overlay,#title,#controls');
  surf.addEventListener('pointerdown', e=>{
    if(id!==null || onUI(e.target) || W.paused || !W.started) return;
    id=e.pointerId; lx=e.clientX; ly=e.clientY; camLook.active=true;
    try{ surf.setPointerCapture(e.pointerId); }catch(_){}
  });
  surf.addEventListener('pointermove', e=>{
    if(e.pointerId!==id) return;
    const dx=e.clientX-lx, dy=e.clientY-ly; lx=e.clientX; ly=e.clientY;
    camLook.yaw   = clampN(camLook.yaw   - dx*0.006, -2.7, 2.7);
    camLook.pitch = clampN(camLook.pitch - dy*0.004, -0.30, 1.15);
  });
  const end=e=>{ if(e.pointerId===id){ id=null; camLook.active=false; } };
  surf.addEventListener('pointerup', end);
  surf.addEventListener('pointercancel', end);
  surf.addEventListener('pointerleave', end);
}

// ---------- TOUCH CONTROLS ----------
const touchCtrl = { active:false, throttle:0, turn:0, boost:false };
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
  const boostBtn=document.getElementById('abBoost');
  if(boostBtn) hold(boostBtn, ()=>{ touchCtrl.boost=true; }, ()=>{ touchCtrl.boost=false; });
  tap(document.getElementById('abSonar'), sonarPing);
  tap(document.getElementById('abAct'), tryInteract);
  tap(document.getElementById('abHarpoon'), fireHarpoon);
  // util buttons
  tap(document.getElementById('ubMap'), toggleMap);
  tap(document.getElementById('ubUpg'), ()=>openHarbor(nearestHarbor(),'upgrades'));
  tap(document.getElementById('ubCam'), cycleCamera);
  tap(document.getElementById('ubGull'), sendSeagull);
  tap(document.getElementById('ubMusic'), toggleMusic);
  tap(document.getElementById('ubPause'), togglePause);

  // block page scroll/zoom gestures on the game canvas
  document.addEventListener('touchmove', e=>{ if(e.target.closest('#modal')) return; e.preventDefault(); }, {passive:false});
  document.addEventListener('gesturestart', e=>e.preventDefault());

  // orientation hint
  function checkOrient(){ document.body.classList.toggle('portrait', innerHeight>innerWidth); }
  addEventListener('resize',checkOrient); addEventListener('orientationchange',checkOrient); checkOrient();
}

// ============================================================================
//  7. GAME LOOP HELPERS sonar, harvest, interact
// ============================================================================
let harvesting=false, harvestTimer=0, harvestTarget=null;
let sonarPulse=-1;

// A ping lights beds up only temporarily: the echo fades, so you have to ping again.
const PING_HOLD = 40;                                   // seconds a contact stays on the scope
function sonarNow(){ return oceanUniforms.uTime.value; }
function bedVisible(b){ return b.charted || sonarNow() < (b.pingUntil||0); }
function sonarPing(){
  sonarPulse=0;
  const range = 220 + W.sonarLvl*120;
  let found=0;
  for(const b of beds){
    if(dist2(b.x,b.z,shipState.x,shipState.z) < range*range){ b.pingUntil = sonarNow()+PING_HOLD; found++; }
  }
  toast(found>0? `📡 Sonar: ${found} mosselbank(en) in bereik!` : '📡 Sonar: niets in de buurt…','good');
  beep(660,0.08); setTimeout(()=>beep(880,0.08),90);
}

function bedActive(b){ return b.kind!=='inktvis' || isNight(); }  // squid only surface at night
function bedColor(b){
  if(b.golden) return '#ffd34d';
  return b.kind==='zalm'?'#cfe0ec' : b.kind==='parel'?'#ffb6d9' : b.kind==='inktvis'?'#b06bff' : '#5bd97a';
}
function bedName(b){
  if(b.golden) return '🌟 Gouden mosselbank!';
  return b.kind==='zalm'?'🐟 Zalmschool' : b.kind==='parel'?'✨ Pareloesterbank'
       : b.kind==='inktvis'?'🦑 Inktviszwerm' : '🦪 Mosselbank';
}
function nearestBed(maxD=14){
  let best=null,bd=maxD*maxD;
  for(const b of beds){ if(b.amount<=0 || !bedActive(b)) continue; const d=dist2(b.x,b.z,shipState.x,shipState.z); if(d<bd){bd=d;best=b;} }
  return best;
}
function nearestHarbor(extra=36){
  // dock when near the berth scales with each harbour's size & pier reach
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

function holdCount(){ return W.inv.mossel + W.inv.goudmossel + W.inv.zalm + W.inv.parel + W.inv.inktvis; }

function tryInteract(){
  if(W.paused) return;
  const gh=nearbyGhost(); if(gh){ lootGhost(); return; }
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
  // pearls come up slowly, squid and salmon a bit under mussel pace
  const kindRate = b.kind==='parel'?0.45 : b.kind==='inktvis'?0.7 : b.kind==='zalm'?0.85 : 1;
  const rate = (0.9 + W.harvestLvl*0.5) * (1 + (W.skills.visserij-1)*0.12) * kindRate;
  harvestTimer += dt*rate;
  if(harvestTimer>=1){
    harvestTimer-=1; b.amount--;
    if(b.golden){ W.inv.goudmossel++; W.totalGold++; goldenMusselPower(); }
    else if(b.kind==='zalm'){ W.inv.zalm++; W.totalZalm++; }
    else if(b.kind==='parel'){ W.inv.parel++; W.totalParel++; }
    else if(b.kind==='inktvis'){ W.inv.inktvis++; W.totalInktvis++; }
    else W.inv.mossel++;
    W.totalCaught++;
    gainSkill('visserij', b.golden?6 : b.kind==='parel'?4 : 1.4);
    splash(b.x,b.z);
    if(b.amount<=0){ poiGroup.remove(b.group); beds.splice(beds.indexOf(b),1);
      // respawn a new bed elsewhere, matched to whatever sea it lands in
      const a=Math.random()*6.28,r=200+Math.random()*2600;
      const nx=Math.cos(a)*r, nz=Math.sin(a)*r;
      spawnBed(nx,nz,{kind:bedKindFor(nx,nz)});
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
    W.gold += loot; W.treasures++; gainFame(6,'schat');
    if(isl.group.userData.gold) isl.group.userData.gold.visible=false;
    if(isl.group.userData.chest) isl.group.userData.chest.material.color.set(0x5a3a1a);
    toast(`🏴‍☠️ Schatkist op ${isl.name}! +${loot} 🪙`,'gold');
    gainXP(60); checkQuests(); updateHUD(); confettiBurst(isl.x,isl.z);
  } else {
    toast(`🏝️ ${isl.name} een mooi plekje, maar geen schat (meer).`);
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
  toast(`📜 Flessenpost! "${m.t}" Vindersloon +${Math.floor(reward*0.4)} 🪙`,'gold');
  gainXP(30); updateHUD();
  setTimeout(spawnBottle, 8000);
}
function rescueSailor(s){
  poiGroup.remove(s.group); sailors.splice(sailors.indexOf(s),1);
  W.rescued++; gainFame(8,'zeeman gered');
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
function musselPrice(harbor, raw=false){
  let base=14*harbor.demand;
  base *= (1 + (W.skills.handel-1)*0.08);
  if(W.buffs.prijs) base*=1.3;
  if(!raw) base*=marketMult(harbor,'mossel');
  return Math.round(base);
}
function goldPrice(harbor){ return Math.round(musselPrice(harbor,true)*8*marketMult(harbor,'goudmossel')); }
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
  {name:'Gerookte Zalmplank',   icon:'🐟', need:4,  base:380,  skill:2, zalmNeed:5},
  {name:'Zalmstoof van de IJszee',icon:'🍲', need:8, base:520,  skill:3, zalmNeed:4},
  {name:'Inktvisringen',        icon:'🦑', need:2,  base:340,  skill:2, inktvisNeed:5},
  {name:'Zwarte-inktrisotto',   icon:'🍚', need:6,  base:600,  skill:4, inktvisNeed:4},
  {name:'Keizers Banket',       icon:'👑', need:34, base:1600, skill:7, goldNeed:3, exootNeed:2},
];
function dishPrice(r,harbor,qual=1,raw=false){
  let p=r.base*harbor.demand*(1+(W.skills.handel-1)*0.1);
  if(W.buffs.prijs) p*=1.3;
  const q=Math.max(0, Math.min(1, +qual || 0));
  p *= 0.7 + 0.5*q;                      // 0.7× botched timing → 1.2× perfect
  if(!raw) p*=marketMult(harbor,'gerecht');
  return Math.round(p);
}
function peekDishQual(name){
  const arr=W.dishQual && W.dishQual[name];
  return (arr && arr.length) ? arr[0] : 0.75;
}
function takeDishQual(name){
  const arr=W.dishQual && W.dishQual[name];
  if(arr && arr.length) return arr.shift();
  return 0.75;
}
function harborBiome(h){ return h ? biomeAt(h.x, h.z) : 'kust'; }

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
  {id:'q1', t:'Vang je eerste 5 mosselen',     check:()=>W.totalCaught>=5, reward:80},
  {id:'q2', t:'Kook je eerste gerecht',        check:()=>W.totalCooked>=1, reward:120},
  {id:'q3', t:'Verkoop voor 200 🪙',           check:()=>W.totalSold>=200, reward:150},
  {id:'q4', t:'Ontdek een verborgen eiland',   check:()=>W.treasures>=1, reward:200},
  {id:'q5', t:'Red een gestrande zeeman',      check:()=>W.rescued>=1, reward:200},
  {id:'q6', t:'Vang een gouden mossel',        check:()=>W.totalGold>=1, reward:300},
  {id:'q7', t:'Bereik kapitein-niveau 5',      check:()=>W.level>=5, reward:400},
  {id:'q8', t:'Koop een groter schip',         check:()=>W.ship>=1, reward:500},
  {id:'q9', t:'Rust een harpoenkanon uit',     check:()=>W.hasHarpoon, reward:200},
  {id:'q10',t:'Versla de Kraken',              check:()=>W.krakensSlain>=1, reward:1000},
  {id:'q11',t:'Versla de Zeeslang',            check:()=>W.serpentsSlain>=1, reward:800},
  {id:'q12',t:'Plunder een spookschip',        check:()=>W.ghostsLooted>=1, reward:600},
  {id:'q13',t:'Red een haven van de Reuzenkrab',check:()=>W.crabsSlain>=1, reward:900},
  {id:'q14',t:'Vang 10 zalmen in de IJszee',    check:()=>W.totalZalm>=10, reward:250},
  {id:'q15',t:'Duik 3 parels op in de tropen',  check:()=>W.totalParel>=3, reward:300},
  {id:'q16',t:'Vang 5 inktvissen bij nacht',    check:()=>W.totalInktvis>=5, reward:300},
  {id:'q17',t:'Verkoop een parel in de IJszee', check:()=>W.parelInIJszee, reward:400},
];
W.totalCaught=0; W.totalCooked=0; W.totalEarned=0; W.totalSold=0; W.totalGold=0;
W.dishQual={};
W.totalZalm=0; W.totalParel=0; W.totalInktvis=0; W.parelInIJszee=false;
function checkQuests(){
  for(const q of QUESTS){
    if(!W.questsDone.has(q.id) && q.check()){
      W.questsDone.add(q.id); W.gold+=q.reward;
      toast(`✅ Logboek voltooid: "${q.t}" +${q.reward} 🪙`,'gold');
      gainXP(40); gainFame(Math.max(3,Math.round(q.reward/40)),'logboek');
    }
  }
  renderQuests(); updateHUD();
}
function renderQuests(){
  const el=document.getElementById('questList');
  const open=QUESTS.filter(q=>!W.questsDone.has(q.id)).slice(0,4);
  const done=QUESTS.filter(q=>W.questsDone.has(q.id)).length;
  const cs=(W.contracts||[]).map(c=>`<div class="q"><b>📜</b> ${contractLabel(c)} naar ${c.harbor} <span style="color:var(--gold)">dag ${c.deadline}</span></div>`).join('');
  el.innerHTML = cs + open.map(q=>`<div class="q"><b>○</b> ${q.t} <span style="color:var(--gold)">+${q.reward}</span></div>`).join('')
    + (open.length===0?'<div class="q done">Alle missies voltooid! 🏆</div>':'')
    + `<div class="q" style="color:var(--accent)">Voortgang: ${done}/${QUESTS.length}</div>`;
}

// ---- Roem: titels die je verdient met contracten, missies en monsters ----
const FAME_TITLES=[[0,'Dekknecht'],[30,'Schipper'],[100,'Kapitein'],[250,'Vlootvoogd'],[500,'Zeeheld'],[900,'Legendarische Mosselkapitein']];
function fameTitle(f=W.fame){ let t=FAME_TITLES[0][1]; for(const [n,name] of FAME_TITLES) if(f>=n) t=name; return t; }
function fameNext(f=W.fame){ for(const [n] of FAME_TITLES) if(f<n) return n; return null; }
function gainFame(n,why){
  const before=fameTitle(); W.fame+=n;
  toast(`🏅 +${n} roem${why?' ('+why+')':''}`,'gold');
  const after=fameTitle();
  if(after!==before){ toast(`👑 Nieuwe titel: ${after}!`,'gold'); beep(659,.12); setTimeout(()=>beep(880,.18),140); }
  if(!W.legendShown && fameNext()===null){ W.legendShown=true; setTimeout(showLegendScene, 900); }
}
function showLegendScene(){
  openModal(`<h2>👑 De beroemdste mosselkapitein ter wereld</h2>
    <div class="sub">Van ${HARBORS[0].name} tot ${HARBORS[HARBORS.length-1].name} zingen ze over je. Je hebt het gehaald, Kapitein!</div>
    <div class="grid">
      <div class="card2"><h3>Reis</h3><p>Dag ${W.day} · Niveau ${W.level}</p></div>
      <div class="card2"><h3>Verdiend</h3><p>${Math.floor(W.totalEarned)} 🪙</p></div>
      <div class="card2"><h3>Contracten</h3><p>${W.contractsDelivered||0} geleverd</p></div>
      <div class="card2"><h3>Monsters</h3><p>${W.krakensSlain+W.serpentsSlain+W.crabsSlain} verslagen</p></div>
    </div>
    <div class="sub" style="margin-top:12px">De zee blijft open: nieuwe contracten, vraagpieken en monsters wachten op je.</div>
    <div style="text-align:center;margin-top:14px"><button class="btn" onclick="window.__close()">⚓ Verder varen</button></div>`);
  for(let k=0;k<6;k++) setTimeout(()=>confettiBurst(shipState.x,shipState.z),k*250);
}

// ---- Contracten: elke haven biedt per dag één levering aan, premie plus roem ----
// Het aanbod volgt uit haven, dag en reis-seed, dus het is na herladen hetzelfde.
function seeded(str){
  let h=1779033703^str.length;
  for(let i=0;i<str.length;i++){ h=Math.imul(h^str.charCodeAt(i),3432918353); h=h<<13|h>>>19; }
  return ()=>{ h=Math.imul(h^(h>>>16),2246822507); h=Math.imul(h^(h>>>13),3266489909); return ((h^=h>>>16)>>>0)/4294967296; };
}
const CONTRACT_ITEMS={ mossel:{label:'mosselen',icon:'🦪'}, goudmossel:{label:'gouden mosselen',icon:'🌟'}, zalm:{label:'zalm',icon:'🐟'}, parel:{label:'parels',icon:'✨'}, inktvis:{label:'inktvis',icon:'🦑'} };
function contractId(h){ return h.name+'#'+W.day; }
function contractOffer(h){
  const id=contractId(h);
  if(W.contractsDone.includes(id) || W.contracts.some(c=>c.id===id)) return null;
  const rnd=seeded(id+'|'+W.contractSeed);
  const b=harborBiome(h);
  // vraag naar wat hier niet vandaan komt weegt zwaarder: zo ontstaan handelsroutes
  const pool=[['mossel',b==='kust'?1:3],['zalm',b==='storm'?1:3],['parel',b==='tropisch'?1:2],['inktvis',b==='mist'?1:3],['goudmossel',1],['gerecht',3]];
  let r=rnd()*pool.reduce((t,p)=>t+p[1],0), kind='mossel';
  for(const [k,w] of pool){ r-=w; if(r<=0){ kind=k; break; } }
  const c={ id, harbor:h.name, kind, deadline:W.day+2+Math.floor(rnd()*3) };
  if(kind==='gerecht'){
    const rs=RECIPES.filter(x=>x.skill<=Math.max(1,W.skills.koken)); const rc=rs[Math.floor(rnd()*rs.length)];
    c.dish=rc.name; c.need=2+Math.floor(rnd()*4); c.unit=Math.round(rc.base*h.demand*1.35);
  } else {
    const scale=Math.min(6, Math.max(1, W.holdMax/40));
    const base={mossel:[12,30],zalm:[6,16],inktvis:[6,16],parel:[2,5],goudmossel:[1,3]}[kind];
    c.need=Math.round((base[0]+rnd()*(base[1]-base[0]))*scale);
    c.unit=Math.round(unitPriceRaw(kind,h)*1.6);
  }
  c.reward=c.need*c.unit; c.fame=Math.max(4, Math.min(40, Math.round(c.reward/55)));
  return c;
}
function contractLabel(c){ return c.dish ? `${(RECIPES.find(r=>r.name===c.dish)||{icon:'🍽️'}).icon} ${c.need}× ${c.dish}` : `${CONTRACT_ITEMS[c.kind].icon} ${c.need}× ${CONTRACT_ITEMS[c.kind].label}`; }
function contractHave(c){ return c.dish ? (W.dishes[c.dish]||0) : (W.inv[c.kind]||0); }
function contractCards(h){
  let html='';
  for(const c of W.contracts){
    const have=contractHave(c), here=h && c.harbor===h.name, ok=have>=c.need;
    html+=`<div class="card2"><h3>${here?'📍':'⚓'} ${c.harbor}</h3>
      <p>${contractLabel(c)} · aan boord: <b style="color:${ok?'var(--good)':'var(--accent)'}">${have}</b><br>Vóór dag ${c.deadline} (nog ${Math.max(0,c.deadline-W.day)} dagen)<br><span class="price">${c.reward} 🪙</span> + 🏅 ${c.fame} roem</p>
      ${here?`<button class="btn sell" ${ok?'':'disabled'} onclick="window.__deliverContract('${c.id}')">${ok?'Leveren':'Nog niet genoeg aan boord'}</button> `:''}
      <button class="btn alt" onclick="window.__dropContract('${c.id}')">Opzeggen</button></div>`;
  }
  return html;
}
function tabContracten(h){
  const offer=contractOffer(h);
  const active=W.contracts.find(c=>c.harbor===h.name);
  let html=`<div class="sub">Havens vragen leveringen tegen een premie plus roem. Jouw titel: <b style="color:var(--gold)">${fameTitle()}</b> (${W.fame} roem${fameNext()!==null?`, volgende titel bij ${fameNext()}`:''}).</div><div class="grid">`;
  if(offer && !active){
    html+=`<div class="card2" style="grid-column:1/-1;border-color:var(--gold)"><h3>📜 Aanbod van vandaag</h3>
      <p>Lever <b>${contractLabel(offer)}</b> hier vóór dag ${offer.deadline}.<br>Beloning <span class="price">${offer.reward} 🪙</span> + 🏅 ${offer.fame} roem</p>
      <button class="btn" ${W.contracts.length>=3?'disabled':''} onclick="window.__takeContract()">${W.contracts.length>=3?'Maximaal 3 contracten tegelijk':'Contract aannemen'}</button></div>`;
  } else if(!active) html+=`<div class="card2" style="grid-column:1/-1"><h3>📜 Aanbod</h3><p>Vandaag geen nieuw contract in deze haven. Morgen hangt er weer een nieuw aanbod.</p></div>`;
  html+=contractCards(h);
  if(!W.contracts.length) html+=`<div class="card2"><h3>Lopende contracten</h3><p>Geen. Je kunt er maximaal drie tegelijk aannemen, ook in verschillende havens.</p></div>`;
  return html+'</div>';
}
window.__takeContract=()=>{
  const c=contractOffer(curHarbor); if(!c||W.contracts.length>=3) return;
  W.contracts.push(c); toast(`📜 Contract aangenomen: ${contractLabel(c)} naar ${c.harbor}`,'good'); beep(600,.06);
  renderHarbor(); renderQuests();
};
window.__dropContract=id=>{
  const i=W.contracts.findIndex(c=>c.id===id); if(i<0) return;
  W.contractsDone.push(id); W.contracts.splice(i,1); toast('📜 Contract opgezegd.');
  if(curHarbor && $('overlay').style.display==='flex') renderHarbor(); renderQuests();
};
window.__deliverContract=id=>{
  const c=W.contracts.find(x=>x.id===id); if(!c||!curHarbor||c.harbor!==curHarbor.name||contractHave(c)<c.need) return;
  if(c.dish){ W.dishes[c.dish]-=c.need; for(let i=0;i<c.need;i++) takeDishQual(c.dish); } else W.inv[c.kind]-=c.need;
  W.gold+=c.reward; W.totalEarned+=c.reward; W.totalSold+=c.reward; W.contractsDelivered=(W.contractsDelivered||0)+1;
  W.contractsDone.push(id); W.contracts.splice(W.contracts.indexOf(c),1);
  toast(`✅ Contract geleverd: +${c.reward} 🪙`,'gold'); beep(784,.08); setTimeout(()=>beep(988,.12),110);
  gainSkill('handel',6); gainXP(60); gainFame(c.fame,'contract');
  renderHarbor(); renderQuests(); updateHUD(); checkQuests();
};
function contractsNewDay(){
  for(const c of [...W.contracts]) if(W.day>c.deadline){ W.contracts.splice(W.contracts.indexOf(c),1); toast(`⌛ Contract verlopen: ${contractLabel(c)} voor ${c.harbor}`); }
  W.contractsDone=W.contractsDone.filter(id=>+id.split('#')[1]>=W.day-1);
  renderQuests();
}

// ============================================================================
//  11. UI HUD, toasts, prompt, modals
// ============================================================================
mark('interface');
const $=id=>document.getElementById(id);
function updateHUD(){
  $('hudGold').textContent=Math.floor(W.gold);
  $('hudLevel').textContent=W.level;
  $('hudXP').style.width=(W.xp/W.xpNext*100)+'%';
  $('hudHoldTxt').textContent=`${holdCount()}/${W.holdMax}`;
  $('hudHold').style.width=(holdCount()/W.holdMax*100)+'%';
  $('hudFish').textContent=W.inv.exoot;
  // hull / health
  const pct=Math.max(0,Math.min(1, W.hull/W.hullMax));
  const hb=$('hudHull');
  if(hb){
    hb.style.width=(pct*100)+'%';
    hb.className='hullfill'+(pct<=0.25?' crit':pct<=0.55?' warn':'');
    $('hudHullTxt').textContent=Math.round(pct*100)+'%';
  }
  $('seagullStat').style.display=W.hasSeagull?'flex':'none';
  $('seagullName').textContent=W.seagullName;
}
function toast(msg,kind=''){
  const t=$('toasts');
  // don't stack the same message: refresh the existing one and count repeats
  const last=t.lastElementChild;
  if(last && last.dataset.msg===msg){
    const n=(+last.dataset.n||1)+1;
    last.dataset.n=n;
    last.textContent=msg+' ×'+n;
    clearTimeout(+last.dataset.tid);
    last.dataset.tid=setTimeout(()=>last.remove(),4200);
    return;
  }
  const el=document.createElement('div');
  el.className='toast '+kind; el.textContent=msg;
  el.dataset.msg=msg; el.dataset.n=1;
  t.appendChild(el);
  el.dataset.tid=setTimeout(()=>el.remove(),4200);
  while(t.children.length>4) t.firstChild.remove();
}
function showPrompt(html){ const p=$('prompt'); p.innerHTML=iconize(html); p.style.display='block'; }
function hidePrompt(){ $('prompt').style.display='none'; }

// swap coin/fish emoji for CSS shapes so they render on every device
function iconize(html){ return String(html).replace(/🪙/g,'<span class="coinsm"></span>'); }
function openModal(html){ $('modal').innerHTML=iconize(html); $('overlay').style.display='flex'; W.paused=true; }
function closeModal(){ $('overlay').style.display='none'; cookGame.active=false; if(!mapOpen) W.paused=false; }

// ---- Harbor modal ----
let curHarbor=null, curTab='verkoop';
function openHarbor(h, tab='verkoop'){
  if(!h){ toast('⚓ Vaar dichter naar een haven om aan te meren.'); return; }
  curHarbor=h; curTab=tab; renderHarbor();
}
function renderHarbor(){
  const h=curHarbor; if(!h) return;
  const tabs=[['verkoop','💰 Verkoop'],['contracten','📜 Contracten'],['markt','🛒 Markt'],['kombuis','👨‍🍳 Kombuis'],['upgrades','🔧 Werf'],['schepen','🚢 Schepen'],['kapitein','🧑‍✈️ Kapitein']];
  let body='';
  if(curTab==='verkoop') body=tabVerkoop(h);
  else if(curTab==='contracten') body=tabContracten(h);
  else if(curTab==='markt') body=tabMarkt(h);
  else if(curTab==='kombuis') body=tabKombuis(h);
  else if(curTab==='upgrades') body=tabUpgrades(h);
  else if(curTab==='schepen') body=tabSchepen(h);
  else if(curTab==='kapitein') body=tabKapitein(h);
  openModal(`
    <button class="closeX" onclick="window.__close()">✕</button>
    <h2>${h.icon} ${h.name}</h2>
    <div class="sub">Biome: ${biomeLabel(harborBiome(h))} · Vraag ×${h.demand.toFixed(1)} · Jouw 🪙 ${Math.floor(W.gold)} · 🏅 ${fameTitle()}</div>
    ${boomLine()?`<div class="sub" style="color:var(--gold)">${boomLine()}</div>`:''}
    <div class="tabs">${tabs.map(t=>`<div class="tab ${curTab===t[0]?'active':''}" onclick="window.__tab('${t[0]}')">${t[1]}</div>`).join('')}</div>
    <div id="modalBody">${body}</div>
  `);
}
// Each sea pays differently for the new products: catch it far away, sell it far
// from where it came and the price roughly doubles. That builds trade routes.
const PRODUCT_PRICES={
  zalm:    { base:25,  storm:0.7, kust:1.3, tropisch:1.8, mist:1.0, tip:'verkoopt het best in de tropen' },
  parel:   { base:120, storm:1.8, kust:1.4, tropisch:0.7, mist:1.1, tip:'verkoopt het best in de IJszee' },
  inktvis: { base:35,  storm:1.1, kust:1.5, tropisch:1.2, mist:0.7, tip:'verkoopt het best aan de kust' },
};
function productPrice(kind,harbor, raw=false){
  const p=PRODUCT_PRICES[kind]; if(!p) return 0;
  let v=p.base*(p[harborBiome(harbor)]||1)*harbor.demand*(1+(W.skills.handel-1)*0.08);
  if(W.buffs.prijs) v*=1.3;
  if(!raw) v*=marketMult(harbor,kind);
  return Math.round(v);
}
// ---- Levende markt ----
// Elke verkochte eenheid drukt de prijs in die haven een beetje, 's nachts herstelt de
// vraag grotendeels. Een vraagpiek (marktbericht) betaalt twee dagen bijna dubbel.
// Zo loont het om vangst te spreiden over havens en zeeën.
const MARKET_CAP={ mossel:140, goudmossel:12, zalm:70, inktvis:70, parel:14, gerecht:14 };
const MARKET_KINDS=['mossel','goudmossel','zalm','parel','inktvis'];   // buit en exoten houden een vaste prijs
function marketKey(kind){ return MARKET_CAP[kind]!==undefined ? kind : 'gerecht'; }
function marketSoldCount(h,kind){ const m=W.market[h.name]; return m ? (m[marketKey(kind)]||0) : 0; }
function marketSold(h,kind,n){ const k=marketKey(kind); (W.market[h.name]=W.market[h.name]||{})[k]=marketSoldCount(h,kind)+n; }
function boomActive(h,kind){ const b=W.boom; return !!(b && b.harbor===h.name && b.kind===marketKey(kind) && b.until>=W.day); }
function marketMult(h,kind,extra=0){
  const cap=MARKET_CAP[marketKey(kind)];
  let m=Math.max(0.45, 1/(1+(marketSoldCount(h,kind)+extra)/cap));
  if(boomActive(h,kind)) m*=1.8;
  return m;
}
function marketTag(h,kind){
  if(boomActive(h,kind)) return '<b style="color:var(--gold)">📈 vraagpiek</b>';
  const m=marketMult(h,kind); if(m<0.93) return `<b style="color:#ff9d4d">📉 ${Math.round((1-m)*100)}% gedrukt</b>`;
  return '';
}
function boomLabel(k){ return {mossel:'mosselen',goudmossel:'gouden mosselen',zalm:'zalm',parel:'parels',inktvis:'inktvis',gerecht:'gerechten'}[k]||k; }
function boomLine(){ const b=W.boom; return (b && b.until>=W.day) ? `📣 Marktbericht: ${b.harbor} betaalt tot en met dag ${b.until} bijna dubbel voor ${boomLabel(b.kind)}.` : ''; }
// Opbrengst van n stuks als elke verkoop de prijs weer een beetje verder drukt.
function sellTotal(h,kind,n,unit){ let t=0; for(let i=0;i<n;i++) t+=unit*marketMult(h,kind,i); return Math.round(t); }
function unitPriceRaw(kind,h){
  return kind==='goudmossel'? musselPrice(h,true)*8 : kind==='exoot'? 60 : kind==='krakeninkt'? 220 : kind==='schub'? 150 : kind==='schaar'? 180
    : PRODUCT_PRICES[kind]? productPrice(kind,h,true) : musselPrice(h,true);
}
function sellKind(kind,n){
  const h=curHarbor; const raw=unitPriceRaw(kind,h); const mk=MARKET_KINDS.includes(kind);
  const tot = mk ? sellTotal(h,kind,n,raw) : Math.round(raw*n);
  if(mk) marketSold(h,kind,n);
  if(kind==='parel' && harborBiome(h)==='storm') W.parelInIJszee=true;
  W.inv[kind]-=n; W.gold+=tot; W.totalEarned+=tot; W.totalSold+=tot;
  return tot;
}
function marketNewDay(){
  for(const hn of Object.keys(W.market)){ const m=W.market[hn]; for(const k of Object.keys(m)){ m[k]*=0.45; if(m[k]<0.5) delete m[k]; } if(!Object.keys(m).length) delete W.market[hn]; }
  if(!W.boom || W.boom.until<W.day){
    if(Math.random()<0.65){
      const h=pick(HARBORS); const kind=pick(['mossel','zalm','parel','inktvis','gerecht','gerecht']);
      W.boom={harbor:h.name, kind, until:W.day+1};
      toast(boomLine(),'gold');
    } else W.boom=null;
  }
}
function tabVerkoop(h){
  const mp=musselPrice(h);
  let rows='';
  rows+=invRow('🦪 Mosselen', W.inv.mossel, mp, ()=>`window.__sell('mossel')`, marketTag(h,'mossel'));
  rows+=invRow('🌟 Gouden mosselen', W.inv.goudmossel, goldPrice(h), ()=>`window.__sell('goudmossel')`, marketTag(h,'goudmossel'));
  rows+=invRow('🐟 Zalm', W.inv.zalm, productPrice('zalm',h), ()=>`window.__sell('zalm')`,'('+PRODUCT_PRICES.zalm.tip+') '+marketTag(h,'zalm'));
  rows+=invRow('✨ Parels', W.inv.parel, productPrice('parel',h), ()=>`window.__sell('parel')`,'('+PRODUCT_PRICES.parel.tip+') '+marketTag(h,'parel'));
  rows+=invRow('🦑 Inktvis', W.inv.inktvis, productPrice('inktvis',h), ()=>`window.__sell('inktvis')`,'('+PRODUCT_PRICES.inktvis.tip+') '+marketTag(h,'inktvis'));
  rows+=invRow('🐠 Exotische dieren', W.inv.exoot, 60, ()=>`window.__sell('exoot')`,'(of doneer aan aquarium)');
  rows+=invRow('🖋️ Krakeninkt', W.inv.krakeninkt, 220, ()=>`window.__sell('krakeninkt')`,'(zeldzame buit van de Kraken)');
  rows+=invRow('🐲 Zeeslangschubben', W.inv.schub, 150, ()=>`window.__sell('schub')`,'(glinsterende buit van de zeeslang)');
  rows+=invRow('🦀 Krabbenscharen', W.inv.schaar, 180, ()=>`window.__sell('schaar')`,'(delicatesse buit van de reuzenkrab)');
  // dishes
  let dishRows='';
  for(const r of RECIPES){
    const c=W.dishes[r.name]||0; if(c<=0) continue;
    dishRows+=invRow(`${r.icon} ${r.name}`, c, dishPrice(r,h,peekDishQual(r.name)), ()=>`window.__sellDish('${r.name}')`, marketTag(h,'gerecht'));
  }
  return `
    <div class="grid"><div class="card2" style="grid-column:1/-1">
      <h3>Rauwe vangst</h3>${rows}
      <button class="btn sell" style="margin-top:10px;width:100%" onclick="window.__sellAll()">Verkoop alle rauwe vangst</button>
    </div>
    ${dishRows?`<div class="card2" style="grid-column:1/-1"><h3>Gerechten 🍽️</h3>${dishRows}
      <button class="btn sell" style="margin-top:10px;width:100%" onclick="window.__sellDishesAll()">Verkoop alle gerechten</button></div>`:''}
    </div>
    ${W.buffs.prijs?'<div class="sub" style="color:var(--gold)">🌟 Prijsbonus actief!</div>':''}
    <div class="sub">Veel van hetzelfde verkopen drukt hier de prijs, morgen is de vraag grotendeels hersteld. Spreid je vangst over havens.</div>`;
}
function invRow(label,count,price,fn,extra=''){
  return `<div class="invrow">
    <span>${label} <b style="color:var(--accent)">×${count}</b> <small style="color:var(--muted)">${extra}</small></span>
    <span style="white-space:nowrap;display:inline-flex;align-items:center;gap:8px">
      <span class="price">${price} 🪙</span>
      <button class="btn sell" ${count<=0?'disabled':''} onclick="${fn()}">Verkoop 1</button>
    </span></div>`;
}
function tabMarkt(h){
  // buy bait/charts/aquariumfish? Keep simple: buy fuel-free; sell-side mostly. Add: sea charts reveal beds, weather machine fuel.
  return `<div class="grid">
    <div class="card2"><h3>🗺️ Zeekaart</h3><p>Onthult alle mosselbanken in dit biome op je sonar.</p>
      <button class="btn" onclick="window.__buyChart()">Koop <span class="price">150 🪙</span></button></div>
    <div class="card2"><h3>🪝 Aas-emmer</h3><p>Lokt direct een verse mosselbank vlak naast je schip.</p>
      <button class="btn" onclick="window.__buyBait()">Koop <span class="price">80 🪙</span></button></div>
    <div class="card2"><h3>🛠️ Reparatie & Proviand</h3><p>Herstel je romp volledig en schrob de aangroei van de scheepshuid (een vieze romp maakt je tot 10% trager). Zonder romp zink je!</p>
      <button class="btn alt" onclick="window.__repair()">Onderhoud <span class="price">40 🪙</span></button></div>
    <div class="card2"><h3>🌦️ Weersmachine brandstof</h3><p>${W.hasWeatherMachine?'Lokt beter weer voor 1 cyclus.':'Vereist Weersmachine (Werf).'}</p>
      <button class="btn" ${W.hasWeatherMachine?'':'disabled'} onclick="window.__buyWeatherFuel()">Koop <span class="price">120 🪙</span></button></div>
  </div>`;
}
function tabKombuis(h){
  let cards='';
  for(const r of RECIPES){
    const locked=W.skills.koken<r.skill;
    const enough=W.inv.mossel>=r.need && (!r.goldNeed||W.inv.goudmossel>=r.goldNeed) && (!r.exootNeed||W.inv.exoot>=r.exootNeed) && (!r.zalmNeed||W.inv.zalm>=r.zalmNeed) && (!r.inktvisNeed||W.inv.inktvis>=r.inktvisNeed);
    cards+=`<div class="card2">
      <h3>${r.icon} ${r.name} ${locked?`<span class="lvltag">Koken Lv.${r.skill}</span>`:''}</h3>
      <p>Nodig: ${r.need}× 🦪 ${r.goldNeed?`+ ${r.goldNeed}× 🌟`:''}${r.exootNeed?` + ${r.exootNeed}× 🐠`:''}${r.zalmNeed?` + ${r.zalmNeed}× 🐟`:''}${r.inktvisNeed?` + ${r.inktvisNeed}× 🦑`:''}<br>Verkoopwaarde ~<span class="price">${dishPrice(r,h,0.6)} tot ${dishPrice(r,h,1)} 🪙</span> (afhankelijk van je timing)</p>
      <button class="btn" ${locked||!enough?'disabled':''} onclick="window.__cook('${r.name}')">${locked?'🔒 Vergrendeld':(enough?'👨‍🍳 Koken (minigame)':'Te weinig ingrediënten')}</button>
    </div>`;
  }
  return `<div class="sub">Kook rauwe mosselen tot gerechten die brengen véél meer op. Hoe beter je timing, hoe waardevoller het bord!</div>
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
    {k:'harpoon', name:'🔱 Harpoenkanon', desc:W.hasHarpoon?'Gemonteerd ✓ (toets H / 🔱-knop)':'Verdedig je tegen de Kraken vuur harpoenen af', price:1500, can:!W.hasHarpoon,
      buy:()=>{ W.hasHarpoon=true; kraken.known=true; refreshHarpoonBtn(); toast('🔱 Harpoenkanon gemonteerd! De Kraken schuilt in de mistige diepte (west/noordwest).','gold'); }},
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
      ${it.can?`Koop <span class="price">${it.price} 🪙</span>`:'✓ Bezit'}</button></div>`).join('')}</div>`;
}
let UPG_MAP={};
function tabSchepen(h){
  UPG_MAP={};
  return `<div class="grid">${SHIPS.map((s,i)=>{
    const owned=i<=W.ship; const can=i===W.ship+1;
    return `<div class="card2" style="${i===W.ship?'border-color:var(--gold)':''}">
      <h3>${s.icon} ${s.name} ${i===W.ship?'<span class="lvltag">In gebruik</span>':''}</h3>
      <p>Ruim ${s.hold} · Snelheid ×${s.speed.toFixed(2)}<br>
      🔱 Vuurkracht ${Math.round((11+W.harvestLvl*2)*(1+i*0.22))} · 🛡️ Romp ${100+i*25}</p>
      <button class="btn" ${owned?'disabled':(can&&W.gold>=s.price?'':'disabled')} onclick="window.__buyShip(${i},${s.price})">
        ${owned?'✓ In bezit':(`Koop <span class="price">${s.price} 🪙</span>`)}</button>
    </div>`;}).join('')}</div>`;
}
function tabKapitein(h){
  const sk=W.skills;
  const aqua = W.aquarium.length? W.aquarium.map(n=>`🐠 ${n}`).join(' · ') : 'Nog leeg vang exotische zeedieren!';
  return `<div class="grid">
    <div class="card2"><h3>🧑‍✈️ Kapitein Niveau ${W.level}</h3>
      <p>XP ${Math.floor(W.xp)}/${W.xpNext}<br>🏅 ${fameTitle()} · ${W.fame} roem${fameNext()!==null?` (volgende titel bij ${fameNext()})`:''}<br>
      🧭 Navigatie ${sk.navigatie} · 👨‍🍳 Koken ${sk.koken}<br>🤝 Handel ${sk.handel} · 🎣 Visserij ${sk.visserij}</p></div>
    <div class="card2"><h3>🏆 Statistieken</h3><p>
      Schatten: ${W.treasures} · Geredde zeelieden: ${W.rescued}<br>
      Flessenpost: ${W.bottles} · Gouden mosselen: ${W.totalGold}<br>
      Dag ${W.day} · Verdiend totaal: ${Math.floor(W.totalEarned)} 🪙</p></div>
    <div class="card2" style="grid-column:1/-1"><h3>🐟 Aquarium aan boord</h3><p>${aqua}</p></div>
    <div class="card2" style="grid-column:1/-1"><h3>🍳 Kookwedstrijd</h3>
      <p>Daag de lokale kapitein uit! Kook een gerecht met perfecte timing en win een prijs.</p>
      <button class="btn" ${(W.inv.mossel<10)?'disabled':''} onclick="window.__contest()">Doe mee (10× 🦪) prijs tot 600 🪙</button></div>
  </div>`;
}
function biomeLabel(b){ return {kust:'🌅 Kustwateren',storm:'❄️ IJszee',tropisch:'🏝️ Parelzee (tropen)',mist:'🌫️ Schemerzee'}[b]||b; }

// ---- expose handlers to window (modal onclick) ----
window.__close=closeModal;
window.__tab=t=>{ curTab=t; renderHarbor(); };
window.__sell=kind=>{
  if(W.inv[kind]<=0) return;
  sellKind(kind,1); gainSkill('handel',1.2);
  beep(720,.05); renderHarbor(); updateHUD(); checkQuests();
};
window.__sellAll=()=>{
  let tot=0, items=0;
  for(const k of ['mossel','goudmossel','exoot','zalm','parel','inktvis','krakeninkt','schub','schaar']){
    const n=W.inv[k]||0; if(n>0){ items+=n; tot+=sellKind(k,n); }
  }
  if(tot<=0) return;
  gainSkill('handel', items*0.5);
  toast(`💰 Alles verkocht voor ${Math.floor(tot)} 🪙`,'good'); beep(720,.08);
  renderHarbor(); updateHUD(); checkQuests();
};
window.__sellDish=name=>{
  if((W.dishes[name]||0)<=0) return;
  const r=RECIPES.find(x=>x.name===name); const p=dishPrice(r,curHarbor,takeDishQual(name));
  marketSold(curHarbor,'gerecht',1);
  W.dishes[name]--; W.gold+=p; W.totalEarned+=p; W.totalSold+=p; gainSkill('handel',2);
  beep(784,.06); renderHarbor(); updateHUD(); checkQuests();
};
window.__sellDishesAll=()=>{
  let tot=0;
  for(const r of RECIPES){
    const c=W.dishes[r.name]||0; if(c<=0) continue;
    for(let i=0;i<c;i++){ tot+=dishPrice(r,curHarbor,takeDishQual(r.name)); marketSold(curHarbor,'gerecht',1); }
    W.dishes[r.name]=0;
  }
  if(tot<=0) return; W.gold+=tot; W.totalEarned+=tot; W.totalSold+=tot; gainSkill('handel',4);
  toast(`🍽️ Alle gerechten verkocht: ${Math.floor(tot)} 🪙`,'good');
  renderHarbor(); updateHUD(); checkQuests();
};
window.__buyChart=()=>{ if(W.gold<150)return; W.gold-=150; const bi=harborBiome(curHarbor); let n=0;
  for(const b of beds){ if(b.biome===bi){ b.charted=true; n++; } } toast(`🗺️ Kaart onthult ${n} banken in dit biome.`,'good'); renderHarbor(); updateHUD(); };
window.__buyBait=()=>{ if(W.gold<80)return; W.gold-=80;
  const a=Math.random()*6.28; spawnBed(shipState.x+Math.cos(a)*30, shipState.z+Math.sin(a)*30,{}).pingUntil=sonarNow()+PING_HOLD;
  toast('🪝 Een verse mosselbank verschijnt vlakbij!','good'); renderHarbor(); updateHUD(); };
window.__repair=()=>{ if(W.gold<40)return; W.gold-=40; W.hull=W.hullMax; W.dirt=0; W._dirtWarned=false;
  updateShipDirt();
  toast('🛠️ Romp hersteld en schoongeschrobd, ze glimt weer!','good'); renderHarbor(); updateHUD(); };
window.__buyWeatherFuel=()=>{ if(W.gold<120||!W.hasWeatherMachine)return; W.gold-=120; setWeather(pick(['clear','clear','cloudy']),true);
  toast('🌦️ Weersmachine: het weer klaart op!','good'); renderHarbor(); updateHUD(); };
window.__upg=(k,price)=>{
  if(W.gold<price) return;
  const items={ hold:()=>W.holdMax+=30, engine:()=>W.engineLvl++, harvest:()=>W.harvestLvl++, sonar:()=>W.sonarLvl++,
    weather:()=>W.hasWeatherMachine=true, gull:()=>{W.hasSeagull=true;seagull.visible=true;}, restaurant:()=>W.hasRestaurant=true,
    harpoon:()=>{ W.hasHarpoon=true; kraken.known=true; refreshHarpoonBtn(); toast('🔱 Harpoenkanon gemonteerd! De Kraken schuilt in de mistige diepte (west/noordwest).','gold'); } };
  W.gold-=price; items[k]();
  toast('🔧 Upgrade gekocht!','good'); beep(660,.08);
  gainSkill('navigatie',1); renderHarbor(); updateHUD(); checkQuests();
};
window.__buyShip=(i,price)=>{
  if(i!==W.ship+1||W.gold<price) return;
  W.gold-=price; W.ship=i; W.holdMax=Math.max(W.holdMax,SHIPS[i].hold); buildShip();
  W.hullMax=100+i*25; W.hull=W.hullMax;   // sturdier hull + heavier guns on bigger ships
  toast(`🚢 Nieuw schip: ${SHIPS[i].name}! (🔱 vuurkracht ${weaponDamage()} · 🛡️ romp ${W.hullMax})`,'gold'); confettiBurst(shipState.x,shipState.z);
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
  const short = W.inv.mossel<r.need || (r.goldNeed&&W.inv.goudmossel<r.goldNeed) || (r.exootNeed&&W.inv.exoot<r.exootNeed)
    || (r.zalmNeed&&W.inv.zalm<r.zalmNeed) || (r.inktvisNeed&&W.inv.inktvis<r.inktvisNeed);
  if(short){ toast('Te weinig ingredienten voor dit gerecht.','bad'); return; }
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
    <div class="sub">${IS_TOUCH?'Tik op <b>👆 TIK!</b>':'Druk <b>Spatie</b>'} als de naald in de <span style="color:var(--good)">groene zone</span> staat raak de <span style="color:var(--gold)">gouden kern</span> voor 'perfect'. ${cookGame.need} keer raak = klaar.</div>
    <div id="cookTrack">
      <div id="cookZone" style="left:${cookGame.zoneL*100}%;width:${cookGame.zoneW*100}%"></div>
      <div id="cookPerfect" style="left:${cookGame.perfL*100}%;width:${cookGame.perfW*100}%"></div>
      <div id="cookNeedle" style="left:${cookGame.pos*100}%"></div>
    </div>
    <div id="cookInfo">Treffers: <b id="cookHits">${cookGame.hits}</b>/${cookGame.need} · Kwaliteit: <b id="cookQual"></b></div>
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
  W.inv.mossel-=r.need; if(r.goldNeed) W.inv.goudmossel-=r.goldNeed; if(r.exootNeed) W.inv.exoot-=r.exootNeed; if(r.zalmNeed) W.inv.zalm-=r.zalmNeed; if(r.inktvisNeed) W.inv.inktvis-=r.inktvisNeed;
  cookGame.active=false;
  const qual = Math.max(0, Math.min(1, cookQuality/cookGame.need)); // ~0..1
  cookQuality=0;
  W.dishes[r.name]=(W.dishes[r.name]||0)+1;
  if(!W.dishQual[r.name]) W.dishQual[r.name]=[];
  W.dishQual[r.name].push(qual);
  W.totalCooked++;
  gainSkill('koken', 3 + (cookGame.contest?3:0));
  const sellHint = curHarbor ? ` ~${dishPrice(r,curHarbor,qual)} 🪙 hier` : '';
  if(cookGame.contest){
    const prize = Math.round(200 + qual*400);
    W.gold+=prize; W.totalEarned+=prize;
    toast(`🏆 Kookwedstrijd! Kwaliteit ${(qual*100|0)}% → +${prize} 🪙 en 1× ${r.name}`,'gold');
  } else {
    toast(`🍽️ ${r.name} bereid! Kwaliteit ${(qual*100|0)}%.${sellHint}`,'good');
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
const mapView={ zoom:1, cx:0, cz:0 };     // cx/cz = world point at the centre of the map
function toggleMap(){ mapOpen?closeMap():openMap(); }
function openMap(){
  mapOpen=true; W.paused=true;
  mapView.zoom=1; mapView.cx=0; mapView.cz=0;
  const chip=(c,label,shape='●')=>`<span style="display:inline-flex;align-items:center;gap:5px;margin-right:12px"><span style="color:${c};font-size:14px;line-height:1">${shape}</span>${label}</span>`;
  openModal(`<button class="closeX" onclick="window.__closemap()">✕</button>
    <h2>Zeekaart</h2><div class="sub">De grote oceaan en haar vier zeeën. De witte pijl is jouw schip en koers.
      ${IS_TOUCH?'Knijp of gebruik de knoppen om te zoomen; sleep om te schuiven.':'Scroll om te zoomen, sleep om te schuiven.'}</div>
    <canvas id="bigmap" width="720" height="720" style="width:100%;max-height:62vh;border-radius:12px;border:1px solid var(--line);background:#062640;cursor:grab;touch-action:none"></canvas>
    <div style="display:flex;gap:8px;justify-content:center;margin-top:8px;flex-wrap:wrap">
      <button class="btn alt" style="padding:6px 14px" onclick="window.__mapZoom(1/1.4)">−</button>
      <button class="btn alt" style="padding:6px 14px" onclick="window.__mapZoom(1.4)">+</button>
      <button class="btn alt" style="padding:6px 14px" onclick="window.__mapCenterShip()">Centreer op schip</button>
      <button class="btn alt" style="padding:6px 14px" onclick="window.__mapReset()">Hele kaart</button>
    </div>
    <div class="sub" style="margin-top:10px;display:flex;flex-wrap:wrap;row-gap:4px">
      ${chip('#ff9d4d','haven','■')}${chip('#8fcf7a','eiland')}${chip('#ffd34d','schat','★')}${chip('#5bd97a','mosselbank','·')}${chip('#ffd34d','gouden bank','·')}${chip('#cfe0ec','zalmschool','·')}${chip('#ffb6d9','parelbank','·')}${chip('#b06bff','inktvis (nacht)','·')}${chip('#ff8a7a','koraalrif','○')}
      ${chip('#9affc8','flessenpost','▲')}${chip('#ff6b6b','zeeman','✚')}${chip('#ff5a7a','monster','◆')}
    </div>`);
  setupMapInput();
  drawBigMap();
}
const MAP_R=3000;
function clampMapView(){
  mapView.zoom=Math.max(1, Math.min(8, mapView.zoom));
  const half=MAP_R/mapView.zoom;            // visible half-extent in world units
  const lim=MAP_R-half;                     // don't scroll past the world edge
  mapView.cx=Math.max(-lim,Math.min(lim,mapView.cx));
  mapView.cz=Math.max(-lim,Math.min(lim,mapView.cz));
}
window.__mapZoom=(f)=>{ mapView.zoom*=f; clampMapView(); drawBigMap(); };
window.__mapCenterShip=()=>{ mapView.zoom=Math.max(mapView.zoom,2.5); mapView.cx=shipState.x; mapView.cz=shipState.z; clampMapView(); drawBigMap(); };
window.__mapReset=()=>{ mapView.zoom=1; mapView.cx=0; mapView.cz=0; drawBigMap(); };
function setupMapInput(){
  const cv=$('bigmap'); if(!cv) return;
  // wheel: zoom toward the cursor
  cv.addEventListener('wheel', e=>{
    e.preventDefault();
    const r=cv.getBoundingClientRect();
    const half=MAP_R/mapView.zoom;
    const wx=mapView.cx + ((e.clientX-r.left)/r.width  *2-1)*half;   // world point under cursor
    const wz=mapView.cz + ((e.clientY-r.top )/r.height *2-1)*half;
    const before=mapView.zoom;
    mapView.zoom *= (e.deltaY<0? 1.18 : 1/1.18);
    clampMapView();
    if(mapView.zoom!==before){                                       // keep that point under the cursor
      const k=1-before/mapView.zoom;
      mapView.cx += (wx-mapView.cx)*k;
      mapView.cz += (wz-mapView.cz)*k;
      clampMapView();
    }
    drawBigMap();
  }, {passive:false});
  // drag to pan (mouse + touch)
  let id=null, lx=0, ly=0;
  cv.addEventListener('pointerdown', e=>{ id=e.pointerId; lx=e.clientX; ly=e.clientY; cv.style.cursor='grabbing';
    try{ cv.setPointerCapture(id); }catch(_){} });
  cv.addEventListener('pointermove', e=>{
    if(e.pointerId!==id) return;
    const r=cv.getBoundingClientRect(), half=MAP_R/mapView.zoom;
    mapView.cx -= (e.clientX-lx)/r.width *2*half;
    mapView.cz -= (e.clientY-ly)/r.height*2*half;
    lx=e.clientX; ly=e.clientY; clampMapView(); drawBigMap();
  });
  const end=e=>{ if(e.pointerId===id){ id=null; cv.style.cursor='grab'; } };
  cv.addEventListener('pointerup',end); cv.addEventListener('pointercancel',end);
  // pinch to zoom on touch
  let pinch=null;
  cv.addEventListener('touchmove', e=>{
    if(e.touches.length!==2) return;
    e.preventDefault();
    const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
    if(pinch){ mapView.zoom*=d/pinch; clampMapView(); drawBigMap(); }
    pinch=d;
  }, {passive:false});
  cv.addEventListener('touchend', ()=>{ pinch=null; });
}
window.__closemap=()=>{ mapOpen=false; closeModal(); W.paused=false; };
function closeMap(){ window.__closemap(); }
function drawBigMap(){
  const cv=$('bigmap'); if(!cv) return; const ctx=cv.getContext('2d');
  const Wc=cv.width, Hc=cv.height;
  // uniform scale (the world is square) with zoom + pan applied
  const R=MAP_R, S=Math.min(Wc,Hc)/(2*R)*mapView.zoom, ox=Wc/2, oy=Hc/2;
  const sx=v=>ox+(v-mapView.cx)*S, sy=v=>oy+(v-mapView.cz)*S;
  ctx.clearRect(0,0,Wc,Hc);

  // ---- sea: deep gradient + biome tints (match biomeAt thresholds) ----
  const grad=ctx.createRadialGradient(ox,oy,40,ox,oy,Wc*0.75);
  grad.addColorStop(0,'#0e4a78'); grad.addColorStop(1,'#062640');
  ctx.fillStyle=grad; ctx.fillRect(0,0,Wc,Hc);
  ctx.globalAlpha=.16;
  ctx.fillStyle='#8fa3b3'; ctx.fillRect(0,0,Wc,sy(-850));                  // stormy north
  ctx.fillStyle='#3fd9a8'; ctx.fillRect(sx(1000),0,Wc-sx(1000),Hc);        // tropical east
  ctx.fillStyle='#c9d4dc'; ctx.fillRect(0,0,sx(-1000),Hc);                 // misty west
  ctx.globalAlpha=1;
  // subtle grid
  ctx.strokeStyle='rgba(160,210,255,.10)'; ctx.lineWidth=1;
  for(let v=-3000; v<=3000; v+=500){ ctx.beginPath(); ctx.moveTo(sx(v),sy(-3000)); ctx.lineTo(sx(v),sy(3000)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx(-3000),sy(v)); ctx.lineTo(sx(3000),sy(v)); ctx.stroke(); }
  // sea labels
  ctx.fillStyle='rgba(200,225,245,.45)'; ctx.font='bold 13px sans-serif'; ctx.textAlign='center';
  ctx.fillText('IJSZEE', ox, sy(-2600));
  ctx.fillText('SCHEMERZEE', sx(-2000), sy(2600));
  ctx.fillText('PARELZEE', sx(2000), sy(2600));

  const label=(txt,x,y,col='#e6f2ff',size=11)=>{
    ctx.font=`${size}px sans-serif`; ctx.textAlign='center';
    ctx.lineWidth=3; ctx.strokeStyle='rgba(0,0,0,.75)'; ctx.strokeText(txt,x,y);
    ctx.fillStyle=col; ctx.fillText(txt,x,y);
  };
  const dot=(x,y,r,col)=>{ ctx.fillStyle=col; ctx.beginPath(); ctx.arc(x,y,r,0,6.283); ctx.fill(); };

  // ---- land: islands (green disc + sand rim) and harbours (sand disc + orange square) ----
  for(const i of islandMeshes){
    const x=sx(i.x), y=sy(i.z), r=Math.max(5, i.r*S*1.4);
    dot(x,y,r+2,'#cdb98a'); dot(x,y,r,'#5f8a47');
    if(i.treasure&&!i.visited){ // star for unclaimed treasure
      ctx.fillStyle='#ffd34d'; ctx.beginPath();
      for(let k=0;k<10;k++){ const a=-Math.PI/2+k*Math.PI/5, rr=k%2?3:7; ctx.lineTo(x+Math.cos(a)*rr, y+Math.sin(a)*rr); }
      ctx.closePath(); ctx.fill();
    }
    label(i.name, x, y+r+12, '#cfe3cf', 10);
  }
  for(const h of harborMarkers){
    const x=sx(h.x), y=sy(h.z), r=Math.max(6,(h.r||40)*0.62*S*1.4);
    dot(x,y,r+2,'#cdb98a'); dot(x,y,r,'#6e7f62');
    ctx.fillStyle='#ff9d4d'; ctx.fillRect(x-4,y-4,8,8);
    ctx.strokeStyle='#fff'; ctx.lineWidth=1; ctx.strokeRect(x-4,y-4,8,8);
    label(h.name, x, y+r+13, '#ffe2c2', 11);
  }

  // ---- points of interest ----
  for(const rf of reefs){ ctx.strokeStyle='#ff8a7a'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(sx(rf.x),sy(rf.z),4,0,6.283); ctx.stroke(); }
  for(const b of beds){ if(bedVisible(b) && bedActive(b)) dot(sx(b.x),sy(b.z), b.golden?3.5:2.5, bedColor(b)); }
  for(const bt of bottles){ const x=sx(bt.x), y=sy(bt.z); ctx.fillStyle='#9affc8'; ctx.beginPath(); ctx.moveTo(x,y-5); ctx.lineTo(x+4,y+3); ctx.lineTo(x-4,y+3); ctx.closePath(); ctx.fill(); }
  for(const s of sailors){ const x=sx(s.x), y=sy(s.z); ctx.strokeStyle='#ff6b6b'; ctx.lineWidth=2.5; ctx.beginPath(); ctx.moveTo(x-5,y); ctx.lineTo(x+5,y); ctx.moveTo(x,y-5); ctx.lineTo(x,y+5); ctx.stroke(); }

  // ---- monsters (diamond markers) ----
  const diamond=(x,y,col,name)=>{ ctx.fillStyle=col; ctx.beginPath(); ctx.moveTo(x,y-7); ctx.lineTo(x+7,y); ctx.lineTo(x,y+7); ctx.lineTo(x-7,y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='#fff'; ctx.lineWidth=1; ctx.stroke(); label(name,x,y+18,col,10); };
  if(kraken.known && kraken.state!=='gone') diamond(sx(kraken.x),sy(kraken.z),'#d56bff','Kraken');
  if(serpent.known && serpent.state!=='gone') diamond(sx(serpent.x),sy(serpent.z),'#7fe8c0','Zeeslang');
  if(crabActive()) diamond(sx(crab.x),sy(crab.z),'#ff7a3d','Reuzenkrab AANVAL!');
  if(ghost.state==='sailing' && ghost.fade>0.3) diamond(sx(ghost.x),sy(ghost.z),'#baffdf','Spookschip');

  // ---- the ship: white arrow pointing along the heading ----
  {
    const x=sx(shipState.x), y=sy(shipState.z), a=shipState.heading;
    // world forward is (sin a, cos a); on the map +z is down, so arrow dir = (sin a, cos a)
    const fx=Math.sin(a), fy=Math.cos(a);
    ctx.save(); ctx.translate(x,y);
    ctx.fillStyle='rgba(255,255,255,.25)'; ctx.beginPath(); ctx.arc(0,0,11,0,6.283); ctx.fill();
    ctx.fillStyle='#ffffff'; ctx.strokeStyle='#0b2a44'; ctx.lineWidth=1.5;
    ctx.beginPath();
    ctx.moveTo(fx*10, fy*10);                       // tip
    ctx.lineTo(-fx*6 - fy*6, -fy*6 + fx*6);         // rear-left
    ctx.lineTo(-fx*3, -fy*3);                       // notch
    ctx.lineTo(-fx*6 + fy*6, -fy*6 - fx*6);         // rear-right
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
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
    // heading-up radar: the ship sails along (sin h, cos h), so rotate the world
    // by (h - 180°) to put "straight ahead" at the top and starboard on the right
    const h=shipState.heading;
    const c=-Math.cos(h), s=-Math.sin(h);      // cos(h-π), sin(h-π)
    const rx=dx*c - dz*s, rz=dx*s + dz*c;
    return [cx + rx/range*R, cy + rz/range*R];
  };
  function blip(x,z,color,size){
    const dx=x-shipState.x, dz=z-shipState.z;
    if(dx*dx+dz*dz>range*range) return;
    const [px,py]=toR(dx,dz);
    sctx.fillStyle=color; sctx.beginPath(); sctx.arc(px,py,size,0,6.28); sctx.fill();
  }
  for(const b of beds){ if(bedVisible(b) && bedActive(b)) blip(b.x,b.z, bedColor(b), b.golden?4:3); }
  for(const h of harborMarkers) blip(h.x,h.z,'#ff9d4d',4);
  if(kraken.known && kraken.state!=='gone'){ const big=krakenActive(); blip(kraken.x,kraken.z, big?'#ff3355':'#b95fd0', big?(6+Math.sin(oceanUniforms.uTime.value*8)*2):4); }
  if(serpent.state!=='gone' && serpent.state!=='dying'){ const agro=serpentActive(); blip(serpent.x,serpent.z, agro?'#ff5a3d':'#3fd9a8', agro?(5+Math.sin(oceanUniforms.uTime.value*8)*2):3.5); }
  if(ghost.state==='sailing' && ghost.fade>0.3) blip(ghost.x,ghost.z,'#baffdf',4);
  if(crabActive()) blip(crab.x,crab.z,'#ff7a3d',5+Math.sin(oceanUniforms.uTime.value*6)*1.5);
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
  if(!W.started){ renderFrame(); requestAnimationFrame(update); return; }
  if(!W.paused) stepSim(dt);
  else oceanUniforms.uTime.value += dt*0.3; // gentle idle waves while paused
  updateCook(dt);
  updateSplashes(dt);
  renderFrame();
  requestAnimationFrame(update);
}

function stepSim(dt){
  // ---- wave clock (this drives the swell, the hull's bob and sonar echoes) ----
  oceanUniforms.uTime.value += dt;
  // ---- time of day ----
  W.time += dt*0.12; // ~ 1 day per ~3.3 real min
  if(W.time>=24){ W.time-=24; W.day++;
    if(W.hasRestaurant){ const inc=80+W.level*20; W.gold+=inc; toast(`🍽️ Drijvend restaurant verdiende vannacht +${inc} 🪙`,'good'); }
    toast(`🌅 Dag ${W.day} breekt aan!`); updateHUD();
    marketNewDay(); contractsNewDay();
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
  shipState.throttle += (accel-shipState.throttle)*Math.min(1,dt*2.8);
  let maxSpeed = 36 * spec.speed * (1 + (W.engineLvl-1)*0.32) * (1+(W.skills.navigatie-1)*0.06);
  if(W.buffs.snelheid) maxSpeed*=1.6;
  if(W.buffs.spookvloek) maxSpeed*=0.6;   // ghost-ship curse until it wears off
  // fouling: the hull picks up grime while under way and it costs you speed
  if(Math.abs(shipState.speed)>3 && !W.dead){
    W.dirt=Math.min(1, W.dirt+dt*0.003);
    if(W.dirt>0.8 && !W._dirtWarned){ W._dirtWarned=true;
      toast('🧽 Je romp zit vol aangroei en wier! Laat hem schoonmaken in een haven (Onderhoud).','bad'); }
  }
  maxSpeed *= 1 - W.dirt*0.10;
  // boost: hold Shift (or the ⚡ button) for a burst of speed
  const boosting = !!(keys['shift'] || touchCtrl.boost) && shipState.throttle>0.2;
  if(boosting) maxSpeed*=1.55;
  // weather drag
  maxSpeed *= (W.weather==='storm'?0.7 : W.weather==='rain'?0.88 : 1);
  shipState.speed += (shipState.throttle*maxSpeed - shipState.speed)*Math.min(1,dt*1.9);
  let turn=0;
  if(keys['a']||keys['arrowleft']) turn+=1;
  if(keys['d']||keys['arrowright']) turn-=1;
  if(touchCtrl.active) turn += touchCtrl.turn;
  turn=Math.max(-1,Math.min(1,turn));
  const turnRate = 1.3*(0.6+0.4*Math.min(1,Math.abs(shipState.speed)/12));  // decent rudder even at low speed
  shipState.heading += turn*turnRate*dt * (shipState.speed<0?-1:1);
  // wind nudge (gentle, and only when actually sailing so docking stays calm)
  const windAmt = wm.wave*0.35*Math.min(1, Math.abs(shipState.speed)/6);
  shipState.x += (Math.sin(shipState.heading)*shipState.speed + W.wind.x*windAmt)*dt;
  shipState.z += (Math.cos(shipState.heading)*shipState.speed + W.wind.y*windAmt)*dt;
  // ---- wrap the world: sail off one edge and reappear on the other ----
  // The camera is shifted by the same amount, so the water stays seamless and
  // only the distant land tells you that you have crossed the meridian.
  const lim=2900;
  let wrapX=0, wrapZ=0;
  if(shipState.x >  lim) wrapX = -2*lim;
  else if(shipState.x < -lim) wrapX =  2*lim;
  if(shipState.z >  lim) wrapZ = -2*lim;
  else if(shipState.z < -lim) wrapZ =  2*lim;
  if(wrapX || wrapZ){
    shipState.x += wrapX; shipState.z += wrapZ;
    camPos.x += wrapX;    camPos.z += wrapZ;     // keep the view glued to the ship
    for(const h of harpoons){ h.x += wrapX; h.z += wrapZ; }
    toast('🧭 Je bent de meridiaan overgestoken naar de andere kant van de oceaan.');
  }

  // ---- island & harbour-land collision: slide along the shore, never get stuck ----
  const pushOut=(cx,cz,minD)=>{
    const dx=shipState.x-cx, dz=shipState.z-cz;
    const d=Math.hypot(dx,dz);
    if(d<minD && d>0.001){
      const nx=dx/d, nz=dz/d;
      shipState.x=cx+nx*minD;                     // keep the hull on the waterline
      shipState.z=cz+nz*minD;
      // damp only the inward part of the motion; tangential glide survives,
      // so steering away or along the coast immediately works
      const hx=Math.sin(shipState.heading), hz=Math.cos(shipState.heading);
      const inward = -(hx*nx + hz*nz) * Math.sign(shipState.speed||1); // >0 when pushing into land
      if(inward>0){
        shipState.speed *= Math.max(0.35, 1 - inward*0.8);
      }
    }
  };
  for(const isl of islandMeshes) pushOut(isl.x, isl.z, isl.r+6);     // beach edge + hull margin
  for(const c of harborCores)    pushOut(c.x,   c.z,   c.r+6);       // harbour land (pier stays clear)
  // coral scrapes the hull's pace out of you (but never sinks you)
  reefToastCd=Math.max(0,reefToastCd-dt);
  for(const rf of reefs){
    if(dist2(shipState.x,shipState.z,rf.x,rf.z) < rf.r*rf.r){
      shipState.speed*=Math.max(0,1-2.4*dt);
      if(reefToastCd<=0){ toast('🪸 Je schuurt over het koraalrif! Vaar er omheen.','bad'); reefToastCd=6;
        splash(shipState.x,shipState.z); beep(220,.08,0.03); }
      break;
    }
  }

  // ---- float ship on waves ----
  const t=oceanUniforms.uTime.value, sc=oceanUniforms.uWaveScale.value;
  const h0=waveHeight(shipState.x,shipState.z,t,sc);
  const hF=waveHeight(shipState.x+Math.sin(shipState.heading)*3, shipState.z+Math.cos(shipState.heading)*3, t, sc);
  const hR=waveHeight(shipState.x+Math.cos(shipState.heading)*2, shipState.z-Math.sin(shipState.heading)*2, t, sc);
  // The hull always rides the swell; lying still it keeps a slow, easy roll
  // so the boat never looks frozen while you are dredging.
  const idle = 1 - Math.min(1, Math.abs(shipState.speed)/10);   // 1 when stopped
  ship.position.set(shipState.x, h0*1.5 + 0.2 + Math.sin(t*0.9)*0.85*idle, shipState.z);
  ship.rotation.y=shipState.heading;
  // pitch & roll from wave slope, plus a clearly visible idle rock
  shipMesh.rotation.x = Math.atan2(hF-h0,3)*-1.4 + Math.sin(t*0.95)*0.10*idle;
  shipMesh.rotation.z = Math.atan2(hR-h0,2)*1.4  + Math.sin(t*0.70)*0.19*idle;
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

  updateShipDirt();

  // ---- wake ----
  updateWake(dt);

  // ---- seagull ----
  updateSeagull(dt);
  updateAmbientGulls(dt, t);

  // ---- monsters ----
  updateKraken(dt);
  updateSerpent(dt);
  updateGhost(dt);
  updateCrab(dt);
  updateCaptainFigure();

  // ---- POI bob ----
  for(const bt of bottles) bt.mesh.position.y=waveHeight(bt.x,bt.z,t,sc)+0.3;
  for(const fl of floes){
    fl.x+=fl.drift*dt*0.4; if(fl.x>1000) fl.x=-1000;
    fl.mesh.position.set(fl.x, waveHeight(fl.x,fl.z,t,sc)*0.6-0.2, fl.z);
    fl.mesh.rotation.y+=fl.spin*dt;
  }
  for(const s of sailors) s.group.position.y=waveHeight(s.x,s.z,t,sc);
  for(const e of exotics){ e.mesh.position.y=waveHeight(e.x,e.z,t,sc)-0.6+Math.sin(t*2+e.x)*0.3; e.mesh.rotation.z=Math.sin(t+e.x)*0.4; }
  for(const b of beds){
    if(b.kind==='zalm'){
      // schools swim slowly through the IJszee; they speed up while being fished
      b.heading += Math.sin(t*0.3+b.x)*0.4*dt;
      const spd = (harvesting && harvestTarget===b) ? 8.5 : 5.5;
      b.x += Math.sin(b.heading)*spd*dt; b.z += Math.cos(b.heading)*spd*dt;
      if(b.z>-950){ b.z=-950; b.heading=Math.PI+(Math.random()-0.5); }       // stay in the cold sea
      if(b.z<-2750) b.z=-2750, b.heading=(Math.random()-0.5);
      if(Math.abs(b.x)>1000) b.x=Math.sign(b.x)*1000, b.heading=-b.heading;   // IJszee is only the middle north
      b.group.position.set(b.x,-1.2,b.z);
      b.group.children.forEach((c,i)=>{ c.rotation.y=b.heading+Math.PI; c.position.y=-0.4+Math.sin(t*3+i)*0.35; });
      if(Math.random()<dt*0.7) splash(b.x+(Math.random()-0.5)*6, b.z+(Math.random()-0.5)*6);
    } else if(b.kind==='inktvis'){
      b.group.visible = isNight();
      if(b.group.visible) b.group.children.forEach((c,i)=>{ c.position.y=-0.8+Math.sin(t*1.6+i*2)*0.4; c.rotation.y+=dt*0.8; });
    } else {
      b.group.children.forEach((c,i)=>{ c.rotation.y+=dt*0.5; });
    }
  }
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

// Map the clock onto the sun's arc, giving daylight a bigger share of the day.
const DAWN=5, DUSK=21;                       // 16 h light, 8 h dark
function solarPhase(time){
  if(time>=DAWN && time<DUSK) return (time-DAWN)/(DUSK-DAWN)*Math.PI;   // above horizon
  const nightLen=24-(DUSK-DAWN);
  const t2 = time>=DUSK ? time-DUSK : time+24-DUSK;
  return Math.PI + (t2/nightLen)*Math.PI;                               // below horizon
}
function applyEnvironment(dt){
  const wm=WEATHERS[W.weather];
  // smooth wave scale
  const targetWave=wm.wave;
  oceanUniforms.uWaveScale.value += (targetWave-oceanUniforms.uWaveScale.value)*Math.min(1,dt*0.7);
  // sun position from time of day. Daylight is stretched over 16 of the 24
  // hours (sunrise 05:00, sunset 21:00) so the world is bright far more often
  // than it is dark; night is compressed into the remaining 8 hours.
  const ang=solarPhase(W.time);
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
  updateShipLights(night);        // ship lamps fade in as it gets dark
  updateAurora(dt,night);         // noorderlicht boven de IJszee
  oceanUniforms.uSunStrength.value=wm.sun*(0.4+dayAmt);
  // each sea has its own water colour; blend toward it as you cross over
  const WATER_TINTS={
    kust:    { deep:0x05335e, mid:0x0e6493 },
    storm:   { deep:0x0c3348, mid:0x2a5a72 },   // steel-blue polar water
    tropisch:{ deep:0x045f66, mid:0x0e8f92 },   // warm turquoise
    mist:    { deep:0x122436, mid:0x2c4258 },   // dark, muted
  };
  const tint=WATER_TINTS[biomeAt(shipState.x,shipState.z)]||WATER_TINTS.kust;
  const deep=new THREE.Color(tint.deep).lerp(wt,(1-wm.sun)*0.3);
  oceanUniforms.uDeep.value.lerp(deep, Math.min(1,dt*0.4));
  const mid=new THREE.Color(tint.mid).lerp(wt,(1-wm.sun)*0.35);
  oceanUniforms.uMid.value.lerp(mid, Math.min(1,dt*0.4));

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
  // when not actively looking, drift the orbit back behind the ship
  if(!camLook.active){
    camLook.yaw   += (0-camLook.yaw)  *Math.min(1,dt*1.6);
    camLook.pitch += (0-camLook.pitch)*Math.min(1,dt*1.6);
  }
  const ang=shipState.heading + camLook.yaw;
  const horiz=Math.cos(camLook.pitch);
  const tx=shipState.x - Math.sin(ang)*back*horiz;
  const tz=shipState.z - Math.cos(ang)*back*horiz;
  const ty=ship.position.y + up + Math.sin(camLook.pitch)*back;
  camPos.lerp(new THREE.Vector3(tx,ty,tz), Math.min(1,dt*(camLook.active?6:2.2)));
  camera.position.copy(camPos);
  camera.lookAt(shipState.x, ship.position.y+lookUp, shipState.z);
}

function updatePrompt(){
  if(W.paused){ hidePrompt(); return; }
  const gh=nearbyGhost();
  if(gh){ showPrompt(`<b>👻 Spookschip!</b><br>${A_E} Enteren en plunderen… durf jij?`); return; }
  const h=nearestHarbor();
  if(h){ showPrompt(`<b>${h.icon} ${h.name}</b><br>${A_E} Aanmeren verkoop, kook & upgrade`); return; }
  const isl=nearbyIsland();
  if(isl){ showPrompt(`<b>🏝️ ${isl.name}</b><br>${A_E} ${isl.treasure&&!isl.visited?'Ga aan land schat zoeken!':'Verken het eiland'}`); return; }
  const s=nearbySailor(); if(s){ showPrompt(`<b>⛑️ Gestrande zeeman!</b><br>${A_E} Redden voor beloning`); return; }
  const bt=nearbyBottle(); if(bt){ showPrompt(`<b>📜 Flessenpost drijft voorbij</b><br>${A_E} Openmaken`); return; }
  const ex=nearbyExotic(); if(ex){ showPrompt(`<b>🐠 Exotisch zeedier!</b><br>${A_E} Vangen voor je aquarium`); return; }
  const b=nearestBed();
  if(b){ showPrompt(`<b>${bedName(b)}</b> <small>(${b.amount} over)</small><br>${PRESS} ${A_SP} en houd vast`); return; }
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
  const p=rain.pos;
  const snow = biomeAt(shipState.x,shipState.z)==='storm';   // polar sea: snow instead of rain
  const speed = snow ? 26 : (W.weather==='storm'?160:90);
  const drift = snow ? Math.sin(oceanUniforms.uTime.value*0.7)*6 : 0;
  rain.points.material.color.setHex(snow?0xffffff:0xaaccee);
  rain.points.material.size = snow?1.4:0.7;
  rain.points.material.opacity = snow?0.85:0.5;
  for(let i=0;i<rain.N;i++){
    p[i*3+1]-=speed*dt;
    if(snow) p[i*3]+=drift*dt*(0.5+((i%7)/7));
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
mark('audio');
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
//  19b. MUSIC - generative ambient score (synthesised live, nothing to download)
//   Slow drifting chords + a sparse melody in a minor pentatonic scale, run
//   through a generated reverb. It never repeats exactly and costs 0 bytes.
// ============================================================================
const music = { on:true, started:false, bus:null, wet:null, timer:null, step:0, vol:0.5 };
function makeReverb(seconds=3.2, decay=2.4){
  const rate=actx.sampleRate, len=Math.floor(rate*seconds);
  const buf=actx.createBuffer(2,len,rate);
  for(let ch=0; ch<2; ch++){
    const d=buf.getChannelData(ch);
    for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/len, decay);
  }
  const c=actx.createConvolver(); c.buffer=buf; return c;
}
// A minor-ish sea scale; chords wander so it never sounds like a loop
const CHORDS=[ [55,65.41,82.41],   // Am
               [49,61.74,73.42],   // G
               [43.65,55,65.41],   // F
               [36.71,55,73.42] ]; // Dm-ish
const MELODY=[220,261.63,293.66,329.63,392,440,523.25];
function startMusic(){
  if(music.started||!music.on) return;
  try{
    if(!actx) actx=new (window.AudioContext||window.webkitAudioContext)();
    music.started=true;
    music.bus=actx.createGain(); music.bus.gain.value=music.vol*0.5;
    const rev=makeReverb();
    music.wet=actx.createGain(); music.wet.gain.value=0.5;
    music.bus.connect(actx.destination);
    music.bus.connect(music.wet); music.wet.connect(rev); rev.connect(actx.destination);
    scheduleMusic();
  }catch(e){ music.started=false; }
}
function voice(freq, t, dur, type, peak, filterHz){
  const o=actx.createOscillator(), g=actx.createGain(), f=actx.createBiquadFilter();
  o.type=type; o.frequency.value=freq;
  f.type='lowpass'; f.frequency.value=filterHz;
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(peak, t+dur*0.35);      // slow swell
  g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
  o.connect(f); f.connect(g); g.connect(music.bus);
  o.start(t); o.stop(t+dur+0.1);
}
function scheduleMusic(){
  if(!music.started) return;
  const bar=7.5;                                   // slow, tidal pace
  const t=actx.currentTime+0.1;
  const chord=CHORDS[music.step%CHORDS.length];
  // pad: each chord tone with a slightly detuned partner
  for(const f of chord){
    voice(f,      t, bar*1.25, 'sine',     0.16, 900);
    voice(f*2.005,t, bar*1.25, 'triangle', 0.05, 1400);
  }
  // bass swell on the root
  voice(chord[0]/2, t, bar*1.3, 'sine', 0.13, 320);
  // a few sparse melody notes, quieter at night so the sea stays calm
  const notes=1+Math.floor(Math.random()*3);
  for(let i=0;i<notes;i++){
    const when=t+bar*(0.15+Math.random()*0.7);
    const n=MELODY[Math.floor(Math.random()*MELODY.length)];
    voice(n, when, 2.2+Math.random()*1.5, 'sine', 0.055, 2200);
  }
  music.step++;
  music.timer=setTimeout(scheduleMusic, bar*1000);
}
function stopMusic(){
  music.started=false;
  if(music.timer){ clearTimeout(music.timer); music.timer=null; }
  if(music.bus){ try{ music.bus.gain.linearRampToValueAtTime(0.0001, actx.currentTime+0.6); }catch(e){} }
}
function toggleMusic(){
  music.on=!music.on;
  if(music.on){ startMusic(); if(music.bus) music.bus.gain.setValueAtTime(music.vol*0.5, actx.currentTime); toast('🎵 Muziek aan'); }
  else { stopMusic(); toast('🔇 Muziek uit'); }
  try{ localStorage.setItem('mosselkapitein_music', music.on?'1':'0'); }catch(e){}
  refreshMusicBtn();
}
function refreshMusicBtn(){ const b=$('ubMusic'); if(b) b.textContent = music.on?'🎵':'🔇'; }
try{ if(localStorage.getItem('mosselkapitein_music')==='0') music.on=false; }catch(e){}

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
  if(W.dead) return;                                          // the run is over
  if($('overlay').style.display==='flex' && !mapOpen) return; // a modal handles its own pause
  W.paused=!W.paused;
  if(W.paused){ openModal(`<h2>⏸️ Pauze</h2><div class="sub">Dag ${W.day} · ${$('clock').textContent} · ${WEATHERS[W.weather].name}</div>
    <div class="grid">
      <div class="card2"><h3>🪙 Munten</h3><p>${Math.floor(W.gold)}</p></div>
      <div class="card2"><h3>⭐ Kapitein</h3><p>Niveau ${W.level} · ${Math.floor(W.xp)}/${W.xpNext} XP<br>🏅 ${fameTitle()} · ${W.fame} roem</p></div>
      <div class="card2"><h3>🦪 Ruim</h3><p>${holdCount()}/${W.holdMax}</p></div>
      <div class="card2"><h3>🚢 Schip</h3><p>${SHIPS[W.ship].name}</p></div>
      ${W.contracts.length?`<div class="card2" style="grid-column:1/-1"><h3>📜 Contracten</h3><p>${W.contracts.map(c=>`${contractLabel(c)} naar <b>${c.harbor}</b> vóór dag ${c.deadline} (aan boord ${contractHave(c)})`).join('<br>')}</p></div>`:''}
      ${boomLine()?`<div class="card2" style="grid-column:1/-1"><h3>📣 Markt</h3><p>${boomLine()}</p></div>`:''}
    </div>
    <div style="text-align:center;margin-top:16px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
      <button class="btn" onclick="window.__resume()">▶️ Verder spelen</button>
      <button class="btn alt" onclick="window.__manual()">📖 Handleiding</button>
      <button class="btn alt" onclick="window.__saveCode()">💾 Reis-code</button>
      ${postFX.available?`<button class="btn alt" onclick="window.__toggleFX()">✨ Gloed: ${postFX.enabled?'aan':'uit'}</button>`:''}
    </div>`);
  } else closeModal();
}
window.__resume=()=>{ W.paused=false; closeModal(); };
window.__toggleFX=()=>{ setPostFX(!postFX.enabled); closeModal(); W.paused=false; togglePause(); };

// ---- Handleiding / manual (opened from the pause menu) ----
function openManual(){
  W.paused=true;
  const key=(k)=> IS_TOUCH ? '' : `<kbd>${k}</kbd> `;
  openModal(`<h2>📖 Handleiding</h2>
    <div class="sub">Alles wat je moet weten om de beroemdste mosselkapitein ter wereld te worden.</div>
    <div class="grid">
      <div class="card2"><h3>🎯 Doel</h3><p>Vang mosselen op de banken (groene blips op de sonar), kook ze in de kombuis-minigame en verkoop je gerechten in havens. Verdien munten, level je vaardigheden, koop upgrades en betere schepen, en ontdek de geheimen van de zee.</p></div>
      <div class="card2"><h3>🕹️ Besturing</h3><p>${IS_TOUCH
        ? 'Vaar met de <b>joystick</b> (linksonder). <b>⚡ Boost</b> vasthouden voor extra snelheid. <b>🦪 Vang</b> vasthouden bij een bank. <b>📡 Sonar</b> en <b>⚓ Actie</b> tikken. Knoppen rechtsboven: kaart 🗺️, werf 🔧, camera 📷, meeuw 🐦, pauze ⏸️. Sleep met een tweede vinger over het water om rond te kijken.'
        : `${key('W')}${key('S')} gas/achteruit · ${key('A')}${key('D')} sturen · ${key('Shift')} boost · ${key('F')} sonar · ${key('Spatie')} vangen · ${key('E')} actie/aanmeren · ${key('H')} harpoen · ${key('C')} camera · ${key('M')} kaart · ${key('U')} werf · ${key('G')} meeuw · ${key('P')} pauze. Sleep met de muis om rond te kijken.`}</p></div>
      <div class="card2"><h3>🦪 Vangen & koken</h3><p>Ping met de <b>${IS_TOUCH?'📡 Sonar':'F'}</b> om mosselbanken te vinden. Een echo blijft maar korte tijd op je scherm staan, dus ping regelmatig opnieuw. Vaar erheen, houd <b>${IS_TOUCH?'🦪 Vang':'Spatie'}</b> vast tot je ruim vol is. Meer aan in een haven, open de <b>Kombuis</b> en kook met perfecte timing: hoe beter je timing, hoe waardevoller het gerecht.</p></div>
      <div class="card2"><h3>🛡️ Romp & overleven</h3><p>Je <b>romp</b> staat in de balk bovenin. Monsters slaan er stukken uit; buiten gevechten herstelt hij langzaam vanzelf. Koop <b>Onderhoud</b> op de werf om hem in één keer volledig te repareren. Loopt je romp leeg, dan <b>zink je en ben je je voortgang kwijt</b>. Vlucht dus op tijd!</p></div>
      <div class="card2"><h3>🧭 De Vier Zeeën</h3><p>Elke hoek van de oceaan heeft eigen vangst: <b>❄️ IJszee</b> (noord) met zwemmende <b>zalmscholen</b>, <b>🏝️ Parelzee</b> (oost) met kostbare <b>pareloesters</b> die vaak vlak bij de <b>koraalriffen</b> liggen (pas op: koraal schuurt je vaart eruit, vaar er omheen), <b>🌫️ Schemerzee</b> (west) met <b>inktvis die alleen bij nacht</b> opduikt, en de vertrouwde mosselbanken aan de kust. Vang het ver weg en verkoop het aan de andere kant van de kaart voor de beste prijs!</p></div>
      <div class="card2"><h3>📜 Contracten en roem</h3><p>Elke haven hangt per dag één <b>contract</b> uit: lever een vangst of gerecht vóór een deadline voor een premie plus <b>roem</b>. Roem krijg je ook voor missies en monsters en bepaalt je titel, van Dekknecht tot <b>Legendarische Mosselkapitein</b>. Maximaal drie contracten tegelijk.</p></div>
      <div class="card2"><h3>📣 Levende markt</h3><p>Veel van hetzelfde verkopen in één haven drukt daar de prijs; de volgende ochtend is de vraag grotendeels hersteld. Let op het <b>marktbericht</b>: een haven betaalt dan twee dagen bijna dubbel voor één soort. Spreid je vangst over havens en zeeën.</p></div>
      <div class="card2"><h3>🌊 De open zee</h3><p>Ontdek verborgen eilanden met schatten 🏴‍☠️, red gestrande zeelieden ⛑️, vang exotische dieren voor je aquarium 🐠, vind gouden mosselen 🌟 en flessenpost met missies 📜. Let op het weer en de dag-/nachtcyclus.</p></div>
      <div class="card2" style="grid-column:1/-1"><h3>🐙 Zeemonsters: waar en wanneer</h3>
        <p>Koop eerst het <b>🔱 Harpoenkanon</b> op de werf (1500). Grotere schepen hebben meer vuurkracht en een sterkere romp.</p>
        <p style="margin-top:8px">
        <b>🦑 Kraken</b> - ligt op de loer in het <b>uiterste noordwesten</b> van de mistige zone. Vaar daarheen; zodra je in de buurt komt rijst hij op. Verslagen? Dan blijft hij <b>3 dagen</b> weg.<br>
        <b>🐉 Zeeslang</b> - zwerft rond in de <b>stormachtige noordzee</b> (het hele noorden). Ziet hij je, dan jaagt hij op je. Na een kill <b>3 dagen</b> weg.<br>
        <b>👻 Spookschip</b> - verschijnt <b>elke nacht</b> (tussen 21:00 en 05:00), ergens bij je in de buurt. Enter het met ${IS_TOUCH?'<b>⚓ Actie</b>':'<b>E</b>'} voor spookgoud; bij dageraad lost het op.<br>
        <b>🦀 Reuzenkrab</b> - belegert <b>om de 3 à 4 dagen</b> een willekeurige haven. Je krijgt een alarmmelding en ziet hem op de kaart.
        </p>
        <p style="margin-top:8px;color:var(--muted)">Tip: alle monsters staan ook op je <b>zeekaart</b> en <b>sonar</b> zodra ze actief of ontdekt zijn.</p></div>
    </div>
    <div style="text-align:center;margin-top:16px"><button class="btn" onclick="window.__backToPause()">◀ Terug</button></div>`);
}
window.__manual=openManual;
window.__backToPause=()=>{ closeModal(); W.paused=false; togglePause(); };

// ============================================================================
//  21b. SAVE / LOAD  (localStorage survives reloads & app restarts)
// ============================================================================
const SAVE_KEY='mosselkapitein_save_v1';
let loadedFromSave=false;

function serializeSave(){
  return { v:1,
    gold:W.gold, level:W.level, xp:W.xp, xpNext:W.xpNext,
    skills:W.skills, skillXp:W.skillXp,
    inv:W.inv, dishes:W.dishes, dishQual:W.dishQual,
    ship:W.ship, holdMax:W.holdMax,
    engineLvl:W.engineLvl, harvestLvl:W.harvestLvl, sonarLvl:W.sonarLvl,
    hasWeatherMachine:W.hasWeatherMachine, hasSeagull:W.hasSeagull, hasRestaurant:W.hasRestaurant,
    hasHarpoon:W.hasHarpoon, hull:W.hull, krakensSlain:W.krakensSlain, krakenGoneUntilDay:W.krakenGoneUntilDay,
    serpentsSlain:W.serpentsSlain, serpentGoneUntilDay:W.serpentGoneUntilDay, ghostsLooted:W.ghostsLooted,
    crabsSlain:W.crabsSlain, crabNextDay:W.crabNextDay,
    seagullName:W.seagullName, aquarium:W.aquarium,
    time:W.time, day:W.day,
    questsDone:[...W.questsDone],
    rescued:W.rescued, treasures:W.treasures, bottles:W.bottles,
    totalCaught:W.totalCaught, totalCooked:W.totalCooked, totalEarned:W.totalEarned, totalSold:W.totalSold, totalGold:W.totalGold,
    totalZalm:W.totalZalm, totalParel:W.totalParel, totalInktvis:W.totalInktvis, parelInIJszee:W.parelInIJszee,
    dirt:W.dirt,
    fame:W.fame, legendShown:W.legendShown, contracts:W.contracts, contractsDone:W.contractsDone,
    contractsDelivered:W.contractsDelivered, contractSeed:W.contractSeed, market:W.market, boom:W.boom,
    islandsVisited: islandMeshes.map(i=>!!i.visited),
    ship_x:shipState.x, ship_z:shipState.z, ship_h:shipState.heading,
  };
}
function saveGame(){
  if(!W.started || W.dead) return;      // a sunk run must not be written back
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(serializeSave())); }
  catch(e){ /* private mode / quota ignore */ }
}

function hasSave(){ try{ return !!localStorage.getItem(SAVE_KEY); }catch(e){ return false; } }

function loadGame(){
  let d; try{ d=JSON.parse(localStorage.getItem(SAVE_KEY)); }catch(e){ return false; }
  return applySave(d);
}
function applySave(d){
  if(!d || d.v!==1) return false;
  // scalars & objects
  const keys=['gold','level','xp','xpNext','skills','skillXp','inv','dishes','dishQual','ship','holdMax',
    'engineLvl','harvestLvl','sonarLvl','hasWeatherMachine','hasSeagull','hasRestaurant',
    'hasHarpoon','hull','krakensSlain','krakenGoneUntilDay',
    'serpentsSlain','serpentGoneUntilDay','ghostsLooted','crabsSlain','crabNextDay',
    'seagullName','aquarium','time','day','rescued','treasures','bottles',
    'totalCaught','totalCooked','totalEarned','totalSold','totalGold',
    'totalZalm','totalParel','totalInktvis','parelInIJszee','dirt',
    'fame','legendShown','contracts','contractsDone','contractsDelivered','contractSeed','market','boom'];
  for(const k of keys){ if(d[k]!==undefined) W[k]=d[k]; }
  if(W.inv.krakeninkt===undefined) W.inv.krakeninkt=0;
  if(W.inv.schub===undefined) W.inv.schub=0;
  if(W.inv.schaar===undefined) W.inv.schaar=0;
  for(const k of ['zalm','parel','inktvis']) if(W.inv[k]===undefined) W.inv[k]=0;
  for(const k of ['totalZalm','totalParel','totalInktvis']) if(W[k]===undefined) W[k]=0;
  if(W.parelInIJszee===undefined) W.parelInIJszee=false;
  if(W.dirt===undefined) W.dirt=0;
  if(!W.dishQual) W.dishQual={};
  if(W.totalSold===undefined) W.totalSold=0;
  if(typeof W.fame!=='number') W.fame=0;
  if(!Array.isArray(W.contracts)) W.contracts=[];
  if(!Array.isArray(W.contractsDone)) W.contractsDone=[];
  if(!W.market || typeof W.market!=='object') W.market={};
  if(typeof W.contractSeed!=='number') W.contractSeed=Math.floor(Math.random()*1e9);
  W.hullMax=100+W.ship*25; W.hull=Math.min(W.hull??W.hullMax, W.hullMax);
  if(!W.hull) W.hull=W.hullMax;
  W.questsDone = new Set(d.questsDone||[]);
  // rebuild the ship mesh for the saved hull
  buildShip();
  seagull.visible = !!W.hasSeagull;
  if(W.hasHarpoon) kraken.known=true;
  refreshHarpoonBtn();
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

// ---- Reis-code: voortgang als tekst meenemen naar een andere telefoon of browser ----
function saveCode(){ return 'MK1.'+btoa(unescape(encodeURIComponent(JSON.stringify(serializeSave())))); }
function parseSaveCode(s){
  s=String(s||'').replace(/\s+/g,''); if(!s.startsWith('MK1.')) return null;
  try{ const d=JSON.parse(decodeURIComponent(escape(atob(s.slice(4))))); return (d && d.v===1) ? d : null; }catch(e){ return null; }
}
const TA_STYLE='width:100%;box-sizing:border-box;height:84px;font-size:11px;font-family:monospace;background:rgba(0,0,0,.35);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:8px;resize:none';
function openSaveCode(){
  const code=(W.started||loadedFromSave) ? saveCode() : '';
  openModal(`<h2>💾 Reis-code</h2>
    <div class="sub">Neem je reis mee naar een andere telefoon of browser: kopieer de code hier, plak hem daar en kies Reis laden. Handig als back-up.</div>
    ${code?`<textarea id="saveOut" readonly style="${TA_STYLE}">${code}</textarea>
    <div style="text-align:center;margin:8px 0 14px"><button class="btn" onclick="window.__copySave()">📋 Kopieer code</button></div>`:''}
    <h3 style="margin:6px 0">Reis laden</h3>
    <textarea id="saveIn" placeholder="Plak hier een reis-code" style="${TA_STYLE}"></textarea>
    <div style="text-align:center;margin-top:10px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
      <button class="btn sell" onclick="window.__importSave()">⚓ Reis laden</button>
      <button class="btn alt" onclick="window.__closeSaveCode()">◀ Terug</button></div>`);
}
window.__saveCode=openSaveCode;
window.__copySave=async()=>{
  const ta=$('saveOut'); if(!ta) return;
  try{ await navigator.clipboard.writeText(ta.value); toast('📋 Reis-code gekopieerd.','good'); }
  catch(e){ ta.focus(); ta.select(); try{ document.execCommand('copy'); toast('📋 Reis-code gekopieerd.','good'); }catch(e2){ toast('Selecteer de code en kopieer hem handmatig.'); } }
};
window.__importSave=()=>{
  const d=parseSaveCode(($('saveIn')||{}).value);
  if(!d){ toast('❌ Dat is geen geldige reis-code.'); return; }
  if((W.started||loadedFromSave) && !confirm('Je huidige reis wordt vervangen door deze code. Doorgaan?')) return;
  W.started=false;                                    // zodat de autosave de nieuwe reis niet overschrijft
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(d)); }catch(e){ toast('❌ Opslaan lukt niet in deze browser.'); return; }
  location.reload();
};
window.__closeSaveCode=()=>{ closeModal(); if(W.started){ W.paused=false; togglePause(); } };
window.__newGame=()=>{ if(confirm('Nieuw spel starten? Je huidige voortgang gaat verloren.')) newGame(); };

// Autosave: every few seconds while playing, and whenever the app is hidden/closed
setInterval(()=>{ if(W.started && !W.paused) saveGame(); }, 5000);
addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden') saveGame(); });
addEventListener('pagehide', saveGame);
addEventListener('beforeunload', saveGame);

// ============================================================================
//  22. START
// ============================================================================
mark('start');
function startGame(){
  W.started=true;
  document.getElementById('title').classList.add('hidden');
  if(!actx){ try{ actx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} }
  startMusic();                       // needs this user gesture to be allowed on iOS
  refreshMusicBtn();
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
  setTimeout(()=>toast(IS_TOUCH ? '👆 Sleep met een tweede vinger over het water om rond te kijken.'
                                : '🖱️ Sleep met de muis over het water om rond te kijken.'), 4200);
}
$('playBtn').addEventListener('click',startGame);

// Unified close: floating ✕ + tap/click on the dark backdrop close whatever modal is open.
function closeAnyModal(){ if(W.dead) return; if(mapOpen) window.__closemap(); else closeModal(); }
$('overlayClose').addEventListener('click',closeAnyModal);
$('overlay').addEventListener('click',e=>{ if(e.target===$('overlay')) closeAnyModal(); });

if(IS_TOUCH){
  setupTouch();
  $('sonarLabel').innerHTML='📡 SONAR';
}
setupLook(); // drag the water (touch or mouse) to look around
// music button also works with a mouse (the util row is visible on desktop too)
{ const mb=$('ubMusic'); if(mb && !IS_TOUCH) mb.addEventListener('click', toggleMusic); }

// expose for debugging / test harness
window.W=W; window.shipState=shipState; window.beds=beds; window.setWeatherDbg=setWeather;
window.keys=keys; window.stepSim=stepSim; window.startHarvest=startHarvest; window.doHarvest=doHarvest;
window.openHarbor=openHarbor; window.harborMarkers=harborMarkers; window.startCook=startCook; window.RECIPES=RECIPES;
window.cookGame=cookGame; window.cookHit=cookHit;
window.camera=camera; window.camLook=camLook;
window.kraken=kraken; window.fireHarpoon=fireHarpoon; window.beginKrakenFight=beginKrakenFight; window.krakenHit=krakenHit; window.KRAKEN_LAIR=KRAKEN_LAIR;
window.serpent=serpent; window.serpentHit=serpentHit; window.ghost=ghost; window.lootGhost=lootGhost; window.nearbyGhost=nearbyGhost;
window.crab=crab; window.crabHit=crabHit; window.beginCrabSiege=beginCrabSiege; window.weaponDamage=weaponDamage;
window.getShipMesh=()=>shipMesh;
window.music=music; window.mapView=mapView; window.drawBigMap=drawBigMap;
window.sonarPing=sonarPing; window.bedVisible=bedVisible; window.sonarNow=sonarNow;
window.oceanUniforms=oceanUniforms; window.damageHull=damageHull; window.sinkShip=sinkShip;
window.toast=toast; window.renderer=renderer; window.scene=scene; window.composer=composer; window.postFX=postFX; window.setPostFX=setPostFX; window.bloomPass=bloomPass;

// Restore a previous save (if any) and adjust the title screen accordingly
if(hasSave()){
  loadedFromSave = loadGame();
}
if(loadedFromSave){
  $('playBtn').textContent='⚓ Verder spelen';
}
// Links under the title: new game (only when a save exists) and the travel code
{
  const box=$('titleLinks');
  const LS='background:none;border:none;color:#cfe0ef;text-decoration:underline;font-size:13px;cursor:pointer;font-family:inherit;text-shadow:0 1px 5px rgba(0,0,0,.9);margin:0 8px';
  if(box){
    box.innerHTML=(loadedFromSave?`<button id="newGameBtn" style="${LS}">🆕 Nieuw spel beginnen</button>`:'')
      +`<button id="saveCodeBtn" style="${LS}">💾 Reis-code</button>`;
    const nb=$('newGameBtn'); if(nb) nb.addEventListener('click',window.__newGame);
    const sb=$('saveCodeBtn'); if(sb) sb.addEventListener('click',openSaveCode);
  }
}

// Kick off loop
$('loadNote').textContent = loadedFromSave ? '✅ Opgeslagen reis gevonden klik Verder spelen.' : '✅ Klaar! Klik Uitvaren.';
requestAnimationFrame(update);
mark('klaar');
window.gameLoaded=true;
try{ sessionStorage.removeItem('mk_heal'); }catch(e){}   // tells the index-watchdog the module came alive
