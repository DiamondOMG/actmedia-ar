const fs = require('fs');
const path = require('path');

const file_path = path.resolve(__dirname, '../public/basketball/basketball hoop 3d model (2).glb');

if (!fs.existsSync(file_path)) {
  console.error("File not found:", file_path);
  process.exit(1);
}

const buffer = fs.readFileSync(file_path);

// Check header magic
const magic = buffer.readUInt32LE(0);
if (magic !== 0x46546C67) { // "glTF"
  console.error("Invalid GLB file magic header.");
  process.exit(1);
}

const version = buffer.readUInt32LE(4);
const total_length = buffer.readUInt32LE(8);

// Read Chunk 0 (JSON)
const chunk_length = buffer.readUInt32LE(12);
const chunk_type = buffer.readUInt32LE(16);

if (chunk_type !== 0x4E4F534A) { // "JSON"
  console.error("First chunk is not JSON.");
  process.exit(1);
}

const json_data = buffer.toString('utf8', 20, 20 + chunk_length);
const gltf = JSON.parse(json_data);

console.log("=== GLB File Info ===");
console.log("Version:", version);
console.log("Total Length:", total_length, "bytes");

// Find all POSITION accessors to compute bounding box
let min_x = Infinity, min_y = Infinity, min_z = Infinity;
let max_x = -Infinity, max_y = -Infinity, max_z = -Infinity;
let found_positions = false;

if (gltf.meshes && gltf.accessors) {
  gltf.meshes.forEach((mesh) => {
    console.log(`Mesh: ${mesh.name || 'Unnamed'}`);
    mesh.primitives.forEach((primitive) => {
      const position_accessor_idx = primitive.attributes.POSITION;
      if (position_accessor_idx !== undefined) {
        const accessor = gltf.accessors[position_accessor_idx];
        if (accessor.min && accessor.max) {
          found_positions = true;
          const [ax_min, ay_min, az_min] = accessor.min;
          const [ax_max, ay_max, az_max] = accessor.max;
          
          min_x = Math.min(min_x, ax_min);
          min_y = Math.min(min_y, ay_min);
          min_z = Math.min(min_z, az_min);
          
          max_x = Math.max(max_x, ax_max);
          max_y = Math.max(max_y, ay_max);
          max_z = Math.max(max_z, az_max);
        }
      }
    });
  });
}

if (found_positions) {
  console.log("\n=== Computed Bounding Box ===");
  console.log(`Min: [${min_x.toFixed(4)}, ${min_y.toFixed(4)}, ${min_z.toFixed(4)}]`);
  console.log(`Max: [${max_x.toFixed(4)}, ${max_y.toFixed(4)}, ${max_z.toFixed(4)}]`);
  
  const size_x = max_x - min_x;
  const size_y = max_y - min_y;
  const size_z = max_z - min_z;
  console.log(`Size: Width(X)=${size_x.toFixed(4)}, Height(Y)=${size_y.toFixed(4)}, Depth(Z)=${size_z.toFixed(4)}`);
  
  const center_x = (min_x + max_x) / 2;
  const center_y = (min_y + max_y) / 2;
  const center_z = (min_z + max_z) / 2;
  console.log(`Center: [${center_x.toFixed(4)}, ${center_y.toFixed(4)}, ${center_z.toFixed(4)}]`);
} else {
  console.log("No POSITION accessors found to compute bounding box.");
}
