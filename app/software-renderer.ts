import * as THREE from "three";

type TexturePixels = { pixels: Uint8ClampedArray; width: number; height: number };
type Surface = THREE.MeshStandardMaterial & { isMeshBasicMaterial?: boolean };
type DrawMesh = { mesh: THREE.Mesh; material: Surface; depth: number };

/** Depth-buffered 3D rasterizer with interpolated vertex light and texture sampling.
 * The fallback uses the same meshes, UVs and materials as WebGL, without flat faces.
 */
export class SoftwareRenderer {
  readonly domElement = document.createElement("canvas");
  private context: CanvasRenderingContext2D;
  private width = 1;
  private height = 1;
  private frame!: ImageData;
  private depth = new Float32Array(1);
  private rgba!: Uint8ClampedArray;
  private matrix = new THREE.Matrix4();
  private view = new THREE.Matrix4();
  private normal = new THREE.Matrix3();
  private frustum = new THREE.Frustum();
  private point = new THREE.Vector3();
  private normalVector = new THREE.Vector3();
  private light = new THREE.Vector3(-.42, .78, .46).normalize();
  private cameraPosition = new THREE.Vector3();
  private halfVector = new THREE.Vector3();
  private vertexCache = new WeakMap<THREE.BufferGeometry, Float32Array>();
  private textureCache = new WeakMap<THREE.Texture, TexturePixels>();
  private colorCache = new WeakMap<THREE.Material, number[]>();
  private vertexColors = new WeakMap<THREE.BufferGeometry, Float32Array>();
  private detailCache = new Map<string, THREE.BufferGeometry>();
  private gardenPixels: Uint8ClampedArray | null = null;
  private gardenDepth: Float32Array | null = null;
  private gardenView = new THREE.Matrix4();
  private gardenStamp = -1;
  private interactive = false;
  private displayWidth = 1;
  private displayHeight = 1;
  private disposed = false;

  constructor() {
    const ctx = this.domElement.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas unavailable");
    this.context = ctx;
  }
  setPixelRatio(_ratio: number) {}
  setInteractive(moving: boolean) {
    if (moving === this.interactive) return;
    this.interactive = moving;
    this.setSize(this.displayWidth, this.displayHeight);
  }
  setSize(width: number, height: number) {
    this.displayWidth = width; this.displayHeight = height;
    const scale = this.interactive ? Math.min(1, 720 / width, 500 / height) : Math.min(1, 1080 / width, 760 / height);
    this.width = Math.max(1, Math.round(width * scale));
    this.height = Math.max(1, Math.round(height * scale));
    this.domElement.width = this.width;
    this.domElement.height = this.height;
    this.frame = this.context.createImageData(this.width, this.height);
    this.rgba = this.frame.data;
    this.depth = new Float32Array(this.width * this.height);
    this.gardenPixels = null; this.gardenDepth = null;
  }
  private texture(texture: THREE.Texture | null): TexturePixels | null {
    if (!texture) return null;
    const cached = this.textureCache.get(texture);
    if (cached) return cached;
    const img = texture.image as (CanvasImageSource & { width: number; height: number; data?: ArrayLike<number> }) | undefined;
    if (!img || !(img.width > 0) || !(img.height > 0)) return null;
    try {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 512 / Math.max(img.width, img.height));
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      if (img.data) {
        const pixels = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
        const input = document.createElement("canvas");input.width=img.width;input.height=img.height;input.getContext("2d")!.putImageData(pixels,0,0);ctx.drawImage(input,0,0,canvas.width,canvas.height);
      } else ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const data = { pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height };
      this.textureCache.set(texture, data);
      return data;
    } catch { return null; }
  }
  render(scene: THREE.Scene, camera: THREE.Camera) {
    if (this.disposed || !this.frame) return;
    scene.updateMatrixWorld();camera.updateMatrixWorld();
    this.cameraPosition.setFromMatrixPosition(camera.matrixWorld);
    this.view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.view);
    const opaque: DrawMesh[] = [], transparent: DrawMesh[] = [];
    scene.traverseVisible(object => {
      if (!(object instanceof THREE.Mesh) || object.userData.skipSoftware || !this.frustum.intersectsObject(object)) return;
      const material = (Array.isArray(object.material) ? object.material[0] : object.material) as Surface;
      if (!material.visible || material.opacity <= 0) return;
      this.point.setFromMatrixPosition(object.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      const draw = { mesh: object, material, depth: -this.point.z };
      (material.transparent ? transparent : opaque).push(draw);
    });
    // Front-to-back opaque passes avoid shading pixels that are already covered.
    opaque.sort((a,b)=>a.depth-b.depth);
    transparent.sort((a,b)=>b.depth-a.depth);
    const garden = [...opaque, ...transparent].filter(draw=>draw.mesh.userData.staticGarden);
    const stamp = garden.reduce((sum,draw)=>sum + draw.mesh.id + (draw.material.map?.version ?? 0),0);
    const sameView = this.view.elements.every((value,index)=>Math.abs(value-this.gardenView.elements[index])<1e-6);
    if (!this.gardenPixels || !this.gardenDepth || !sameView || stamp !== this.gardenStamp) {
      this.depth.fill(Infinity);
      const buffer = this.rgba, width = this.width, height = this.height;
      for (let y = 0; y < height; y++) {
        const k = y / height, r = 205 + k * 26, g = 224 + k * 6, b = 227 - k * 18;
        for (let x = 0, i = y * width * 4; x < width; x++, i += 4) {buffer[i]=r;buffer[i+1]=g;buffer[i+2]=b;buffer[i+3]=255;}
      }
      for (const draw of garden) this.draw(draw, camera);
      this.gardenPixels ??= new Uint8ClampedArray(this.rgba.length);
      this.gardenDepth ??= new Float32Array(this.depth.length);
      this.gardenPixels.set(this.rgba); this.gardenDepth.set(this.depth);
      this.gardenView.copy(this.view); this.gardenStamp = stamp;
    } else {
      this.rgba.set(this.gardenPixels); this.depth.set(this.gardenDepth);
    }
    for (const draw of opaque) if(!draw.mesh.userData.staticGarden)this.draw(draw, camera);
    for (const draw of transparent) if(!draw.mesh.userData.staticGarden)this.draw(draw, camera);
    this.context.putImageData(this.frame,0,0);
  }
  private detail(mesh: THREE.Mesh, distance: number, camera: THREE.Camera) {
    const original = mesh.geometry;
    if (!(original instanceof THREE.SphereGeometry) && !(original instanceof THREE.CylinderGeometry)) return original;
    const radius = original instanceof THREE.SphereGeometry ? original.parameters.radius : Math.max(original.parameters.radiusTop,original.parameters.radiusBottom);
    const pixels = radius * mesh.matrixWorld.getMaxScaleOnAxis() * camera.projectionMatrix.elements[5] * this.height * .5 / Math.max(1,distance);
    const segments = pixels > 90 ? 40 : pixels > 40 ? 28 : pixels > 16 ? 20 : pixels > 6 ? 12 : 8;
    const current = original instanceof THREE.SphereGeometry ? original.parameters.widthSegments : original.parameters.radialSegments;
    if (segments >= current) return original;
    const key = `${original.id}:${segments}`;
    if (!this.detailCache.has(key)) {
      const p = original.parameters;
      const geometry = original instanceof THREE.SphereGeometry
        ? new THREE.SphereGeometry(radius,segments,Math.max(6,Math.round(segments*.65)))
        : new THREE.CylinderGeometry((p as THREE.CylinderGeometry['parameters']).radiusTop,(p as THREE.CylinderGeometry['parameters']).radiusBottom,(p as THREE.CylinderGeometry['parameters']).height,segments);
      this.detailCache.set(key,geometry);
    }
    return this.detailCache.get(key)!;
  }
  private draw({ mesh, material, depth: distance }: DrawMesh, camera: THREE.Camera) {
    const geometry = this.detail(mesh,distance,camera), pos = geometry.attributes.position, normals = geometry.attributes.normal, uv = geometry.attributes.uv, indices = geometry.index;
    const colorAttribute = material.vertexColors ? geometry.attributes.color : undefined;
    let colors = this.vertexColors.get(geometry);
    if(colorAttribute && !colors){colors=new Float32Array(pos.count*3);for(let i=0;i<pos.count;i++){colors[i*3]=Math.max(0,colorAttribute.getX(i))**(1/2.2);colors[i*3+1]=Math.max(0,colorAttribute.getY(i))**(1/2.2);colors[i*3+2]=Math.max(0,colorAttribute.getZ(i))**(1/2.2);}this.vertexColors.set(geometry,colors);}
    const count = pos.count, stride = 11;
    let vertices = this.vertexCache.get(geometry);
    if (!vertices || vertices.length !== count * stride) {vertices = new Float32Array(count * stride);this.vertexCache.set(geometry, vertices);}
    this.matrix.multiplyMatrices(this.view, mesh.matrixWorld);this.normal.getNormalMatrix(mesh.matrixWorld);
    const matrix = this.matrix.elements;
    this.point.setFromMatrixPosition(mesh.matrixWorld);
    this.halfVector.copy(this.cameraPosition).sub(this.point).normalize().add(this.light).normalize();
    const specularStrength = material.isMeshBasicMaterial ? 0 : Math.max(0, .5 - (material.roughness ?? .9)) * 1.8;
    for (let i=0; i<count; i++) {
      const x=pos.getX(i), y=pos.getY(i), z=pos.getZ(i), w=matrix[3]*x+matrix[7]*y+matrix[11]*z+matrix[15];
      const o=i*stride, iw=1/w;
      vertices[o]=(matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12])*iw*this.width*.5+this.width*.5;
      vertices[o+1]=-(matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13])*iw*this.height*.5+this.height*.5;
      vertices[o+2]=(matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14])*iw;
      let light=1, specular=0;
      if (normals && !material.isMeshBasicMaterial) {
        this.normalVector.set(normals.getX(i),normals.getY(i),normals.getZ(i)).applyMatrix3(this.normal).normalize();
        const diffuse=Math.max(0,this.normalVector.dot(this.light));
        light=.61 + diffuse*.37 + (this.normalVector.y*.5+.5)*.08;
        if (specularStrength) specular=Math.pow(Math.max(0,this.normalVector.dot(this.halfVector)),36)*specularStrength;
      }
      vertices[o+3]=light;vertices[o+4]=specular;
      vertices[o+5]=uv?uv.getX(i)*iw:0;vertices[o+6]=uv?uv.getY(i)*iw:0;vertices[o+7]=iw;
      vertices[o+8]=colors?colors[i*3]:1;
      vertices[o+9]=colors?colors[i*3+1]:1;
      vertices[o+10]=colors?colors[i*3+2]:1;
    }
    let base=this.colorCache.get(material);
    if (!base) {const color=material.color.clone().convertLinearToSRGB();base=[color.r*255,color.g*255,color.b*255];this.colorCache.set(material,base);}
    const texture=this.texture(material.map), tex=material.map;
    const texRepeatX=tex?.repeat.x ?? 1,texRepeatY=tex?.repeat.y ?? 1,texOffsetX=tex?.offset.x ?? 0,texOffsetY=tex?.offset.y ?? 0;
    const total=indices?indices.count:count, v=vertices, width=this.width,height=this.height,depth=this.depth,pixels=this.rgba;
    const transparent=material.transparent,opacity=material.opacity,alphaCutoff=Math.max(.005,material.alphaTest);
    let skipFirstLeaf = false;
    for (let i=0; i<total; i+=3) {
      // A crossed leaf cluster needs only its most visible card while moving.
      if(this.interactive && geometry.userData.doubleLeaves && indices){
        if(i%12===0){
          const triangleArea=(start:number)=>{const p=indices.getX(start)*stride,q=indices.getX(start+1)*stride,r=indices.getX(start+2)*stride;return Math.abs((v[q]-v[p])*(v[r+1]-v[p+1])-(v[q+1]-v[p+1])*(v[r]-v[p]));};
          skipFirstLeaf=triangleArea(i)<triangleArea(i+6);
        }
        if((i%12<6)===skipFirstLeaf)continue;
      }
      const a=(indices?indices.getX(i):i)*stride,b=(indices?indices.getX(i+1):i+1)*stride,c=(indices?indices.getX(i+2):i+2)*stride;
      const ax=v[a],ay=v[a+1],az=v[a+2],bx=v[b],by=v[b+1],bz=v[b+2],cx=v[c],cy=v[c+1],cz=v[c+2];
      if (az< -1||bz< -1||cz< -1||az>1||bz>1||cz>1) continue;
      const area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
      if (Math.abs(area)<.015 || (material.side!==THREE.DoubleSide && area>=0)) continue;
      const minX=Math.max(0,Math.floor(Math.min(ax,bx,cx))),maxX=Math.min(width-1,Math.ceil(Math.max(ax,bx,cx)));
      const minY=Math.max(0,Math.floor(Math.min(ay,by,cy))),maxY=Math.min(height-1,Math.ceil(Math.max(ay,by,cy)));
      if (minX>maxX||minY>maxY) continue;
      const inv=1/area, aStepX=(by-cy)*inv,aStepY=(cx-bx)*inv,bStepX=(cy-ay)*inv,bStepY=(ax-cx)*inv;
      let aRow=((bx-minX-.5)*(cy-minY-.5)-(by-minY-.5)*(cx-minX-.5))*inv;
      let bRow=((cx-minX-.5)*(ay-minY-.5)-(cy-minY-.5)*(ax-minX-.5))*inv;
      for (let y=minY;y<=maxY;y++,aRow+=aStepY,bRow+=bStepY) {
        let wa=aRow,wb=bRow;
        for (let x=minX,p=y*width+minX;x<=maxX;x++,p++,wa+=aStepX,wb+=bStepX) {
          const wc=1-wa-wb;if(wa<-.00001||wb<-.00001||wc<-.00001)continue;
          const z=wa*az+wb*bz+wc*cz;if(z>=depth[p])continue;
          let alpha=opacity,red=base[0],green=base[1],blue=base[2];
          if(texture&&tex){
            const iw=wa*v[a+7]+wb*v[b+7]+wc*v[c+7];
            let u=(wa*v[a+5]+wb*v[b+5]+wc*v[c+5])/iw*texRepeatX+texOffsetX;
            let vv=(wa*v[a+6]+wb*v[b+6]+wc*v[c+6])/iw*texRepeatY+texOffsetY;
            if(tex.wrapS===THREE.RepeatWrapping)u-=Math.floor(u);else u=Math.min(.99999,Math.max(0,u));
            if(tex.wrapT===THREE.RepeatWrapping)vv-=Math.floor(vv);else vv=Math.min(.99999,Math.max(0,vv));
            if(tex.flipY)vv=1-vv;
            const tx=Math.min(texture.width-1,(u*texture.width)|0),ty=Math.min(texture.height-1,(vv*texture.height)|0),q=(ty*texture.width+tx)*4,t=texture.pixels;
            red*=t[q]/255;green*=t[q+1]/255;blue*=t[q+2]/255;alpha*=t[q+3]/255;
          }
          if(alpha<alphaCutoff)continue;
          if(colorAttribute){red*=wa*v[a+8]+wb*v[b+8]+wc*v[c+8];green*=wa*v[a+9]+wb*v[b+9]+wc*v[c+9];blue*=wa*v[a+10]+wb*v[b+10]+wc*v[c+10];}
          const brightness=wa*v[a+3]+wb*v[b+3]+wc*v[c+3],specular=(wa*v[a+4]+wb*v[b+4]+wc*v[c+4])*255;
          const r=Math.min(255,red*brightness+specular),g=Math.min(255,green*brightness+specular),bl=Math.min(255,blue*brightness+specular),offset=p*4;
          if(transparent&&alpha<.999){const back=1-alpha;pixels[offset]=r*alpha+pixels[offset]*back;pixels[offset+1]=g*alpha+pixels[offset+1]*back;pixels[offset+2]=bl*alpha+pixels[offset+2]*back;}
          else {pixels[offset]=r;pixels[offset+1]=g;pixels[offset+2]=bl;}
          if(material.depthWrite)depth[p]=z;
        }
      }
    }
  }
  dispose(){this.disposed=true;this.depth=new Float32Array(0);this.gardenPixels=null;this.gardenDepth=null;this.vertexCache=new WeakMap();this.vertexColors=new WeakMap();this.textureCache=new WeakMap();this.detailCache.forEach(g=>g.dispose());this.detailCache.clear();}
}
