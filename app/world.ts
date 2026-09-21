import * as THREE from "three";
import { createCameraControls } from "./camera-controls";
import { prepareStaticGarden, createAdaptiveResolution } from "./scene-performance";
import { SoftwareRenderer } from "./software-renderer";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { surfaceTexture, shadowTexture, earGeometry as createEarGeometry, addFurSilhouette } from "./appearance";
import { createTree, createMeadow, canopyShadowTexture } from "./vegetation";
import { createNeckRuff, createPlumeTail } from "./cat-coat";

export type GameSnapshot = { mode: "intro" | "playing" | "paused" | "won"; collected: number; seconds: number; moving: boolean };
export type GameAPI = { start: () => void; pause: (paused: boolean) => void; key: (code: string, pressed: boolean) => void; jump: () => void; meow: () => void; sound: (enabled: boolean) => void; resetCamera: () => void; snapshot: () => GameSnapshot; dispose: () => void };
type Collider = { x: number; z: number; radius: number; height: number };
const FISH_POSITIONS: [number, number][] = [[1, 2], [-3, 1], [-6, -3], [-9, -6], [-4, -10], [1, -11], [6, -8], [10, -3], [9, 3], [5, 8], [-1, 10], [-7, 7]];

export function createGame(host: HTMLDivElement, onState: (s: GameSnapshot) => void, notify: (message: string) => void): GameAPI {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#dfebed");
  scene.fog = new THREE.Fog("#dfebed", 40, 95);
  const renderCanvas = document.createElement("canvas");
  const context = renderCanvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "high-performance" });
  const renderer = context ? new THREE.WebGLRenderer({ canvas: renderCanvas, context, antialias: true, alpha: false, powerPreference: "high-performance" }) : new SoftwareRenderer();
  const software = renderer instanceof SoftwareRenderer;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  if (renderer instanceof THREE.WebGLRenderer) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
  }
  let environment: THREE.WebGLRenderTarget | null = null;
  if (renderer instanceof THREE.WebGLRenderer) {
    const pmrem=new THREE.PMREMGenerator(renderer), room=new RoomEnvironment();
    environment=pmrem.fromScene(room,.06);scene.environment=environment.texture;scene.environmentIntensity=.32;room.dispose();pmrem.dispose();
  }
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-label", "Jardim 3D da Rova Tech");
  const camera = new THREE.PerspectiveCamera(43, 1, .1, 130);
  const hemisphere = new THREE.HemisphereLight(0xeaf5ff, 0x78915d, 1.7);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xffefd5, 2.8);
  sun.position.set(-12, 22, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -23, right: 23, top: 23, bottom: -23, near: 1, far: 65 });
  sun.shadow.normalBias = .045;
  sun.shadow.bias = -.00015;
  sun.shadow.radius = 4;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xd4eced, .7);
  fill.position.set(12, 8, -10); scene.add(fill);
  const surfaceMaps={grass:surfaceTexture("grass"),wood:surfaceTexture("wood"),leaves:surfaceTexture("leaves")};
  const furMap=new THREE.TextureLoader().load("./gato-fur-texture.webp");furMap.colorSpace=THREE.SRGBColorSpace;furMap.wrapS=furMap.wrapT=THREE.RepeatWrapping;furMap.repeat.set(3,2);furMap.anisotropy=4;
  const furMaterial=new THREE.MeshPhysicalMaterial({color:"#fffefb",map:furMap,bumpMap:furMap,bumpScale:.018,roughness:.97,sheen:.85,sheenColor:new THREE.Color("#fff3e5"),sheenRoughness:.8,envMapIntensity:.35});
  const furShade=furMaterial.clone();furShade.color.set("#f5f3e9");
  const shadowMap=shadowTexture();
  const shadowGeo=new THREE.PlaneGeometry(1,1);
  const softShadow=(parent:THREE.Object3D,x:number,z:number,width:number,depth:number,opacity=.65)=>{const m=new THREE.Mesh(shadowGeo,new THREE.MeshBasicMaterial({map:shadowMap,transparent:true,opacity,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));m.rotation.x=-Math.PI/2;m.position.set(x,.064,z);m.scale.set(width,depth,1);parent.add(m);return m;};
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const material = (color: string, roughness = .85) => {
    const id = color + roughness;
    if (!materials.has(id)) {
      const m=new THREE.MeshStandardMaterial({color,roughness,flatShading:false});
      const wood=["#8a6d48","#d3b381","#bd905e","#c99f6b","#c39463","#a67d50"];
      const leaves=["#739850","#809f56","#99ab64","#719859","#6e995e","#89a55f","#799958"];
      if(wood.includes(color)){m.map=surfaceMaps.wood;m.bumpMap=surfaceMaps.wood;m.bumpScale=.028;}
      if(leaves.includes(color)){m.map=surfaceMaps.leaves;m.bumpMap=surfaceMaps.leaves;m.bumpScale=.045;}
      materials.set(id,m);
    }
    return materials.get(id)!;
  };
  const sphereGeometry = new THREE.SphereGeometry(1, software ? 24 : 40, software ? 16 : 28);
  const catSphereGeometry = new THREE.SphereGeometry(1, software ? 36 : 64, software ? 24 : 40);
  const smallSphereGeometry = new THREE.SphereGeometry(1,16,10);
  const boxGeometry = new RoundedBoxGeometry(1,1,1,3,.055);
  const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 48);
  function mesh(geometry: THREE.BufferGeometry, color: string, parent: THREE.Object3D, x: number, y: number, z: number, sx = 1, sy = sx, sz = sx, shadow = true) {
    const m = new THREE.Mesh(geometry, color==="#fffdf5"?furMaterial:color==="#eeeede"?furShade:material(color)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = shadow; m.receiveShadow = true; if(parent===scene && y<.15 && sy<.12) m.userData.floorOrder=1800-y; parent.add(m); return m;
  }
  const sphere = (p: THREE.Object3D, c: string, x: number, y: number, z: number, sx = 1, sy = sx, sz = sx, shadow = true) => mesh(c==="#fffdf5"||c==="#eeeede"?catSphereGeometry:Math.max(sx,sy,sz)<.25?smallSphereGeometry:sphereGeometry, c, p, x, y, z, sx, sy, sz, shadow);
  const box = (p: THREE.Object3D, c: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) => mesh(boxGeometry, c, p, x, y, z, sx, sy, sz);
  const cylinder = (p: THREE.Object3D, c: string, x: number, y: number, z: number, r: number, h: number) => mesh(cylinderGeometry, c, p, x, y, z, r, h, r);
  const colliders: Collider[] = [];
  const greenery: ReturnType<typeof createTree>[] = [];
  let seed = 181;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const grass = "#7d9160";
  cylinder(scene, "#b69262", 0, -.84, 0, 20.4, 1.4).userData.floorOrder = 2000;
  const lawn=cylinder(scene, grass, 0, -.2, 0, 20.6, .45);
  const lawnMaterial=material(grass);lawnMaterial.map=surfaceMaps.grass;lawnMaterial.bumpMap=surfaceMaps.grass;lawnMaterial.bumpScale=.04;lawnMaterial.roughness=1;
  lawn.userData.floorOrder=1900;
  if(software){lawn.visible=false;const terrain=new THREE.Mesh(new THREE.PlaneGeometry(80,80,32,32),lawnMaterial);terrain.rotation.x=-Math.PI/2;terrain.position.y=.025;scene.add(terrain);}
  const ground = cylinder(scene, "#b3c685", 0, -1.61, 0, 100, .2); ground.receiveShadow = true; ground.userData.skipSoftware = true;
  scene.add(createMeadow(software));
  const canopyMap = canopyShadowTexture();
  // A soft loop of stepping stones, with a short path through the center.
  for (let i = 0; i < 64; i++) {
    const a = i / 64 * Math.PI * 2;
    const r = 10.4 + Math.sin(a * 3) * .5;
    const stone = sphere(scene, i % 3 ? "#d8c99c" : "#e5d7ac", Math.cos(a) * r, .025, Math.sin(a) * r, .44 + random() * .16, .065, .32 + random() * .13, false);
    stone.rotation.y = random() * 3;
  }
  for (let i = 0; i < 14; i++) sphere(scene, "#dccc9f", -2 + Math.sin(i * .5) * .65, .03, 9 - i * 1.2, .43, .06, .32, false);
  function tree(x: number, z: number, s: number, index: number) {
    const g = createTree(317 + index * 179, 7.2 * s, index % 3 === 1 ? "ash" : "oak", software);
    g.position.set(x, .025, z); g.rotation.y = index * 1.81; scene.add(g);
    colliders.push({ x, z, radius: .55 * s, height: 8 });
    greenery.push(g);
    const shadow = softShadow(scene,x+1.1*s,z-.7*s,7*s,5.5*s,software?.7:.36);
    (shadow.material as THREE.MeshBasicMaterial).map = canopyMap;
    shadow.rotation.z = index * .71;
    softShadow(scene,x,z,1.8*s,1.6*s,.8);
  }
  [[-14,-8,1.05],[-10,-14,1.15],[-3,-16,1.08],[6,-15,1.18],[14,-9,1.12],[16,1,1],[-16,1,1.05],[-14,10,.85],[15,10,.8],[-5,18,.8]].forEach(([x,z,s],i)=>tree(x,z,s,i));
  function bush(x: number, z: number, s: number) {
    const g = createTree(Math.floor(random()*65000),1.4*s,"bush",software);
    g.position.set(x,.025,z);g.rotation.y=random()*Math.PI*2;scene.add(g);greenery.push(g);
    softShadow(scene,x,z,2.6*s,2.3*s,.65);
  }
  for (let i=0;i<14;i++){const a=i/14*Math.PI*2;const r=17.8+random()*.6;bush(Math.cos(a)*r,Math.sin(a)*r,.9+random()*.6);}
  // Low wooden garden fence, capped posts, and an open entry.
  const fenceColor = "#d3b381";
  for (let i = 0; i < 44; i++) {
    const a = i / 44 * Math.PI * 2;
    if (a > 1.18 && a < 1.85) continue;
    const g = new THREE.Group();g.position.set(Math.cos(a)*18.4,0,Math.sin(a)*18.4);g.rotation.y=-a;scene.add(g);
    box(g,fenceColor,0,.65,0,.16,1.3,.18);sphere(g,"#e1c190",0,1.31,0,.135,.08,.135);
    box(g,fenceColor,0,.5,.65,.095,.12,2.05);box(g,fenceColor,0,.99,.65,.095,.12,2.05);
  }
  // Pond and reeds; the shallow water slows the cat with a visible cue.
  const pond = new THREE.Group(); pond.position.set(5,.045,-1.3);scene.add(pond);
  sphere(pond,"#d1c899",0,0,0,3.3,.095,2.65,false).userData.floorOrder=1700;
  const water = sphere(pond,"#72babe",0,.045,0,2.95,.08,2.28,false);
  water.userData.floorOrder=1600;
  water.material = new THREE.MeshPhysicalMaterial({color:"#70afb6",roughness:.14,metalness:.1,clearcoat:1,clearcoatRoughness:.08,envMapIntensity:1.2});
  const ripples: THREE.Mesh[]=[];
  for(let j=0;j<3;j++){const r=new THREE.Mesh(new THREE.TorusGeometry(.46+j*.36,.013,5,48),material("#b7dfcc"));r.rotation.x=Math.PI/2;r.position.set(-.4,.134,.1);r.scale.y=.65;pond.add(r);r.userData.floorOrder=1500;ripples.push(r);}
  for(let i=0;i<6;i++){const a=i*.8;const lily=cylinder(pond,"#609f65",Math.cos(a)*1.6,.14,Math.sin(a)*1.3,.24,.035);if(i%2===0)sphere(pond,"#edc6aa",lily.position.x,.21,lily.position.z,.12,.08,.12,false);}
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2;const x=Math.cos(a)*3.05,z=Math.sin(a)*2.4;const rock=sphere(pond,i%2?"#bac3a0":"#cdd0ae",x,.14,z,.3+random()*.2,.2+random()*.18,.28);rock.rotation.y=random()*3;}
  for(let j=0;j<8;j++){const x=7.35+random()*.5,z=-2.9+random()*.8;const reed=cylinder(scene,"#7b9050",x,.5,z,.028,.9);reed.rotation.z=(random()-.5)*.25;cylinder(scene,"#967148",x,.98,z,.065,.24);}
  // Garden bench with softened edges and fine wood grain.
  const bench = new THREE.Group();bench.position.set(-8,0,-1.8);bench.rotation.y=.25;scene.add(bench);
  for(let i=0;i<3;i++)box(bench,"#bd905e",0,.72,(i-1)*.25,2.8,.16,.21);
  for(let i=0;i<2;i++)box(bench,"#c99f6b",0,1.2+i*.3,-.4,2.8,.22,.15);
  [-1,1].forEach(x=>{box(bench,"#657556",x,.39,0,.15,.72,.75);box(bench,"#657556",x,1,-.38,.12,1.4,.12);});
  colliders.push({x:-8,z:-1.8,radius:1.3,height:1});
  // Watering can, terracotta pots and a low crate to jump over.
  const can = new THREE.Group();can.position.set(-5.5,0,3.5);can.rotation.y=.6;scene.add(can);
  cylinder(can,"#739fa0",0,.4,0,.4,.7);
  const handle=new THREE.Mesh(new THREE.TorusGeometry(.36,.065,8,20),material("#739fa0"));handle.position.set(-.33,.56,0);can.add(handle);
  const spout=cylinder(can,"#739fa0",.49,.6,0,.085,.65);spout.rotation.z=-.95;sphere(can,"#9dbab1",.72,.8,0,.13,.06,.17);
  function pot(x:number,z:number){const m=new THREE.Mesh(new THREE.CylinderGeometry(.44,.32,.6,40),material("#c8815a"));m.position.set(x,.32,z);m.castShadow=true;scene.add(m);cylinder(scene,"#d79165",x,.6,z,.48,.13);cylinder(scene,"#765437",x,.68,z,.38,.02);for(let i=0;i<5;i++){const a=i*1.25;sphere(scene,"#799958",x+Math.cos(a)*.22,.82,z+Math.sin(a)*.22,.14,.38,.13);}}
  pot(-5.3,-7.2);pot(-4.3,-7.6);pot(12,4.5);
  const crate=box(scene,"#c39463",-3, .42, 5,1.4,.82,1.25);crate.rotation.y=.16;
  for(let i=0;i<3;i++)box(scene,"#a67d50",-3,.2+i*.22,5.64,1.4,.035,.025);
  colliders.push({x:-3,z:5,radius:.8,height:.83});
  // Small flowers and mushrooms along the garden paths.
  const flowerGeometry = new THREE.SphereGeometry(1,16,10);
  for (let i = 0; i < 110; i++) {
    const x=(random()-.5)*34,z=(random()-.5)*33;
    if(x*x+z*z>310 || (x-5)**2/15+(z+1.3)**2/10<1.1 || FISH_POSITIONS.some(([a,b])=>Math.hypot(a-x,b-z)<.9))continue;
    if(i%3===0){
      const color=["#eecb7c","#edb6a7","#fbf2d7"][i%3===0?Math.floor(random()*3):0];
      const h=.2+random()*.24;cylinder(scene,"#6b9153",x,h/2,z,.018,h);
      for(let j=0;j<5;j++){const a=j/5*Math.PI*2;mesh(flowerGeometry,color,scene,x+Math.cos(a)*.085,h,z+Math.sin(a)*.085,.08,.045,.08,false);}sphere(scene,"#d8a646",x,h+.025,z,.045,.035,.045,false);
    }
  }
  for(let i=0;i<12;i++){const a=random()*Math.PI*2,x=Math.cos(a)*(12+random()*3),z=Math.sin(a)*(12+random()*3);cylinder(scene,"#f3e4c4",x,.15,z,.065,.3);sphere(scene,"#d39367",x,.31,z,.22,.12,.2);}
  // Cache or batch the fixed scenery; animated parts retain their own transforms.
  const gardenBatch = prepareStaticGarden(scene,new Set<THREE.Object3D>(software ? ripples : [...ripples,...greenery]),software);
  if(process.env.NODE_ENV!=="production"&&!software)console.info("[garden-batches]",JSON.stringify(gardenBatch));
  // White cat, built as a real articulated 3D model.
  const cat = new THREE.Group();scene.add(cat);cat.position.set(0,0,5.4);cat.scale.setScalar(1.4);
  const rig=new THREE.Group();cat.add(rig);
  const white="#fffdf5",shadeWhite="#eeeede",pink="#e5aa9a",dark="#314b47";
  sphere(rig,white,0,1.01,-.13,.59,.55,.93);
  sphere(rig,white,0,1.19,.4,.49,.53,.46);
  rig.add(createNeckRuff(furMaterial,software));
  const head=new THREE.Group();head.position.set(0,1.83,.7);rig.add(head);
  sphere(head,white,0,0,0,.73,.64,.61);
  sphere(head,white,-.445,-.19,.15,.32,.31,.36);
  sphere(head,white,.445,-.19,.15,.32,.31,.36);
  const earGeometry = new THREE.ConeGeometry(1,1,3,1);
  const softEarGeometry=createEarGeometry();
  const eyeMaterial=new THREE.MeshPhysicalMaterial({color:"#7ebdc1",roughness:.14,clearcoat:1,clearcoatRoughness:.06,envMapIntensity:1.1});
  const pupilMaterial=new THREE.MeshPhysicalMaterial({color:"#152f33",roughness:.09,clearcoat:1,envMapIntensity:1.2});
  const eyes:THREE.Group[]=[];
  [-1,1].forEach(side=>{
    const ear=mesh(softEarGeometry,white,head,side*.445,.4,-.035,.91,.69,.95);ear.rotation.z=-side*.23;
    const inner=mesh(softEarGeometry,pink,head,side*.45,.435,.091,.53,.46,.3,false);inner.rotation.z=-side*.23;
    const eye=new THREE.Group();eye.position.set(side*.305,-.02,.554);head.add(eye);eyes.push(eye);
    sphere(eye,"#c7c9bd",0,0,0,.182,.216,.046,false);
    const iris=sphere(eye,"#73b6b0",0,.012,.032,.158,.187,.06,false);iris.material=eyeMaterial;
    const pupil=sphere(eye,dark,0,.016,.081,.113,.148,.031,false);pupil.material=pupilMaterial;
    sphere(eye,"#ffffff",-.041,.079,.113,.044,.049,.016,false);
    sphere(eye,"#ffffff",.035,-.029,.11,.014,.018,.012,false);
    // Subtle radial iris fibers remain actual geometry on both renderers.
    for(let j=0;j<18;j++){const a=j/18*Math.PI*2;const fleck=sphere(eye,j%2?"#4d969e":"#a7cfd0",Math.cos(a)*.112,.012+Math.sin(a)*.142,.079,.006,.019,.005,false);fleck.rotation.z=-a+Math.PI/2;}
  });
  sphere(head,white,-.145,-.245,.575,.21,.16,.155);
  sphere(head,white,.145,-.245,.575,.21,.16,.155);
  const nose=sphere(head,"#dc9695",0,-.205,.739,.068,.047,.045,false);
  sphere(head,"#dc9695",0,-.236,.741,.032,.038,.027,false);
  function line(points:THREE.Vector3[],color:string,r=.011,parent:THREE.Object3D=head){const curve=new THREE.CatmullRomCurve3(points);const m=new THREE.Mesh(new THREE.TubeGeometry(curve,18,r,8,false),material(color));parent.add(m);return m;}
  line([new THREE.Vector3(0,-.23,.743),new THREE.Vector3(0,-.3,.74),new THREE.Vector3(-.075,-.325,.715)],"#977c6e",.008);
  line([new THREE.Vector3(0,-.3,.74),new THREE.Vector3(.045,-.325,.723),new THREE.Vector3(.08,-.308,.715)],"#977c6e",.008);
  for(const side of [-1,1])for(let i=0;i<3;i++)line([new THREE.Vector3(side*.4,-.22-i*.05,.51),new THREE.Vector3(side*.73,-.22-i*.07,.57),new THREE.Vector3(side*1.01,-.18-i*.11,.48)],"#c4c5b6",.008);
  const scarf=new THREE.Mesh(new THREE.TorusGeometry(.33,.055,12,48),material("#deb25b"));scarf.rotation.x=Math.PI/2;scarf.position.set(0,1.24,.57);rig.add(scarf);
  const scarfShape=new THREE.Shape();scarfShape.moveTo(-.25,0);scarfShape.lineTo(.25,0);scarfShape.lineTo(0,-.36);scarfShape.closePath();
  const scarfTip=new THREE.Mesh(new THREE.ExtrudeGeometry(scarfShape,{depth:.03,bevelEnabled:true,bevelThickness:.025,bevelSize:.025,bevelSegments:2,steps:1}),material("#e6b858"));scarfTip.position.set(0,1.2,1.08);rig.add(scarfTip);
  const legs:THREE.Group[]=[];
  for(const x of [-.4,.4])for(const z of [-.64,.52]){const pivot=new THREE.Group();pivot.position.set(x,.71,z);rig.add(pivot);sphere(pivot,white,0,-.17,-.025,.19,.35,.205);sphere(pivot,white,0,-.5,.075,.235,.19,.29);for(let j=-1;j<=1;j++)sphere(pivot,"#e8e8dd",j*.085,-.52,.34,.011,.05,.009,false);legs.push(pivot);}
  const tailPivot=new THREE.Group();tailPivot.position.set(0,1.13,-.86);rig.add(tailPivot);
  tailPivot.add(createPlumeTail(furMaterial,software));
  if(!software){const furMeshes:THREE.Mesh[]=[];rig.traverse(o=>{if(o instanceof THREE.Mesh&&o.geometry===catSphereGeometry&&Math.max(o.scale.x,o.scale.y,o.scale.z)>.27)furMeshes.push(o);});furMeshes.forEach(m=>addFurSilhouette(m));}
  cat.rotation.y=.38;
  cat.traverse(o=>{if(o instanceof THREE.Mesh)o.castShadow=false;});
  // Soft grounding shadow remains visible on slow graphics devices.
  const contact=softShadow(scene,cat.position.x,cat.position.z,2.1,2.5,.78);
  softShadow(scene,-8,-1.8,4,2.8,.6);softShadow(scene,-3,5,2.4,2.4,.65);
  const fish: {group:THREE.Group;collected:boolean;baseY:number;ring:THREE.Mesh}[]=[];
  const fishMat=material("#e8b750",.4);
  for(const [x,z] of FISH_POSITIONS){
    const g=new THREE.Group();g.position.set(x,.83,z);scene.add(g);
    const body=new THREE.Mesh(sphereGeometry,fishMat);body.scale.set(.34,.18,.105);body.castShadow=false;g.add(body);
    const fin=mesh(earGeometry,"#e9ba59",g,-.4,0,0,.21,.27,.12);fin.rotation.z=-Math.PI/2;
    const dorsal=mesh(earGeometry,"#f2ce76",g,-.02,.19,0,.13,.17,.06);dorsal.rotation.z=-.2;
    sphere(g,"#684e32",.18,.055,.091,.034,.034,.025,false);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.57,.013,4,32),new THREE.MeshBasicMaterial({color:"#ffdc7e",transparent:true,opacity:.65}));ring.rotation.x=Math.PI/2;ring.position.y=-.67;g.add(ring);
    g.traverse(o=>{if(o instanceof THREE.Mesh)o.castShadow=false;});
    fish.push({group:g,collected:false,baseY:.83,ring});
  }
  const particles:{mesh:THREE.Mesh;velocity:THREE.Vector3;life:number}[]=[];
  const particleGeometry=new THREE.SphereGeometry(.055,5,4);
  function burst(x:number,y:number,z:number,celebrate=false){for(let j=0;j<(celebrate?80:15);j++){const p=new THREE.Mesh(particleGeometry,material(["#ffdf81","#fff6ce","#e6b667","#9db77c"][j%4]));p.position.set(x,y,z);scene.add(p);particles.push({mesh:p,velocity:new THREE.Vector3((random()-.5)*(celebrate?10:3),1+random()*(celebrate?8:3),(random()-.5)*(celebrate?10:3)),life:celebrate?3:1});}}
  // Sparse floating butterflies: no gameplay depends on sound.
  const butterflies:THREE.Group[]=[];
  for(let j=0;j<7;j++){const g=new THREE.Group();const c=j%2?"#f8d695":"#e2c7a2";sphere(g,c,-.09,0,0,.12,.018,.17,false);sphere(g,c,.09,0,0,.12,.018,.17,false);sphere(g,"#80734e",0,0,0,.022,.02,.12,false);scene.add(g);butterflies.push(g);}
  let state:GameSnapshot={mode:"intro",collected:0,seconds:0,moving:false};
  const keys=new Set<string>();
  const destination=new THREE.Vector3();let hasDestination=false;
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),floorPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
  const targetMarker=new THREE.Mesh(new THREE.TorusGeometry(.28,.025,5,24),new THREE.MeshBasicMaterial({color:"#fff3c7"}));targetMarker.rotation.x=Math.PI/2;targetMarker.visible=false;scene.add(targetMarker);
  function pointToWalk(event:PointerEvent){if(state.mode!=="playing")return;const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);if(raycaster.ray.intersectPlane(floorPlane,destination)){const r=Math.hypot(destination.x,destination.z);if(r>17.1){destination.x*=17.1/r;destination.z*=17.1/r;}hasDestination=true;targetMarker.position.set(destination.x,.15,destination.z);targetMarker.visible=true;}}
  const cameraControls = createCameraControls(renderer.domElement, () => state.mode === "intro" || state.mode === "playing", pointToWalk);

  let disposed=false,frame=0,lastTime=0,lastPaint=0,elapsed=0,walkPhase=0,verticalSpeed=0,meowTime=0,waterNotice=0,lastPublished=-1,soundEnabled=false;
  let audioContext:AudioContext|null=null;
  const reducedMotion=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lookTarget=new THREE.Vector3(),desiredLook=new THREE.Vector3(),desiredCamera=new THREE.Vector3();
  const forward=new THREE.Vector3(-10,0,-14).normalize(),right=new THREE.Vector3(14,0,-10).normalize(),movement=new THREE.Vector3();
  const size={width:1,height:1};
  function resize(){size.width=host.clientWidth;size.height=host.clientHeight;camera.aspect=size.width/size.height;camera.updateProjectionMatrix();renderer.setSize(size.width,size.height);}
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  const adaptResolution = renderer instanceof THREE.WebGLRenderer ? createAdaptiveResolution(renderer,()=>size.width,()=>size.height) : null;
  const textureListeners: {image: HTMLImageElement; callback: () => void}[]=[];
  if(renderer instanceof THREE.WebGLRenderer){
    const textures=new Set<THREE.Texture>();
    scene.traverse(o=>{if(o instanceof THREE.Mesh){const list=Array.isArray(o.material)?o.material:[o.material];for(const mat of list){const map=(mat as THREE.MeshStandardMaterial).map;if(map)textures.add(map);}}});
    textures.forEach(texture=>{const image=texture.image;if(image instanceof HTMLImageElement&&!image.complete){const callback=()=>{renderer.shadowMap.needsUpdate=true;};image.addEventListener("load",callback,{once:true});textureListeners.push({image,callback});}});
  }
  function publish(){onState({...state,seconds:Math.floor(state.seconds)});}
  function soundTone(frequency:number,duration:number,endFrequency=frequency){if(!soundEnabled)return;try{audioContext??=new AudioContext();void audioContext.resume();const o=audioContext.createOscillator(),v=audioContext.createGain();o.type="sine";o.frequency.setValueAtTime(frequency,audioContext.currentTime);o.frequency.exponentialRampToValueAtTime(endFrequency,audioContext.currentTime+duration);v.gain.setValueAtTime(.09,audioContext.currentTime);v.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);o.connect(v);v.connect(audioContext.destination);o.start();o.stop(audioContext.currentTime+duration);}catch{}}
  function jump(){if(state.mode==="playing"&&cat.position.y<=.002){verticalSpeed=6.4;soundTone(280,.14,550);}}
  function meow(){if(state.mode!=="playing"||meowTime>0)return;meowTime=1.05;notify("Miau! Seu gato está feliz em explorar com você.");soundTone(610,.3,410);}
  function pause(paused:boolean){if(paused&&state.mode==="playing"){state.mode="paused";state.moving=false;keys.clear();publish();}else if(!paused&&state.mode==="paused"){state.mode="playing";keys.clear();publish();}}
  function key(code:string,pressed:boolean){if(pressed){keys.add(code);hasDestination=false;targetMarker.visible=false;}else keys.delete(code);}
  const codes=["KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space","ShiftLeft","ShiftRight","KeyE","KeyP","Escape","KeyR"];
  function keydown(e:KeyboardEvent){if((e.target as HTMLElement)?.closest("button,a,input,textarea,select")&&e.code==="Space")return;if(!codes.includes(e.code))return;if(state.mode!=="intro")e.preventDefault();if(e.repeat)return;if(e.code==="KeyR"){cameraControls.reset();return;}if(e.code==="Escape"||e.code==="KeyP"){if(!document.querySelector('[data-slot="dialog-content"]'))pause(state.mode==="playing");else if(state.mode==="paused"&&e.code==="KeyP")pause(false);return;}if(state.mode!=="playing")return;keys.add(e.code);hasDestination=false;targetMarker.visible=false;if(e.code==="Space")jump();if(e.code==="KeyE")meow();}
  function keyup(e:KeyboardEvent){keys.delete(e.code);}
  function blur(){keys.clear();pause(true);}
  function visibility(){if(document.hidden)blur();}
  window.addEventListener("keydown",keydown);window.addEventListener("keyup",keyup);window.addEventListener("blur",blur);document.addEventListener("visibilitychange",visibility);
  function start(){cameraControls.reset();state={mode:"playing",collected:0,seconds:0,moving:false};cat.position.set(0,0,5.4);cat.scale.setScalar(1);cat.rotation.y=Math.PI;rig.rotation.set(0,0,0);verticalSpeed=0;keys.clear();hasDestination=false;targetMarker.visible=false;elapsed=0;lastPublished=-1;fish.forEach(f=>{f.collected=false;f.group.visible=true;});particles.forEach(p=>scene.remove(p.mesh));particles.length=0;notify("Encontre os peixes dourados pelo jardim!");publish();}
  const snap=()=>({...state,seconds:Math.floor(state.seconds)});
  let profileFrames=0,profileTotal=0,motionFrames=0,motionTotal=0;
  function animate(now:number){if(disposed)return;frame=requestAnimationFrame(animate);if(document.hidden){lastTime=now;return;}adaptResolution?.(now-lastTime,now);const dt=Math.min((now-lastTime)/1000||.016,software?.1:.04);lastTime=now;elapsed+=dt;const t=now/1000;
    if(state.mode==="playing"){
      state.seconds+=dt;movement.set(0,0,0);
      forward.copy(lookTarget).sub(camera.position);forward.y=0;forward.normalize();right.set(-forward.z,0,forward.x);
      const up=keys.has("KeyW")||keys.has("ArrowUp"),down=keys.has("KeyS")||keys.has("ArrowDown"),left=keys.has("KeyA")||keys.has("ArrowLeft"),r=keys.has("KeyD")||keys.has("ArrowRight");
      if(up)movement.add(forward);if(down)movement.sub(forward);if(left)movement.sub(right);if(r)movement.add(right);
      if(movement.lengthSq()>.01){hasDestination=false;targetMarker.visible=false;}
      else if(hasDestination){movement.set(destination.x-cat.position.x,0,destination.z-cat.position.z);if(movement.length()<.2){hasDestination=false;targetMarker.visible=false;movement.set(0,0,0);}}
      const moving=movement.lengthSq()>.01;state.moving=moving;
      const inWater=(cat.position.x-5)**2/8.2+(cat.position.z+1.3)**2/4.9<1&&cat.position.y<.3;
      let speed=(keys.has("ShiftLeft")||keys.has("ShiftRight"))?6.8:4.25;if(inWater){speed*=.57;if(waterNotice<=0){notify("Patinhas molhadas! A água deixa o gato mais lento.");waterNotice=9;}}waterNotice-=dt;
      if(moving){movement.normalize();const x=cat.position.x+movement.x*speed*dt,z=cat.position.z+movement.z*speed*dt;cat.position.x=x;cat.position.z=z;
        for(const c of colliders){let dx=cat.position.x-c.x,dz=cat.position.z-c.z,d=Math.hypot(dx,dz),min=c.radius+.4;if(d<min&&cat.position.y<c.height){if(d<.001){dx=1;dz=0;d=1;}cat.position.x=c.x+dx/d*min;cat.position.z=c.z+dz/d*min;hasDestination=false;targetMarker.visible=false;}}
        const radius=Math.hypot(cat.position.x,cat.position.z);if(radius>17.4){cat.position.x*=17.4/radius;cat.position.z*=17.4/radius;}
        const angle=Math.atan2(movement.x,movement.z),diff=Math.atan2(Math.sin(angle-cat.rotation.y),Math.cos(angle-cat.rotation.y));cat.rotation.y+=diff*Math.min(1,dt*13);walkPhase+=dt*speed*3.3;
      }
      if(cat.position.y>0||verticalSpeed>0){cat.position.y+=verticalSpeed*dt;verticalSpeed-=16*dt;if(cat.position.y<0){cat.position.y=0;verticalSpeed=0;}}
      rig.position.y=moving&&cat.position.y===0?Math.sin(walkPhase*2)*.045:Math.sin(t*2)*.012;
      legs.forEach((leg,i)=>{leg.rotation.x=cat.position.y>.1?-.26:moving?Math.sin(walkPhase+(i===0||i===3?0:Math.PI))*.57:THREE.MathUtils.lerp(leg.rotation.x,0,dt*10);});
      for(const f of fish)if(!f.collected&&Math.hypot(cat.position.x-f.group.position.x,cat.position.z-f.group.position.z)<.92&&cat.position.y<1.8){f.collected=true;f.group.visible=false;state.collected++;burst(f.group.position.x,.9,f.group.position.z);soundTone(650+state.collected*35,.19,1100);notify(state.collected===12?"Todos os peixinhos encontrados!":`${state.collected} de 12 peixinhos. Muito bem!`);publish();if(state.collected===12){state.mode="won";state.moving=false;keys.clear();burst(cat.position.x,2,cat.position.z,true);publish();}}
      if(Math.floor(state.seconds)!==lastPublished){lastPublished=Math.floor(state.seconds);publish();}
    }else{rig.position.y=Math.sin(t*2)*.018;legs.forEach(l=>l.rotation.x=THREE.MathUtils.lerp(l.rotation.x,0,dt*7));}
    if(meowTime>0)meowTime-=dt;
    head.rotation.x=meowTime>0?-.17+Math.sin(meowTime*12)*.04:Math.sin(t*1.3)*.022;
    head.rotation.z=state.mode==="intro"?Math.sin(t*.65)*.035:0;
    const blinkPhase=t%5.6;const blink=blinkPhase<.18?Math.max(.1,Math.abs(blinkPhase-.09)/.09):1;
    eyes.forEach(eye=>eye.scale.y=blink);
    tailPivot.rotation.z=Math.sin(t*2.2)*.12;tailPivot.rotation.x=Math.sin(t*1.6)*.08;
    contact.position.set(cat.position.x,.083,cat.position.z);contact.scale.set(2.1*(1+cat.position.y*.13),2.5*(1+cat.position.y*.13),1);(contact.material as THREE.MeshBasicMaterial).opacity=.78-cat.position.y*.19;
    fish.forEach((f,i)=>{if(!f.collected){f.group.position.y=f.baseY+Math.sin(t*2.1+i)*.13;f.group.rotation.y=t*.65+i;f.ring.rotation.z=t*.2;}});
    butterflies.forEach((b,i)=>{b.position.set(Math.sin(t*.17+i*4)*(7+i),1.6+Math.sin(t*.7+i)*.35,Math.cos(t*.21+i*3)*(7+i));b.rotation.y=t*.4+i;b.children[0].rotation.z=Math.sin(t*18+i)*.7;b.children[1].rotation.z=-Math.sin(t*18+i)*.7;});
    if(!software&&!reducedMotion)greenery.forEach((g,i)=>{g.update(t);g.rotation.z=Math.sin(t*.5+i)*.002;});
    ripples.forEach((r,i)=>{const pulse=1+Math.sin(t+i)*.06;r.scale.set(pulse,.65*pulse,1);});
    for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.velocity.y-=4.5*dt;p.mesh.position.addScaledVector(p.velocity,dt);p.mesh.scale.setScalar(Math.min(1,p.life*2));if(p.life<=0){scene.remove(p.mesh);particles.splice(i,1);}}
    const mobile=size.width<700;
    if(state.mode==="intro"){
      if(mobile){desiredCamera.set(8.3,8.7,17);desiredLook.set(.1,0,4.4);}
      else{desiredCamera.set(8,7.4,18.4);desiredLook.set(-5,1.5,4.8);}
    }else{
      const zoom=mobile?1.22:1;desiredCamera.set(cat.position.x+10*zoom,cat.position.y*.3+12.7*zoom,cat.position.z+14*zoom);desiredLook.set(cat.position.x, .7, cat.position.z);
    }
    cameraControls.apply(desiredCamera, desiredLook);
    if(now<100||lastTime===0){camera.position.copy(desiredCamera);lookTarget.copy(desiredLook);}else{const blend=1-Math.exp(-dt*(state.mode==="intro"?4:5));camera.position.lerp(desiredCamera,blend);lookTarget.lerp(desiredLook,blend);}
    camera.lookAt(lookTarget);if(renderer instanceof SoftwareRenderer)renderer.setInteractive(state.moving || camera.position.distanceToSquared(desiredCamera)>.001 || lookTarget.distanceToSquared(desiredLook)>.001);if(!software || now-lastPaint>40){const renderStart=performance.now();renderer.render(scene,camera);if(process.env.NODE_ENV!=="production"){const renderMs=performance.now()-renderStart;profileTotal+=renderMs;profileFrames++;if(state.moving){motionTotal+=renderMs;motionFrames++;if(motionFrames===12)console.info("[motion-profile]",JSON.stringify({averageMs:Math.round(motionTotal/motionFrames)}));}if(profileFrames===30||profileFrames===120)console.info("[render-profile]",JSON.stringify({renderer:software?"software":"webgl",averageMs:Math.round(profileTotal/profileFrames),drawCalls:renderer instanceof THREE.WebGLRenderer?renderer.info.render.calls:null}));}lastPaint=now;}
  }
  camera.position.set(8,7.4,18.4);lookTarget.set(-5,1.5,4.8);camera.lookAt(lookTarget);publish();frame=requestAnimationFrame(animate);
  return { start,pause,key,jump,meow,resetCamera:()=>cameraControls.reset(),sound(enabled){soundEnabled=enabled;if(enabled)soundTone(700,.13,950);},snapshot:snap,dispose(){disposed=true;cameraControls.dispose();textureListeners.forEach(({image,callback})=>image.removeEventListener("load",callback));cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener("keydown",keydown);window.removeEventListener("keyup",keyup);window.removeEventListener("blur",blur);document.removeEventListener("visibilitychange",visibility);const geometries=new Set<THREE.BufferGeometry>(),mats=new Set<THREE.Material>();scene.traverse(o=>{if(o instanceof THREE.Mesh || o instanceof THREE.LineSegments){geometries.add(o.geometry);const m=Array.isArray(o.material)?o.material:[o.material];m.forEach(x=>mats.add(x));}});geometries.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());Object.values(surfaceMaps).forEach(t=>t.dispose());furMap.dispose();shadowMap.dispose();canopyMap.dispose();environment?.dispose();renderer.dispose();void audioContext?.close();renderer.domElement.remove();} };
}
