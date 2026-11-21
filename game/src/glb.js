// A minimal glTF 2.0 (.glb) reader, written for Solara Bay v5 so the
// game does not need Three.js's GLTFLoader at all. It reads exactly what
// the game's own FBX converter writes — and nothing more:
//   - one scene, a tree of nodes with matrix or TRS transforms
//   - meshes with POSITION / NORMAL / TEXCOORD_0 attributes (floats)
//   - optional indices, triangle mode (4)
// No skins, no animations, no morph targets, no extensions, no embedded
// images: the car textures are applied by cars.js after loading.
// The file is a binary container: a 12-byte header, a JSON chunk, then
// a BIN chunk holding every accessor's raw bytes.
import * as THREE from 'three';

const GLB_MAGIC = 0x46546c67; // 'glTF', little-endian
const CHUNK_JSON = 0x4e4f534a; // 'JSON'
const CHUNK_BIN = 0x004e4942; // 'BIN\0'

const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMPONENT_ARRAY = {
  5120: Int8Array,
  5121: Uint8Array,
  5122: Int16Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array,
};
const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

function readChunkHeader(view, offset) {
  return {
    length: view.getUint32(offset, true),
    type: view.getUint32(offset + 4, true),
  };
}

// Pull one accessor's numbers out of the BIN chunk as a flat typed array.
// Respects the accessor's byte offset and the buffer view's stride, so
// interleaved layouts still read correctly.
function readAccessor(gltf, bin, index) {
  const accessor = gltf.accessors[index];
  const view = gltf.bufferViews[accessor.bufferView];
  const bytesPerComponent = COMPONENT_BYTES[accessor.componentType];
  const componentCount = TYPE_COMPONENTS[accessor.type];
  const stride = view.byteStride || bytesPerComponent * componentCount;
  const base = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const ArrayType = COMPONENT_ARRAY[accessor.componentType];
  const out = new ArrayType(accessor.count * componentCount);
  const raw = new ArrayType(bin, 0, bin.byteLength / ArrayType.BYTES_PER_ELEMENT);
  const rawStride = stride / ArrayType.BYTES_PER_ELEMENT;
  const rawBase = base / ArrayType.BYTES_PER_ELEMENT;
  for (let i = 0; i < accessor.count; i += 1) {
    for (let c = 0; c < componentCount; c += 1) {
      out[i * componentCount + c] = raw[rawBase + i * rawStride + c];
    }
  }
  return { data: out, components: componentCount, count: accessor.count };
}

// Turn one mesh primitive into a THREE.Mesh. Positions, normals and UVs
// are the only attributes the cars carry; an index, when present, is
// used as-is, otherwise the vertices are already in triangle order.
function buildPrimitive(gltf, bin, primitive, fallbackMaterial) {
  const geometry = new THREE.BufferGeometry();
  const attrs = primitive.attributes;
  if (attrs.POSITION !== undefined) {
    const pos = readAccessor(gltf, bin, attrs.POSITION);
    geometry.setAttribute('position', new THREE.BufferAttribute(pos.data, 3));
  }
  if (attrs.NORMAL !== undefined) {
    const nrm = readAccessor(gltf, bin, attrs.NORMAL);
    geometry.setAttribute('normal', new THREE.BufferAttribute(nrm.data, 3));
  }
  if (attrs.TEXCOORD_0 !== undefined) {
    const uv = readAccessor(gltf, bin, attrs.TEXCOORD_0);
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv.data, 2));
  }
  if (primitive.indices !== undefined) {
    const idx = readAccessor(gltf, bin, primitive.indices);
    geometry.setIndex(new THREE.BufferAttribute(idx.data, 1));
  }
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, fallbackMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Build one node of the scene tree. A node with a matrix gets it
// applied whole (the converter writes pivot matrices this way); a node
// with translation / rotation / scale gets those composed instead.
function buildNode(gltf, bin, nodeIndex, fallbackMaterial) {
  const node = gltf.nodes[nodeIndex];
  let holder;
  if (node.mesh !== undefined) {
    const meshDef = gltf.meshes[node.mesh];
    if (meshDef.primitives.length === 1) {
      holder = buildPrimitive(gltf, bin, meshDef.primitives[0], fallbackMaterial);
    } else {
      holder = new THREE.Group();
      for (const prim of meshDef.primitives) {
        holder.add(buildPrimitive(gltf, bin, prim, fallbackMaterial));
      }
    }
  } else {
    holder = new THREE.Group();
  }
  holder.name = node.name || '';
  if (node.matrix) {
    holder.matrix.fromArray(node.matrix);
    holder.matrix.decompose(holder.position, holder.quaternion, holder.scale);
  } else {
    if (node.translation) holder.position.fromArray(node.translation);
    if (node.rotation) holder.quaternion.fromArray(node.rotation);
    if (node.scale) holder.scale.fromArray(node.scale);
  }
  for (const childIndex of node.children || []) {
    holder.add(buildNode(gltf, bin, childIndex, fallbackMaterial));
  }
  return holder;
}

// Load a .glb from a URL and return its scene as a THREE.Group.
// Throws on a bad magic number, an unsupported version, or a missing
// JSON chunk, so a corrupt file fails loudly instead of half-loading.
export async function loadGlb(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`could not fetch ${url}: ${response.status}`);
  const buffer = await response.arrayBuffer();
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error(`${url} is not a glTF binary`);
  const version = view.getUint32(4, true);
  if (version !== 2) throw new Error(`${url} is glTF version ${version}, expected 2`);

  let offset = 12;
  let jsonText = null;
  let bin = null;
  while (offset + 8 <= buffer.byteLength) {
    const { length, type } = readChunkHeader(view, offset);
    const start = offset + 8;
    if (type === CHUNK_JSON) {
      const bytes = new Uint8Array(buffer, start, length);
      jsonText = new TextDecoder().decode(bytes);
    } else if (type === CHUNK_BIN) {
      bin = buffer.slice(start, start + length);
    }
    offset = start + length;
  }
  if (jsonText === null) throw new Error(`${url} has no JSON chunk`);
  const gltf = JSON.parse(jsonText);
  if (!bin) bin = new ArrayBuffer(0);

  const plain = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const sceneDef = (gltf.scenes && gltf.scenes[gltf.scene || 0]) || { nodes: [] };
  const root = new THREE.Group();
  root.name = 'glb';
  for (const nodeIndex of sceneDef.nodes || []) {
    root.add(buildNode(gltf, bin, nodeIndex, plain));
  }
  return root;
}
