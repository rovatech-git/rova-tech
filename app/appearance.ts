import * as THREE from "three";

/** Material maps are procedural surface data, shared by both rendering paths. */
export function surfaceTexture(kind: "grass" | "wood" | "leaves") {
  const canvas=document.createElement("canvas");canvas.width=canvas.height=256;
  const ctx=canvas.getContext("2d")!;const data=ctx.createImageData(256,256);
  let seed=781;const random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
  const grid=new Float32Array(32*32);for(let i=0;i<grid.length;i++)grid[i]=random();
  function noise(x:number,y:number){const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;const at=(a:number,b:number)=>grid[((b%32+32)%32)*32+(a%32+32)%32];return at(ix,iy)*(1-fx)*(1-fy)+at(ix+1,iy)*fx*(1-fy)+at(ix,iy+1)*(1-fx)*fy+at(ix+1,iy+1)*fx*fy;}
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const grain=random(),broad=noise(x/32,y/32),fine=noise(x/5,y/5);
    const t=kind==="wood"?.81+.11*Math.sin(x*.4+Math.sin(y*.03)*2)+grain*.05:kind==="leaves"?.79+.13*broad+.09*fine:.8+.1*broad+.07*fine+grain*.05;
    const i=(y*256+x)*4;data.data[i]=Math.min(255,t*255);data.data[i+1]=Math.min(255,t*255);data.data[i+2]=Math.min(255,t*249);data.data[i+3]=255;
  }
  ctx.putImageData(data,0,0);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.repeat.set(kind==="grass"?8:kind==="wood"?2:1,kind==="grass"?8:1);texture.anisotropy=4;
  return texture;
}
export function shadowTexture() {
  const canvas=document.createElement("canvas");canvas.width=canvas.height=128;const ctx=canvas.getContext("2d")!;
  const g=ctx.createRadialGradient(64,64,2,64,64,63);g.addColorStop(0,"rgba(25,45,25,.32)");g.addColorStop(.38,"rgba(25,45,25,.22)");g.addColorStop(.75,"rgba(25,45,25,.07)");g.addColorStop(1,"rgba(25,45,25,0)");ctx.fillStyle=g;ctx.fillRect(0,0,128,128);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
export function earGeometry() {
  const shape=new THREE.Shape();shape.moveTo(-.28,-.08);
  shape.bezierCurveTo(-.26,.12,-.08,.48,.035,.62);
  shape.bezierCurveTo(.08,.66,.11,.6,.13,.5);
  shape.bezierCurveTo(.19,.28,.27,.02,.3,-.08);
  shape.quadraticCurveTo(.03,-.18,-.28,-.08);
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:.1,steps:1,bevelEnabled:true,bevelThickness:.055,bevelSize:.043,bevelSegments:5,curveSegments:18});
  geometry.computeVertexNormals();return geometry;
}
export function addFurSilhouette(mesh:THREE.Mesh, count=900) {
  const vertices:number[]=[];let seed=59;const random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
  for(let i=0;i<count;i++){
    const y=random()*2-1,a=random()*Math.PI*2,r=Math.sqrt(1-y*y),x=r*Math.cos(a),z=r*Math.sin(a),length=.014+random()*.018;
    vertices.push(x,y,z,x*(1+length),y*(1+length)-.005,z*(1+length));
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
  const hair=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:"#fffef5",transparent:true,opacity:.34,depthWrite:false}));mesh.add(hair);
}
